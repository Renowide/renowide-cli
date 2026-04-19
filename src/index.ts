#!/usr/bin/env node
/**
 * @renowide/cli — command-line tool for publishing agents to Renowide.
 *
 * Commands:
 *   renowide init [dir]         — scaffold a new agent project
 *   renowide add <kind> <name>  — scaffold a v0.6 block, tool, or A/B variant
 *   renowide preview            — render renowide.yaml locally (no API)
 *   renowide login              — device-code authentication
 *   renowide publish            — upload manifest + register agent
 *   renowide test:sandbox       — run a simulated hire against your endpoint
 *   renowide status             — summary of live agents, hires, credits
 *   renowide whoami             — print the logged-in creator's identity
 *   renowide logout             — remove stored credentials
 */

import { Command } from "commander";
import pc from "picocolors";

import { cmdAdd } from "./commands/add";
import { cmdInit } from "./commands/init";
import { cmdLogin } from "./commands/login";
import { cmdLogout } from "./commands/logout";
import { cmdPreview } from "./commands/preview";
import { cmdPublish } from "./commands/publish";
import { cmdSandbox } from "./commands/sandbox";
import { cmdStatus } from "./commands/status";
import { cmdWhoami } from "./commands/whoami";
import { loadConfig } from "./config";

const VERSION = "0.4.0";

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
    .description("Authenticate with Renowide (device-code flow)")
    .option("--api <url>", "Override API base URL", loadConfig().apiBase)
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

  program.parseAsync(process.argv).catch((err) => {
    console.error(pc.red(`error: ${err?.message ?? err}`));
    if (process.env.RENOWIDE_DEBUG) console.error(err);
    process.exit(1);
  });
}

main();
