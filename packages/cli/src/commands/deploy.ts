/**
 * `renowide deploy` — publish a Persona A link-out agent.
 *
 * This is the "I already have my own UI/UX, just give me demand + payment"
 * on-ramp. The dev has an existing AI agent at some endpoint
 * (e.g. https://my-agent.com) and wants Renowide to:
 *   • list it in the marketplace,
 *   • handle buyer discovery and prepayment,
 *   • send a signed `hire.created` webhook when someone hires,
 *   • release funds when the dev POSTs the completion callback.
 *
 * The full integration is three things:
 *   1. a local `renowide.json` (this file is what `deploy` consumes),
 *   2. a webhook handler on their server,
 *   3. one `POST /api/v1/hire/{hire_id}/complete` call when the job's done.
 *
 * ## Why JSON and not YAML
 * The existing `renowide publish` command consumes a full `renowide.yaml`
 * manifest (Persona B: Canvas Kit, tools, post-hire flow, i18n, brand,
 * variants…). Persona A doesn't need any of that — they have their own
 * UI. A minimal 3-field config in JSON signals "this is the light path"
 * and prevents every Persona A dev from wrestling with YAML indentation
 * and the 40+ optional manifest fields.
 *
 * ## Flow
 *   1. Read `renowide.json` (or --config <path>).
 *   2. Validate with zod — reject early with a precise error.
 *   3. On --dry-run: print the resolved config and exit.
 *   4. Otherwise: POST /api/v1/agents/publish (Bearer rw_key_ from
 *      ~/.renowide/credentials). The server:
 *        - creates or upserts an AgentProfile with protocol="external",
 *        - mints a handoff_secret the dev uses to verify `rw_hire` JWTs
 *          and `Renowide-Signature` HMAC webhook bodies,
 *        - returns { slug, dashboard_url, webhook_url, handoff_secret }.
 *   5. Print handoff_secret ONCE with a hard-red warning — it is never
 *      returned again. Next time the dev runs `deploy` the server
 *      recognises the slug and returns without a secret (updates only).
 *   6. Write `.renowide-deploy.json` next to the config as a cache of
 *      `{ slug, dashboard_url }` — NEVER the secret. Used by subsequent
 *      `renowide hire show` and `renowide status --agent <slug>` calls
 *      to locate the right agent without the user retyping the slug.
 *
 * See RENOWIDE_PERSONA_A_ONRAMP.md for the full protocol.
 */

import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { z } from "zod";

import { ManifestCanvasBlockSchema } from "@renowide/types/manifest";

import { RenowideAPI } from "../api.js";
import { requireCredentials, loadCredentials } from "../config.js";

// Public page at which the agent will (or does) live once published.
function forecastPublicUrl(apiBase: string, slug: string): string {
  const host = apiBase.replace(/\/api\/v1\/?$/, "").replace(/\/$/, "");
  return `${host}/agents/${slug}`;
}

// Best-effort endpoint probe — HEAD first, GET fallback. Never throws.
async function probeUrl(url: string, timeoutMs = 4000): Promise<{
  ok: boolean;
  status: number | null;
  note: string;
}> {
  const deadline = Date.now() + timeoutMs;
  const remaining = () => Math.max(100, deadline - Date.now());

  const ctlHead = new AbortController();
  const headTimer = setTimeout(() => ctlHead.abort(), timeoutMs);
  try {
    // HEAD attempt. On non-Abort network errors (e.g. HEAD-unsupported
    // servers that respond to GET only), retry with a fresh controller
    // so the remaining deadline — not an already-aborted signal — gates
    // the fallback.
    const res = await fetch(url, { method: "HEAD", signal: ctlHead.signal }).catch(
      async (err) => {
        if (err?.name === "AbortError") throw err;
        clearTimeout(headTimer);
        const ctlGet = new AbortController();
        const getTimer = setTimeout(() => ctlGet.abort(), remaining());
        try {
          return await fetch(url, { method: "GET", signal: ctlGet.signal });
        } finally {
          clearTimeout(getTimer);
        }
      },
    );
    clearTimeout(headTimer);
    // 2xx/3xx = healthy. 4xx = reachable but misconfigured (still counts as "DNS + TLS
    // resolved"). 5xx or network errors = red flag.
    const healthy = res.status >= 200 && res.status < 400;
    const reachable = res.status >= 200 && res.status < 500;
    const label = healthy
      ? `${res.status} OK`
      : reachable
        ? `${res.status} reachable`
        : `${res.status} ${res.statusText || "error"}`;
    return { ok: reachable, status: res.status, note: label };
  } catch (err: any) {
    clearTimeout(headTimer);
    if (err?.name === "AbortError") {
      return { ok: false, status: null, note: `timed out after ${timeoutMs}ms` };
    }
    return {
      ok: false,
      status: null,
      note: err?.message?.split("\n")[0] || "unreachable",
    };
  }
}

async function runDryRunPreview(
  config: z.infer<typeof RenowideJsonSchema>,
): Promise<void> {
  const creds = loadCredentials(); // may be null — dry-run does not require auth
  const apiBase = creds?.apiBase || "https://renowide.com";
  const forecastSlug =
    config.slug || config.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const publicUrl = forecastPublicUrl(apiBase, forecastSlug);

  console.log("");
  console.log(pc.gray("── dry run — no API call, no writes ──"));
  console.log("");

  // ── 1. Reachability probes ──────────────────────────────────────────────
  console.log(pc.bold("Pre-flight checks"));

  // mcp_client agents have no endpoint to probe — skip the URL check.
  if (config.protocol === "mcp_client") {
    console.log(pc.green("✓") + " Protocol: mcp_client (no public URL required)");
    console.log(pc.gray("  Hire events are delivered via the Renowide MCP session."));
    console.log(pc.gray("  Docs: https://github.com/Renowide/renowide-cli/blob/main/docs/openclaw-listing.md"));
    console.log("");
    console.log(pc.gray("(dry run complete — no API call made)"));
    return;
  }

  const endpointProbe = await probeUrl(config.endpoint!);
  const endpointHealthy =
    endpointProbe.status !== null &&
    endpointProbe.status >= 200 &&
    endpointProbe.status < 400;
  const endpointMark = endpointHealthy
    ? pc.green("✓")
    : endpointProbe.ok
      ? pc.yellow("!")
      : pc.red("✗");
  console.log(
    `  ${endpointMark} endpoint       ${config.endpoint}  ${pc.gray(`(${endpointProbe.note})`)}`,
  );
  if (!endpointHealthy && endpointProbe.ok) {
    console.log(
      pc.gray(
        `      endpoint responded but not 2xx/3xx — buyers clicking "Hire" will land on this URL.`,
      ),
    );
  }
  if (config.webhook_url) {
    const webhookProbe = await probeUrl(config.webhook_url);
    console.log(
      `  ${webhookProbe.ok ? pc.green("✓") : pc.yellow("?")} webhook_url    ${config.webhook_url}  ${pc.gray(`(${webhookProbe.note})`)}`,
    );
    if (!webhookProbe.ok) {
      console.log(
        pc.gray(
          `      webhook probes often 405/401 by design — that's fine; a real hire will POST here.`,
        ),
      );
    }
  } else {
    console.log(
      `  ${pc.gray("–")} webhook_url    ${pc.gray("not set — Renowide will default to <endpoint>/api/renowide/hire")}`,
    );
  }
  if (config.icon_url) {
    const iconProbe = await probeUrl(config.icon_url);
    console.log(
      `  ${iconProbe.ok ? pc.green("✓") : pc.yellow("!")} icon_url       ${config.icon_url}  ${pc.gray(`(${iconProbe.note})`)}`,
    );
  }
  // ── Canvas Kit v2 checks (only if `canvas` block is present) ──────────
  if (config.canvas) {
    console.log("");
    console.log(pc.bold(`Canvas Kit v2 (ui_kit ${config.canvas.ui_kit_version || "default"})`));
    if (config.canvas.hire_flow?.canvas_url) {
      const hf = await probeUrl(config.canvas.hire_flow.canvas_url);
      console.log(
        `  ${hf.ok ? pc.green("✓") : pc.red("✗")} hire_flow      ${config.canvas.hire_flow.canvas_url}  ${pc.gray(`(${hf.note})`)}`,
      );
      console.log(
        pc.gray(
          "      Renowide GETs this URL (signed) when a buyer opens the pre-hire surface.",
        ),
      );
    } else {
      console.log(pc.gray("  –  hire_flow.canvas_url   (not set — pre-hire surface disabled)"));
    }
    if (config.canvas.post_hire?.canvas_url) {
      const ph = config.canvas.post_hire.canvas_url;
      const isAbs = /^https?:\/\//.test(ph);
      if (isAbs) {
        const phProbe = await probeUrl(ph);
        console.log(
          `  ${phProbe.ok ? pc.green("✓") : pc.red("✗")} post_hire      ${ph}  ${pc.gray(`(${phProbe.note})`)}`,
        );
      } else {
        console.log(
          `  ${pc.yellow("?")} post_hire      ${ph}  ${pc.gray("(relative — resolved server-side with {hire_id})")}`,
        );
      }
    } else {
      console.log(
        pc.gray("  –  post_hire.canvas_url   (not set — buyer stays on pre-hire canvas post-hire)"),
      );
    }
    if (config.canvas.custom_embed) {
      const origins = config.canvas.custom_embed.allowed_origins ?? [];
      if (origins.length === 0) {
        console.log(
          pc.yellow(
            "  ⚠ custom_embed.allowed_origins is empty — Renowide will reject all custom_embed iframes",
          ),
        );
      } else {
        console.log(`  ${pc.green("✓")} custom_embed    ${origins.length} allowed origin(s): ${origins.join(", ")}`);
      }
    }
  }
  console.log("");

  // ── 2. Marketplace listing preview ──────────────────────────────────────
  console.log(pc.bold("Listing preview (buyer's view)"));
  const box = (line: string) => `  │ ${line.padEnd(70)} │`;
  const rule = "  ┌" + "─".repeat(72) + "┐";
  const base = "  └" + "─".repeat(72) + "┘";
  console.log(rule);
  console.log(box(pc.bold(config.name)));
  if (config.description) {
    const desc = config.description.length > 68
      ? config.description.slice(0, 65) + "..."
      : config.description;
    console.log(box(pc.gray(desc)));
  }
  console.log(box(""));
  console.log(box(
    config.price_credits
      ? `Price:   ${config.price_credits} credits per hire`
      : `Price:   (draft — set price_credits before going public)`,
  ));
  console.log(
    box(
      `Guild:   ${(config.categories?.[0] || "unclassified").padEnd(20)}  Path: A (link-out)`,
    ),
  );
  if (config.completion_timeout_minutes) {
    const mins = config.completion_timeout_minutes;
    const readable =
      mins < 60
        ? `${mins} min`
        : mins < 1440
          ? `${Math.round(mins / 60)} h`
          : `${Math.round(mins / 1440)} days`;
    console.log(box(`Timeout: ${readable}`));
  }
  console.log(box(""));
  console.log(box(pc.gray("[ Hire this agent → ]   would redirect buyer to:")));
  console.log(box(pc.gray(`  ${config.endpoint}`)));
  console.log(base);
  console.log("");

  // ── 3. What publishing would do ─────────────────────────────────────────
  console.log(pc.bold("What `renowide deploy` would do"));
  console.log(`  • POST ${apiBase}/api/v1/agents/publish`);
  console.log(`  • Create or update an AgentProfile with slug  ${pc.bold(forecastSlug)}`);
  console.log(`  • Return a handoff_secret (shown once only)`);
  console.log(`  • List the agent publicly at  ${pc.underline(publicUrl)}`);
  console.log("");

  // ── 4. Blocking issues ──────────────────────────────────────────────────
  const blockers: string[] = [];
  if (!endpointProbe.ok) {
    blockers.push(
      `endpoint ${config.endpoint} is unreachable — buyers clicking "Hire" would hit a broken link`,
    );
  }
  if (blockers.length > 0) {
    console.log(pc.red("Blocking issues — fix before `renowide deploy`:"));
    for (const b of blockers) console.log(pc.red(`  • ${b}`));
    console.log("");
    process.exitCode = 1;
  } else {
    console.log(pc.green("✓ Dry-run passed. Run `renowide deploy` (without --dry-run) to publish."));
    console.log("");
  }
}

// ─── renowide.json schema ────────────────────────────────────────────────────
// Keep the required surface as narrow as physically possible. Every extra
// required field is one more reason a first-time user bounces. Everything
// that can have a sensible default, has one server-side.

const RenowideJsonSchema = z
  .object({
    // REQUIRED — name and price are always required.
    name: z
      .string()
      .min(2, "name must be at least 2 chars")
      .max(80, "name must be ≤ 80 chars"),
    // price_credits is required for public listings, optional for drafts.
    // The cross-field refine below enforces this: if visibility is "public"
    // and price_credits is absent, validation fails with a clear message.
    price_credits: z
      .number()
      .int("price_credits must be a whole number")
      .positive("price_credits must be > 0")
      .max(10_000, "price_credits over 10 000 is almost certainly a typo")
      .optional(),

    // ── Protocol ──────────────────────────────────────────────────────────
    // "external"   (default) — buyer is redirected to `endpoint`; Renowide
    //              fires a signed webhook on hire. Requires `endpoint`.
    //
    // "mcp_client" — for OpenClaw / Cursor / Claude Code agents that run
    //              locally or on a private server. NO public URL needed.
    //              Renowide routes hire events through the creator's
    //              authenticated MCP session. The agent polls for work via
    //              `renowide_poll_hires` and reports completion via
    //              `renowide_complete_hire`. Creator authenticates once with
    //              `renowide login --key rw_key_...` and the session handles
    //              everything. Machine-to-machine payments in USDC on Base L2.
    protocol: z
      .enum(["external", "mcp_client"])
      .optional()
      .default("external"),

    // endpoint — required for protocol "external", forbidden for "mcp_client".
    endpoint: z
      .string()
      .url("endpoint must be a valid https:// URL")
      .refine((u) => u.startsWith("https://"), {
        message: "endpoint must use https:// (http is rejected in prod)",
      })
      .optional(),

    // OPTIONAL — sensible defaults applied server-side, shown here so the
    // dev knows what knobs exist without reading the docs.
    slug: z
      .string()
      .regex(
        /^[a-z0-9][a-z0-9-]{1,40}[a-z0-9]$/,
        "slug must be lowercase kebab-case (a-z, 0-9, dash)",
      )
      .optional(),
    description: z.string().max(500).optional(),
    icon_url: z.string().url().optional(),
    categories: z.array(z.string()).max(5).optional(),
    webhook_url: z
      .string()
      .url()
      .refine((u) => u.startsWith("https://"), {
        message: "webhook_url must use https://",
      })
      .optional(),
    // Cap at 30 days — beyond that the payout ops queue gets awkward.
    completion_timeout_minutes: z
      .number()
      .int()
      .min(5, "completion timeout must be ≥ 5 minutes")
      .max(43_200, "completion timeout must be ≤ 30 days (43200 min)")
      .optional(),
    sandbox_endpoint: z.string().url().optional(),

    // ── Visibility ────────────────────────────────────────────────────────
    // "public"  (default) — live in marketplace, price required.
    // "draft"             — saved to creator dashboard only, not searchable,
    //                       price not required. Use to test / set up first.
    visibility: z.enum(["public", "draft"]).optional().default("public"),

    // ── EU AI Act compliance fields (Gap 6) ───────────────────────────────
    // Optional for minimal/limited risk agents; required before going public
    // for high-risk agents (finance credit-scoring, healthcare clinical,
    // recruitment hiring decisions, construction safety-critical infra).
    //
    // These fields feed:
    //   - The Art. 4 AI Literacy Pack (auto-generated at every hire)
    //   - The Art. 13 Deployer Disclosure (auto-generated at hire time)
    //   - The Art. 11 Technical Documentation (POST generate-eu-tech-docs)
    //   - The precision risk classifier (narrows finance/healthcare/etc.)
    //
    // EU AI Act Art. 11 + 13 required fields for high-risk agents:
    intended_purpose: z
      .string()
      .max(2000)
      .optional()
      .describe(
        "What this agent is designed to do and in what context. " +
        "Required for Art. 11 technical documentation (high-risk agents). " +
        "Example: 'Assess creditworthiness of individual applicants for personal loans under €50,000'"
      ),
    known_limitations: z
      .array(z.string().max(300))
      .max(20)
      .optional()
      .describe(
        "List of declared limitations staff must be aware of. " +
        "Required for Art. 13 deployer transparency (high-risk agents). " +
        "Example: ['Not validated on applicants outside EU-27', 'Requires 24+ months of credit history']"
      ),
    foreseeable_misuse: z
      .array(z.string().max(300))
      .max(10)
      .optional()
      .describe(
        "Scenarios where this agent should NOT be used, or special care is required. " +
        "Required for Art. 13 deployer transparency."
      ),
    // Binary intent flags — the most reliable EU AI Act risk signal.
    // A 'yes' to any of these triggers the matching Annex III high-risk category.
    // Without explicit flags, the risk classifier falls back to keyword matching
    // against intended_purpose + description.
    makes_credit_decisions: z
      .boolean()
      .optional()
      .describe(
        "Set to true if this agent assesses creditworthiness or scores credit. " +
        "Triggers Annex III §5(b) HIGH RISK. Required for accuracy."
      ),
    makes_hiring_decisions: z
      .boolean()
      .optional()
      .describe(
        "Set to true if this agent screens job candidates or informs hiring decisions. " +
        "Triggers Annex III §4 HIGH RISK."
      ),
    makes_clinical_decisions: z
      .boolean()
      .optional()
      .describe(
        "Set to true if this agent informs clinical or diagnostic decisions. " +
        "Triggers Annex III §5(a) HIGH RISK."
      ),
    processes_biometrics: z
      .boolean()
      .optional()
      .describe(
        "Set to true if this agent processes biometric data for identification. " +
        "Triggers Annex III §1 HIGH RISK."
      ),
    is_safety_critical_infra: z
      .boolean()
      .optional()
      .describe(
        "Set to true if this agent acts as a safety component of critical infrastructure " +
        "(gas, electricity, water, road traffic, digital infra). " +
        "Triggers Annex III §2 HIGH RISK."
      ),
    // AI models used — feeds GPAI identification (Art. 51/53)
    ai_models_used: z
      .array(z.string().max(100))
      .max(10)
      .optional()
      .describe(
        "AI models this agent uses. Used to identify GPAI models (Art. 51/53). " +
        "Example: ['claude-3-5-sonnet', 'gpt-4o-mini']"
      ),
    eu_art4_literacy_notes: z
      .string()
      .max(1000)
      .optional()
      .describe(
        "Additional staff literacy notes specific to this agent. " +
        "Included in the Art. 4 AI Literacy Pack generated at every hire."
      ),

    // ── Canvas Kit v2 (Path C) ─────────────────────────────────────────────
    canvas: ManifestCanvasBlockSchema.optional(),
  })
  // Cross-field validation: external protocol requires endpoint; mcp_client
  // does not (and passing one is an error to prevent confusion).
  .refine(
    (d) => d.protocol === "mcp_client" || !!d.endpoint,
    {
      message:
        'endpoint is required for protocol "external". ' +
        'Add "endpoint": "https://your-agent.com" or switch to ' +
        '"protocol": "mcp_client" if your agent has no public URL ' +
        '(OpenClaw / Cursor / Claude Code agents).',
      path: ["endpoint"],
    },
  )
  .refine(
    (d) => d.visibility === "draft" || !!d.price_credits,
    {
      message:
        'price_credits is required for public listings. ' +
        'Set "price_credits": 25 (or any value 1-10000), ' +
        'or use "visibility": "draft" to save without going live.',
      path: ["price_credits"],
    },
  )
  .refine(
    (d) => !(d.protocol === "mcp_client" && d.endpoint),
    {
      message:
        '"mcp_client" agents must NOT have an endpoint — they receive work ' +
        "through the Renowide MCP session, not a webhook URL. Remove the " +
        '"endpoint" field.',
      path: ["endpoint"],
    },
  )
  // Forward-compat: unknown keys are warned about, not rejected.
  .loose();

export type RenowideJson = z.infer<typeof RenowideJsonSchema>;

// ─── server response ─────────────────────────────────────────────────────────

interface PublishResponse {
  slug: string;
  dashboard_url: string;
  webhook_url: string;
  handoff_secret?: string;
  warnings?: string[];
  action: "created" | "updated";
  canvas?: {
    enabled: boolean;
    ui_kit_version: string;
    hire_flow_canvas_url?: string;
    post_hire_canvas_url?: string;
    action_webhook_url: string;
    custom_embed_allowed_origins: string[];
  };
  // Gap 5: EU AI Act compliance summary returned at deploy time
  eu_compliance?: {
    risk_level: "prohibited" | "high" | "limited" | "minimal";
    risk_reasons: string[];
    obligations: string[];
    platform_provides: string[];
    c2pa_required: boolean;
    transparency_url: string;
  };
}

// ─── command ─────────────────────────────────────────────────────────────────

/**
 * Detect which AI coding environment is running this command so we can
 * auto-populate `referred_by` without requiring --via. Returns the
 * agent slug if detectable, otherwise undefined.
 *
 * Detection strategy:
 *   1. RENOWIDE_PARTNER_SLUG env var — set explicitly by an AI agent
 *      that already has a Renowide listing (most reliable).
 *   2. Known AI assistant env vars — Cursor, Claude Code, Claude Desktop,
 *      Windsurf, etc. inject identifiable env vars or config paths.
 *   3. MCP session indicator — if `npm_lifecycle_event` contains "mcp"
 *      or the process was spawned by an MCP server, it's likely an agent.
 *
 * We do NOT send the detected env to the server if it produces an
 * unrecognisable string — the server only accepts Renowide agent slugs,
 * so a spurious value would just be ignored anyway.
 */
function detectReferrer(explicit?: string): string | undefined {
  if (explicit) return explicit.trim().toLowerCase() || undefined;

  // Explicit override from any AI agent that has a listing
  const fromEnv = process.env.RENOWIDE_PARTNER_SLUG;
  if (fromEnv?.startsWith("rw-") || fromEnv?.match(/^[a-z0-9][a-z0-9-]{1,60}[a-z0-9]$/)) {
    return fromEnv.toLowerCase();
  }

  // Cursor — sets CURSOR_RULES_DIR or runs as "cursor" in the exe path
  if (process.env.CURSOR_RULES_DIR || process.execPath?.toLowerCase().includes("cursor")) {
    return undefined; // Cursor isn't a Renowide agent (yet) — no slug to credit
  }

  return undefined;
}

export async function cmdDeploy(opts: {
  config?: string;
  dryRun?: boolean;
  via?: string;        // --via <partner-slug>
}): Promise<void> {
  const configPath = path.resolve(opts.config ?? "renowide.json");

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `No ${pc.bold("renowide.json")} at ${configPath}.\n  ` +
        `Create one with the required fields.\n\n` +
        `  For agents with a public URL (Persona A / Path C):\n` +
        `    {\n` +
        `      "name": "My Agent",\n` +
        `      "endpoint": "https://my-agent.com",\n` +
        `      "price_credits": 10\n` +
        `    }\n\n` +
        `  For OpenClaw / Cursor / Claude Code agents (no public URL needed):\n` +
        `    {\n` +
        `      "name": "My OpenClaw Agent",\n` +
        `      "protocol": "mcp_client",\n` +
        `      "price_credits": 25\n` +
        `    }\n\n` +
        `  To save as draft (no price needed, not yet public):\n` +
        `    {\n` +
        `      "name": "My Agent",\n` +
        `      "protocol": "mcp_client",\n` +
        `      "visibility": "draft"\n` +
        `    }\n\n` +
        `  Docs: https://github.com/Renowide/renowide-cli/blob/main/docs/openclaw-listing.md`,
    );
  }

  const raw = fs.readFileSync(configPath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: any) {
    throw new Error(
      `${configPath} is not valid JSON:\n  ${err?.message ?? err}`,
    );
  }

  // reportInput: true keeps the rejected value on each issue (zod 4 omits it
  // by default to reduce payload size; we need it for good error messages).
  const validation = RenowideJsonSchema.safeParse(parsed, { reportInput: true });
  if (!validation.success) {
    const issues = validation.error.issues
      .map((i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid renowide.json:\n${issues}`);
  }
  const config = validation.data;

  // Warn on unknown keys (from .loose()) so we don't silently drop typo'd
  // fields. zod 4 exposes the shape map as a direct property, not a function.
  const knownKeys = new Set(Object.keys(RenowideJsonSchema.shape));
  const unknownKeys = Object.keys(parsed as Record<string, unknown>).filter(
    (k) => !knownKeys.has(k),
  );
  if (unknownKeys.length > 0) {
    console.log(
      pc.yellow(
        `  ⚠ Unknown fields in renowide.json (will be forwarded to server, may be ignored): ${unknownKeys.join(", ")}`,
      ),
    );
  }

  // ── dry-run: validate, probe URLs, render a listing preview ──────────────
  // No publish API call; no writes; safe to run anytime.
  if (opts.dryRun) {
    await runDryRunPreview(config);
    return;
  }

  // ── live publish ─────────────────────────────────────────────────────────
  const creds = requireCredentials();
  const api = new RenowideAPI(creds.apiBase, creds.token);

  console.log(pc.gray(`→ ${creds.apiBase}`));
  console.log(pc.gray(`  publishing ${pc.bold(config.name)}…`));

  const referrer = detectReferrer(opts.via);

  let resp: PublishResponse;
  try {
    resp = await api.post<PublishResponse>("/api/v1/agents/publish", {
      protocol: config.protocol ?? "external",
      config,
      ...(referrer ? { referred_by: referrer } : {}),
    });
  } catch (err: any) {
    // Endpoint hasn't shipped yet — give a concrete hint rather than a
    // bare 404. Remove this branch once the backend endpoint lands.
    if (err?.status === 404) {
      throw new Error(
        "The /api/v1/agents/publish endpoint is not live on this Renowide " +
          "instance. If you are targeting a staging backend, confirm the " +
          "Persona A (link-out) endpoints have been rolled out. If this is " +
          "renowide.com and you still see 404, please file an issue at " +
          "https://github.com/Renowide/renowide-cli/issues.",
      );
    }
    if (err?.status === 401) {
      throw new Error(
        "Not authenticated. Run `renowide login` or `renowide login --key rw_key_…`.",
      );
    }
    if (err?.status === 403) {
      throw new Error(
        "Your API key does not have the `deploy` scope. Mint a new key with " +
          "`deploy` scope from /creator?section=api-keys.",
      );
    }
    throw err;
  }

  // ── success reporting ────────────────────────────────────────────────────
  console.log("");
  console.log(
    pc.green(
      `✓ ${resp.action === "created" ? "published" : "updated"} ${pc.bold(resp.slug)}`,
    ),
  );
  console.log(`  Dashboard:    ${pc.underline(resp.dashboard_url)}`);

  if (config.protocol === "mcp_client") {
    // mcp_client mode: no webhook, no public URL needed.
    // The agent receives work by polling renowide_poll_hires via MCP.
    console.log(`  Protocol:     mcp_client`);
    console.log(
      `  ${pc.green("✓")} No public URL needed. Your agent receives work via the Renowide MCP session.`,
    );
    console.log(`  Next: install @renowide/mcp-server in your agent, then poll:`);
    console.log(`    renowide_poll_hires()     — check for new hire events`);
    console.log(`    renowide_accept_hire()    — acknowledge and start working`);
    console.log(`    renowide_complete_hire()  — report result + trigger payout`);
    console.log(
      `  Docs: https://github.com/Renowide/renowide-cli/blob/main/docs/openclaw-listing.md`,
    );
  } else {
    console.log(`  Webhook URL:  ${resp.webhook_url}`);
    console.log(`                (Renowide → your server on hire events)`);
  }

  // ── Partner promo notification ──────────────────────────────────────────
  if (referrer && resp.action === "created") {
    console.log("");
    console.log(pc.green(`  Partner promo active (via ${pc.bold(referrer)}):`));
    console.log(
      pc.gray(
        `    0% platform commission for your first 30 days — you keep 100% of earnings.`,
      ),
    );
    console.log(
      pc.gray(
        `    After 30 days it reverts to the standard 15% commission.`,
      ),
    );
  }

  // ── Gap 5: Guild-adaptive EU AI Act compliance summary ──────────────────
  // Always shown — the article numbers vary by guild and risk level.
  // This is what makes compliance visible at the moment of deploy, not hidden
  // in a dashboard nobody checks.
  if (resp.eu_compliance) {
    const eu = resp.eu_compliance;
    const riskBadge = {
      prohibited: pc.red("PROHIBITED — listing blocked"),
      high:       pc.yellow("HIGH RISK (Annex III)"),
      limited:    pc.cyan("LIMITED RISK (Art. 50)"),
      minimal:    pc.green("MINIMAL RISK"),
    }[eu.risk_level] ?? eu.risk_level;

    console.log("");
    console.log(`  EU AI Act:    ${riskBadge}`);

    if (eu.risk_reasons.length > 0 && eu.risk_level !== "minimal") {
      for (const r of eu.risk_reasons) {
        console.log(pc.gray(`    Basis: ${r}`));
      }
    }

    // What Renowide handles (always reassuring to see)
    console.log(pc.gray("  Platform provides automatically:"));
    for (const p of eu.platform_provides.slice(0, 3)) {
      // Show first 3 most important; truncate for readability
      console.log(pc.gray(`    ✓ ${p.substring(0, 90)}`));
    }

    // What the creator must do (only show if there's something actionable)
    const creatorTodos = eu.obligations.filter(o =>
      !o.startsWith("Art. 4") && !o.startsWith("No mandatory")
    );
    if (creatorTodos.length > 0) {
      console.log(pc.yellow("  Your remaining obligations:"));
      for (const o of creatorTodos.slice(0, 3)) {
        console.log(pc.yellow(`    ! ${o.substring(0, 100)}`));
      }
      if (eu.risk_level === "high") {
        console.log(pc.gray(`    Generate technical docs: renowide compliance generate-docs`));
      }
    }

    if (eu.c2pa_required) {
      console.log(pc.yellow("  ⚠ Art. 50(4): C2PA watermarking required for generated content."));
      console.log(pc.gray("    See: https://github.com/Renowide/renowide-cli/docs/c2pa.md"));
    }

    console.log(pc.gray(`  Transparency: ${eu.transparency_url}`));
  } else {
    // Fallback if backend didn't return eu_compliance yet
    console.log("");
    console.log(pc.gray(
      `  EU AI Act: run \`renowide compliance check\` for your risk classification.`
    ));
  }

  if (resp.warnings && resp.warnings.length > 0) {
    console.log("");
    console.log(pc.yellow("  Warnings:"));
    for (const w of resp.warnings) console.log(pc.yellow(`    • ${w}`));
  }

  if (resp.canvas) {
    console.log("");
    console.log(
      resp.canvas.enabled
        ? pc.green(`  Canvas Kit v2: enabled (ui_kit ${resp.canvas.ui_kit_version})`)
        : pc.yellow(
            `  Canvas Kit v2: provisioned but NOT enabled (ui_kit ${resp.canvas.ui_kit_version})`,
          ),
    );
    if (resp.canvas.hire_flow_canvas_url) {
      console.log(`    hire_flow:     ${resp.canvas.hire_flow_canvas_url}`);
    }
    if (resp.canvas.post_hire_canvas_url) {
      console.log(`    post_hire:     ${resp.canvas.post_hire_canvas_url}`);
    }
    console.log(`    action:        ${resp.canvas.action_webhook_url}`);
    if (resp.canvas.custom_embed_allowed_origins.length > 0) {
      console.log(
        pc.gray(
          `    custom_embed:  ${resp.canvas.custom_embed_allowed_origins.join(", ")}`,
        ),
      );
    }
    if (!resp.canvas.enabled) {
      console.log(
        pc.yellow(
          "    Run `renowide canvas validate` on each canvas URL, then re-deploy to flip enabled=true.",
        ),
      );
    }
  }

  if (resp.handoff_secret) {
    // ── HANDOFF SECRET — one-time display ────────────────────────────────
    // This is the only moment the secret is visible. It can't be re-fetched
    // later (rotation mints a new one and invalidates the old). Print it
    // in a deliberately ugly box so someone pair-programming over Zoom
    // immediately knows "don't screenshot this".
    console.log("");
    console.log(pc.red("  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
    console.log(pc.red("  ⚠  HANDOFF SECRET — shown once, never again"));
    console.log(pc.red("  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
    console.log("");
    console.log(`    ${pc.bold(resp.handoff_secret)}`);
    console.log("");
    console.log(pc.red("  Store this in your environment now:"));
    console.log(pc.gray(`    export RENOWIDE_HANDOFF_SECRET='${resp.handoff_secret}'`));
    console.log("");
    console.log(pc.gray("  Use it to:"));
    console.log(pc.gray("    • verify Renowide-Signature on incoming webhooks,"));
    console.log(pc.gray("    • verify the rw_hire JWT on /handoff deep-links."));
    console.log(pc.red("  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  } else if (resp.action === "updated") {
    console.log(pc.gray("  (handoff secret unchanged — rotate via `renowide agent rotate-secret`)"));
  }

  // ── cache slug + dashboard for subsequent commands ───────────────────────
  // We intentionally do NOT cache the handoff_secret. That file still
  // contains a dashboard URL unique to the creator, so we ensure it is
  // git-ignored before writing to avoid a casual `git add .` leaking it.
  const cacheDir = path.dirname(configPath);
  const cachePath = path.join(cacheDir, ".renowide-deploy.json");
  ensureGitignored(cacheDir, ".renowide-deploy.json");
  const cache = {
    slug: resp.slug,
    dashboard_url: resp.dashboard_url,
    webhook_url: resp.webhook_url,
    last_deployed_at: new Date().toISOString(),
  };
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), { mode: 0o644 });
  console.log(pc.gray(`  cached → ${path.relative(process.cwd(), cachePath)}`));
}

/** Append `pattern` to `.gitignore` in `dir` if not already present. */
function ensureGitignored(dir: string, pattern: string): void {
  const gi = path.join(dir, ".gitignore");
  let current = "";
  try {
    current = fs.readFileSync(gi, "utf8");
  } catch {
    // .gitignore doesn't exist yet — also skip if this dir is not a
    // git work-tree (i.e. no .git / no parent .git). Best-effort only.
    if (!isInsideGitWorkTree(dir)) return;
  }
  const lines = current.split(/\r?\n/).map((l) => l.trim());
  if (lines.includes(pattern)) return;
  const sep = current.length === 0 || current.endsWith("\n") ? "" : "\n";
  try {
    fs.appendFileSync(gi, `${sep}${pattern}\n`);
  } catch {
    // non-fatal
  }
}

function isInsideGitWorkTree(dir: string): boolean {
  let cursor = path.resolve(dir);
  while (true) {
    if (fs.existsSync(path.join(cursor, ".git"))) return true;
    const parent = path.dirname(cursor);
    if (parent === cursor) return false;
    cursor = parent;
  }
}
