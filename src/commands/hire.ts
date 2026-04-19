/**
 * `renowide hire <subcommand>` — inspect hires from the CLI.
 *
 * Today this exposes only `show <hire_id>`, which is the single most
 * useful thing a Persona A developer wants while wiring up their
 * webhook handler:
 *
 *   - "I got a `hire.created` webhook — did Renowide really send it?"
 *   - "Is this hire sandbox:true or live?"
 *   - "What did the buyer enter on the pre-hire form?"
 *   - "Has Renowide retried the webhook? How many times?"
 *
 * It's a debugging aid, not a hire-management tool (no create/cancel/
 * refund yet — those flow through the dashboard so a dev can't
 * accidentally refund from a CI pipeline).
 *
 * Shape returned by the server (see RENOWIDE_PERSONA_A_ONRAMP.md §8):
 *   {
 *     id, slug, agent_slug, status, sandbox, created_at, completed_at?,
 *     buyer: { id, email },
 *     pre_hire_form: { ... },
 *     webhook_deliveries: [
 *       { event, status, attempts, last_attempt_at, response_code }
 *     ]
 *   }
 *
 * The CLI prints a compact summary. For the raw JSON use --json.
 */

import pc from "picocolors";

import { RenowideAPI } from "../api";
import { requireCredentials } from "../config";

interface HireDetail {
  id: string;
  slug: string;
  agent_slug: string;
  status: "pending" | "in_progress" | "completed" | "failed" | "cancelled";
  sandbox: boolean;
  created_at: string;
  completed_at?: string;
  buyer?: {
    id?: string;
    email?: string;
  };
  pre_hire_form?: Record<string, unknown>;
  webhook_deliveries?: Array<{
    event: string;
    status: "pending" | "delivered" | "failed";
    attempts: number;
    last_attempt_at?: string;
    response_code?: number;
    error?: string;
  }>;
}

export async function cmdHireShow(
  hireId: string,
  opts: { json?: boolean },
): Promise<void> {
  if (!hireId || !hireId.startsWith("hir_")) {
    throw new Error(
      "Hire IDs look like `hir_…`. Got: " + JSON.stringify(hireId),
    );
  }

  const creds = requireCredentials();
  const api = new RenowideAPI(creds.apiBase, creds.token);

  let hire: HireDetail;
  try {
    hire = await api.get<HireDetail>(
      `/api/v1/creator/hires/${encodeURIComponent(hireId)}`,
    );
  } catch (err: any) {
    if (err?.status === 404) {
      throw new Error(
        `Hire ${hireId} not found (or not owned by your creator account).`,
      );
    }
    if (err?.status === 401) {
      throw new Error(
        "Not authenticated. Run `renowide login` or `renowide login --key rw_key_…`.",
      );
    }
    throw err;
  }

  // --json is for scripting (`renowide hire show hir_… --json | jq`).
  if (opts.json) {
    console.log(JSON.stringify(hire, null, 2));
    return;
  }

  // Human-readable summary.
  const statusColour = statusToColour(hire.status);
  console.log("");
  console.log(pc.bold(hire.id) + (hire.sandbox ? pc.yellow("  [sandbox]") : ""));
  console.log(`  Agent:      ${hire.agent_slug}`);
  console.log(`  Status:     ${statusColour(hire.status)}`);
  console.log(`  Created:    ${formatDate(hire.created_at)}`);
  if (hire.completed_at) {
    console.log(`  Completed:  ${formatDate(hire.completed_at)}`);
  }
  if (hire.buyer?.email) {
    console.log(`  Buyer:      ${hire.buyer.email}`);
  }

  if (hire.pre_hire_form && Object.keys(hire.pre_hire_form).length > 0) {
    console.log("");
    console.log(pc.bold("  Pre-hire form:"));
    for (const [k, v] of Object.entries(hire.pre_hire_form)) {
      // Truncate long values so a copy-pasted uploaded-file blob doesn't
      // flood the terminal.
      const rendered =
        typeof v === "string" && v.length > 120
          ? v.slice(0, 120) + pc.gray(`… (+${v.length - 120} chars)`)
          : JSON.stringify(v);
      console.log(`    ${k}: ${rendered}`);
    }
  }

  if (hire.webhook_deliveries && hire.webhook_deliveries.length > 0) {
    console.log("");
    console.log(pc.bold("  Webhook deliveries:"));
    for (const d of hire.webhook_deliveries) {
      const tag =
        d.status === "delivered"
          ? pc.green("✓")
          : d.status === "failed"
            ? pc.red("✗")
            : pc.gray("·");
      const info = d.response_code
        ? `HTTP ${d.response_code}`
        : d.error || d.status;
      console.log(
        `    ${tag} ${pc.gray(d.event.padEnd(18))} attempts=${d.attempts} ${info}`,
      );
    }
  } else {
    console.log("");
    console.log(
      pc.gray("  No webhook deliveries recorded yet (hire is queued or agent has no webhook_url)."),
    );
  }
  console.log("");
}

function statusToColour(status: HireDetail["status"]) {
  switch (status) {
    case "completed":
      return pc.green;
    case "failed":
    case "cancelled":
      return pc.red;
    case "in_progress":
      return pc.cyan;
    default:
      return pc.yellow;
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    // Keep it terse: "2026-04-17 14:32 UTC"
    return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  } catch {
    return iso;
  }
}
