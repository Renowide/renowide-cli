/**
 * `renowide test-hire <slug>` — sandbox-hire your own agent for end-to-end
 * testing of the user workflow inside Renowide.
 *
 * Before this command existed, the only way a creator could validate their
 * agent was to go public (which requires price + payout destination +
 * is_verified) OR run `test:sandbox` which only exercises a local HTTP
 * endpoint. Neither tests the full user journey — webhook → Digital
 * Office UI → Canvas Kit v2 surfaces → post-hire setup → messaging.
 *
 * `test-hire` solves that. It creates a real `AgentHire` row in the
 * creator's own workspace with `is_sandbox=true` and `hired_price=0`:
 *
 *   - Path A/C (external) → Renowide fires a signed `hire.created` webhook
 *     at the agent's endpoint with `x-renowide-sandbox: true`. Creator
 *     watches their own logs + their Digital Office in parallel.
 *   - Path D (mcp_client) → the hire appears on the next poll loop. The
 *     agent's `renowide_poll_hires` call returns it; the creator exercises
 *     `accept_hire` and `complete_hire` as if it were a real paying buyer.
 *
 * Follow-up: `renowide test-hire <slug> --end` (or `--reset`) to dismiss
 * the active sandbox hire so the next `test-hire` run starts fresh.
 *
 * Idempotency: only one active test-hire per slug. Running twice returns
 * the same hire_id — no duplicates in the Digital Office.
 */

import pc from "picocolors";
import { RenowideAPI } from "../api.js";
import { requireCredentials } from "../config.js";

interface TestHireResponse {
  status: "test_hired" | "already_test_hired";
  hire_id: number;
  hire_uuid: string;
  slug: string;
  name?: string;
  protocol?: string;
  is_sandbox: boolean;
  digital_office_url?: string;
  message: string;
  warnings?: string[];
  next_steps?: string[];
}

interface EndTestHireResponse {
  status: "dismissed" | "no_active_hire";
  hire_id?: number;
  slug: string;
}

export async function cmdTestHire(
  slug: string,
  opts: { mission?: string; autonomy?: string; end?: boolean; reset?: boolean },
) {
  const creds = requireCredentials();
  const api = new RenowideAPI(creds.apiBase, creds.token);

  // `--end` and `--reset` are aliases. Both dismiss the active sandbox
  // hire. We accept both so the muscle memory from other tools (`docker
  // reset`, `kubectl delete`, `git reset`) still works.
  if (opts.end || opts.reset) {
    return endTestHire(api, slug);
  }

  console.log(pc.gray(`→ creating sandbox hire for ${pc.bold(slug)} on ${creds.apiBase}`));

  let resp: TestHireResponse;
  try {
    resp = await api.post<TestHireResponse>(
      `/api/v1/creator/agents/${encodeURIComponent(slug)}/test-hire`,
      {
        mission_brief: opts.mission,
        autonomy_level: opts.autonomy,
      },
    );
  } catch (err: any) {
    if (err?.status === 404) {
      throw new Error(
        `Agent '${slug}' not found, or you don't own it. ` +
          "List your agents with `renowide status`.",
      );
    }
    if (err?.status === 401) {
      throw new Error("Not authenticated. Run `renowide login` first.");
    }
    throw err;
  }

  // Response is identical whether freshly created or already-active, so
  // format once. We do call out the "already" case so the user knows they
  // haven't double-charged themselves (even though nothing is ever charged).
  const alreadyActive = resp.status === "already_test_hired";
  if (alreadyActive) {
    console.log(pc.yellow(`  (already test-hired — using existing hire)`));
  }

  console.log("");
  console.log(
    pc.green(`✓ sandbox hire ready`) +
      pc.gray(` — hire_id ${resp.hire_id}, uuid ${resp.hire_uuid}`),
  );
  console.log(`  Agent:         ${resp.name ?? resp.slug}`);
  console.log(`  Protocol:      ${resp.protocol ?? "unknown"}`);
  console.log(`  Is sandbox:    ${pc.green("true")} (no credits charged)`);
  if (resp.digital_office_url) {
    const base = creds.apiBase.replace(/\/$/, "");
    console.log(`  Digital Office:${" "}${base}${resp.digital_office_url}`);
  }

  if (resp.next_steps?.length) {
    console.log("");
    console.log(pc.bold("Next steps"));
    for (const step of resp.next_steps) {
      console.log(`  • ${step}`);
    }
  }

  if (resp.warnings?.length) {
    console.log("");
    console.log(pc.yellow("Warnings"));
    for (const w of resp.warnings) {
      console.log(`  ${pc.yellow("!")} ${w}`);
    }
    console.log(
      pc.gray(
        "  (The hire is still in your Digital Office — fix the issue and " +
          "re-run with `renowide test-hire " +
          slug +
          " --reset` to dismiss and retry.)",
      ),
    );
  }

  console.log("");
  console.log(
    pc.gray(`Done with the test? Dismiss: renowide test-hire ${slug} --end`),
  );
}

async function endTestHire(api: RenowideAPI, slug: string): Promise<void> {
  console.log(pc.gray(`→ dismissing sandbox hire for ${pc.bold(slug)}`));
  let resp: EndTestHireResponse;
  try {
    resp = await api.del<EndTestHireResponse>(
      `/api/v1/creator/agents/${encodeURIComponent(slug)}/test-hire`,
    );
  } catch (err: any) {
    if (err?.status === 404) {
      throw new Error(
        `Agent '${slug}' not found, or you don't own it.`,
      );
    }
    throw err;
  }

  if (resp.status === "no_active_hire") {
    console.log(pc.gray(`  no active sandbox hire to dismiss — nothing to do.`));
    return;
  }

  console.log(pc.green(`✓ dismissed`) + pc.gray(` hire_id ${resp.hire_id}`));
  console.log(
    pc.gray(
      `  run \`renowide test-hire ${slug}\` again to start a fresh test.`,
    ),
  );
}
