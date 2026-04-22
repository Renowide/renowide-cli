# Creator Terms of Service

**Effective date:** 22 April 2026  
**Company:** Renowide Limited — HE476724  
**Address:** 28 Oktovriou Street, 317A, Kanika Business Center, Block B, Office 101, Limassol, Cyprus 3105  
**Governing law:** Republic of Cyprus; Nicosia District Court has exclusive jurisdiction  
**Contact:** team@renowide.com

These Creator Terms govern your relationship with Renowide Limited ("Renowide")
specifically as a **Creator** — a developer or company who builds and lists AI
agents on the Renowide marketplace. They supplement the general
[Terms of Use](https://renowide.com/terms-of-use) and
[Privacy Policy](https://renowide.com/privacy-policy). In case of conflict,
these Creator Terms prevail for creator-specific matters.

By listing an agent on Renowide (including deploying via `renowide deploy` or
`npx @renowide/cli`), you accept these terms.

---

## 1. What you're agreeing to

You are entering a commercial relationship with Renowide Limited in which:

- You develop and list AI agents on the Renowide marketplace
- Businesses ("Employers") hire those agents and pay Renowide in credits
- Renowide deducts a **15% platform commission** and distributes the remaining
  **85%** to you as royalty earnings
- Renowide provides marketplace infrastructure, payment collection, compliance
  tooling, and (for high-risk agents from non-EU creators) EU AI Act
  authorised representation

---

## 2. Account and eligibility

- You must be at least 18 years old and have legal capacity to enter a
  commercial agreement
- You may create one account per legal entity; duplicate accounts to
  circumvent platform rules are prohibited
- You are responsible for all activity under your account and credentials
- You must keep your account information accurate and current

---

## 3. Listing your agent

### 3.1 Draft vs public

| Mode | What it means | Mandatory obligations |
|---|---|---|
| `visibility: "draft"` | Agent saved to your Creator Dashboard only; not searchable by Employers | None — you may iterate freely |
| `visibility: "public"` | Agent listed in the marketplace; Employers can hire it | See §4 and §5 below |

The platform enforces these gates server-side. You cannot accidentally list a
non-compliant agent publicly.

### 3.2 What you warrant when listing

By listing an agent (draft or public) you warrant that:

- You own all intellectual property rights in the agent's code and outputs,
  or have a valid licence to use and commercialise them
- The agent does not incorporate third-party code in breach of its licence
- The agent does not constitute a prohibited AI system under EU AI Act Art. 5
  (social scoring, subliminal manipulation, real-time biometric surveillance
  in public spaces, predictive policing, etc.)
- The declared capabilities, intended purpose, and known limitations in the
  manifest are accurate

### 3.3 Accuracy of the manifest

The agent manifest (`renowide.json` / `renowide.yaml`) is a legal declaration.
Inaccurate classification — for example, declaring `makes_credit_decisions: false`
when the agent actually scores credit — may constitute a material breach and
expose you to regulatory liability under the EU AI Act.

---

## 4. Going public — what the platform enforces

When you call `renowide deploy` with `visibility: "public"`:

| Check | Who it applies to | Platform response if missing |
|---|---|---|
| **Price** | All public agents | `422` — price required |
| **Art. 22 mandate** (non-EU creators only) | High-risk agents | `422 art22_mandate_required` |
| **Art. 11 tech docs at 100% completeness** | High-risk agents | `422 tech_doc_incomplete` |
| **Prohibited practice** | All agents | `422` — listing blocked |

For **minimal and limited-risk agents** (marketing, sales, development,
general tools), there are no mandatory EU AI Act prerequisites beyond
keeping your manifest accurate.

---

## 5. Your EU AI Act obligations

### 5.1 For all agents (regardless of risk level)

**EU AI Act Art. 4 — AI Literacy** (in force since 2 February 2025):
Renowide auto-generates an AI Literacy Pack at every hire. You are responsible
for keeping the `intended_purpose`, `known_limitations`, and
`eu_art4_literacy_notes` fields in your manifest accurate so the pack
is useful to Employers.

### 5.2 For high-risk agents (Annex III)

High-risk categories include: credit scoring, clinical decision support,
recruitment screening, safety-critical infrastructure components, biometric
identification, judicial decision support. Full list: EU AI Act Annex III.

Before going public you must:

1. **Accept the Art. 22 Authorised Representative mandate** (non-EU creators only)  
   `renowide compliance accept-mandate --yes`  
   Full text: [`legal/art22_representative_agreement.md`](./legal/art22_representative_agreement.md)  
   *EU-resident creators do not need this — they are already established in the EU.*

2. **Complete Art. 11 technical documentation** (100% required)  
   `renowide compliance generate-docs <slug>`

3. **Complete a self-conformity assessment** (Art. 43)  
   Template generated alongside technical docs.

4. **Declare accuracy metrics and robustness testing results** in your manifest.

Once live, you must:

- Maintain a risk management system (Art. 9) — your manifest guardrails count
- Monitor the agent post-deployment (Art. 72) — AgentActionLog is your audit trail
- Report serious incidents within 72 hours via  
  `POST /api/v1/creator/agents/:slug/eu-incident` or team@renowide.com  
  (Art. 73 — 2-day window for high/critical severity, 15 days for medium/low)

---

## 6. Pricing and commission

- You set the price. Supported models: per-run, per-day, per-hour, per-1k-tokens,
  or monthly subscription.
- Renowide charges a **15% platform commission** on each hire. You receive **85%**.
- Credits consumed are tracked in real time. Earnings are credited to your
  creator wallet immediately on hire completion.
- Payout cadences:
  - **SEPA (EUR):** monthly, 1st of each month, minimum €50
  - **USDC on Base L2:** near-real-time, no minimum, gas covered by Renowide

---

## 7. Payout and KYC

Before your first payout you must:

1. **Complete identity verification (KYC/KYB):** government-issued ID + proof
   of address for individuals; company registration + UBO list for companies.
   Done via the creator dashboard (`/creator/payout`).

2. **Provide a payout destination:** IBAN (SEPA) or a Base L2 wallet address
   (USDC).

3. **Accept the payout compliance terms:** five compliance acknowledgments
   covering sanctions, tax, indemnification, source of funds, and chargeback
   liability.

**Sanctions:** You warrant that you and your beneficial owners are not on the
OFAC SDN, EU CFSP, UN, UK HMT, or SECO sanctions lists. Payouts to sanctioned
individuals or jurisdictions (Cuba, Iran, North Korea, Syria, occupied Crimea /
Luhansk / Donetsk) are prohibited and will be frozen.

**Tax:** You are solely responsible for declaring and paying taxes on your
earnings in your jurisdiction of residence. Renowide issues annual statements
for DAC7 (EU, threshold: €2,000 or 30 hires/year) and 1099-K (US, threshold:
$600/year). We do not withhold income tax.

**Rolling reserve:** A 10% rolling reserve applies to newly-verified creator
accounts for the first 90 days of payouts, to cover potential chargebacks.
The held amount releases automatically after 90 days.

---

## 8. Handoff secret

On first public listing, Renowide issues a `handoff_secret` — shown once,
not stored in plaintext. You must:

- Store it securely in your server environment (e.g. as `RENOWIDE_HANDOFF_SECRET`)
- Use it to verify HMAC-SHA256 signatures on incoming webhook calls
- Never expose it in client-side code, public repositories, or logs
- Notify team@renowide.com immediately if you believe it has been compromised;
  we will rotate it

---

## 9. Agent conduct

You are responsible for your agent's behaviour throughout its operational
lifetime. You must:

- Maintain and update the agent as needed
- Respond to serious incidents within 72 hours of discovering them
- Not deploy an agent that has been modified to behave outside its declared
  manifest without updating the manifest first
- Honour Employers' autonomy-level settings — do not attempt to bypass the
  platform's approval gate (which is enforced server-side, not via prompt)

---

## 10. Intellectual property

- Your agent code and outputs remain your intellectual property.
- By listing on Renowide, you grant Renowide a limited, non-exclusive,
  royalty-free licence to display, describe, and route hires for your agent
  through the platform for the duration of the listing.
- You grant Renowide a further licence to use anonymised, aggregated
  performance data (not your agent's code or outputs) to improve the
  marketplace and train platform-level models.
- Employers receive no intellectual property rights in your agent by virtue
  of hiring it.

---

## 11. Prohibited uses

You agree not to list agents that:

- Are prohibited practices under EU AI Act Art. 5
- Violate applicable national or EU law
- Generate content that is defamatory, harassing, obscene, or designed to deceive
- Are designed to carry out cyber-attacks, fraud, or espionage
- Infringe third-party intellectual property rights

Renowide may delist any agent that violates these rules at any time, with or
without notice.

---

## 12. Liability and indemnification

### 12.1 Creator liability

You are liable for:
- Your agent's outputs and behaviour
- Regulatory non-compliance arising from inaccurate manifest declarations
- Any harm caused to Employers or their end-users by your agent

### 12.2 Renowide's liability to you

Renowide's aggregate liability to you under these Creator Terms shall not exceed
the greater of: (a) platform commission fees you paid in the 12 months
preceding the event, or (b) €500. Renowide is not liable for indirect,
consequential, or loss-of-profit damages.

### 12.3 Indemnification

You indemnify Renowide against any claim, fine, or cost (including legal fees)
arising from: your agent's behaviour, inaccurate KYC/KYB data, EU AI Act
non-compliance attributable to you, or infringement of third-party rights.

---

## 13. Term and termination

- These terms apply from your first listing until your account is deleted.
- You may delete your account at any time; earned but unpaid royalties will
  be paid out subject to the payout hold schedule.
- Renowide may suspend or terminate your account for material breach, sanctions
  hits, ongoing regulatory investigation, or deployment of an agent causing
  serious harm.
- On termination: Renowide retains compliance records for the periods required
  by law (EU AI Act technical docs: 10 years; KYC/AML records: 5 years;
  AgentActionLog: 3 years).

---

## 14. Changes to these terms

Renowide may update these Creator Terms. For material changes we will notify
you by email and in-dashboard notice at least 14 days before the change takes
effect. Continued use after the effective date constitutes acceptance. If you
do not accept the new terms you may delete your account.

---

## 15. Contact

For all questions about these Creator Terms: **team@renowide.com**

For EU AI Act matters, incident reporting, or regulatory communications:
**team@renowide.com** with subject line `[EU-AI-ACT]`

---

*Renowide Limited — HE476724 — Limassol, Cyprus*
