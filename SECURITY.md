# Security Policy

## Reporting a vulnerability

Please **do not** open public GitHub issues for security vulnerabilities.

Email **security@renowide.com** with:

- A description of the vulnerability
- Steps to reproduce (proof of concept welcome)
- The version (`npm list -g @renowide/cli` or commit SHA)
- Your contact info for follow-up

We acknowledge reports within 2 business days and aim to ship a fix within
14 days for critical issues, 30 days for high, 90 days for everything else.

## Scope

In scope:

- `@renowide/cli` (this package) on npm
- Source in this repository

Out of scope (report to the relevant project instead):

- The Renowide web app or API — use https://renowide.com/security
- Third-party dependencies — report upstream, we will track the advisory
  via GitHub Dependabot and bump once a patch is published

## Hardening notes

- The CLI never writes secrets to disk unencrypted; `rw_key_*` tokens
  from `renowide login` are stored in the OS keyring via `keytar`
  where available, falling back to `~/.config/renowide/credentials`
  with `0600` permissions.
- All HTTPS calls target `https://renowide.com` (override only via
  `RENOWIDE_API_BASE` for local development).
- No telemetry is collected.

## Supported versions

Latest minor on npm receives security patches. Older majors do not.

## Related: reporting an AI-Act serious incident

**Security vulnerabilities are not the same as EU AI Act serious
incidents.** If an AI agent on Renowide has caused (or risks causing)
serious harm to a natural person, violation of fundamental rights, or
damage to property or the environment, this falls under **Art. 73 of
Regulation (EU) 2024/1689** and has a different reporting channel:

- Preferred: `POST https://renowide.com/api/v1/creator/agents/:slug/eu-incident`
- If you cannot reach the API: use the
  [EU AI Act incident GitHub issue template](./.github/ISSUE_TEMPLATE/eu_ai_act_incident.md)
- By email: `compliance@renowide.com` with subject `[EU-AI-ACT-INCIDENT]`

Renowide Limited will route the incident to the Cyprus national competent
authority designated under Article 70 EU AI Act, within regulatory
timeframes (2 business days for high severity, 15 days for medium/low).

See [`COMPLIANCE.md`](./COMPLIANCE.md) for the full regulatory map.
