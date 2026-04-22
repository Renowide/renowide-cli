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


// ─── Art. 22 Authorised Representative mandate subcommands ──────────────────
// These are the final step in the "Renowide as Art. 22 representative"
// claim — without a signed mandate the platform cannot legally act as the
// Provider's EU representative. The CLI flow reads the template, shows
// the creator what they're signing, and POSTs acceptance.

interface Art22Template {
  terms_version: string;
  is_draft: boolean;
  template_url: string;
  provider_legal_name: string;
  signatory_name: string;
  agent_slugs_covered: string[];
  representative_entity: string;
  required_fields: string[];
  draft_warning?: string;
}

interface Art22Status {
  has_mandate: boolean;
  current_version: string;
  accepted_version?: string;
  is_up_to_date?: boolean;
  provider_legal_name?: string;
  signatory_name?: string;
  accepted_at?: string;
  is_draft?: boolean;
  agent_slugs_covered?: string[];
  renew_required?: boolean;
  message?: string;
}

export async function cmdComplianceMandateStatus(opts: { json?: boolean }): Promise<void> {
  const creds = requireCredentials();
  const api = new RenowideAPI(creds.apiBase, creds.token);
  const status = await api.get<Art22Status>("/api/v1/creator/art22-mandate/status");
  if (opts.json) { console.log(JSON.stringify(status, null, 2)); return; }

  console.log("");
  console.log(pc.bold("EU AI Act Art. 22 — Authorised Representative Mandate"));
  console.log("");
  if (!status.has_mandate) {
    console.log(pc.yellow("  Status: NOT ACCEPTED"));
    console.log(pc.gray(`  Current version: ${status.current_version}`));
    console.log("");
    console.log("  You cannot publish HIGH-RISK agents until you accept the");
    console.log("  Authorised Representative mandate. Run:");
    console.log(pc.bold("    renowide compliance accept-mandate"));
    console.log("");
    return;
  }
  console.log(pc.green(`  Status: ACCEPTED${status.is_draft ? pc.yellow(" (DRAFT)") : ""}`));
  console.log(`  Accepted version: ${status.accepted_version}`);
  console.log(`  Current version:  ${status.current_version}`);
  console.log(`  Up to date:       ${status.is_up_to_date ? pc.green("yes") : pc.yellow("no — renewal required")}`);
  console.log(`  Provider:         ${status.provider_legal_name}`);
  console.log(`  Signatory:        ${status.signatory_name}`);
  console.log(`  Accepted at:      ${status.accepted_at}`);
  if (status.agent_slugs_covered?.length) {
    console.log(`  Agents covered:   ${status.agent_slugs_covered.join(", ")}`);
  }
  if (status.renew_required) {
    console.log("");
    console.log(pc.yellow("  Renewal required — run: renowide compliance accept-mandate"));
  }
  console.log("");
}

export async function cmdComplianceAcceptMandate(opts: {
  json?: boolean;
  yes?: boolean;
  provider?: string;
  signatory?: string;
  role?: string;
}): Promise<void> {
  const creds = requireCredentials();
  const api = new RenowideAPI(creds.apiBase, creds.token);

  // Step 1 — fetch template + current version
  const tpl = await api.get<Art22Template>("/api/v1/creator/art22-mandate/template");

  console.log("");
  console.log(pc.bold("EU AI Act Art. 22 — Authorised Representative Mandate"));
  console.log(`  Version:       ${tpl.terms_version}${tpl.is_draft ? pc.yellow(" [DRAFT]") : ""}`);
  console.log(`  Full text:     ${tpl.template_url}`);
  console.log(`  Representative: ${tpl.representative_entity}`);
  console.log(`  Agents covered: ${tpl.agent_slugs_covered.join(", ") || "(none yet — register at least one agent first)"}`);
  console.log("");
  if (tpl.draft_warning) {
    console.log(pc.yellow("  ⚠ DRAFT NOTICE"));
    for (const line of tpl.draft_warning.match(/.{1,78}(\s|$)/g) ?? [tpl.draft_warning]) {
      console.log(pc.yellow(`    ${line.trim()}`));
    }
    console.log("");
  }

  const provider = opts.provider ?? tpl.provider_legal_name;
  const signatory = opts.signatory ?? tpl.signatory_name;
  if (!provider?.trim() || !signatory?.trim()) {
    throw new Error(
      "Provider legal name and signatory name are required. " +
      "Pass --provider '<Legal Company Name>' --signatory '<Your Full Name>' " +
      "or fill those fields in your Renowide creator profile first.",
    );
  }

  // Step 2 — confirmation (skipped with --yes for CI)
  if (!opts.yes) {
    console.log(pc.bold("  You are about to electronically accept the following:"));
    console.log(`    • Provider legal name:    ${provider}`);
    console.log(`    • Signatory:              ${signatory}${opts.role ? " (" + opts.role + ")" : ""}`);
    console.log(`    • Agreement version:      ${tpl.terms_version}`);
    console.log(`    • Representative:         Renowide OÜ (Estonia, EU)`);
    console.log("");
    console.log(pc.bold("  By proceeding you confirm you have READ the full agreement text"));
    console.log(pc.bold("  at the URL above and have authority to bind the Provider."));
    console.log("");
    console.log(pc.gray("  Re-run with --yes to skip this confirmation (CI mode)."));
    console.log("");
    console.log(pc.yellow("  Acceptance not recorded (interactive confirmation not supported in this build)."));
    console.log(pc.gray("  Add --yes to the command to record acceptance."));
    console.log("");
    return;
  }

  // Step 3 — POST acceptance
  const res = await api.post<{
    accepted: boolean;
    mandate_id: number;
    terms_version: string;
    is_draft: boolean;
    acceptance_hash: string;
    accepted_at: string;
    agent_slugs_covered: string[];
    next_step: string;
  }>("/api/v1/creator/art22-mandate/accept", {
    provider_legal_name: provider,
    signatory_name:      signatory,
    signatory_role:      opts.role,
    terms_version:       tpl.terms_version,
    i_have_read:         true,
    i_accept:            true,
    draft_acknowledged:  tpl.is_draft ? true : undefined,
  });

  if (opts.json) { console.log(JSON.stringify(res, null, 2)); return; }

  console.log(pc.green(`✓ Mandate accepted — v${res.terms_version}${res.is_draft ? pc.yellow(" (DRAFT)") : ""}`));
  console.log(`  Mandate ID:       ${res.mandate_id}`);
  console.log(`  Acceptance hash:  ${res.acceptance_hash.substring(0, 24)}…`);
  console.log(`  Accepted at:      ${res.accepted_at}`);
  console.log(`  Agents covered:   ${res.agent_slugs_covered.join(", ") || "(none yet)"}`);
  console.log("");
  console.log(pc.gray(`  ${res.next_step}`));
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
