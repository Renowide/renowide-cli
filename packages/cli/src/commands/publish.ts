/**
 * `renowide publish` — validate the manifest and register the agent.
 *
 * Sends the full v0.5 manifest to POST /api/v1/creator/agents/manifest.
 * The backend is the source of truth for asset ingestion, `when:`
 * validation, and persistence. The CLI's job is fail-fast on local
 * problems (YAML syntax, schema violations, missing asset URLs).
 */

import pc from "picocolors";
import { RenowideAPI } from "../api.js";
import { requireCredentials } from "../config.js";
import { readManifest, type Manifest } from "../manifest.js";

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

function summariseAssets(m: Manifest): string[] {
  const lines: string[] = [];
  if (m.assets.logo) lines.push(`  logo:        ${m.assets.logo}`);
  if (m.assets.avatar) lines.push(`  avatar:      ${m.assets.avatar}`);
  if (m.assets.hero) lines.push(`  hero:        ${m.assets.hero}`);
  if (m.assets.screenshots.length) {
    lines.push(`  screenshots: ${m.assets.screenshots.length} image(s)`);
  }
  if (m.assets.demo_video) lines.push(`  demo_video:  ${m.assets.demo_video}`);
  return lines;
}

function summariseCanvas(m: Manifest): string[] {
  const lines: string[] = [];
  if (m.chat.canvas.length) lines.push(`  chat canvas:       ${m.chat.canvas.length} block(s)`);
  if (m.chat.variants?.length)
    lines.push(`  chat variants:     ${m.chat.variants.length}`);
  if (m.chat.starter_prompts.length)
    lines.push(`  chat starter:      ${m.chat.starter_prompts.length} prompt(s)`);
  if (m.post_hire.welcome_canvas.length)
    lines.push(`  post-hire canvas:  ${m.post_hire.welcome_canvas.length} block(s)`);
  if (m.post_hire.variants?.length)
    lines.push(`  post-hire variants:${m.post_hire.variants.length}`);
  if (m.dashboard.tiles.length)
    lines.push(`  dashboard tiles:   ${m.dashboard.tiles.length}`);
  if (m.brand) {
    const brandSummary = [
      m.brand.primary_color ? `primary ${m.brand.primary_color}` : null,
      m.brand.accent_color ? `accent ${m.brand.accent_color}` : null,
      m.brand.font_family ? `font ${m.brand.font_family}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    if (brandSummary) lines.push(`  brand:             ${brandSummary}`);
  }
  if (m.tools?.length) lines.push(`  tools:             ${m.tools.length} declared`);
  return lines;
}

export async function cmdPublish(opts: { manifest: string; dryRun?: boolean }) {
  // `readManifest` already validates every `when` expression via
  // `validateWhenExpressions`. We used to re-run it here with a
  // "belt + braces" comment, but that is a pure duplicate: if readManifest
  // succeeds, the re-run always succeeds; if it fails, readManifest would
  // have thrown already. Removed.
  const manifest = readManifest(opts.manifest);

  if (opts.dryRun) {
    console.log(pc.green("✓ manifest valid"));
    console.log(pc.gray("  (dry-run — not calling the API)"));
    console.log("");
    console.log("  slug:       ", manifest.slug);
    console.log("  guild:      ", manifest.guild);
    console.log("  protocol:   ", manifest.protocol);
    console.log("  capabilities:", manifest.capabilities.map((c) => c.id).join(", "));
    const assets = summariseAssets(manifest);
    const canvas = summariseCanvas(manifest);
    if (assets.length) {
      console.log("");
      console.log(pc.gray("  assets:"));
      assets.forEach((l) => console.log(l));
    }
    if (canvas.length) {
      console.log("");
      console.log(pc.gray("  canvas:"));
      canvas.forEach((l) => console.log(l));
    }
    return;
  }

  const creds = requireCredentials();
  const api = new RenowideAPI(creds.apiBase, creds.token);

  console.log(pc.gray(`→ publishing ${manifest.slug} to ${creds.apiBase}`));
  const resp = await api.post<PublishResp>("/api/v1/creator/agents/manifest", {
    manifest,
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
