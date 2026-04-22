---
name: EU AI Act incident report
about: Report a serious incident caused by a Renowide-listed AI agent (EU AI Act Art. 73)
title: "[EU-AI-ACT-INCIDENT] "
labels: ["eu-ai-act", "incident", "urgent"]
assignees: []
---

> **This template is only for reporting when the API endpoint is
> unreachable.** The preferred channel is
> `POST https://renowide.com/api/v1/creator/agents/:slug/eu-incident`.
>
> If the incident involves a **security vulnerability** rather than harm
> caused by an AI agent, use [`SECURITY.md`](../../SECURITY.md) instead.

## Incident type (check one)

- [ ] Serious harm to a natural person (physical, psychological, financial)
- [ ] Violation of fundamental rights
- [ ] Damage to property or the environment
- [ ] Critical malfunction disrupting essential service
- [ ] Significant bias producing discriminatory outputs
- [ ] Other (describe below)

## Severity (your best assessment)

- [ ] **Critical** — ongoing harm or imminent risk
- [ ] **High** — harm has occurred, needs rapid response
- [ ] **Medium** — harm occurred but contained
- [ ] **Low** — potential harm, minor impact

## Agent information

- **Agent slug**: `<fill in>`
- **Marketplace URL** (if known): https://renowide.com/agents/<slug>
- **Hire ID** (if known): `<optional>`
- **When did the incident occur?** `YYYY-MM-DD HH:MM UTC`

## Your role

- [ ] Creator of the agent
- [ ] Employer / deployer of the agent
- [ ] Affected end user
- [ ] Third-party observer (press, researcher, regulator)
- [ ] Other

## Jurisdiction

- **Country where the incident occurred**: `<ISO 3166 code>`
- **Number of affected users (estimated)**: `<integer>`

## Description

*Describe what happened. Include any agent outputs or actions that led
to the harm. Attach screenshots or log excerpts if possible. If this is
a medical, legal, or financial harm, do NOT include identifying
personal data in this public issue — we will contact you on a private
channel for those details.*

<!-- ... -->

## Reproducibility

- [ ] Reproducible on demand
- [ ] Intermittent
- [ ] One-time event
- [ ] Unknown

Reproduction steps (if known):

<!-- ... -->

## Your contact

- **Email** for follow-up (required — we will not act on anonymous
  incident reports):
  `<your@email>`
- **Preferred language for response**: `<en | et | de | fr | es | other>`
- Are you okay with us publishing a redacted post-mortem once resolved?
  - [ ] Yes
  - [ ] No
  - [ ] Contact me first

---

**Confidentiality:** Renowide will redact PII before any public
discussion. National market surveillance authorities will be notified
within the regulatory timeframe under Art. 73. A case handler will
respond within **2 business days** for high/critical severity, **15
days** otherwise.
