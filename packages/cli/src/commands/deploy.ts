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
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "HEAD", signal: ctl.signal }).catch(
      async (err) => {
        if (err?.name === "AbortError") throw err;
        // Some servers block HEAD — retry with GET.
        return fetch(url, { method: "GET", signal: ctl.signal });
      },
    );
    clearTimeout(timer);
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
    clearTimeout(timer);
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
  const endpointProbe = await probeUrl(config.endpoint);
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
  console.log(box(`Price:   ${config.price_credits} credits per hire`));
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
    // REQUIRED — the three fields without which we cannot list an agent.
    name: z
      .string()
      .min(2, "name must be at least 2 chars")
      .max(80, "name must be ≤ 80 chars"),
    endpoint: z
      .string()
      .url("endpoint must be a valid https:// URL")
      .refine((u) => u.startsWith("https://"), {
        message: "endpoint must use https:// (http is rejected in prod)",
      }),
    price_credits: z
      .number()
      .int("price_credits must be a whole number")
      .positive("price_credits must be > 0")
      .max(10_000, "price_credits over 10 000 is almost certainly a typo"),

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

    // ── Canvas Kit v2 (Path C) ─────────────────────────────────────────────
    // Opt-in: if `canvas` is present, Renowide will fetch SDUI JSON from the
    // dev's server on hire-flow and post-hire surfaces and render it inside
    // Renowide's chrome. If absent, the agent stays pure Persona A link-out.
    //
    // Shape mirrors `ManifestCanvasBlock` in `backend/app/schemas/canvas.py`
    // via the canonical `@renowide/types` package so the CLI, the backend,
    // and `@renowide/ui-kit` never drift.
    canvas: ManifestCanvasBlockSchema.optional(),
  })
  // Forward-compat: unknown keys are warned about, not rejected. This lets
  // us add fields server-side without breaking old CLIs. In zod 4, the old
  // `.passthrough()` is spelled `.loose()` (same semantics).
  .loose();

export type RenowideJson = z.infer<typeof RenowideJsonSchema>;

// ─── server response ─────────────────────────────────────────────────────────

interface PublishResponse {
  slug: string;
  dashboard_url: string;
  webhook_url: string;
  // Present ONLY on first publish (secret rotation is a separate endpoint).
  handoff_secret?: string;
  // Present when the server accepted the publish but flagged non-fatal
  // warnings (e.g. "icon_url returned 404 — add one before going live").
  warnings?: string[];
  // `created` on first publish, `updated` on subsequent ones.
  action: "created" | "updated";
  // Canvas Kit v2 — populated only if `canvas` was present in renowide.json
  // AND the backend accepted it. `canvas_enabled` on the AgentProfile flips
  // to true once all three URLs below resolve + sign correctly.
  canvas?: {
    enabled: boolean;
    ui_kit_version: string;
    hire_flow_canvas_url?: string;
    post_hire_canvas_url?: string;
    action_webhook_url: string;
    custom_embed_allowed_origins: string[];
  };
}

// ─── command ─────────────────────────────────────────────────────────────────

export async function cmdDeploy(opts: {
  config?: string;
  dryRun?: boolean;
}): Promise<void> {
  const configPath = path.resolve(opts.config ?? "renowide.json");

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `No ${pc.bold("renowide.json")} at ${configPath}.\n  ` +
        `Create one with the three required fields:\n` +
        `    {\n` +
        `      "name": "My Agent",\n` +
        `      "endpoint": "https://my-agent.com",\n` +
        `      "price_credits": 10\n` +
        `    }\n  ` +
        `See RENOWIDE_PERSONA_A_ONRAMP.md for all optional fields.`,
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

  let resp: PublishResponse;
  try {
    resp = await api.post<PublishResponse>("/api/v1/agents/publish", {
      protocol: "external",
      config,
    });
  } catch (err: any) {
    // Endpoint hasn't shipped yet — give a concrete hint rather than a
    // bare 404. Remove this branch once the backend endpoint lands.
    if (err?.status === 404) {
      throw new Error(
        "The /api/v1/agents/publish endpoint is not yet live on this Renowide " +
          "instance. This CLI is v0.5.0 (Persona A preview); the backend lands " +
          "in the next deploy. Track the rollout in " +
          "RENOWIDE_PERSONA_A_ONRAMP.md.",
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
  console.log(`  Webhook URL:  ${resp.webhook_url}`);
  console.log(`                (Renowide → your server on hire events)`);

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
  // We intentionally do NOT cache the handoff_secret. That file lives next
  // to the user's renowide.json and is committable / shareable with teammates.
  const cachePath = path.join(path.dirname(configPath), ".renowide-deploy.json");
  const cache = {
    slug: resp.slug,
    dashboard_url: resp.dashboard_url,
    webhook_url: resp.webhook_url,
    last_deployed_at: new Date().toISOString(),
  };
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), { mode: 0o644 });
  console.log(pc.gray(`  cached → ${path.relative(process.cwd(), cachePath)}`));
}
