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
  /**
   * Optional server-provided EUR valuation for `creator_earnings_credits`.
   * Preferred over any client-side credits-to-EUR constant so that if
   * Renowide ever reprices credits, the old-CLI-in-the-wild reports the
   * correct figure on the next `renowide status`.
   */
  creator_earnings_eur?: number | null;
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
        padVisible("slug", 28),
        padVisible("status", 16),
        padVisible("active", 8),
        padVisible("total hires", 12),
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
          padVisible(a.agent_slug, 28),
          padVisible(statusBadge(a.status), 16),
          padVisible(String(a.active_hires), 8),
          padVisible(String(a.hire_count), 12),
          pricing,
        ].join("  "),
    );
  }

  console.log("");
  console.log(pc.bold("earnings"));
  console.log(`  credits consumed:  ${earnings.total_credits_consumed.toLocaleString()}`);
  console.log(
    `  your share:        ${earnings.creator_earnings_credits.toLocaleString()} credits${formatEurSuffix(earnings.creator_earnings_eur)}`,
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

/**
 * `padEnd` that measures visible width only — i.e. strips ANSI SGR
 * escape sequences emitted by picocolors before counting. Without this,
 * a green "active" (15 raw bytes, 6 visible) over-consumes `padEnd(16)`
 * and every column after it drifts left. Intentionally inlined — this
 * is the only caller — so we can ship without a `string-width` dep.
 */
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;
export function padVisible(s: string, width: number): string {
  const visible = s.replace(ANSI_RE, "").length;
  if (visible >= width) return s;
  return s + " ".repeat(width - visible);
}

function formatEurSuffix(eur: number | null | undefined): string {
  if (typeof eur !== "number" || !Number.isFinite(eur)) return "";
  return `  (~€${eur.toFixed(2)})`;
}
