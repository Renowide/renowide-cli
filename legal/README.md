# Renowide — Legal documents

This folder contains the binding legal texts that govern how Renowide
operates as a platform and as an authorised representative.

| Document | Applies to | Current version |
|---|---|---|
| [`art22_representative_agreement.md`](./art22_representative_agreement.md) | Creators listing high-risk AI systems under Renowide's Art. 22 EU AI Act representation | `v2026-04-22-draft` |

## Document status conventions

- **`-draft`** suffix on a version string means the document is **not yet
  finalised by EU legal counsel**. Acceptance is recorded for audit
  purposes but the final text may change with 30 days' notice.
- **Non-`-draft`** version strings (e.g. `v1.0`) mean the document has
  been reviewed and counter-signed by Renowide OÜ's legal counsel and
  is the binding text.
- Version changes are announced in the root [`CHANGELOG.md`](../CHANGELOG.md)
  with the `compliance:` prefix.

## How acceptance is recorded

- Electronic acceptance via the Renowide creator dashboard or CLI
  (`renowide compliance accept-mandate`) is equivalent to signature in
  writing under EU eIDAS Regulation 910/2014 Art. 25.
- Acceptance is stored in `art22_mandates` with: terms version hash,
  IP address, user-agent, timestamp, signatory name and role, and the
  list of agent slugs covered.
- A new acceptance supersedes any previous active mandate from the same
  creator; the superseded row is preserved in the audit log.

## Regulatory references

The agreement implements obligations under:

- **EU AI Act** (Regulation (EU) 2024/1689) — Articles 3, 9, 10, 11, 12,
  13, 14, 15, 22, 43, 47, 49, 50, 71, 72, 73, 74, and Annexes IV, VIII.
- **GDPR** (Regulation (EU) 2016/679).
- Applicable Estonian company and contract law.

## Contact

- Legal questions: `legal@renowide.com`
- Compliance questions: `compliance@renowide.com`
- Incident reporting: [`POST /api/v1/creator/agents/:slug/eu-incident`](../docs/test-hire.md)

---

*See [`../COMPLIANCE.md`](../COMPLIANCE.md) for the full regulatory
compliance summary.*
