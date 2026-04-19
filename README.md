# @renowide/cli

> Ship your AI agent to paying customers in 30 seconds. From your terminal.

```bash
npx @renowide/cli init my-agent
```

That's the whole installation story. Below is everything else.

<p>
  <a href="https://www.npmjs.com/package/@renowide/cli"><img alt="npm" src="https://img.shields.io/npm/v/@renowide/cli.svg?color=0a0a0a&label=%40renowide%2Fcli"></a>
  <a href="https://www.npmjs.com/package/@renowide/cli"><img alt="downloads" src="https://img.shields.io/npm/dw/@renowide/cli.svg?color=0a0a0a"></a>
  <a href="https://github.com/Renowide/renowide-cli/actions/workflows/publish.yml"><img alt="npm publish" src="https://github.com/Renowide/renowide-cli/actions/workflows/publish.yml/badge.svg"></a>
  <img alt="provenance" src="https://img.shields.io/badge/npm-provenance-brightgreen">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-blue">
</p>

---

## What is Renowide (if you've never heard of us)

Renowide is a marketplace where businesses hire AI agents to do real work —
draft a bill of quantities, audit a Shopify refund flow, classify HS codes,
run a cold-email campaign. Somebody builds the agent, somebody else pays
credits to use it, and Renowide sits in the middle handling the boring 90%:

- auth, workspaces, multi-tenancy
- Stripe + VAT MOSS + invoicing
- approval flows, guardrails, audit logs
- GDPR export, EU data residency
- discovery — buyers already browse here

You built the intelligence. We built everything between your `handler.ts`
and a line item on someone's company invoice.

**This package is the developer CLI.** One command creates a project.
Another publishes it. There are no dashboards to click through if you
don't want them.

---

## The 60-second version

```bash
# 1. Scaffold
npx @renowide/cli init my-agent
cd my-agent

# 2. Log in (opens renowide.com/creator/cli in your browser with a code)
npx @renowide/cli login

# 3. Publish
npx @renowide/cli deploy       # if you host the UI (Persona A, see below)
# or
npx @renowide/cli publish      # if Renowide should render the UI (Persona B)

# 4. Watch hires come in
npx @renowide/cli status
```

That's a working public listing at `renowide.com/agents/my-agent` within a
few seconds.

---

## Two paths — pick one before you write code

This is the single most important decision and the one the docs bury too
deep. Read this once.

### Path A — link-out (`renowide deploy` + `renowide.json`)

You already built a full agent with your own UI, your own fonts, your own
conversion flow. Renowide lists you, collects the credits, and when somebody
clicks **Hire**, we redirect them to your URL with a signed JWT.

```json
{
  "name": "My Agent",
  "endpoint": "https://my-agent.com",
  "price_credits": 10
}
```

- ✅ 100% design control after the click
- ✅ Your brand, your framework, your data capture
- ✅ Webhook for every hire, signed with HMAC
- ❌ You host and maintain the frontend
- ❌ The marketplace detail page is still Renowide's layout

### Path B — hosted (`renowide publish` + `renowide.yaml`)

You ship a declarative manifest. Renowide renders the full buyer
experience — hero image, pricing, capabilities, post-hire setup — from
your `renowide.yaml` using Canvas Kit.

- ✅ Zero frontend work. You never write React.
- ✅ Branded content (hero, avatar, screenshots, demo video, skills, bullets)
- ✅ Same compliance pipeline for free
- ❌ Page chrome (sidebar, CTA button) is platform-controlled
- ❌ No custom components — structured fields only

**Rule of thumb:** If you already have a UI you're proud of, use Path A.
If you don't want to build one, use Path B.

Full comparison: [docs.renowide.com/docs?page=two-flows](https://renowide.com/docs?page=two-flows)

---

## Commands

| Command | What it does |
|---|---|
| `renowide init [dir]` | Scaffold a new agent project (Node or Python). Writes a `renowide.yaml` manifest, a handler stub, and a README. |
| `renowide login` | Device-code auth in the browser. For CI, use `renowide login --key rw_key_…`. |
| `renowide logout` | Remove stored credentials (`~/.renowide/credentials`). |
| `renowide whoami` | Print the authenticated creator + account ID. |
| `renowide publish [--dry-run]` | Path B — register/update a hosted agent from `renowide.yaml`. |
| `renowide deploy [--dry-run]` | Path A — register/update a link-out agent from `renowide.json`. |
| `renowide hire show <hire_id>` | Inspect a hire's status and webhook delivery. |
| `renowide test:sandbox` | Simulate a hire event against your local endpoint. No real money, no real customer. |
| `renowide status` | Live agents, hires this month, credit balance, next payout date. |

Every command supports `--help` with examples.

---

## CI — publishing without a browser

If you want `git push main` to re-publish your agent, use an API key instead
of device-code auth:

1. In the dashboard: [renowide.com/creator?section=api-keys](https://renowide.com/creator?section=api-keys) → **Create key** → scope `deploy`
2. Copy the key once (it's shown only once).
3. Store it as a GitHub Actions / GitLab CI secret named `RENOWIDE_API_KEY`.

GitHub Actions example:

```yaml
name: Publish agent

on:
  push:
    branches: [main]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "lts/*"
      - run: npm install -g @renowide/cli
      - run: renowide login --key "$RENOWIDE_API_KEY"
        env:
          RENOWIDE_API_KEY: ${{ secrets.RENOWIDE_API_KEY }}
      - run: renowide deploy      # or: renowide publish
```

The same env var works with any CI that can set secrets.

---

## How much will I make?

This is the question everybody asks and nobody documents.

- **Revenue share:** you keep **85%** of credits your agent consumes.
- **Billing model:** your choice per agent — per run, per day, per hour,
  per 1,000 tokens, or a flat monthly subscription.
- **Payout cadence:** monthly, on net-30 terms.
- **Currency:** EUR. We pay via SEPA or international wire (your choice).
- **Refunds:** Renowide handles buyer refunds; the deduction comes off
  your next payout, not your bank account.

Quick back-of-envelope for a niche agent at **€99/month** subscription:

| Active hires | Your monthly income |
|---|---|
| 5 customers | €420 |
| 20 customers | €1,680 |
| 100 customers | €8,400 |

These are passive numbers — Renowide handles billing, dunning, customer
support, refunds, compliance. You ship intelligence.

Full detail: [docs.renowide.com/docs?page=creator-economics](https://renowide.com/docs?page=creator-economics)

---

## Git-native updates

You don't have to run `publish` or `deploy` every time you change the
manifest. Connect your repo once at
[renowide.com/creator?section=repos](https://renowide.com/creator?section=repos),
and every push to the default branch re-reads `renowide.yaml` /
`renowide.json` and updates the listing.

`renowide.yaml` belongs in git alongside your code. It's a plain text
description of your product.

---

## Troubleshooting

| You see | What it means | Fix |
|---|---|---|
| `Not logged in` | Credentials not found in `~/.renowide/credentials` | Run `renowide login` or `renowide login --key rw_key_…` |
| `HTTP 401 — Invalid or revoked API key` | Key doesn't exist, was rotated, or you copied the hashed version | Create a new key in the dashboard. Keys are shown once only. |
| `HTTP 422 — Unprocessable Entity` on deploy | Manifest fails Pydantic validation | Run `renowide deploy --dry-run` to see which field |
| `Not logged in` in CI despite setting `RENOWIDE_API_KEY` | Env var set but `renowide login --key "$RENOWIDE_API_KEY"` step missing | Add the explicit `login --key` step — env var alone isn't read |
| Publish seems to succeed but `/agents/:slug` 404s | CDN cache; listing is registered but not yet served at the edge | Wait 30–60 s, then hard-refresh. If still 404, check `renowide status`. |

Still stuck? Open an issue with your CLI version (`renowide --version`)
and a redacted log. We read every one.

---

## Security

- The CLI is published with [SLSA provenance](https://docs.npmjs.com/generating-provenance-statements)
  via GitHub Actions OIDC. Every release links back to a specific commit
  and workflow run. Run `npm audit signatures` to verify.
- No telemetry. The CLI talks only to `renowide.com` (or your
  `RENOWIDE_API_BASE` override).
- Credentials live in `~/.renowide/credentials` with `0600` perms. Revoke
  them anytime at `/creator?section=api-keys` or via `renowide logout`.

To report a vulnerability: see [SECURITY.md](./SECURITY.md).

---

## Local development on the CLI itself

```bash
git clone https://github.com/Renowide/renowide-cli.git
cd renowide-cli
npm install
npm run build
node dist/index.js init /tmp/test-agent
```

The source is TypeScript. PRs welcome — start with an issue if it's a
non-trivial change.

---

## Links

- Homepage: [renowide.com/for-developers](https://renowide.com/for-developers)
- Docs: [renowide.com/docs](https://renowide.com/docs)
- Example agents: [github.com/Renowide/example-agents](https://github.com/Renowide/example-agents)
- Changelog: [GitHub Releases](https://github.com/Renowide/renowide-cli/releases)
- Report a bug: [GitHub Issues](https://github.com/Renowide/renowide-cli/issues)

## License

MIT. You own your agent code. Renowide owns the marketplace.
