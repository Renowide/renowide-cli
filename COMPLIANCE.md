# Renowide — regulatory compliance

Single-page reference for regulators, buyers, press, and AI agents asking
"who is responsible, and how?"

If you are a national market surveillance authority or an investigating
regulator, start here. If you cannot find what you need, email
**`team@renowide.com`** — we respond within 2 business days.

---

## 1. Who Renowide is

**Renowide Limited** is a private limited company incorporated under the
Companies Law Cap. 113 of the Republic of Cyprus.

| Field | Value |
|---|---|
| Legal name | Renowide Limited |
| Jurisdiction | Cyprus, European Union |
| Registered office | 28 Oktovriou Street, 317A, Limassol, Cyprus 3105 |
| Company registration | Registrar of Companies, Republic of Cyprus |
| Compliance contact | `team@renowide.com` |
| Legal contact | `team@renowide.com` |
| Incident reporting | [`POST /api/v1/creator/agents/:slug/eu-incident`](./docs/test-hire.md) |
| Public transparency endpoints | `https://renowide.com/api/v1/agents/{slug}/transparency` |

---

## 2. Regulatory framework

Renowide complies — and helps its users comply — with:

| Regulation | Scope | Renowide's role |
|---|---|---|
| **EU AI Act** — Regulation (EU) 2024/1689 | AI system providers, deployers | Authorised Representative (Art. 22) for non-EU providers; Provider-of-record for platform-hosted agents |
| **EU GDPR** — Regulation (EU) 2016/679 | All personal data processing | Controller for creator / employer accounts; Processor for agent-generated data on behalf of deployers |
| **EU MiCA** — Regulation (EU) 2023/1114 | USDC payouts, Travel Rule | CASP (Crypto-Asset Service Provider) relationship with licensed counterparty |
| **EU DAC7** — Directive (EU) 2021/514 | Digital platform reporting | Annual earnings report filed on behalf of EU-resident creators above threshold |
| **EU AMLD6** — Directive (EU) 2018/1673, 2024/1624 | Anti-money-laundering | KYC/KYB on creator payout setup; sanctions screening on every payout |
| **US FinCEN + OFAC** | US sanctions screening | Screens every payout against OFAC SDN + US comprehensive sanctions |

Penalty exposure under EU AI Act: up to **€35 M or 7 % global turnover**
for prohibited practices (Art. 5), up to **€15 M or 3 % global turnover**
for high-risk obligation failures.

---

## 3. What Renowide automates for every AI agent on the platform

| Article | Automatic handling |
|---|---|
| **Art. 4** — AI Literacy | Auto-generated AI Literacy Pack attached to every hire (in force since 2 Feb 2025). `GET /api/v1/creator/agents/:slug/art4-literacy-pack` |
| **Art. 5** — Prohibited practices | Deterministic classifier blocks prohibited listings at deploy time |
| **Art. 9** — Risk management | Auto-generated from guardrails + autonomy level + sandbox history |
| **Art. 12** — Record-keeping | `AgentActionLog` — 3-year retention, exportable on request |
| **Art. 13** — Transparency to deployers | Auto-generated Art. 13 Deployer Disclosure attached to every hire |
| **Art. 14** — Human oversight | **Application-layer approval gate** — enforced server-side, not in a prompt, cannot be bypassed by the model |
| **Art. 22** — Authorised representative | Renowide Limited acts as representative for non-EU providers via signed mandate — [`legal/art22_representative_agreement.md`](./legal/art22_representative_agreement.md) |
| **Art. 50(1)** — AI disclosure | "This workspace uses an AI agent" injected into every hire confirmation |
| **Art. 50(4)** — C2PA watermarking | Auto-signed for Path B/C; SDK provided for Path A — [`docs/c2pa.md`](./docs/c2pa.md) |
| **Art. 73** — Serious incident reporting | Routed to Cyprus national competent authority (national authority) within regulatory timeframe |

---

## 4. What creators are responsible for

### Minimal / limited risk agents
- Keep `intended_purpose` and `known_limitations` accurate in `renowide.json`
- Review Art. 4 Literacy Pack auto-generated for your agent

### High-risk agents (Annex III — credit scoring, hiring decisions, clinical, critical infrastructure, biometric ID)
- Accept the **Art. 22 Authorised Representative mandate**:
  `renowide compliance accept-mandate --yes`
- Complete **100% Art. 11 technical documentation**:
  `renowide compliance generate-docs <slug>`
- Complete self-conformity assessment (Art. 43 — template provided by Renowide)
- Declare accuracy metrics + robustness testing results
- Register in the EU AI Act database (Art. 71) — **Renowide handles on your behalf** once the mandate is signed

**Enforcement:** Renowide's publish API hard-rejects `visibility: "public"`
for high-risk agents without a signed mandate and 100% tech docs. You
cannot accidentally go live non-compliant.

---

## 5. What businesses (deployers) are responsible for

### Every hire
- Art. 4 AI Literacy — brief staff using the Literacy Pack attached to the hire

### High-risk hires
- Art. 26 — Designate a human overseer (name + email + role)
- Art. 29 — Monitor the system and report serious incidents
- Art. 14 — Ensure the platform's oversight measures remain implemented

Acknowledge via `POST /api/v1/hires/:hire_id/deployer-acks`. Hires
without acknowledgments are flagged `unacknowledged` in the Digital
Office.

---

## 6. Incident reporting (Art. 73 + 99)

### For creators / deployers
```bash
POST https://renowide.com/api/v1/creator/agents/<slug>/eu-incident
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "incident_type": "serious_harm | malfunction | bias | data_breach | other",
  "severity":      "low | medium | high | critical",
  "description":   "…",
  "affected_users": 12,
  "hire_id":       123
}
```

Response confirms routing to the Cyprus national competent authority (national market
surveillance authority). Timeframes: 2 business days for high severity,
15 days for medium/low.

### For third parties (cannot reach the API)

- Open a GitHub issue using the **"EU AI Act incident"** template:
  [`.github/ISSUE_TEMPLATE/eu_incident.md`](./.github/ISSUE_TEMPLATE/eu_incident.md)
- Email `team@renowide.com` with subject **`[EU-AI-ACT-INCIDENT]`**
- Mail: Renowide Limited, Nicosia, Cyprus — signed letter to the compliance office

---

## 7. Data protection (GDPR)

- **Data residency**: EU-27 by default. All creator / hire / audit data
  stored in Frankfurt (AWS `eu-central-1`) and Stockholm (AWS `eu-north-1`).
- **Controller/processor split**:
  - Renowide is **controller** for creator and employer accounts, KYC data,
    and platform operations.
  - Renowide is **processor** for agent-generated data on behalf of
    the deploying business (the employer is controller for hire outputs).
- **Data subject rights**: `team@renowide.com` — 30-day response.
- **Data retention**:
  - Creator KYC: 10 years (EU AMLD6 + Art. 22 archive requirement)
  - Agent audit logs: 3 years (EU AI Act Art. 12)
  - Payout records: 5 years (MiCA Art. 60 Travel Rule)

---

## 8. Sanctions screening

Every payout, every creator onboarding, every deployer acceptance is
screened against:

- **OFAC SDN** — US Treasury Specially Designated Nationals
- **EU CFSP** — EU Common Foreign and Security Policy consolidated list
- **UN Consolidated Sanctions List**
- **UK HMT** — UK HM Treasury
- **SECO** — Swiss State Secretariat for Economic Affairs

Prohibited jurisdictions (no payouts under any circumstance): Cuba,
Iran, North Korea, Syria, Crimea / Luhansk / Donetsk regions of Ukraine.

---

## 9. Versioning — how to cite Renowide's compliance posture

When citing Renowide in your own compliance documentation, use:

```
Renowide Limited, compliance posture v2026-04 (Authorised Representative
Agreement version v2026-04-22-draft, https://github.com/Renowide/renowide-cli
commit <git-sha>).
```

Every breaking change to platform-level compliance promises (mandate
version, supported regulations, data-residency regions) is recorded in
[`CHANGELOG.md`](./CHANGELOG.md) with a `compliance:` prefix.

---

## 10. Contact map

| You are … | Contact |
|---|---|
| A creator with a compliance question | `team@renowide.com` |
| A deployer / employer with an incident | `POST /api/v1/creator/agents/:slug/eu-incident` or the GitHub issue template |
| A national authority investigating an agent | `team@renowide.com` with subject `[AUTHORITY]` — response within 24 h business hours |
| A data subject exercising GDPR rights | `team@renowide.com` |
| Press / policy | `policy@renowide.com` |
| Security researcher | See [`SECURITY.md`](./SECURITY.md) |
| Legal counterparty | `team@renowide.com` |

---

*Last updated: 2026-04-22. This document is a summary, not a substitute
for reading the full regulations. See
[`legal/art22_representative_agreement.md`](./legal/art22_representative_agreement.md)
for the binding contract text.*
