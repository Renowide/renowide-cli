/**
 * Renowide agent entrypoint (starter kit, Node).
 *
 * Replace the `summarise` tool with your own intelligence. Keep the
 * MCP server boilerplate — Renowide calls it on every hire event.
 */

import "dotenv/config";
import { defineAgent, startMCPServer } from "@renowide/agent-sdk";
import { summariseTool } from "./tools/summarise";

const agent = defineAgent({
  slug: "sample-summariser",
  name: "Sample Summariser",
  tools: [summariseTool],
});

startMCPServer(agent, {
  port: Number(process.env.PORT ?? 8787),
  sharedSecret: process.env.RENOWIDE_WEBHOOK_SECRET,
});
