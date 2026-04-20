/**
 * `renowide status` — summary of live agents, hires, credits, and payouts.
 *
 * This is where the exact revenue split lives — we deliberately don't
 * show it on any marketing surface, only in the creator dashboard and
 * here in the CLI.
 */

import pc from "picocolors";
import { RenowideAPI } from "../api.js";
import { requireCredentials } from "../config.js";

interface EarningsResp {
  total_credits_consumed: number;
  creator_earnings_credits: number;
  platform_fee_credits: number;
  agents: Array<{
    id: string;
    name: string;
    agent_slug: string;
    guild: string;
    layer: number;
    hire_count: number;
    active_hires: number;
    total_credits_consumed: number;
    creator_earnings: number;
  }>;
}

interface AgentsResp {
  agents: Array<{
    id: string;
    name: string;
    status: string;
    guild: string;
    layer: number;
    agent_slug: string;
    hire_count: number;
    active_hires: number;
    credits_per_day: number | null;
    credits_per_run: number | null;
    billing_model: string;
    connection_type: string;
    created_at: string;
  }>;
}

export async function cmdStatus(opts: { agent?: string }) {
  const creds = requireCredentials();
  const api = new RenowideAPI(creds.apiBase, creds.token);

  const [agents, earnings] = await Promise.all([
    api.get<AgentsResp>("/api/v1/creator/agents"),
    api.get<EarningsResp>("/api/v1/creator/earnings"),
  ]);

  const filter = opts.agent?.toLowerCase();
  const rows = agents.agents.filter((a) => !filter || a.agent_slug === filter);

  if (rows.length === 0) {
    console.log(pc.gray("no agents published yet — try `renowide publish`"));
    return;
  }

  console.log(pc.bold("agents"));
  console.log(
    "  " +
      [
        "slug".padEnd(28),
        "status".padEnd(16),
        "active".padEnd(8),
        "total hires".padEnd(12),
        "pricing",
      ].join("  "),
  );
  for (const a of rows) {
    const pricing =
      a.credits_per_run != null
        ? `${a.credits_per_run} credits/run`
        : a.credits_per_day != null
        ? `${a.credits_per_day} credits/day`
        : a.billing_model;
    console.log(
      "  " +
        [
          a.agent_slug.padEnd(28),
          statusBadge(a.status).padEnd(16),
          String(a.active_hires).padEnd(8),
          String(a.hire_count).padEnd(12),
          pricing,
        ].join("  "),
    );
  }

  console.log("");
  console.log(pc.bold("earnings"));
  console.log(`  credits consumed:  ${earnings.total_credits_consumed.toLocaleString()}`);
  console.log(
    `  your share:        ${earnings.creator_earnings_credits.toLocaleString()} credits  (~€${(earnings.creator_earnings_credits * 0.01).toFixed(2)})`,
  );
  console.log(`  platform/infra:    ${earnings.platform_fee_credits.toLocaleString()} credits`);
  console.log(pc.gray("  (full breakdown + payout history: renowide.com/creator/earnings)"));
}

function statusBadge(status: string): string {
  if (status === "active") return pc.green("active");
  if (status === "pending_review") return pc.yellow("pending");
  if (status === "suspended") return pc.red("suspended");
  return status;
}
