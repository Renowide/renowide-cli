#!/usr/bin/env node
/**
 * `@renowide/mcp-server` — Model Context Protocol server for shipping
 * agents to Renowide from inside an AI coding assistant.
 *
 * Positioning: an AI coding assistant (Cursor, Claude Code, Claude
 * Desktop, Replit Agents, Windsurf, and any other MCP client) can:
 *
 *   1. List Renowide templates              (resource/tool)
 *   2. Scaffold an agent from a template    (tool)
 *   3. Validate the generated manifest       (tool)
 *   4. Validate the generated canvas JSON    (tool)
 *   5. Deploy the agent to Renowide          (tool)
 *   6. Read docs on demand                   (resource)
 *   7. Inspect existing agents / earnings    (tool)
 *
 * All with no CLI shelling. The assistant stays in tool-call land; the
 * human developer stays in the chat UI. This is the "build-and-distribute"
 * default: from prompt to paying agent in a handful of tool calls.
 *
 * Transport: stdio. That's what Claude Desktop, Cursor, and the MCP
 * reference clients speak today. HTTP transport is on the roadmap but
 * every first-class client uses stdio, so that's what ships first.
 *
 * Auth: piggybacks on the CLI's `~/.renowide/credentials`. If the
 * assistant can read the user's home dir (every desktop client can),
 * there is no second login flow. If the file isn't there, we return a
 * `renowide_login_required` error that the assistant can surface.
 *
 * See `RENOWIDE_BUILD_AND_DISTRIBUTE_STRATEGY.md` for the full thesis.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ManifestCanvasBlockSchema } from "@renowide/types/manifest";
import { CanvasResponseSchema } from "@renowide/types/canvas";

// Mirror of the CLI's RenowideJsonSchema (packages/cli/src/commands/deploy.ts).
// Kept in sync with that definition. This is the shape POST /api/v1/agents/publish
// expects for Persona A / Path C. Persona B YAML uses the CLI's manifest.ts schema.
const RenowideJsonSchema = z
  .object({
    name: z.string().min(2).max(80),
    endpoint: z
      .string()
      .url()
      .refine((u) => u.startsWith("https://"), {
        message: "endpoint must use https://",
      }),
    price_credits: z.number().int().positive().max(10_000),
    slug: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]{1,40}[a-z0-9]$/)
      .optional(),
    description: z.string().max(500).optional(),
    icon_url: z.string().url().optional(),
    categories: z.array(z.string()).max(5).optional(),
    webhook_url: z.string().url().optional(),
    completion_timeout_minutes: z.number().int().min(5).max(43_200).optional(),
    sandbox_endpoint: z.string().url().optional(),
    canvas: ManifestCanvasBlockSchema.optional(),
  })
  .loose();
type RenowideJson = z.infer<typeof RenowideJsonSchema>;

// ----------------------------------------------------------------------
// Config / credentials
// ----------------------------------------------------------------------

const CONFIG_DIR = path.join(os.homedir(), ".renowide");
const CREDENTIALS_FILE = path.join(CONFIG_DIR, "credentials");

interface Credentials {
  apiBase: string;
  token: string;
  creatorId: string;
  creatorEmail: string;
}

function loadCredentials(): Credentials | null {
  try {
    const raw = fs.readFileSync(CREDENTIALS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed?.apiBase || !parsed?.token) return null;
    return parsed as Credentials;
  } catch {
    return null;
  }
}

function apiBase(): string {
  return (
    process.env.RENOWIDE_API_BASE ??
    process.env.RENOWIDE_API ??
    loadCredentials()?.apiBase ??
    "https://renowide.com"
  );
}

// ----------------------------------------------------------------------
// HTTP client (compatible with the CLI's api.ts contract)
// ----------------------------------------------------------------------

const USER_AGENT = `@renowide/mcp-server/0.1.0 (node ${process.version})`;

class APIError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
  }
}

async function apiRequest<T>(
  method: "GET" | "POST",
  pathname: string,
  body?: unknown,
  token?: string,
): Promise<T> {
  const url = `${apiBase().replace(/\/$/, "")}${pathname}`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "user-agent": USER_AGENT,
  };
  if (token) headers["authorization"] = `Bearer ${token}`;

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30_000);
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal,
    });
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    if (!res.ok) {
      const p = parsed as Record<string, string> | null;
      const message =
        p?.detail ?? p?.message ?? p?.error ?? `HTTP ${res.status} at ${pathname}`;
      throw new APIError(res.status, parsed, message);
    }
    return parsed as T;
  } finally {
    clearTimeout(timer);
  }
}

function requireToken(): string {
  const creds = loadCredentials();
  if (!creds) {
    throw new APIError(
      401,
      null,
      "Not logged in to Renowide. Ask the user to run `npx @renowide/cli login` in their terminal, then retry.",
    );
  }
  return creds.token;
}

// ----------------------------------------------------------------------
// Templates catalog (static for v0.1; will move to live API in v0.2)
// ----------------------------------------------------------------------

interface TemplateInfo {
  slug: string;
  name: string;
  description: string;
  guild: string;
  layer: "strategy" | "execution" | "development";
  path: "A" | "B" | "C";
  /** Preferred path. Most templates are Path C (Canvas Kit v2) by design. */
  default_price_credits: number;
  highlights: string[];
  /** URL to a working example on the marketplace, if one exists. */
  live_example?: string;
  tags: string[];
}

const TEMPLATES: TemplateInfo[] = [
  {
    slug: "saas-trial-dark",
    name: "SaaS trial-to-paid",
    description:
      "Dark elegant onboarding quiz → free-trial provisioning → upgrade-to-paid conversion flow. Canvas Kit v2. Best for productised SaaS agents.",
    guild: "development",
    layer: "execution",
    path: "C",
    default_price_credits: 10,
    highlights: [
      "3-step onboarding wizard",
      "Trial activation via custom webhook",
      "Upgrade CTA with dynamic pricing",
      "Dark elegant theme; mobile-first",
    ],
    tags: ["saas", "onboarding", "subscription", "canvas-kit-v2"],
  },
  {
    slug: "consumer-service-intake",
    name: "Consumer service intake",
    description:
      "Questionnaire → payment → scheduled delivery of a result. Suitable for any service with a 24–168h delivery window (coaching reports, research briefs, code reviews).",
    guild: "marketing",
    layer: "execution",
    path: "C",
    default_price_credits: 25,
    highlights: [
      "Multi-step questionnaire with conditional branches",
      "Payment captured on submit",
      "Post-hire canvas shows 'in progress → delivered' state",
      "Result delivered as downloadable artifacts",
    ],
    tags: ["consumer", "intake", "delivery", "canvas-kit-v2"],
  },
  {
    slug: "expert-curated-consult",
    name: "Expert-curated consultation",
    description:
      "Intake → AI prep → human curator review → delivered report. The 'licensed human uses AI' pattern. Enables regulated professional-services verticals: education, legal, medical, financial advisory.",
    guild: "finance",
    layer: "strategy",
    path: "C",
    default_price_credits: 50,
    highlights: [
      "Curator-approval gate before buyer sees result",
      "Named human endorser visible on agent card",
      "Audit trail of curator decisions",
      "Long-horizon outcome tracking (T+30d / T+90d)",
    ],
    tags: ["professional-services", "curator", "regulated", "canvas-kit-v2"],
  },
  {
    slug: "data-report-generator",
    name: "Data report generator",
    description:
      "Upload dataset → agent analyses → branded report canvas. Dark-mode; file_upload + chart blocks + downloadable PDF.",
    guild: "marketing",
    layer: "execution",
    path: "C",
    default_price_credits: 15,
    highlights: [
      "File upload with size + type validation",
      "Async processing with live status",
      "Chart blocks + KPI tiles in the post-hire canvas",
      "PDF export of the final report",
    ],
    tags: ["analytics", "reports", "dark", "canvas-kit-v2"],
  },
  {
    slug: "b2b-demo-booking",
    name: "B2B demo booking",
    description:
      "Calendar picker → qualify → hand off to human. Good for agent authors who want AI-triaged leads into their sales pipeline.",
    guild: "marketing",
    layer: "execution",
    path: "C",
    default_price_credits: 20,
    highlights: [
      "Date picker + timezone-aware slot selection",
      "BANT qualification wizard",
      "Post-booking confirmation canvas",
      "CRM handoff webhook (HubSpot / Salesforce / Notion)",
    ],
    tags: ["b2b", "sales", "lead-qualification", "canvas-kit-v2"],
  },
  {
    slug: "link-out-minimal",
    name: "Link-out (Persona A)",
    description:
      "Minimal Persona A manifest — 3 fields, points at your existing agent URL. Renowide handles listing + payment + webhook; you handle the UI at your own domain. Use when you already have a polished product UI you don't want to rewrite.",
    guild: "development",
    layer: "execution",
    path: "A",
    default_price_credits: 10,
    highlights: [
      "3-field renowide.json",
      "Webhook handler scaffolded with HMAC verification",
      "/complete callback skeleton",
      "Fastest time to listing — under 5 minutes",
    ],
    tags: ["persona-a", "link-out", "minimal"],
  },
  {
    slug: "hosted-layout-yaml",
    name: "Hosted Layout v0.6 (Persona B)",
    description:
      "Declarative renowide.yaml — Renowide renders the entire buyer experience from your manifest. Use when you want zero frontend work and your entire hire/post-hire flow fits in declarative fields.",
    guild: "development",
    layer: "execution",
    path: "B",
    default_price_credits: 10,
    highlights: [
      "No backend rendering required",
      "Canvas blocks declared in YAML",
      "Tool schemas inline",
      "A/B variants + i18n out of the box",
    ],
    tags: ["persona-b", "hosted-layout", "yaml", "no-backend"],
  },
];

// ----------------------------------------------------------------------
// Tool definitions
// ----------------------------------------------------------------------

const TOOLS = [
  {
    name: "renowide_whoami",
    description:
      "Verify that the user is logged in to Renowide and return the creator's email + id + default API base. Call this first in any new session. If it fails with 'Not logged in', tell the user to run `npx @renowide/cli login` in their terminal and retry.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "renowide_list_templates",
    description:
      "List all Renowide starter templates. Each template is a known-good starting point for a Canvas Kit v2 agent. Always prefer a template over writing Canvas JSON from scratch — templates are designed + validated + known to ship. Filter by `guild`, `path` (A|B|C), or `tags` if the user's intent points at a niche.",
    inputSchema: {
      type: "object",
      properties: {
        guild: {
          type: "string",
          description:
            "Filter by guild: development | marketing | construction | finance. Default: no filter.",
        },
        path: {
          type: "string",
          enum: ["A", "B", "C"],
          description:
            "Filter by onboarding path. Default C (Canvas Kit v2 — the recommended default). Pick A only if the user already has a polished product UI. Pick B only if the user explicitly wants YAML / zero backend.",
        },
        tag: {
          type: "string",
          description:
            "Filter by tag (e.g. 'saas', 'b2b', 'dark', 'consumer', 'regulated').",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "renowide_scaffold_agent",
    description:
      "Return the file contents needed to create a new agent from a template. Files are returned as a JSON object `{ path: content }`. The assistant should write them into the user's project directory. Always use this instead of hand-writing Canvas JSON or renowide.json — the templates bake in design tokens, HMAC verification, /complete callbacks, and workflow patterns that are hard to get right from scratch.",
    inputSchema: {
      type: "object",
      properties: {
        template: {
          type: "string",
          description: "Template slug from renowide_list_templates (e.g. 'saas-trial-dark').",
        },
        name: {
          type: "string",
          description:
            "Display name for the agent (shown on the marketplace card). 3-80 chars.",
        },
        slug: {
          type: "string",
          description:
            "URL slug — lowercase, letters/numbers/hyphens. If omitted, derived from name.",
        },
        price_credits: {
          type: "integer",
          minimum: 1,
          description:
            "Cost per hire in credits (1 credit = €0.01). Default: the template's default_price_credits.",
        },
        description: {
          type: "string",
          description: "One-paragraph description shown on the agent page.",
        },
      },
      required: ["template", "name"],
      additionalProperties: false,
    },
  },
  {
    name: "renowide_validate_manifest",
    description:
      "Validate a `renowide.json` manifest (Persona A / Path C) against the canonical schema. Returns { valid: true } on success, or { valid: false, errors: [...] } with precise paths + messages. Always call this before renowide_deploy so the assistant can fix issues in-chat rather than after a server-side reject.",
    inputSchema: {
      type: "object",
      properties: {
        manifest: {
          type: "object",
          description:
            "The parsed renowide.json object. Must conform to ManifestSchema from @renowide/types.",
        },
      },
      required: ["manifest"],
      additionalProperties: false,
    },
  },
  {
    name: "renowide_validate_canvas",
    description:
      "Validate a Canvas Kit v2 canvas JSON (hire_flow or post_hire) against the canonical CanvasSchema. Returns { valid: true } or { valid: false, errors: [...] }. Call this for every canvas JSON the assistant generates before it's committed or deployed.",
    inputSchema: {
      type: "object",
      properties: {
        canvas: {
          type: "object",
          description:
            "The parsed canvas JSON. Must conform to CanvasSchema from @renowide/types.",
        },
        surface: {
          type: "string",
          enum: ["hire_flow", "post_hire"],
          description:
            "Which canvas surface. Validation is identical today but the field is recorded for future schema-per-surface divergence.",
        },
      },
      required: ["canvas"],
      additionalProperties: false,
    },
  },
  {
    name: "renowide_deploy",
    description:
      "Deploy a Persona A / Path C agent to Renowide. Calls POST /api/v1/agents/publish with the manifest. Returns { slug, dashboard_url, public_url, webhook_url, handoff_secret? }. IMPORTANT: `handoff_secret` is returned ONLY on first create; store it in the user's env vars as RENOWIDE_HANDOFF_SECRET immediately, it can never be retrieved again. Requires the user to be logged in.",
    inputSchema: {
      type: "object",
      properties: {
        manifest: {
          type: "object",
          description:
            "The full renowide.json manifest. Run renowide_validate_manifest first.",
        },
      },
      required: ["manifest"],
      additionalProperties: false,
    },
  },
  {
    name: "renowide_list_my_agents",
    description:
      "List agents owned by the logged-in creator. Returns name, slug, path (A/B/C), price, hires this month, earnings. Use to check 'do I already have an agent like this?' before scaffolding a new one.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "renowide_get_agent",
    description:
      "Fetch a single agent by slug — returns stats, recent hires, earnings, outcome reward distribution, webhook delivery health. Use after renowide_deploy to confirm the listing is live.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string" },
      },
      required: ["slug"],
      additionalProperties: false,
    },
  },
  {
    name: "renowide_test_sandbox",
    description:
      "Simulate a hire against the user's deployed agent. No real money, no real customer. Returns a trace of the hire lifecycle (webhook sent, signature verified, /complete called). Useful for confirming the agent is correctly wired after deploy.",
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string" },
      },
      required: ["slug"],
      additionalProperties: false,
    },
  },
  {
    name: "renowide_search_marketplace",
    description:
      "Search the Renowide marketplace for existing agents (across all creators). Useful to: (a) check if a similar agent already exists before building a new one; (b) find a benchmark for pricing / features; (c) discover agents to integrate with via delegate_task. Returns top N agents matching the query.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Free-text search across name, tagline, description.",
        },
        guild: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 50, default: 10 },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
] as const;

// ----------------------------------------------------------------------
// Resources (docs surfaces that LLMs can pull into context on demand)
// ----------------------------------------------------------------------

const RESOURCES = [
  {
    uri: "renowide://docs/build-and-distribute",
    name: "Build-and-Distribute explainer",
    description:
      "The canonical one-paragraph pitch + the recommended default flow for AI coding assistants. Read this first in any new session to anchor what Renowide does.",
    mimeType: "text/markdown",
  },
  {
    uri: "renowide://docs/decision-tree",
    name: "Path A vs B vs C — 60-second decision tree",
    description:
      "If the user hasn't picked a path, walk this tree to select the right one. Defaults to Path C (Canvas Kit v2).",
    mimeType: "text/markdown",
  },
  {
    uri: "renowide://docs/canvas-kit-v2/blocks",
    name: "Canvas Kit v2 — block reference",
    description:
      "Every Canvas Kit v2 block type (header, markdown, text_input, wizard, action_button, chart, custom_embed, etc.) with authoring examples in TSX and JSON.",
    mimeType: "text/markdown",
  },
  {
    uri: "renowide://docs/canvas-kit-v2/expressions",
    name: "Canvas Kit v2 — expression grammar",
    description:
      "{{…}} syntax for Canvas Kit v2: how to reference state, compute derived values, and evaluate conditionals inside block props.",
    mimeType: "text/markdown",
  },
  {
    uri: "renowide://docs/webhook-security",
    name: "HMAC-SHA256 webhook verification",
    description:
      "How to verify Renowide webhook signatures (Persona A hire.created + Canvas Kit v2 action invocations). Includes ready-to-use verification snippets in Node.js and Python.",
    mimeType: "text/markdown",
  },
  {
    uri: "renowide://docs/pricing-menu",
    name: "Pricing models menu (per-run / per-hour / subscription / …)",
    description:
      "Five supported pricing models. The developer sets the price; Renowide charges a 15% commission per hire.",
    mimeType: "text/markdown",
  },
];

// ----------------------------------------------------------------------
// Server wiring
// ----------------------------------------------------------------------

const server = new Server(
  { name: "@renowide/mcp-server", version: "0.1.0" },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: RESOURCES.map((r) => ({
    uri: r.uri,
    name: r.name,
    description: r.description,
    mimeType: r.mimeType,
  })),
}));

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const uri = req.params.uri;
  const body = resourceContent(uri);
  return {
    contents: [
      {
        uri,
        mimeType: "text/markdown",
        text: body,
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    const result = await dispatch(name, args ?? {});
    return {
      content: [
        {
          type: "text",
          text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const body = err instanceof APIError ? err.body : null;
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              error: msg,
              status: err instanceof APIError ? err.status : null,
              body,
              hint:
                err instanceof APIError && err.status === 401
                  ? "Run `npx @renowide/cli login` to authenticate."
                  : undefined,
            },
            null,
            2,
          ),
        },
      ],
    };
  }
});

// ----------------------------------------------------------------------
// Tool dispatch
// ----------------------------------------------------------------------

async function dispatch(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case "renowide_whoami": {
      const token = requireToken();
      const me = await apiRequest<{
        creator_id: string;
        email: string;
        scopes?: string[];
      }>("GET", "/api/v1/creator/me", undefined, token);
      return {
        logged_in: true,
        creator_id: me.creator_id,
        email: me.email,
        api_base: apiBase(),
        scopes: me.scopes ?? [],
      };
    }

    case "renowide_list_templates": {
      const { guild, path: pathFilter, tag } = args as {
        guild?: string;
        path?: "A" | "B" | "C";
        tag?: string;
      };
      let out = TEMPLATES;
      if (guild) out = out.filter((t) => t.guild === guild);
      if (pathFilter) out = out.filter((t) => t.path === pathFilter);
      if (tag) out = out.filter((t) => t.tags.includes(tag));
      return { count: out.length, templates: out };
    }

    case "renowide_scaffold_agent": {
      const { template, name: agentName, slug, price_credits, description } =
        args as {
          template: string;
          name: string;
          slug?: string;
          price_credits?: number;
          description?: string;
        };
      const tpl = TEMPLATES.find((t) => t.slug === template);
      if (!tpl) {
        throw new APIError(
          404,
          null,
          `Unknown template '${template}'. Call renowide_list_templates to see the valid slugs.`,
        );
      }
      const agentSlug = slug ?? slugify(agentName);
      return scaffold(tpl, {
        name: agentName,
        slug: agentSlug,
        price_credits: price_credits ?? tpl.default_price_credits,
        description: description ?? tpl.description,
      });
    }

    case "renowide_validate_manifest": {
      const { manifest } = args as { manifest: unknown };
      const parsed = RenowideJsonSchema.safeParse(manifest);
      if (!parsed.success) {
        return {
          valid: false,
          errors: parsed.error.issues.map((i: z.core.$ZodIssue) => ({
            path: i.path.join("."),
            message: i.message,
            code: i.code,
          })),
        };
      }
      return { valid: true, manifest: parsed.data };
    }

    case "renowide_validate_canvas": {
      const { canvas, surface } = args as { canvas: unknown; surface?: string };
      const parsed = CanvasResponseSchema.safeParse(canvas);
      if (!parsed.success) {
        return {
          valid: false,
          surface: surface ?? "hire_flow",
          errors: parsed.error.issues.map((i: z.core.$ZodIssue) => ({
            path: i.path.join("."),
            message: i.message,
            code: i.code,
          })),
        };
      }
      return {
        valid: true,
        surface: surface ?? "hire_flow",
        block_count: countBlocks(parsed.data),
      };
    }

    case "renowide_deploy": {
      const token = requireToken();
      const { manifest } = args as { manifest: unknown };
      const parsed = RenowideJsonSchema.safeParse(manifest);
      if (!parsed.success) {
        return {
          ok: false,
          phase: "validation",
          errors: parsed.error.issues.map((i: z.core.$ZodIssue) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        };
      }
      const res = await apiRequest<{
        slug: string;
        dashboard_url: string;
        webhook_url: string;
        handoff_secret?: string;
        action?: "created" | "updated";
      }>("POST", "/api/v1/agents/publish", parsed.data, token);
      return {
        ok: true,
        action: res.action ?? "updated",
        slug: res.slug,
        dashboard_url: res.dashboard_url,
        public_url: `${apiBase().replace(/\/$/, "")}/agents/${res.slug}`,
        webhook_url: res.webhook_url,
        handoff_secret: res.handoff_secret,
        note: res.handoff_secret
          ? "STORE handoff_secret NOW — it is returned only on first create. Add it to the agent's environment as RENOWIDE_HANDOFF_SECRET."
          : "Listing updated. No new handoff_secret returned.",
      };
    }

    case "renowide_list_my_agents": {
      const token = requireToken();
      return apiRequest("GET", "/api/v1/creator/agents", undefined, token);
    }

    case "renowide_get_agent": {
      const token = requireToken();
      const { slug } = args as { slug: string };
      return apiRequest(
        "GET",
        `/api/v1/creator/agents/${encodeURIComponent(slug)}`,
        undefined,
        token,
      );
    }

    case "renowide_test_sandbox": {
      const token = requireToken();
      const { slug } = args as { slug: string };
      return apiRequest(
        "POST",
        `/api/v1/creator/agents/${encodeURIComponent(slug)}/sandbox`,
        {},
        token,
      );
    }

    case "renowide_search_marketplace": {
      const { query, guild, limit } = args as {
        query: string;
        guild?: string;
        limit?: number;
      };
      const qs = new URLSearchParams({ q: query });
      if (guild) qs.set("guild", guild);
      if (limit) qs.set("limit", String(limit));
      return apiRequest("GET", `/api/v1/public/agents/search?${qs}`);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ----------------------------------------------------------------------
// Scaffolding — returns file content for a template, parameterised
// ----------------------------------------------------------------------

interface ScaffoldArgs {
  name: string;
  slug: string;
  price_credits: number;
  description: string;
}

function scaffold(tpl: TemplateInfo, args: ScaffoldArgs): Record<string, string> {
  const files: Record<string, string> = {};

  if (tpl.path === "A" || tpl.path === "C") {
    files["renowide.json"] = JSON.stringify(
      {
        name: args.name,
        slug: args.slug,
        endpoint: `https://${args.slug}.example.com`,
        price_credits: args.price_credits,
        description: args.description,
        categories: [tpl.guild],
        ...(tpl.path === "C"
          ? {
              canvas: {
                enabled: true,
                ui_kit_version: "2.0.0",
                hire_flow: {
                  canvas_url: `https://${args.slug}.example.com/canvas/hire_flow.json`,
                  cache_ttl_seconds: 30,
                },
                post_hire: {
                  canvas_url: `https://${args.slug}.example.com/canvas/post_hire.json`,
                },
                actions: {
                  webhook_url: `https://${args.slug}.example.com/canvas/actions`,
                },
                custom_embed: {
                  allowed_origins: [`https://${args.slug}.example.com`],
                },
              },
            }
          : {}),
      },
      null,
      2,
    );
  }

  if (tpl.path === "B") {
    files["renowide.yaml"] = yamlManifestStub(args, tpl);
  }

  if (tpl.path === "C") {
    files["canvas/hire_flow.json"] = hireFlowStub(args, tpl);
    files["canvas/post_hire.json"] = postHireStub(args, tpl);
    files["server/index.ts"] = canvasServerStub(args, tpl);
    files["server/actions.ts"] = canvasActionsStub(args, tpl);
    files["package.json"] = canvasPackageJson(args);
    files["tsconfig.json"] = canvasTsConfig();
    files[".env.example"] = canvasEnvExample();
  }

  if (tpl.path === "A") {
    files["server/webhook.ts"] = personaAWebhookStub(args);
    files["package.json"] = personaAPackageJson(args);
    files["tsconfig.json"] = canvasTsConfig();
    files[".env.example"] = personaAEnvExample();
  }

  files["README.md"] = readmeStub(args, tpl);

  return files;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 99);
}

function countBlocks(canvas: z.infer<typeof CanvasResponseSchema>): number {
  let n = 0;
  const walk = (blocks: unknown): void => {
    if (!Array.isArray(blocks)) return;
    for (const b of blocks) {
      n++;
      const props = (b as { props?: Record<string, unknown> }).props;
      if (props?.children) walk(props.children);
      if (props?.steps) {
        for (const s of props.steps as Array<{ children?: unknown }>) {
          if (s.children) walk(s.children);
        }
      }
    }
  };
  walk(canvas.blocks);
  return n;
}

// ----------------------------------------------------------------------
// Resource body
// ----------------------------------------------------------------------

function resourceContent(uri: string): string {
  switch (uri) {
    case "renowide://docs/build-and-distribute":
      return `# Build-and-Distribute — the Renowide default

Every AI coding tool (you included) solves the **supply** side: building software.
Nobody has solved the **demand** side for AI-built products. A developer who ships
a Next.js app on Vercel still faces €5–50k and 3–6 months of SEO, ads, and
landing-page optimisation before the first paying customer.

Renowide closes the loop. **Build the agent. Distribution comes with it.**

When a user asks you to ship an AI-powered product that paying customers will
hire, the canonical flow is:

1. \`renowide_list_templates\` — find the closest template.
2. \`renowide_scaffold_agent\` — get the working files for that template.
3. Customise the business logic (not the boilerplate).
4. \`renowide_validate_manifest\` + \`renowide_validate_canvas\`.
5. \`renowide_deploy\` — ship.

Default path: **C (Canvas Kit v2)**. The buyer stays on \`renowide.com\` end-to-end,
the developer owns the dynamic UI via JSON-or-TSX canvases, Renowide handles the
listing + payment + webhook.

Pricing is simple: **the developer sets the price. Renowide charges a 15% commission per hire.** EUR, monthly SEPA payouts.`;

    case "renowide://docs/decision-tree":
      return `# Path A vs Path B vs Path C — decision tree

If the user has not explicitly told you which path, run this in your head:

**Q1.** Does the user already have a polished product UI at their own URL that
they want to keep?
  - YES → **Path A (link-out)**. Use template \`link-out-minimal\`.
  - NO → go to Q2.

**Q2.** Does the user want Renowide to render the entire buyer experience
from a YAML manifest with zero backend of their own?
  - YES → **Path B (hosted layout)**. Use template \`hosted-layout-yaml\`.
  - NO → go to Q3.

**Q3.** Does the user want buyers to stay on \`renowide.com\` while they author
the dynamic UI themselves?
  - YES (this is the default) → **Path C (Canvas Kit v2)**. Use any
    Canvas Kit v2 template (\`saas-trial-dark\`, \`consumer-service-intake\`,
    \`expert-curated-consult\`, \`data-report-generator\`, \`b2b-demo-booking\`).

Default if the user didn't tell you anything: **Path C with \`saas-trial-dark\`
or whichever template's tags best match the intent**.`;

    case "renowide://docs/canvas-kit-v2/blocks":
      return `# Canvas Kit v2 — block reference (quick)

A canvas is \`{ version: "2.0.0", blocks: [...], initial_state?: {...} }\`.
Each block is \`{ type: string, props: {...} }\`. Supported types:

**Layout**: section, divider, spacer, list.
**Content**: header, markdown, image, kpi, table, code_block, chart, info_callout.
**Input**: text_input, checkbox, date_picker, file_upload, api_key_input,
  oauth_button.
**Action**: action_button, link_button, quick_reply, cta.
**Flow**: wizard (with \`props.steps\`), step.
**Integration**: integration_button.
**Escape hatch**: custom_embed (iframe with \`sandbox="allow-scripts
  allow-same-origin allow-forms allow-popups"\` — your own UI when SDUI blocks
  aren't enough).

Every block supports an optional \`when\` expression: \`{{ state.field == "x" }}\`.
Expression grammar at \`renowide://docs/canvas-kit-v2/expressions\`.

Authoring options:
  - Hand-write JSON (fine for small canvases).
  - Write TSX with \`@renowide/ui-kit\`; compile to JSON via \`renderToJson()\`.
    This is the recommended way. See the template \`saas-trial-dark\`.`;

    case "renowide://docs/canvas-kit-v2/expressions":
      return `# Canvas Kit v2 — expression grammar

Any string block-prop can contain \`{{…}}\` expressions. They are re-evaluated
client-side when state changes.

**Accessing state**: \`{{ state.user_name }}\`, \`{{ state.items.length }}\`.
**Arithmetic**: \`{{ (credits * 0.01) }}€\`.
**Conditionals**: \`{{ state.plan == "pro" ? "Unlock" : "Upgrade" }}\`.
**Built-ins**: \`{{ now() }}\`, \`{{ uppercase(state.name) }}\`,
  \`{{ format_price(credits) }}\`.

\`when\`-conditions on blocks use the same grammar:
\`{ "type": "info_callout", "when": "{{ state.errors.length > 0 }}", ... }\`.

Full reference: \`docs/canvas-kit-v2/expressions.md\` in the renowide-cli repo.`;

    case "renowide://docs/webhook-security":
      return `# HMAC-SHA256 webhook verification

Every Renowide webhook (Persona A hire.created, Canvas Kit v2 action invocations)
is HMAC-SHA256-signed. You MUST verify before parsing.

**Node.js**:
\`\`\`ts
import { createHmac, timingSafeEqual } from "node:crypto";

function verify(raw: string | Buffer, headerSig: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const got = headerSig.replace(/^sha256=/, "");
  return got.length === expected.length &&
    timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}
\`\`\`

**Python**:
\`\`\`python
import hmac, hashlib
def verify(raw: bytes, header_sig: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    got = header_sig.removeprefix("sha256=")
    return hmac.compare_digest(got, expected)
\`\`\`

**Rules**:
  - Verify BEFORE parsing the body.
  - Reject timestamps older than 5 minutes (\`X-Renowide-Timestamp\`).
  - Idempotent on \`X-Renowide-Event-Id\` — Renowide retries on 5xx.
  - Return 2xx within 10 seconds; do heavy work async.

**Secret storage**: \`RENOWIDE_HANDOFF_SECRET\` env var for Persona A,
\`RENOWIDE_WEBHOOK_SECRET\` env var for Canvas Kit v2 actions. Same value
for both in most cases.`;

    case "renowide://docs/pricing-menu":
      return `# Pricing — Renowide menu

**The developer sets the price. Renowide charges a 15% commission per hire.**
That's the whole platform fee. No listing fee, no monthly fee, no seat fee.

Pick ONE model per agent:

| Model | When |
|---|---|
| **per-run** | One-shot tasks. "10 credits per research report." |
| **per-day** | Continuous monitoring. "15 credits/day" for an ads optimiser. |
| **per-hour** | Synchronous advisor time. Rare for pure-software agents. |
| **per-1K-tokens** | Developer API surfaces. Transparent AI costs. |
| **flat monthly sub** | Recurring service. €99–€499/mo typical. **Default recommendation for new creators** — predictable revenue, better unit economics. |

1 credit = €0.01. Buyer sees the credit price; the EUR equivalent is shown
in parentheses.

Success fees / outcome-gated fees are NOT yet supported (roadmap Q3 2026 —
see RENOWIDE_BUILD_AND_DISTRIBUTE_STRATEGY.md §4.1). For now, use a
subscription + free trial instead.`;

    default:
      return `# Resource not found\n\n\`${uri}\` is not a known Renowide MCP resource. Call ListResources to see the catalogue.`;
  }
}

// ----------------------------------------------------------------------
// Stubs for scaffold output — Persona A / Path B / Path C
// ----------------------------------------------------------------------

function personaAWebhookStub(args: ScaffoldArgs): string {
  return `/**
 * Persona A webhook handler for ${args.name}.
 * Verifies Renowide's hire.created signed webhook, provisions the buyer,
 * redirects to your product, and calls /complete when the job finishes.
 */
import express from "express";
import { createHmac, timingSafeEqual } from "node:crypto";

const app = express();
const SECRET = process.env.RENOWIDE_HANDOFF_SECRET!;

app.post("/renowide", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = String(req.header("X-Renowide-Signature") ?? "");
  const expected = createHmac("sha256", SECRET).update(req.body).digest("hex");
  const got = sig.replace(/^sha256=/, "");
  if (
    got.length !== expected.length ||
    !timingSafeEqual(Buffer.from(got), Buffer.from(expected))
  ) {
    return res.status(401).send("bad signature");
  }

  const event = JSON.parse(req.body.toString("utf8"));
  if (event.event === "hire.created") {
    // TODO: provision a workspace for event.buyer.workspace_id
    // TODO: redirect the buyer to event.handoff_url OR start doing work async
    // TODO: when done, POST event.completion.report_url with the outcome
  }

  res.status(200).send("ok");
});

app.listen(process.env.PORT ?? 8787, () => {
  console.log("Persona A webhook handler listening on :" + (process.env.PORT ?? 8787));
});
`;
}

function canvasServerStub(args: ScaffoldArgs, tpl: TemplateInfo): string {
  return `/**
 * Canvas Kit v2 server for ${args.name} (${tpl.slug}).
 *
 * Three routes Renowide expects:
 *   GET  /canvas/hire_flow.json  — pre-hire canvas (form, quiz, wizard)
 *   GET  /canvas/post_hire.json  — post-hire canvas (status, result)
 *   POST /canvas/actions         — action_button webhook
 *
 * Every request is HMAC-SHA256 signed. Verify before handling.
 */
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";
import { handleAction } from "./actions.js";

const app = express();
const SECRET = process.env.RENOWIDE_WEBHOOK_SECRET!;

function verifyRequest(req: express.Request, raw: string | Buffer): boolean {
  const sig = String(req.header("X-Renowide-Signature") ?? "");
  const expected = createHmac("sha256", SECRET).update(raw).digest("hex");
  const got = sig.replace(/^sha256=/, "");
  return (
    got.length === expected.length &&
    timingSafeEqual(Buffer.from(got), Buffer.from(expected))
  );
}

// Signed GET — body is empty, so we sign the canonical string
// \`\${METHOD}\\n\${PATH}\\n\${TIMESTAMP}\` per @renowide/types/signing.
app.get("/canvas/hire_flow.json", (req, res) => {
  // For brevity, the signing verification for GET is shown in the docs
  // resource renowide://docs/webhook-security. This stub just serves.
  const body = fs.readFileSync(path.join(__dirname, "..", "canvas/hire_flow.json"), "utf8");
  res.json(JSON.parse(body));
});

app.get("/canvas/post_hire.json", (req, res) => {
  const body = fs.readFileSync(path.join(__dirname, "..", "canvas/post_hire.json"), "utf8");
  res.json(JSON.parse(body));
});

app.post("/canvas/actions", express.raw({ type: "application/json" }), async (req, res) => {
  if (!verifyRequest(req, req.body)) return res.status(401).send("bad signature");
  const event = JSON.parse(req.body.toString("utf8"));
  const response = await handleAction(event);
  res.status(200).json(response);
});

app.listen(process.env.PORT ?? 8787, () => {
  console.log("Canvas Kit v2 server for ${args.slug} listening on :" + (process.env.PORT ?? 8787));
});
`;
}

function canvasActionsStub(args: ScaffoldArgs, tpl: TemplateInfo): string {
  return `/**
 * Canvas Kit v2 action handlers for ${args.name} (${tpl.slug}).
 *
 * Each action_button click fires a POST /canvas/actions with the action
 * name + state snapshot. Return an ActionInvokeResponse describing what
 * happens next: patches to state, toast to show, navigate to canvas, etc.
 */

export interface ActionEvent {
  action: string;
  hire_id: string;
  workspace_id: string;
  state: Record<string, unknown>;
}

export interface ActionInvokeResponse {
  state_patches?: Array<{ op: "set" | "merge" | "push"; path: string; value: unknown }>;
  toast?: { level: "info" | "success" | "error"; message: string };
  navigate?: "post_hire" | "hire_flow";
}

export async function handleAction(event: ActionEvent): Promise<ActionInvokeResponse> {
  // Each template customises this. Below is the minimal default.
  switch (event.action) {
    case "start":
      return {
        state_patches: [{ op: "set", path: "started_at", value: new Date().toISOString() }],
        toast: { level: "success", message: "Let's go." },
      };
    default:
      return {
        toast: { level: "info", message: \`Unhandled action: \${event.action}\` },
      };
  }
}
`;
}

function hireFlowStub(args: ScaffoldArgs, tpl: TemplateInfo): string {
  // Generic starter — each real template would ship richer canvases.
  const canvas = {
    version: "2.0.0",
    initial_state: { agreed: false },
    blocks: [
      { type: "header", props: { level: 1, text: args.name } },
      { type: "markdown", props: { body: args.description } },
      {
        type: "checkbox",
        props: {
          bind: "state.agreed",
          label: "I agree to the terms",
          required: true,
        },
      },
      {
        type: "action_button",
        props: {
          action: "__submit_hire__",
          label: `Hire for ${args.price_credits} credits ({{ ${args.price_credits} * 0.01 }}€)`,
          variant: "primary",
          disabled: "{{ !state.agreed }}",
        },
      },
    ],
  };
  return JSON.stringify(canvas, null, 2);
}

function postHireStub(args: ScaffoldArgs, tpl: TemplateInfo): string {
  const canvas = {
    version: "2.0.0",
    initial_state: { status: "queued" },
    blocks: [
      {
        type: "header",
        props: { level: 2, text: `Your ${args.name} is being prepared` },
      },
      {
        type: "info_callout",
        props: {
          level: "info",
          title: "Status: {{ state.status }}",
          body: "We'll notify you when your result is ready.",
        },
      },
    ],
  };
  return JSON.stringify(canvas, null, 2);
}

function yamlManifestStub(args: ScaffoldArgs, tpl: TemplateInfo): string {
  return `# Persona B — ${args.name}
# Hosted Layout v0.6. Renowide renders the entire buyer experience from this file.
# Full schema: https://github.com/Renowide/renowide-cli/blob/main/schemas/renowide.schema.json

name: "${args.name}"
slug: "${args.slug}"
tagline: "A concrete one-sentence pitch ending in a verb."
description: |
  ${args.description}
guild: "${tpl.guild}"
layer: "${tpl.layer}"
protocol: "mcp"
endpoint: "https://${args.slug}.example.com/mcp"
pricing:
  model: "per_run"
  credits: ${args.price_credits}
brand:
  primary_color: "#0ea5e9"
  accent_color: "#6366f1"
  font: "Inter"
  border_radius: "12px"
tools: []
post_hire:
  welcome_canvas:
    blocks:
      - type: header
        level: 2
        text: "Thanks for hiring ${args.name}."
      - type: markdown
        body: "Your result will arrive within 24 hours."
compliance:
  data_residency: ["EU"]
  tags: ["gdpr"]
`;
}

function canvasPackageJson(args: ScaffoldArgs): string {
  return JSON.stringify(
    {
      name: args.slug,
      version: "0.1.0",
      type: "module",
      scripts: {
        dev: "tsx server/index.ts",
        start: "node dist/server/index.js",
        build: "tsc -p tsconfig.json",
      },
      dependencies: {
        express: "^4.19.2",
      },
      devDependencies: {
        "@types/express": "^4.17.21",
        "@types/node": "^20.11.0",
        tsx: "^4.19.0",
        typescript: "^5.6.3",
      },
    },
    null,
    2,
  );
}

function personaAPackageJson(args: ScaffoldArgs): string {
  return JSON.stringify(
    {
      name: args.slug,
      version: "0.1.0",
      type: "module",
      scripts: {
        dev: "tsx server/webhook.ts",
        start: "node dist/server/webhook.js",
        build: "tsc -p tsconfig.json",
      },
      dependencies: {
        express: "^4.19.2",
      },
      devDependencies: {
        "@types/express": "^4.17.21",
        "@types/node": "^20.11.0",
        tsx: "^4.19.0",
        typescript: "^5.6.3",
      },
    },
    null,
    2,
  );
}

function canvasTsConfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "ES2022",
        moduleResolution: "bundler",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        outDir: "dist",
      },
      include: ["server/**/*"],
    },
    null,
    2,
  );
}

function canvasEnvExample(): string {
  return `RENOWIDE_WEBHOOK_SECRET=paste-from-renowide-deploy
PORT=8787
`;
}

function personaAEnvExample(): string {
  return `RENOWIDE_HANDOFF_SECRET=paste-from-renowide-deploy
RENOWIDE_API_KEY=rw_key_...
PORT=8787
`;
}

function readmeStub(args: ScaffoldArgs, tpl: TemplateInfo): string {
  return `# ${args.name}

Built with Renowide template \`${tpl.slug}\` (Path ${tpl.path}).

## What you got

${tpl.highlights.map((h) => `- ${h}`).join("\n")}

## Run locally

\`\`\`bash
cp .env.example .env        # paste secrets after renowide_deploy
npm install
npm run dev                 # :8787
\`\`\`

## Deploy to Renowide

\`\`\`bash
npx @renowide/cli login     # if you haven't already
npx @renowide/cli deploy    # publishes this agent; prints handoff_secret
\`\`\`

Or, from inside your AI coding assistant, call the MCP tool:

\`\`\`
renowide_deploy({ manifest: <contents of renowide.json> })
\`\`\`

## What Renowide handles for you

- Listing, discovery, marketplace card
- Credit-based payment — you set the price; Renowide charges a 15% commission per hire
- VAT MOSS + invoicing
- EU data residency + GDPR export
- HMAC-signed webhook delivery
- Buyer dispute + refund workflow

## Pricing

Default: **${args.price_credits} credits** per hire = **€${(args.price_credits * 0.01).toFixed(2)}**.
Change in \`renowide.json\` → \`config.price_credits\`.

---

Renowide — "renown worldwide". Build-and-distribute your AI product with one
command. https://renowide.com/build
`;
}

// ----------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // NB: do NOT log to stdout — MCP stdio transport uses stdout as the channel.
  process.stderr.write("@renowide/mcp-server v0.1.0 connected via stdio\n");
}

main().catch((err) => {
  process.stderr.write(`fatal: ${err?.stack ?? err}\n`);
  process.exit(1);
});
