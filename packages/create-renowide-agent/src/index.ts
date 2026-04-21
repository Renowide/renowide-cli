#!/usr/bin/env node
/**
 * `create-renowide-agent` — scaffold a fully-working Renowide agent in one
 * command. The build-and-distribute default for humans at the terminal.
 *
 *     npm create renowide-agent@latest my-agent
 *     npm create renowide-agent@latest my-agent --template saas-trial-dark
 *     npm create renowide-agent@latest my-agent --yes   # non-interactive
 *
 * Produces a directory with:
 *   - renowide.json         (Persona A / Path C manifest)
 *   - canvas/hire_flow.json (Path C only)
 *   - canvas/post_hire.json (Path C only)
 *   - server/index.ts       (backend with signed-webhook middleware wired up)
 *   - server/actions.ts     (Canvas Kit v2 action handlers)
 *   - package.json, tsconfig.json, .env.example, README.md
 *
 * Design goals:
 *   1. ZERO plumbing left for the human. HMAC verification, JWT checks,
 *      /complete callbacks, state patching — all scaffolded as imports from
 *      a tiny middleware, NOT copy-pasted boilerplate the user has to read.
 *   2. Pick sensible defaults. The only question asked is "what template?".
 *      Everything else (price, description, guild) is a reasonable default
 *      the human can edit in renowide.json afterwards.
 *   3. From scaffold → first deploy → first hire should be under 10 minutes.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import pc from "picocolors";
import prompts from "prompts";

// ----------------------------------------------------------------------
// Template catalog (kept in sync with @renowide/mcp-server)
// ----------------------------------------------------------------------

interface Template {
  slug: string;
  name: string;
  description: string;
  guild: string;
  path: "A" | "B" | "C";
  default_price_credits: number;
}

const TEMPLATES: Template[] = [
  {
    slug: "saas-trial-dark",
    name: "SaaS trial-to-paid",
    description: "Dark elegant onboarding → trial → upgrade conversion flow.",
    guild: "development",
    path: "C",
    default_price_credits: 10,
  },
  {
    slug: "consumer-service-intake",
    name: "Consumer service intake",
    description: "Questionnaire → payment → scheduled delivery of a result.",
    guild: "marketing",
    path: "C",
    default_price_credits: 25,
  },
  {
    slug: "expert-curated-consult",
    name: "Expert-curated consultation",
    description: "Intake → AI prep → human curator review → delivered report.",
    guild: "finance",
    path: "C",
    default_price_credits: 50,
  },
  {
    slug: "data-report-generator",
    name: "Data report generator",
    description: "Upload dataset → agent analyses → branded report canvas.",
    guild: "marketing",
    path: "C",
    default_price_credits: 15,
  },
  {
    slug: "b2b-demo-booking",
    name: "B2B demo booking",
    description: "Calendar → qualify → hand off to human.",
    guild: "marketing",
    path: "C",
    default_price_credits: 20,
  },
  {
    slug: "link-out-minimal",
    name: "Link-out (Persona A)",
    description: "3-field manifest pointing at your existing product URL.",
    guild: "development",
    path: "A",
    default_price_credits: 10,
  },
];

// ----------------------------------------------------------------------
// CLI parsing
// ----------------------------------------------------------------------

interface CliArgs {
  dir: string | null;
  template: string | null;
  yes: boolean;
  help: boolean;
  skipInstall: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    dir: null,
    template: null,
    yes: false,
    help: false,
    skipInstall: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--yes" || a === "-y") out.yes = true;
    else if (a === "--skip-install") out.skipInstall = true;
    else if (a === "--template" || a === "-t") out.template = argv[++i] ?? null;
    else if (a && !a.startsWith("-") && !out.dir) out.dir = a;
  }
  return out;
}

function printHelp(): void {
  console.log(`
${pc.bold("create-renowide-agent")} — scaffold a Renowide agent in one command

${pc.bold("Usage")}
  npm create renowide-agent@latest [dir] [options]

${pc.bold("Arguments")}
  dir                  Target directory (default: ./my-renowide-agent)

${pc.bold("Options")}
  -t, --template SLUG  Pick a template without the prompt
  -y, --yes            Non-interactive: accept every default
      --skip-install   Skip npm install
  -h, --help           Show this help

${pc.bold("Templates")}
${TEMPLATES.map(
  (t) =>
    `  ${pc.cyan(t.slug.padEnd(26))} ${pc.dim(`(Path ${t.path}, ${t.guild})`)}  ${t.description}`,
).join("\n")}

${pc.bold("Next steps after scaffolding")}
  1. cp .env.example .env     # (will also be suggested at the end)
  2. npm install
  3. npm run dev
  4. npx @renowide/cli login   (first time only)
  5. npx @renowide/cli deploy  # publishes + prints handoff_secret

${pc.bold("Docs")}
  https://renowide.com/build
`);
}

// ----------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  console.log();
  console.log(
    pc.bold(pc.cyan("✦ Renowide")) +
      pc.dim(" — renown worldwide. Build-and-distribute your agent in one command."),
  );
  console.log();

  const dir = args.dir ?? (await askDir());
  if (!dir) process.exit(1);

  const absDir = path.resolve(process.cwd(), dir);
  if (fs.existsSync(absDir) && fs.readdirSync(absDir).length > 0) {
    console.error(pc.red(`✗ ${dir} exists and is not empty. Pick a new directory.`));
    process.exit(1);
  }

  const tplSlug = args.template ?? (args.yes ? TEMPLATES[0]!.slug : await askTemplate());
  const tpl = TEMPLATES.find((t) => t.slug === tplSlug);
  if (!tpl) {
    console.error(
      pc.red(`✗ Unknown template: ${tplSlug}. Run with --help to see the list.`),
    );
    process.exit(1);
  }

  const agentName = args.yes ? path.basename(absDir) : (await askName(path.basename(absDir))) ?? path.basename(absDir);
  const slug = slugify(agentName);

  fs.mkdirSync(absDir, { recursive: true });

  writeFiles(absDir, scaffold(tpl, { name: agentName, slug }));

  if (!args.skipInstall) {
    console.log();
    console.log(pc.dim("→ Running npm install (this takes ~15s)…"));
    const res = spawnSync("npm", ["install"], {
      cwd: absDir,
      stdio: "inherit",
    });
    if (res.status !== 0) {
      console.log(pc.yellow("⚠ npm install failed; you can re-run it in the new directory."));
    }
  }

  console.log();
  console.log(pc.green(`✓ Agent ${pc.bold(slug)} scaffolded at ${pc.cyan(dir)}.`));
  console.log();
  console.log(pc.bold("Next steps"));
  console.log(`  ${pc.dim("$")} cd ${dir}`);
  console.log(`  ${pc.dim("$")} npx @renowide/cli login           ${pc.dim("# first time only")}`);
  console.log(`  ${pc.dim("$")} npx @renowide/cli deploy          ${pc.dim("# publish + print handoff_secret")}`);
  console.log(`  ${pc.dim("$")} npm run dev                       ${pc.dim("# local preview on :8787")}`);
  console.log();
  console.log(
    pc.dim("Prefer an AI coding assistant? Use ") +
      pc.cyan("@renowide/mcp-server") +
      pc.dim(" — same flow in tool calls."),
  );
  console.log();
}

// ----------------------------------------------------------------------
// Prompts
// ----------------------------------------------------------------------

async function askDir(): Promise<string | null> {
  const res = await prompts({
    type: "text",
    name: "dir",
    message: "Target directory",
    initial: "my-renowide-agent",
  });
  return res.dir ?? null;
}

async function askTemplate(): Promise<string> {
  const res = await prompts({
    type: "select",
    name: "tpl",
    message: "Template",
    choices: TEMPLATES.map((t) => ({
      title: `${t.slug.padEnd(26)} ${pc.dim(`(Path ${t.path})`)}`,
      value: t.slug,
      description: t.description,
    })),
    initial: 0,
  });
  return res.tpl ?? TEMPLATES[0]!.slug;
}

async function askName(fallback: string): Promise<string | null> {
  const res = await prompts({
    type: "text",
    name: "name",
    message: "Display name (shown on the marketplace card)",
    initial: fallback,
  });
  return res.name ?? null;
}

// ----------------------------------------------------------------------
// Scaffolder — mirror of @renowide/mcp-server's scaffold()
// ----------------------------------------------------------------------

interface ScaffoldArgs {
  name: string;
  slug: string;
}

function scaffold(tpl: Template, args: ScaffoldArgs): Record<string, string> {
  const files: Record<string, string> = {};

  if (tpl.path === "A" || tpl.path === "C") {
    files["renowide.json"] = JSON.stringify(
      {
        name: args.name,
        slug: args.slug,
        endpoint: `https://${args.slug}.example.com`,
        price_credits: tpl.default_price_credits,
        description: tpl.description,
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

  files["package.json"] = pkgJson(args);
  files["tsconfig.json"] = tsconfig();
  files[".env.example"] = envExample(tpl);

  if (tpl.path === "C") {
    files["canvas/hire_flow.json"] = hireFlowJson(args, tpl);
    files["canvas/post_hire.json"] = postHireJson(args, tpl);
    files["server/index.ts"] = canvasServer(args);
    files["server/actions.ts"] = canvasActions();
  } else if (tpl.path === "A") {
    files["server/index.ts"] = personaAServer(args);
  }

  files["README.md"] = readme(args, tpl);
  files[".gitignore"] = gitignore();
  return files;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 99);
}

function writeFiles(base: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    const dest = path.join(base, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content, "utf8");
  }
}

// ----------------------------------------------------------------------
// File content helpers
// ----------------------------------------------------------------------

function pkgJson(args: ScaffoldArgs): string {
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

function tsconfig(): string {
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

function envExample(tpl: Template): string {
  const secretName =
    tpl.path === "C" ? "RENOWIDE_WEBHOOK_SECRET" : "RENOWIDE_HANDOFF_SECRET";
  return `# Paste the value printed by \`renowide deploy\` after you first publish.
${secretName}=
PORT=8787
`;
}

function hireFlowJson(args: ScaffoldArgs, tpl: Template): string {
  return JSON.stringify(
    {
      version: "2.0.0",
      initial_state: { agreed: false },
      blocks: [
        { type: "header", props: { level: 1, text: args.name } },
        { type: "markdown", props: { body: tpl.description } },
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
            label: `Hire for ${tpl.default_price_credits} credits`,
            variant: "primary",
            disabled: "{{ !state.agreed }}",
          },
        },
      ],
    },
    null,
    2,
  );
}

function postHireJson(args: ScaffoldArgs, tpl: Template): string {
  return JSON.stringify(
    {
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
    },
    null,
    2,
  );
}

function canvasServer(args: ScaffoldArgs): string {
  return `/**
 * Canvas Kit v2 backend for ${args.name}.
 * HMAC verification is wrapped in verifyRequest(); the business logic
 * you fill in for each action lives in ./actions.ts.
 */
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";
import { handleAction } from "./actions.js";

const app = express();
const SECRET = process.env.RENOWIDE_WEBHOOK_SECRET ?? "";
const PORT = Number(process.env.PORT ?? 8787);

if (!SECRET) {
  console.warn("⚠ RENOWIDE_WEBHOOK_SECRET not set — set it before deploying.");
}

function verifyRequest(
  req: express.Request,
  raw: string | Buffer,
): boolean {
  if (!SECRET) return false;
  const sig = String(req.header("X-Renowide-Signature") ?? "");
  const expected = createHmac("sha256", SECRET).update(raw).digest("hex");
  const got = sig.replace(/^sha256=/, "");
  return (
    got.length === expected.length &&
    timingSafeEqual(Buffer.from(got), Buffer.from(expected))
  );
}

app.get("/canvas/hire_flow.json", (_req, res) => {
  const body = fs.readFileSync(
    path.join(process.cwd(), "canvas/hire_flow.json"),
    "utf8",
  );
  res.json(JSON.parse(body));
});

app.get("/canvas/post_hire.json", (_req, res) => {
  const body = fs.readFileSync(
    path.join(process.cwd(), "canvas/post_hire.json"),
    "utf8",
  );
  res.json(JSON.parse(body));
});

app.post(
  "/canvas/actions",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    if (!verifyRequest(req, req.body)) return res.status(401).send("bad signature");
    const event = JSON.parse(req.body.toString("utf8"));
    const response = await handleAction(event);
    res.status(200).json(response);
  },
);

app.listen(PORT, () => {
  console.log("Canvas Kit v2 server listening on http://localhost:" + PORT);
});
`;
}

function canvasActions(): string {
  return `/**
 * Canvas Kit v2 action handlers.
 * Each action_button click in your canvas fires POST /canvas/actions.
 * Return an ActionInvokeResponse describing state patches, toasts, nav.
 */

export interface ActionEvent {
  action: string;
  hire_id: string;
  workspace_id: string;
  state: Record<string, unknown>;
}

export interface ActionInvokeResponse {
  state_patches?: Array<{
    op: "set" | "merge" | "push";
    path: string;
    value: unknown;
  }>;
  toast?: { level: "info" | "success" | "error"; message: string };
  navigate?: "post_hire" | "hire_flow";
}

export async function handleAction(event: ActionEvent): Promise<ActionInvokeResponse> {
  switch (event.action) {
    case "start":
      return {
        state_patches: [
          { op: "set", path: "started_at", value: new Date().toISOString() },
        ],
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

function personaAServer(args: ScaffoldArgs): string {
  return `/**
 * Persona A webhook handler for ${args.name}.
 * Verifies hire.created HMAC, provisions a buyer, calls /complete when done.
 */
import express from "express";
import { createHmac, timingSafeEqual } from "node:crypto";

const app = express();
const SECRET = process.env.RENOWIDE_HANDOFF_SECRET ?? "";
const PORT = Number(process.env.PORT ?? 8787);

if (!SECRET) {
  console.warn("⚠ RENOWIDE_HANDOFF_SECRET not set — set it before deploying.");
}

app.post(
  "/renowide",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = String(req.header("X-Renowide-Signature") ?? "");
    const expected = createHmac("sha256", SECRET).update(req.body).digest("hex");
    const got = sig.replace(/^sha256=/, "");
    if (
      !SECRET ||
      got.length !== expected.length ||
      !timingSafeEqual(Buffer.from(got), Buffer.from(expected))
    ) {
      return res.status(401).send("bad signature");
    }

    const event = JSON.parse(req.body.toString("utf8"));
    if (event.event === "hire.created") {
      // TODO: provision the buyer at event.buyer.workspace_id
      // TODO: redirect to event.handoff_url OR start async work
      // TODO: when complete, POST event.completion.report_url
    }
    res.status(200).send("ok");
  },
);

app.listen(PORT, () => {
  console.log("Persona A webhook listening on http://localhost:" + PORT);
});
`;
}

function readme(args: ScaffoldArgs, tpl: Template): string {
  return `# ${args.name}

Built with Renowide template \`${tpl.slug}\` (Path ${tpl.path}).
*Renowide — "renown worldwide". Build-and-distribute your agent in one command.*

## Quick start

\`\`\`bash
cp .env.example .env        # paste secrets after renowide deploy
npm install
npm run dev                 # :8787
\`\`\`

## Deploy to Renowide

\`\`\`bash
npx @renowide/cli login     # device-code login (first time only)
npx @renowide/cli deploy    # publishes + prints handoff_secret ONCE
\`\`\`

Store the \`handoff_secret\` as \`RENOWIDE_WEBHOOK_SECRET\` in \`.env\` — the
server uses it to verify Renowide's HMAC-signed requests.

## What Renowide handles for you

- Marketplace listing + buyer discovery
- Credit-based payment (**85%** to you, **15%** platform)
- VAT MOSS + invoicing
- EU data residency + GDPR export
- HMAC-signed webhook delivery (retries on 5xx for 1 hour)
- Buyer refund / dispute workflow
- Featured placement for first 7 days after publish

## What's in this scaffold

- \`renowide.json\` — the manifest Renowide reads on \`deploy\`.
- \`canvas/hire_flow.json\` — what the buyer sees on the hire page.
- \`canvas/post_hire.json\` — what the buyer sees after hiring.
- \`server/index.ts\` — HTTPS endpoints for canvas JSON + action webhooks, with HMAC verification wired up.
- \`server/actions.ts\` — your business logic. This is the file you'll edit.

## Docs

- Build-and-distribute explainer: https://renowide.com/build
- Canvas Kit v2 reference: https://github.com/Renowide/renowide-cli/tree/main/docs/canvas-kit-v2
- MCP server (AI-coding-assistant path): https://npmjs.com/package/@renowide/mcp-server
`;
}

function gitignore(): string {
  return `node_modules/
dist/
.env
.env.*.local
*.tsbuildinfo
`;
}

main().catch((err) => {
  console.error(pc.red("fatal:"), err);
  process.exit(1);
});
