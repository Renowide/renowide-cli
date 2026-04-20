#!/usr/bin/env node
/**
 * @renowide/cli — command-line tool for publishing agents to Renowide.
 *
 * Commands:
 *   renowide init [dir]            — scaffold a new agent project
 *   renowide add <kind> <name>     — scaffold a v0.6 block, tool, or A/B variant
 *   renowide preview               — render renowide.yaml locally (no API)
 *   renowide login [--key <key>]   — device-code auth, or CI-friendly API key
 *   renowide publish               — upload full renowide.yaml manifest (Persona B)
 *   renowide deploy                — publish a link-out agent from renowide.json (Persona A)
 *   renowide hire show <hire_id>   — inspect a single hire (debugging webhooks)
 *   renowide test:sandbox          — run a simulated hire against your endpoint
 *   renowide status                — summary of live agents, hires, credits
 *   renowide whoami                — print the logged-in creator's identity
 *   renowide logout                — remove stored credentials
 *
 * Two publish paths, two configs, two mental models:
 *   • `publish` reads `renowide.yaml` (Persona B — Renowide hosts the whole
 *     agent: Canvas Kit, tools, post-hire flow, brand, variants, i18n)
 *   • `deploy`  reads `renowide.json` (Persona A — dev hosts their own UI;
 *     Renowide is the marketplace + payment + webhook orchestrator only)
 */

import { Command } from "commander";
import pc from "picocolors";

import { cmdAdd } from "./commands/add.js";
import {
  cmdCanvasFetch,
  cmdCanvasInit,
  cmdCanvasSign,
  cmdCanvasValidate,
  cmdCanvasVerify,
} from "./commands/canvas.js";
import { cmdDeploy } from "./commands/deploy.js";
import { cmdHireShow } from "./commands/hire.js";
import { cmdInit } from "./commands/init.js";
import { cmdLogin } from "./commands/login.js";
import { cmdLogout } from "./commands/logout.js";
import { cmdPreview } from "./commands/preview.js";
import { cmdPublish } from "./commands/publish.js";
import { cmdSandbox } from "./commands/sandbox.js";
import { cmdStatus } from "./commands/status.js";
import { cmdWhoami } from "./commands/whoami.js";
import { loadConfig } from "./config.js";
import { VERSION } from "./version.js";

async function main() {
  const program = new Command();
  program
    .name("renowide")
    .description("Publish and manage AI agents on the Renowide marketplace.")
    .version(VERSION);

  program
    .command("init [dir]")
    .description("Scaffold a new Renowide agent project (Node or Python)")
    .option("--in-place", "Add renowide.yaml to the current project without scaffolding")
    .option("--lang <lang>", "Language template: node | python", "node")
    .action((dir: string | undefined, opts: any) => cmdInit({ dir, ...opts }));

  program
    .command("login")
    .description("Authenticate with Renowide (device-code flow, or --key for CI)")
    .option("--api <url>", "Override API base URL", loadConfig().apiBase)
    .option(
      "--key <rw_key>",
      "Skip the browser flow and validate a pre-minted API key " +
        "(rw_key_... for live, rw_key_test_... for sandbox). " +
        "Mint one at /creator?section=api-keys.",
    )
    .action((opts: any) => cmdLogin(opts));

  program
    .command("logout")
    .description("Remove stored Renowide credentials")
    .action(() => cmdLogout());

  program
    .command("whoami")
    .description("Show the currently authenticated creator")
    .action(() => cmdWhoami());

  program
    .command("publish")
    .description("Validate renowide.yaml and register the agent")
    .option("--manifest <path>", "Path to renowide.yaml", "renowide.yaml")
    .option("--dry-run", "Validate only — do not call the API")
    .action((opts: any) => cmdPublish(opts));

  program
    .command("add <kind> <name>")
    .description("Scaffold a Canvas Kit block, tool, or A/B variant into renowide.yaml")
    .option("--manifest <path>", "Path to renowide.yaml", "renowide.yaml")
    .option("--surface <surface>", "Target surface: chat | post_hire", "chat")
    .action((kind: string, name: string, opts: any) => cmdAdd(kind, name, opts));

  program
    .command("preview")
    .description("Render renowide.yaml locally in the browser (no API calls)")
    .option("--manifest <path>", "Path to renowide.yaml", "renowide.yaml")
    .option("--port <port>", "Port to listen on", "4400")
    .option("--host <host>", "Host to bind to", "127.0.0.1")
    .action((opts: any) => cmdPreview(opts));

  program
    .command("test:sandbox")
    .description("Run a simulated hire against your local or deployed endpoint")
    .option("--manifest <path>", "Path to renowide.yaml", "renowide.yaml")
    .option("--endpoint <url>", "Override endpoint for this run")
    .option("--runs <n>", "Runs per tool", "3")
    .action((opts: any) => cmdSandbox(opts));

  program
    .command("status")
    .description("Show live agents, hires, credits, and payout-ready totals")
    .option("--agent <slug>", "Filter to a single agent slug")
    .action((opts: any) => cmdStatus(opts));

  program
    .command("deploy")
    .description(
      "Publish a Persona A link-out agent from renowide.json (dev hosts their own UI)",
    )
    .option("--config <path>", "Path to renowide.json", "renowide.json")
    .option("--dry-run", "Validate only — do not call the API")
    .action((opts: any) => cmdDeploy(opts));

  // `hire` is a parent command with subcommands so we can grow into
  // `renowide hire list`, `renowide hire logs`, etc. without another
  // top-level command later.
  const hire = program
    .command("hire")
    .description("Inspect hires (read-only debugging tools)");

  hire
    .command("show <hire_id>")
    .description("Print details, buyer form, and webhook delivery state for a hire")
    .option("--json", "Output the raw JSON response instead of a summary")
    .action((hireId: string, opts: any) => cmdHireShow(hireId, opts));

  // ── Canvas Kit v2 (Path C) utilities ───────────────────────────────────────
  // These never hit the Renowide API; they work against YOUR canvas JSON and
  // YOUR webhook endpoints, so devs can iterate before `renowide deploy`.
  const canvas = program
    .command("canvas")
    .description("Canvas Kit v2 utilities: validate JSON, sign requests, verify signatures");

  canvas
    .command("init")
    .description("Scaffold a minimal hire_flow / post_hire canvas JSON file")
    .requiredOption(
      "--surface <surface>",
      "Canvas surface to scaffold: hire_flow | post_hire",
    )
    .option("--out <path>", "Output path (default: <surface>.json)")
    .action((opts: any) => cmdCanvasInit(opts));

  canvas
    .command("validate <file>")
    .description(
      "Validate a canvas JSON file offline (schema, expressions, ui_kit compatibility)",
    )
    .option("--ui <version>", "Renderer target to check against (default: latest shipped)")
    .action((file: string, opts: any) => cmdCanvasValidate(file, opts));

  canvas
    .command("sign <url>")
    .description("Print signed headers for a canvas-fetch GET (does not call the URL)")
    .requiredOption("--slug <slug>", "Agent slug this canvas belongs to")
    .requiredOption(
      "--surface <surface>",
      "Canvas surface: hire_flow | post_hire",
    )
    .option("--buyer-id <id>", "Buyer identity to include in signature")
    .option("--hire-id <id>", "Hire identity to include in signature")
    .option("--request-id <id>", "Override request id (default: random uuid)")
    .option("--secret <val>", "handoff_secret (falls back to RENOWIDE_HANDOFF_SECRET)")
    .action((url: string, opts: any) => cmdCanvasSign(url, opts));

  canvas
    .command("fetch <url>")
    .description(
      "Sign and GET a canvas URL, then validate the response against the canonical schema",
    )
    .requiredOption("--slug <slug>", "Agent slug this canvas belongs to")
    .requiredOption(
      "--surface <surface>",
      "Canvas surface: hire_flow | post_hire",
    )
    .option("--buyer-id <id>", "Buyer identity to include in signature")
    .option("--hire-id <id>", "Hire identity to include in signature")
    .option("--request-id <id>", "Override request id (default: random uuid)")
    .option("--secret <val>", "handoff_secret (falls back to RENOWIDE_HANDOFF_SECRET)")
    .option("--no-validate", "Skip schema validation; just pretty-print the response")
    .action((url: string, opts: any) => cmdCanvasFetch(url, opts));

  canvas
    .command("verify")
    .description(
      "Verify a signed request locally (useful when your webhook 401s in production)",
    )
    .requiredOption("--kind <kind>", "Request kind: canvas | action")
    .requiredOption("--signature <sig>", "Signature header value (v1=<hex>)")
    .requiredOption("--ts <unix>", "X-Renowide-Timestamp value")
    .option("--body <file>", "Raw body file (required for --kind action)")
    .option("--slug <slug>", "Agent slug (required for --kind canvas)")
    .option(
      "--surface <surface>",
      "Canvas surface: hire_flow | post_hire (required for --kind canvas)",
    )
    .option("--request-id <id>", "X-Renowide-Request-Id (required for --kind canvas)")
    .option("--buyer-id <id>", "X-Renowide-Buyer-Id")
    .option("--hire-id <id>", "X-Renowide-Hire-Id")
    .option("--secret <val>", "handoff_secret (falls back to RENOWIDE_HANDOFF_SECRET)")
    .action((opts: any) =>
      cmdCanvasVerify({
        ...opts,
        timestamp: opts.ts,
      }),
    );

  program.parseAsync(process.argv).catch((err) => {
    console.error(pc.red(`error: ${err?.message ?? err}`));
    if (process.env.RENOWIDE_DEBUG) console.error(err);
    process.exit(1);
  });
}

main();
