/**
 * `renowide compliance` — EU AI Act compliance tools.
 *
 * Gap 5: These commands surface the EU AI Act compliance status at the
 * terminal — during development, not after the fact. Every command is
 * self-contained (no wizard, no interactive prompts) so it can be piped
 * in CI / called from AI agents.
 *
 * Subcommands:
 *   renowide compliance check <slug>
 *     — Risk classification + obligations + what Renowide handles.
 *       Identical to what the deploy output shows but callable any time.
 *
 *   renowide compliance generate-docs <slug>
 *     — POST /creator/agents/:slug/generate-eu-tech-docs.
 *       Generates Art. 11 technical documentation pre-filled from the
 *       manifest. Returns the document JSON.
 *
 *   renowide compliance literacy-pack <slug>
 *     — GET /creator/agents/:slug/art4-literacy-pack.
 *       Returns the Art. 4 AI Literacy Pack the deployer should keep
 *       on file. Can be piped to a PDF generator.
 *
 *   renowide compliance deployer-obligations <slug>
 *     — GET /creator/agents/:slug/deployer-obligations.
 *       Returns what the *business* that hires this agent must do.
 *       Useful to include in product documentation.
 *
 * All subcommands support --json to get raw JSON output.
 *
 * Regulation reference: EU AI Act Regulation (EU) 2024/1689.
 * Art. 4 in force since 2 February 2025.
 * Main body applicable from 2 August 2026.
 */

import pc from "picocolors";
import { RenowideAPI } from "../api.js";
import { requireCredentials } from "../config.js";

interface EuCompliance {
  agent_slug: string;
  agent_name: string;
  eu_risk_level: string;
  risk_reasons: string[];
  obligations: string[];
  platform_provides: string[];
  c2pa_required?: boolean;
  disclosure_url?: string;
  tech_doc_ready?: boolean;
  next_steps?: string[];
}

const RISK_COLOURS: Record<string, (s: string) => string> = {
  prohibited: (s) => pc.red(s),
  high:       (s) => pc.yellow(s),
  limited:    (s) => pc.cyan(s),
  minimal:    (s) => pc.green(s),
};

function riskLabel(level: string): string {
  const labels: Record<string, string> = {
    prohibited: "PROHIBITED — cannot be deployed",
    high:       "HIGH RISK (Annex III) — technical docs + conformity assessment required",
    limited:    "LIMITED RISK — Art. 50 transparency obligations",
    minimal:    "MINIMAL RISK — Art. 4 AI Literacy Pack auto-generated at every hire",
  };
  const colour = RISK_COLOURS[level] ?? ((s: string) => s);
  return colour(labels[level] ?? level);
}

export async function cmdComplianceCheck(
  slug: string,
  opts: { json?: boolean },
): Promise<void> {
  const creds = requireCredentials();
  const api = new RenowideAPI(creds.apiBase, creds.token);

  const eu = await api.get<EuCompliance>(
    `/api/v1/creator/agents/${encodeURIComponent(slug)}/eu-compliance`,
  );

  if (opts.json) {
    console.log(JSON.stringify(eu, null, 2));
    return;
  }

  console.log("");
  console.log(pc.bold(`EU AI Act compliance: ${eu.agent_name} (${slug})`));
  console.log(`  Risk level:   ${riskLabel(eu.eu_risk_level)}`);

  if (eu.risk_reasons.length > 0) {
    console.log("");
    console.log(pc.bold("  Classification basis:"));
    for (const r of eu.risk_reasons) console.log(pc.gray(`    • ${r}`));
  }

  console.log("");
  console.log(pc.bold("  Renowide provides automatically:"));
  for (const p of eu.platform_provides) {
    console.log(pc.green(`    ✓ ${p}`));
  }

  console.log("");
  console.log(pc.bold("  Your obligations:"));
  for (const o of eu.obligations) {
    const isArt4 = o.startsWith("Art. 4");
    console.log((isArt4 ? pc.cyan : pc.yellow)(`    ${isArt4 ? "ℹ" : "!"} ${o}`));
  }

  if (eu.c2pa_required) {
    console.log("");
    console.log(pc.yellow("  ⚠ Art. 50(4): C2PA watermarking required."));
    console.log(pc.gray("    See: https://github.com/Renowide/renowide-cli/docs/c2pa.md"));
  }

  if (eu.disclosure_url) {
    console.log("");
    console.log(pc.gray(`  Transparency URL: ${eu.disclosure_url}`));
    console.log(pc.gray("    Link this from your product docs and EU submissions."));
  }

  if (eu.next_steps && eu.next_steps.length > 0) {
    console.log("");
    console.log(pc.bold("  Next steps:"));
    for (const s of eu.next_steps) console.log(`    → ${s}`);
  }
  console.log("");
}


export async function cmdComplianceGenerateDocs(
  slug: string,
  opts: { json?: boolean },
): Promise<void> {
  const creds = requireCredentials();
  const api = new RenowideAPI(creds.apiBase, creds.token);

  console.log(pc.gray(`→ generating EU AI Act technical documentation for ${pc.bold(slug)}…`));
  const doc = await api.post<{
    generated: boolean;
    doc_version: number;
    risk_level: string;
    status: string;
    transparency_url: string;
    next: string;
    document: Record<string, unknown>;
  }>(`/api/v1/creator/agents/${encodeURIComponent(slug)}/generate-eu-tech-docs`, {});

  if (opts.json) {
    console.log(JSON.stringify(doc, null, 2));
    return;
  }

  console.log(pc.green(`✓ Technical documentation generated (v${doc.doc_version})`));
  console.log(`  Risk level:  ${riskLabel(doc.risk_level)}`);
  console.log(`  Status:      ${doc.status}`);
  console.log(`  Next:        ${doc.next}`);
  console.log(pc.gray(`  Transparency URL: ${doc.transparency_url}`));

  if (doc.risk_level === "high") {
    console.log("");
    console.log(pc.yellow("  High-risk agent — review the generated document and add:"));
    console.log(pc.yellow("    • Known limitations (declare in renowide.json: known_limitations[])"));
    console.log(pc.yellow("    • Accuracy metrics from your evaluation"));
    console.log(pc.yellow("  Then submit for Renowide compliance review."));
  }
  console.log("");
}


export async function cmdComplianceLiteracyPack(
  slug: string,
  opts: { json?: boolean; hireId?: number },
): Promise<void> {
  const creds = requireCredentials();
  const api = new RenowideAPI(creds.apiBase, creds.token);

  const qs = opts.hireId ? `?hire_id=${opts.hireId}` : "";
  const pack = await api.get<Record<string, unknown>>(
    `/api/v1/creator/agents/${encodeURIComponent(slug)}/art4-literacy-pack${qs}`,
  );

  if (opts.json) {
    console.log(JSON.stringify(pack, null, 2));
    return;
  }

  console.log("");
  console.log(pc.bold("EU AI Act Art. 4 — AI Literacy Pack"));
  console.log(pc.gray("(In force since 2 February 2025. Keep on file for auditor review.)"));
  console.log("");

  const sections = [
    "section_1_capabilities",
    "section_2_limitations",
    "section_3_interpretation",
    "section_4_oversight",
    "section_5_automation_bias",
    "section_6_staff_attestation",
  ] as const;

  for (const s of sections) {
    const section = pack[s] as { title: string; content: string } | undefined;
    if (section) {
      console.log(pc.bold(section.title));
      console.log(section.content);
      console.log("");
    }
  }

  console.log(pc.gray(pack["compliance_note"] as string ?? ""));
  console.log("");
}


export async function cmdComplianceDeployerObligations(
  slug: string,
  opts: { json?: boolean },
): Promise<void> {
  const creds = requireCredentials();
  const api = new RenowideAPI(creds.apiBase, creds.token);

  const data = await api.get<{
    agent_name: string;
    eu_risk_level: string;
    deployer_obligations: string[];
    hire_confirmation_required: string[];
    guild_literacy_note: string;
    transparency_url: string;
  }>(`/api/v1/creator/agents/${encodeURIComponent(slug)}/deployer-obligations`);

  if (opts.json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  console.log("");
  console.log(pc.bold(`Deployer obligations: ${data.agent_name}`));
  console.log(`  Risk level: ${riskLabel(data.eu_risk_level)}`);
  console.log("");
  console.log(pc.bold("  What the hiring business must do:"));
  for (const o of data.deployer_obligations) {
    console.log(`    • ${o}`);
  }

  if (data.hire_confirmation_required.length > 0) {
    console.log("");
    console.log(pc.bold("  Required at hire confirmation:"));
    for (const c of data.hire_confirmation_required) {
      console.log(pc.yellow(`    ☐ ${c}`));
    }
  }

  if (data.guild_literacy_note) {
    console.log("");
    console.log(pc.gray(`  Staff literacy note: ${data.guild_literacy_note}`));
  }

  console.log(pc.gray(`  Transparency URL: ${data.transparency_url}`));
  console.log("");
}
