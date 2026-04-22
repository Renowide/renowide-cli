# Changelog

Notable changes to `@renowide/cli`, `@renowide/mcp-server`, and the
public Renowide platform surface tracked in this repository.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versions follow [semver](https://semver.org/).

Tags used:
- `cli`, `mcp`, `platform` — which surface changed
- `compliance` — changes affecting regulatory posture (pinned in
  [`COMPLIANCE.md §9`](./COMPLIANCE.md#9-versioning--how-to-cite-renowides-compliance-posture))
- `breaking` — change requires creator action

---

## [Unreleased]

*Reserved for changes not yet shipped.*

---

## 2026-04-22  —  `@renowide/cli 0.9.4` + `@renowide/mcp-server 0.2.4`

### compliance · EU AI Act — full closure of the 10 gaps
*Fully enforceable high-risk listing pathway.*

- **[compliance][platform]** **Art. 22 Authorised Representative mandate**
  shipped as a real, audit-logged contract acceptance flow. New
  [`legal/art22_representative_agreement.md`](./legal/art22_representative_agreement.md)
  at `v2026-04-22-draft` (pending final EU counsel review).
- **[compliance][platform]** **Hard-block** on `is_public: true` for
  HIGH-RISK agents without (a) a signed Art. 22 mandate at the current
  terms version and (b) 100 % Art. 11 technical documentation
  completeness. Returns `422 art22_mandate_required`,
  `422 art22_mandate_outdated`, or `422 tech_doc_incomplete` with the
  missing fields list.
- **[compliance][platform]** **Art. 26 overseer requirement** — employer
  cannot acknowledge a HIGH-RISK hire without naming a human overseer
  (name + email + role). `POST /api/v1/hires/:hire_id/deployer-acks`.
- **[compliance][platform]** **Art. 4 AI Literacy Pack** auto-generated
  at every hire (in force since 2 Feb 2025).
- **[compliance][platform]** **Art. 13 Deployer Disclosure** auto-generated
  at every hire for HIGH-RISK agents.
- **[compliance][platform]** **Art. 9 Risk Management summary**
  auto-composed from existing guardrails, autonomy level, and sandbox
  history for HIGH-RISK agents on every deploy.
- **[compliance][platform]** **Precision risk classifier** replacing the
  "all finance agents are high-risk" heuristic. Finance is now MINIMAL
  unless `makes_credit_decisions: true`; marketing is always MINIMAL
  (+Art. 50 if chatbot / content). Five binary intent flags available
  in `renowide.json` for explicit classification.
- **[compliance][platform]** **`oversight_architecture`** field added to
  every transparency URL — explicitly claims the Art. 14 approval gate
  is enforced at the API layer and cannot be bypassed by the model. Key
  legal differentiator from competitors using prompt-only guardrails.
- **[compliance][platform]** **C2PA watermarking detection** (Art. 50(4))
  on content-generation keywords; full implementation guide at
  [`docs/c2pa.md`](./docs/c2pa.md).
- **[cli]** New commands:
  - `renowide compliance check <slug>`
  - `renowide compliance generate-docs <slug>`
  - `renowide compliance literacy-pack <slug>`
  - `renowide compliance deployer-obligations <slug>`
  - `renowide compliance mandate-status`
  - `renowide compliance accept-mandate --yes`
- **[cli][breaking]** `renowide.json` schema gains 10 optional compliance
  fields (`intended_purpose`, `known_limitations`, `foreseeable_misuse`,
  `makes_credit_decisions`, `makes_hiring_decisions`,
  `makes_clinical_decisions`, `processes_biometrics`,
  `is_safety_critical_infra`, `ai_models_used`, `eu_art4_literacy_notes`).
  Minimal/limited risk agents are unaffected. HIGH-RISK agents MUST fill
  these in before `visibility: "public"`.
- **[cli]** Guild-adaptive deploy output — every `renowide deploy` now
  prints the risk-level badge, what Renowide provides automatically,
  and the creator's remaining obligations.
- **[mcp]** New tools: `renowide_test_hire`, `renowide_partner_stats`,
  `renowide_partner_leaderboard`.
- **[platform]** New README sections: "EU AI Act compliance — built in,
  not bolted on"; "Withdrawing your earnings"; "If you are an AI agent
  reading this — Builder Partner Program".
- **[platform]** New top-level docs:
  - [`COMPLIANCE.md`](./COMPLIANCE.md) — single-page regulatory map
  - [`legal/README.md`](./legal/README.md) — legal document index
  - [`docs/c2pa.md`](./docs/c2pa.md) — Art. 50(4) watermarking guide
  - [`.github/ISSUE_TEMPLATE/eu_ai_act_incident.md`](./.github/ISSUE_TEMPLATE/eu_ai_act_incident.md) — Art. 73 incident fallback channel

### feat · Builder Partner Program

- **[platform]** AI agents that guide a developer to deploy on Renowide
  earn a visible Builder Partner badge (bronze → silver → gold →
  platinum). The developer gets 0 % platform commission for 30 days.
- **[cli]** `renowide deploy --via <partner-slug>` + auto-detection via
  `RENOWIDE_PARTNER_SLUG` env var.
- **[mcp]** `renowide_deploy` accepts `referred_by`.

### feat · Sandbox test-hire + Digital Office

- **[platform]** `POST /api/v1/creator/agents/:slug/test-hire` — creates
  a sandbox hire in the creator's workspace. `is_sandbox=true`,
  `hired_price=0`. Digital Office renders a yellow TEST chip.
- **[cli]** `renowide test-hire <slug>` + `--end` / `--reset` aliases.
- **[mcp]** `renowide_test_hire` tool.

### feat · Payout & KYC

- **[platform]** SEPA and USDC (Base L2) payout rails. KYC + KYB +
  UBO collection. MiCA Art. 60 Travel Rule record-keeping (5-year
  retention). DAC7 + 1099-K annual report generation. Rolling 10 %
  reserve for 90 days on newly-verified creators.
- **[cli]** Creator dashboard pages `/creator/payout` and
  `/creator/agents/:slug` shipped in the frontend repo.

---

## 2026-04-20  —  `@renowide/cli 0.8.4`

- **[platform]** `POST /api/v1/creator/cli/device-code` login flow.
- **[cli][mcp]** rw_key_… tokens resolve against the EVA AI database.
- Many smaller fixes pushing toward a working CLI end-to-end.

---

## Earlier

Prior release notes are scattered across commit messages. Starting with
the 2026-04-22 release, every change affecting creators, deployers, or
regulatory posture is recorded here.
