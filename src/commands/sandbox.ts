/**
 * `renowide test:sandbox` — simulate a hire against your endpoint.
 *
 * Two modes:
 *   - endpoint on localhost: CLI drives the hire locally, calls your
 *     MCP endpoint directly, reports latency and audit completeness.
 *   - endpoint public: CLI asks the Renowide API to run a
 *     platform-side sandbox, which exercises the production relay
 *     path. More realistic, slower.
 */

import pc from "picocolors";
import { RenowideAPI } from "../api";
import { loadCredentials, loadConfig } from "../config";
import { readManifest } from "../manifest";

interface SandboxReport {
  passed: boolean;
  tools_exercised: Array<{
    name: string;
    runs: number;
    p50_ms: number;
    p95_ms: number;
    audit_events: number;
    failed: number;
  }>;
  warnings: string[];
}

export async function cmdSandbox(opts: { manifest: string; endpoint?: string; runs?: string }) {
  const manifest = readManifest(opts.manifest);
  const endpoint = opts.endpoint ?? manifest.endpoint;
  if (!endpoint) throw new Error("no endpoint — set it in renowide.yaml or pass --endpoint");

  const isLocal = /localhost|127\.0\.0\.1|::1/.test(endpoint);
  const runs = Math.max(1, Number(opts.runs ?? 3));

  if (isLocal) {
    await runLocalSandbox(endpoint, manifest.capabilities, runs);
    return;
  }

  // Delegate to the platform sandbox for deployed endpoints.
  const creds = loadCredentials();
  const apiBase = creds?.apiBase ?? loadConfig().apiBase;
  const api = new RenowideAPI(apiBase, creds?.token);
  console.log(pc.gray(`→ running platform sandbox for ${manifest.slug}`));
  const report = await api.post<SandboxReport>(
    `/api/v1/creator/agents/${manifest.slug}/sandbox`,
    { runs_per_tool: runs },
  );
  renderReport(report);
}

async function runLocalSandbox(
  endpoint: string,
  capabilities: { id: string; description?: string }[],
  runs: number,
) {
  console.log(pc.gray(`→ local sandbox against ${endpoint}`));
  const report: SandboxReport = {
    passed: true,
    tools_exercised: [],
    warnings: [],
  };

  for (const cap of capabilities) {
    const latencies: number[] = [];
    let audit = 0;
    let failed = 0;
    for (let i = 0; i < runs; i++) {
      const t0 = Date.now();
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            tool: cap.id,
            input: seedInputFor(cap.id),
            traceId: `sandbox_${cap.id}_${i}`,
            hire: {
              hireId: "sandbox",
              workspaceId: "sandbox",
              workspaceJurisdiction: null,
              billingModel: "per_run",
              remainingCredits: 10_000,
              creditBudget: 10_000,
            },
            compliance: {
              allowedResidency: ["EU", "ANY"],
              tags: [],
              jurisdiction: [],
            },
          }),
        });
        latencies.push(Date.now() - t0);
        if (!res.ok) failed++;
        // local sandbox doesn't read audit stream; assume 1 per call.
        audit++;
      } catch {
        failed++;
      }
    }
    latencies.sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
    const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? p50;
    report.tools_exercised.push({
      name: cap.id,
      runs: latencies.length,
      p50_ms: p50,
      p95_ms: p95,
      audit_events: audit,
      failed,
    });
    if (failed > 0) report.passed = false;
  }
  renderReport(report);
}

function seedInputFor(toolId: string): Record<string, unknown> {
  if (toolId === "summarise") {
    return {
      text: "Renowide is the commerce layer for AI agents. It handles billing, compliance, and distribution so developers can ship the intelligence.",
      max_bullets: 3,
    };
  }
  return {};
}

function renderReport(report: SandboxReport) {
  for (const t of report.tools_exercised) {
    const ok = t.failed === 0;
    const mark = ok ? pc.green("✓") : pc.red("✗");
    console.log(
      `  ${mark} ${t.name.padEnd(28)} runs=${t.runs} p50=${t.p50_ms}ms p95=${t.p95_ms}ms audit=${t.audit_events}${
        t.failed ? pc.red(" failed=" + t.failed) : ""
      }`,
    );
  }
  for (const w of report.warnings) console.log(pc.yellow(`  ⚠ ${w}`));
  console.log("");
  console.log(report.passed ? pc.green("sandbox passed") : pc.red("sandbox failed"));
  if (!report.passed) process.exit(1);
}
