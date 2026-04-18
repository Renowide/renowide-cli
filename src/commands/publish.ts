/**
 * `renowide publish` — validate the manifest and register the agent.
 *
 * Calls POST /api/v1/creator/agents/manifest with the parsed
 * renowide.yaml. The backend treats this as an upsert keyed on
 * (creator_id, slug) so you can re-publish to update pricing or add
 * capabilities.
 */

import pc from "picocolors";
import { RenowideAPI } from "../api";
import { requireCredentials } from "../config";
import { manifestToRegistrationPayload, readManifest } from "../manifest";

interface PublishResp {
  id: string;
  agent_slug: string;
  status: string;
  message: string;
  webhook_config?: {
    secret: string;
    context_push_url?: string;
    proposal_inbound_url?: string;
    status_url?: string;
    instructions?: string;
  };
  mcp_config?: {
    server_url: string;
    example: unknown;
    instructions: string;
  };
  live_url?: string;
}

export async function cmdPublish(opts: { manifest: string; dryRun?: boolean }) {
  const manifest = readManifest(opts.manifest);
  const payload = manifestToRegistrationPayload(manifest);

  if (opts.dryRun) {
    console.log(pc.green("✓ manifest valid"));
    console.log(pc.gray("  (dry-run — not calling the API)"));
    console.log("");
    console.log("  slug:       ", manifest.slug);
    console.log("  guild:      ", manifest.guild);
    console.log("  protocol:   ", manifest.protocol);
    console.log("  pricing:    ", JSON.stringify(manifest.pricing));
    console.log("  capabilities:", manifest.capabilities.map((c) => c.id).join(", "));
    return;
  }

  const creds = requireCredentials();
  const api = new RenowideAPI(creds.apiBase, creds.token);

  console.log(pc.gray(`→ publishing ${manifest.slug} to ${creds.apiBase}`));
  const resp = await api.post<PublishResp>("/api/v1/creator/agents/manifest", {
    manifest: payload,
  });

  console.log(pc.green(`✓ ${resp.message}`));
  console.log("");
  console.log(`  agent id:   ${resp.id}`);
  console.log(`  slug:       ${resp.agent_slug}`);
  console.log(`  status:     ${resp.status}`);
  if (resp.live_url) console.log(`  live URL:   ${pc.underline(resp.live_url)}`);

  if (resp.webhook_config?.secret) {
    console.log("");
    console.log(pc.yellow("  webhook secret (store this — not shown again):"));
    console.log(`  ${pc.bold(resp.webhook_config.secret)}`);
  }
  if (resp.mcp_config?.server_url) {
    console.log("");
    console.log(pc.gray("  MCP server URL: ") + resp.mcp_config.server_url);
  }

  console.log("");
  console.log(pc.gray("  next: `renowide test:sandbox` — simulate a hire end-to-end"));
}
