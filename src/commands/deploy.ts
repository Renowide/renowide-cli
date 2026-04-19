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

import { RenowideAPI } from "../api";
import { requireCredentials } from "../config";

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
  })
  // Forward-compat: unknown keys are warned about, not rejected. This lets
  // us add fields server-side without breaking old CLIs.
  .passthrough();

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

  const validation = RenowideJsonSchema.safeParse(parsed);
  if (!validation.success) {
    const issues = validation.error.issues
      .map((i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid renowide.json:\n${issues}`);
  }
  const config = validation.data;

  // Warn on unknown keys (from .passthrough) so we don't silently drop
  // typo'd fields.
  const knownKeys = new Set(Object.keys(RenowideJsonSchema._def.shape()));
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

  // ── dry-run: show resolved config, stop before network ───────────────────
  if (opts.dryRun) {
    console.log(pc.gray("── dry run — no API call ──"));
    console.log(pc.bold("Resolved config:"));
    console.log(JSON.stringify(config, null, 2));
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
