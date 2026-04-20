/**
 * `renowide canvas …` — local utilities for Canvas Kit v2 (Path C).
 *
 * Four subcommands, each intentionally small:
 *
 *   • `renowide canvas validate <path>`
 *        Parse a file of canvas JSON, run the canonical Zod schema from
 *        `@renowide/types/canvas` (same one the Renowide backend uses),
 *        walk every `when` / `disabled_when` / `value` expression and
 *        report bad grammar inline. This is the fastest feedback loop —
 *        no network, no auth, no side effects.
 *
 *   • `renowide canvas fetch <url>`
 *        Sign a canvas-fetch GET exactly the way the Renowide backend
 *        would (`signCanvasRequest`), call the URL, then run the response
 *        through `validateCanvasStructure`. This is how you reproduce a
 *        production 5xx: your `hire_flow.json` probably passes `curl` but
 *        fails the strict schema.
 *
 *   • `renowide canvas sign <url>`
 *        Same signing logic as `fetch`, but prints the headers and exits
 *        without calling the URL. For plumbing signed requests through
 *        `curl` / Insomnia / Postman during early integration.
 *
 *   • `renowide canvas verify`
 *        Verify a signed request locally — useful when your action
 *        webhook is returning 401 and you want to know whether the bug
 *        is in YOUR verification code or in Renowide's signature.
 *
 * All subcommands accept `--secret <handoff_secret>` or fall back to the
 * `RENOWIDE_HANDOFF_SECRET` env var (what the dry-run guide recommends).
 */

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import pc from "picocolors";

import {
  CanvasResponseSchema,
  validateCanvasStructure,
  CANVAS_KIT_VERSION,
  canRender,
} from "@renowide/types/canvas";
import {
  validateExpression,
  extractExpressions,
} from "@renowide/types/expression";
import {
  signCanvasRequest,
  signActionRequest,
  verifyCanvasRequest,
  verifyActionRequest,
  SIGNATURE_SCHEME_VERSION,
  SignatureVerificationError,
} from "../hmac.js";

// ─── `renowide canvas validate` ──────────────────────────────────────────────

interface ValidateOpts {
  ui?: string;
}

export async function cmdCanvasValidate(
  file: string,
  opts: ValidateOpts,
): Promise<void> {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) {
    throw new Error(`canvas file not found: ${abs}`);
  }
  const raw = fs.readFileSync(abs, "utf8");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: any) {
    throw new Error(`${abs} is not valid JSON: ${err?.message ?? err}`);
  }

  // Stage 1: Zod shape check — same schema the Renowide proxy enforces.
  const zres = CanvasResponseSchema.safeParse(parsed);
  if (!zres.success) {
    console.log(pc.red(`✗ ${abs}`));
    for (const issue of zres.error.issues) {
      const where = issue.path.length ? issue.path.join(".") : "(root)";
      console.log(pc.red(`  • ${where}: ${issue.message}`));
    }
    process.exitCode = 1;
    return;
  }

  // Stage 2: Canvas-level rules (reserved namespaces, __submit_hire__
  // uniqueness, wizard/action_button exclusivity, unique block IDs…).
  try {
    validateCanvasStructure(zres.data);
  } catch (err: any) {
    console.log(pc.red(`✗ ${abs}`));
    console.log(pc.red(`  • structural: ${err?.message ?? err}`));
    process.exitCode = 1;
    return;
  }

  // Stage 3: Expression grammar — walk every string that may contain
  // `{{…}}` interpolations or is used as a boolean guard.
  const exprIssues = walkExpressions(zres.data);
  if (exprIssues.length > 0) {
    console.log(pc.red(`✗ ${abs}`));
    for (const i of exprIssues) console.log(pc.red(`  • ${i}`));
    process.exitCode = 1;
    return;
  }

  // Stage 4: Renderer-compatibility check (optional — caller can pin a
  // specific ui_kit version they're targeting with `--ui`).
  const target = opts.ui ?? CANVAS_KIT_VERSION;
  const compat = canRender({
    response: zres.data.ui_kit_version,
    manifest: zres.data.ui_kit_version,
    renderer: target,
  });
  const kind = compat.ok ? pc.green("✓") : pc.yellow("!");

  console.log(`${kind} ${abs}`);
  console.log(
    pc.gray(
      `  ui_kit_version=${zres.data.ui_kit_version}  renderer target=${target}  ${
        compat.ok ? "compatible" : "MAY NOT RENDER"
      }`,
    ),
  );
  if (!compat.ok) {
    console.log(pc.yellow(`  • ${compat.reason}`));
    console.log(
      pc.yellow(
        "  • Renowide will refuse to render it on buyer devices running older ui_kit bundles.",
      ),
    );
    process.exitCode = 1;
  }
}

function walkExpressions(canvas: { blocks: unknown[] }): string[] {
  const issues: string[] = [];

  function check(exprSource: string, where: string, asBoolean: boolean): void {
    const runtime = asBoolean ? exprSource : undefined;
    const candidates = asBoolean ? [exprSource] : extractExpressions(exprSource);
    if (candidates.length === 0) return;
    for (const expr of candidates) {
      try {
        validateExpression(expr);
      } catch (err) {
        issues.push(
          `${where}: bad expression \`${expr}\` — ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    if (runtime !== undefined) {
      // Bare boolean guards: also make sure the whole string parses as
      // an expression, not just an interpolation fragment.
      try {
        validateExpression(runtime);
      } catch (err) {
        issues.push(
          `${where}: guard \`${runtime}\` — ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  function visit(block: any, path: string): void {
    if (!block || typeof block !== "object") return;

    if (typeof block.when === "string") check(block.when, `${path}.when`, true);
    if (block.props && typeof block.props === "object") {
      for (const [key, value] of Object.entries(block.props)) {
        if (typeof value !== "string") continue;
        // `disabled_when` / `open_when` / `visible_when` / `required_when` /
        // `hidden_when` all live inside props and are boolean guard
        // expressions rather than `{{…}}` interpolation templates.
        const asBoolean = /_when$/.test(key) || key === "payload_from";
        check(value, `${path}.props.${key}`, asBoolean);
      }

      // `wizard` blocks nest their substructure under `props.steps[*]`,
      // each step carrying its own `when` + `children`. Without this,
      // bad expressions inside wizard steps only surfaced server-side
      // with worse error messages.
      if (Array.isArray(block.props.steps)) {
        block.props.steps.forEach((step: any, i: number) => {
          if (!step || typeof step !== "object") return;
          if (typeof step.when === "string") {
            check(step.when, `${path}.props.steps[${i}].when`, true);
          }
          if (Array.isArray(step.children)) {
            step.children.forEach((c: any, j: number) =>
              visit(c, `${path}.props.steps[${i}].children[${j}]`),
            );
          }
        });
      }

      // Modals / drawers host their body inside `props.content[]`.
      for (const containerKey of ["content", "body", "items"]) {
        const container = block.props[containerKey];
        if (Array.isArray(container)) {
          container.forEach((c: any, i: number) =>
            visit(c, `${path}.props.${containerKey}[${i}]`),
          );
        }
      }
    }
    if (Array.isArray(block.children)) {
      block.children.forEach((c: any, i: number) => visit(c, `${path}.children[${i}]`));
    }
  }

  canvas.blocks.forEach((b, i) => visit(b, `blocks[${i}]`));
  return issues;
}

// ─── `renowide canvas fetch` / `sign` ────────────────────────────────────────

interface SignFetchOpts {
  secret?: string;
  slug: string;
  surface: string;
  buyerId?: string;
  hireId?: string;
  requestId?: string;
}

function buildSignedHeaders(url: string, opts: SignFetchOpts): Record<string, string> {
  const secret = opts.secret ?? process.env.RENOWIDE_HANDOFF_SECRET;
  if (!secret) {
    throw new Error(
      "No handoff secret. Pass --secret <val> or export RENOWIDE_HANDOFF_SECRET.",
    );
  }
  if (opts.surface !== "hire_flow" && opts.surface !== "post_hire") {
    throw new Error(`--surface must be hire_flow or post_hire (got ${opts.surface})`);
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const requestId = opts.requestId ?? randomUUID();
  const hex = signCanvasRequest({
    handoffSecret: secret,
    agentSlug: opts.slug,
    surface: opts.surface as "hire_flow" | "post_hire",
    buyerId: opts.buyerId ?? null,
    hireId: opts.hireId ?? null,
    requestId,
    timestamp,
  });
  const headers: Record<string, string> = {
    "Renowide-Signature": `${SIGNATURE_SCHEME_VERSION}=${hex}`,
    "X-Renowide-Timestamp": String(timestamp),
    "X-Renowide-Request-Id": requestId,
    "X-Renowide-Agent-Slug": opts.slug,
    "X-Renowide-Surface": opts.surface,
  };
  if (opts.buyerId) headers["X-Renowide-Buyer-Id"] = opts.buyerId;
  if (opts.hireId) headers["X-Renowide-Hire-Id"] = opts.hireId;
  return headers;
}

export async function cmdCanvasSign(url: string, opts: SignFetchOpts): Promise<void> {
  new URL(url);
  const headers = buildSignedHeaders(url, opts);
  console.log(pc.bold(`# signed request for ${url}`));
  for (const [k, v] of Object.entries(headers)) console.log(`${k}: ${v}`);
  console.log("");
  console.log(pc.gray("# reproduce with curl:"));
  const curlHeaders = Object.entries(headers)
    .map(([k, v]) => `-H '${k}: ${v}'`)
    .join(" \\\n     ");
  console.log(pc.gray(`curl ${curlHeaders} '${url}'`));
}

export async function cmdCanvasFetch(
  url: string,
  opts: SignFetchOpts & { validate?: boolean },
): Promise<void> {
  new URL(url);
  const headers = buildSignedHeaders(url, opts);

  console.log(pc.gray(`→ GET ${url}`));
  const res = await fetch(url, { headers });
  const body = await res.text();
  console.log(pc.gray(`← ${res.status} ${res.statusText} (${body.length} bytes)`));

  if (res.status >= 400) {
    console.log(pc.red(body.slice(0, 2000)));
    process.exitCode = 1;
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    console.log(pc.red("response is not JSON:"));
    console.log(body.slice(0, 2000));
    process.exitCode = 1;
    return;
  }

  if (opts.validate !== false) {
    const zres = CanvasResponseSchema.safeParse(parsed);
    if (!zres.success) {
      console.log(pc.red("✗ response fails CanvasResponseSchema:"));
      for (const i of zres.error.issues) {
        console.log(pc.red(`  • ${i.path.join(".") || "(root)"}: ${i.message}`));
      }
      process.exitCode = 1;
      return;
    }
    try {
      validateCanvasStructure(zres.data);
    } catch (err: any) {
      console.log(pc.red(`✗ structural: ${err?.message ?? err}`));
      process.exitCode = 1;
      return;
    }
    console.log(
      pc.green(
        `✓ ${zres.data.blocks.length} block(s), ui_kit ${zres.data.ui_kit_version}, cache_ttl=${zres.data.cache_ttl_seconds}s`,
      ),
    );
  }

  console.log("");
  console.log(JSON.stringify(parsed, null, 2));
}

// ─── `renowide canvas verify` ────────────────────────────────────────────────

interface VerifyOpts {
  secret?: string;
  body?: string;
  signature?: string;
  timestamp?: string;
  requestId?: string;
  slug?: string;
  surface?: string;
  buyerId?: string;
  hireId?: string;
  kind: string;
}

export async function cmdCanvasVerify(opts: VerifyOpts): Promise<void> {
  const secret = opts.secret ?? process.env.RENOWIDE_HANDOFF_SECRET;
  if (!secret) {
    throw new Error(
      "No handoff secret. Pass --secret <val> or export RENOWIDE_HANDOFF_SECRET.",
    );
  }
  if (!opts.signature) throw new Error("--signature <v1=hex> is required");
  if (!opts.timestamp) throw new Error("--ts <unix-seconds> is required");

  if (opts.kind === "action") {
    if (!opts.body) throw new Error("--body <file> is required for action verification");
    const abs = path.resolve(opts.body);
    const bytes = fs.readFileSync(abs);
    try {
      verifyActionRequest({
        handoffSecret: secret,
        headers: {
          "renowide-signature": opts.signature,
          "x-renowide-timestamp": opts.timestamp,
        },
        body: new Uint8Array(bytes),
        // Let the verifier enforce real clock skew — this is a prod-lint.
      });
      console.log(pc.green("✓ action signature verifies"));
    } catch (err) {
      if (err instanceof SignatureVerificationError) {
        console.log(pc.red(`✗ action signature failed — ${err.message}`));
      } else {
        console.log(pc.red(`✗ ${err instanceof Error ? err.message : String(err)}`));
      }
      process.exitCode = 1;
    }
    return;
  }

  // canvas fetch verification
  if (!opts.slug) throw new Error("--slug is required for canvas verification");
  if (!opts.surface) throw new Error("--surface is required (hire_flow | post_hire)");
  if (opts.surface !== "hire_flow" && opts.surface !== "post_hire") {
    throw new Error(`--surface must be hire_flow or post_hire (got ${opts.surface})`);
  }
  if (!opts.requestId) throw new Error("--request-id is required for canvas verification");

  const headers: Record<string, string> = {
    "renowide-signature": opts.signature,
    "x-renowide-timestamp": opts.timestamp,
    "x-renowide-request-id": opts.requestId,
  };
  if (opts.buyerId) headers["x-renowide-buyer-id"] = opts.buyerId;
  if (opts.hireId) headers["x-renowide-hire-id"] = opts.hireId;

  try {
    verifyCanvasRequest({
      handoffSecret: secret,
      headers,
      agentSlug: opts.slug,
      surface: opts.surface,
    });
    console.log(pc.green("✓ canvas signature verifies"));
  } catch (err) {
    if (err instanceof SignatureVerificationError) {
      console.log(pc.red(`✗ canvas signature failed — ${err.message}`));
    } else {
      console.log(pc.red(`✗ ${err instanceof Error ? err.message : String(err)}`));
    }
    process.exitCode = 1;
  }
}

// ─── `renowide canvas init` — scaffold a minimal canvas.json + bridge ────────

interface CanvasInitOpts {
  surface: string;
  out?: string;
}

export async function cmdCanvasInit(opts: CanvasInitOpts): Promise<void> {
  const surface = opts.surface;
  if (surface !== "hire_flow" && surface !== "post_hire") {
    throw new Error(`--surface must be hire_flow or post_hire (got ${surface})`);
  }
  const out = path.resolve(opts.out ?? `${surface}.json`);
  if (fs.existsSync(out)) {
    throw new Error(`refusing to overwrite existing ${out} — pass --out to rename`);
  }
  const sample =
    surface === "hire_flow"
      ? HIRE_FLOW_SAMPLE
      : POST_HIRE_SAMPLE;
  fs.writeFileSync(out, JSON.stringify(sample, null, 2) + "\n", "utf8");
  console.log(pc.green(`✓ wrote ${out}`));
  console.log(pc.gray(`  → validate:    renowide canvas validate ${path.relative(process.cwd(), out)}`));
  console.log(pc.gray(`  → serve + test: see docs/canvas-kit-v2/README.md`));
}

// Hire-flow sample. The renderer writes each form field to
// `form.<block.id>` (see packages/ui-kit/src/renderer/CanvasRenderer.tsx
// around the CheckboxBlock impl), so the button's `disabled_when`
// references `form.agree` directly. We do not seed `custom.agreed` —
// there is no block that reads it, so it would be dead state and a
// footgun for new devs (they'd change `custom.agreed` and wonder why
// nothing flips).
const HIRE_FLOW_SAMPLE = {
  ui_kit_version: CANVAS_KIT_VERSION,
  surface: "hire_flow",
  cache_ttl_seconds: 0,
  blocks: [
    {
      id: "heading",
      type: "header",
      props: { text: "Hire this agent" },
    },
    {
      id: "summary",
      type: "markdown",
      props: {
        source:
          "This agent will run against your data. Review the terms below before continuing.",
      },
    },
    {
      id: "agree",
      type: "checkbox",
      props: {
        label: "I agree to the terms",
        // `required: true` also drives Renowide's own validation at
        // submit time. Keep it in sync with `disabled_when` below.
        required: true,
        default: false,
      },
    },
    {
      id: "hire_cta",
      type: "action_button",
      props: {
        label: "Hire now",
        loading_label: "Processing…",
        action: "__submit_hire__",
        // `form.agree` is a boolean (set by the checkbox above). The
        // button stays disabled until the buyer checks the box.
        disabled_when: "!form.agree",
      },
    },
  ],
};

const POST_HIRE_SAMPLE = {
  ui_kit_version: CANVAS_KIT_VERSION,
  surface: "post_hire",
  cache_ttl_seconds: 0,
  blocks: [
    {
      id: "welcome_heading",
      type: "header",
      props: { text: "Welcome — let's get started" },
    },
    {
      id: "welcome_intro",
      type: "markdown",
      props: {
        source:
          "Complete the onboarding steps below. Your progress syncs to Renowide in real time.",
      },
    },
    {
      id: "embed_workspace",
      type: "custom_embed",
      props: {
        src: "https://example.com/embed?hire_id={{auth.hire_id}}",
        height: "800px",
        resize: "auto",
        allow_postmessage_events: ["ready", "resize", "toast", "action"],
      },
    },
  ],
};
