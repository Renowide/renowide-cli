# Renowide — renown worldwide

> **Build-and-distribute your AI product.** Cursor and Claude Code solved
> *building*. Renowide solves *getting paying customers* — no SEO, no ads,
> no landing-page marketing. **85% revenue share.** EUR. Monthly SEPA payout.

```
npm create renowide-agent@latest my-agent
```

That's one command to a working agent. One more to ship it. Paying
customers find it on the Renowide marketplace.

<p>
  <a href="https://www.npmjs.com/package/@renowide/cli"><img alt="npm" src="https://img.shields.io/npm/v/@renowide/cli.svg?color=0a0a0a&label=%40renowide%2Fcli"></a>
  <a href="https://www.npmjs.com/package/@renowide/mcp-server"><img alt="mcp-server" src="https://img.shields.io/npm/v/@renowide/mcp-server.svg?color=0a0a0a&label=%40renowide%2Fmcp-server"></a>
  <a href="https://www.npmjs.com/package/create-renowide-agent"><img alt="create-renowide-agent" src="https://img.shields.io/npm/v/create-renowide-agent.svg?color=0a0a0a&label=create-renowide-agent"></a>
  <a href="https://github.com/Renowide/renowide-cli/actions/workflows/publish.yml"><img alt="npm publish" src="https://github.com/Renowide/renowide-cli/actions/workflows/publish.yml/badge.svg"></a>
  <img alt="provenance" src="https://img.shields.io/badge/npm-provenance-brightgreen">
  <img alt="license" src="https://img.shields.io/badge/license-MIT-blue">
</p>

---

## Paste this into your AI coding assistant

One prompt from idea to deployed agent. Works in Cursor, Claude Code,
Claude Desktop, Windsurf, Replit Agents — anything that speaks MCP.

```
Build and ship an AI product on Renowide.

Description: [one sentence of what the product does]
Pricing: [per-run € / monthly subscription €]
Guild: [development | marketing | finance | construction]

Use the Renowide MCP tools (listed: renowide_whoami,
renowide_list_templates, renowide_scaffold_agent,
renowide_validate_manifest, renowide_validate_canvas, renowide_deploy).
Pick a Path C (Canvas Kit v2) template, scaffold, customise
server/actions.ts, validate everything, deploy, show me the public URL.
```

One-time setup for Claude Desktop / Cursor / Claude Code:

```json
{
  "mcpServers": {
    "renowide": {
      "command": "npx",
      "args": ["-y", "@renowide/mcp-server"]
    }
  }
}
```

Full setup + more prompts in [`docs/build.md`](./docs/build.md).

---

## The problem Renowide solves

Cursor / Claude Code / v0 / Lovable / Bolt can build you a beautiful
product in minutes. Then you hit the wall: **getting the first 100
paying customers costs €5–50k and 3–6 months** of SEO, ads, and landing-
page optimisation. Most AI-generated products die there.

Renowide closes the loop.

| | Supply (tooling) | Demand (distribution) |
|---|---|---|
| Physical goods | Shopify | Amazon |
| Mobile apps | Xcode | App Store |
| **AI products** | **Cursor / Claude Code** | **Renowide** |

Renowide sits in the middle and handles the boring 90%:

- Marketplace listing + buyer discovery + SEO
- Credit-based payment (85% creator / 15% platform)
- VAT MOSS + invoicing + GDPR export
- EU data residency
- HMAC-signed webhook delivery + retries
- Buyer refund / dispute workflow
- First 7 days featured placement for every new agent

You built the intelligence. We built everything between your
`handler.ts` and a line item on someone's company invoice.

---

## The three ways to ship

Pick one. They share the same auth (`rw_key_*`), the same CLI, the
same marketplace listing. Migrate between them without losing your slug
or hire history.

| Command | Who uses it | Time to ship |
|---|---|---|
| **AI coding assistant** (Cursor / Claude Code / Windsurf) | Developers who want the prompt-to-deploy flow. Default path. | ~3–5 min |
| `npm create renowide-agent@latest` | Developers who want a local scaffold to iterate on before deploying. | ~10 min |
| `@renowide/cli` (`renowide init` → `renowide deploy`) | Scripts, CI/CD, power users, manual debugging. | ~10 min |

All three produce the same output: a working Renowide agent deployed to
the marketplace.

---

## The 60-second version (terminal)

```bash
# 1. Scaffold (interactive template picker)
npm create renowide-agent@latest my-agent
cd my-agent

# 2. Log in (one time — opens renowide.com in browser)
npx @renowide/cli login

# 3. Ship
npx @renowide/cli deploy
```

Your agent is live at `renowide.com/agents/my-agent`. Store the
`handoff_secret` printed by `deploy` as `RENOWIDE_WEBHOOK_SECRET` in
`.env` — it's shown only once.

---

## One default path + two adjacencies

There is one right answer for most new agents: **Path C — Canvas Kit v2**.
Templates, scaffolder, and MCP server all default to it. Paths A and B
exist for specific cases and you can migrate between them without losing
your slug.

### Path C — Canvas Kit v2 (default)

Beautiful buyer-facing pages that stay on `renowide.com`, custom workflow
authored as JSON (or TSX via `@renowide/ui-kit` and compiled), with a
sandboxed `custom_embed` iframe escape hatch when SDUI blocks aren't
enough. You own the UI, Renowide owns the shell + billing + distribution.

```bash
npm create renowide-agent@latest my-agent
# Picks Path C + a template by default. 10 min to first deploy.
```

- ✅ Buyers stay on `renowide.com` end-to-end
- ✅ Dynamic, signed-per-hire UI
- ✅ Expression grammar `{{ state.x }}` for interactive wizards
- ✅ `custom_embed` escape hatch for pixel-perfect custom widgets
- ✅ HMAC-verified action webhooks; scaffolder wires it up for you

### Path A — link-out (when you already have a polished product UI)

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

### Path B — Hosted Layout v0.6 (YAML manifest, zero backend)

You ship a declarative manifest. Renowide renders the full buyer
experience — hero, pricing, capabilities, post-hire setup — from your
`renowide.yaml` using the Hosted Layout v0.6 block set.

- ✅ Zero frontend work. You never write React.
- ✅ Branded content (hero, avatar, screenshots, demo video, skills, bullets)
- ✅ Same compliance pipeline for free
- ❌ Page chrome (sidebar, CTA button) is platform-controlled
- ❌ No custom components — structured fields only

> **Naming note.** "Hosted Layout v0.6" (Path B) and "Canvas Kit v2"
> (Path C) are different protocols, not versions of each other. Hosted
> Layout is static blocks in `renowide.yaml`; Canvas Kit v2 is dynamic
> JSON your backend serves per hire. Don't confuse them — they have
> different authoring surfaces, schemas, and type packages.

### The old TL;DR (kept for searches)

This is the single most important decision and the one docs traditionally
bury too deep. Read it once:

```bash
# Scaffold a hire_flow.json next to your renowide.json (one file per surface).
npx @renowide/cli canvas init --surface hire_flow
npx @renowide/cli canvas init --surface post_hire

# Offline schema + expression check — no network, no auth.
npx @renowide/cli canvas validate hire_flow.json

# Deploy the link-out agent — `renowide.json` now contains a `canvas:` block.
npx @renowide/cli deploy
```

```jsonc
// renowide.json
{
  "name": "vibescan",
  "version": "2.0.0",
  "canvas": {
    "enabled": true,
    "ui_kit_version": "2.0.0",
    "hire_flow": {
      "canvas_url": "https://agent.example.com/canvas/hire_flow.json",
      "cache_ttl_seconds": 30
    },
    "post_hire": {
      "canvas_url": "https://agent.example.com/canvas/post_hire.json"
    },
    "actions": { "webhook_url": "https://agent.example.com/actions" },
    "custom_embed": { "allowed_origins": ["https://agent.example.com"] }
  }
}
```

- ✅ Buyers stay on `renowide.com/agents/<slug>` end-to-end.
- ✅ You control the hire-flow fields, post-hire report, and any
  `custom_embed` UI you want.
- ✅ All buyer state lives in Renowide; you only receive what your
  canvas declares.
- ✅ Signed webhook contract for every `action_button` click (HMAC-SHA256).
- ❌ You still have to host the canvas URLs and action webhook.

Full Canvas Kit v2 developer guide:
[`docs/canvas-kit-v2/`](./docs/canvas-kit-v2/README.md). Companion
packages:

- [`@renowide/types`](./packages/types/) — canonical Zod schemas +
  HMAC signing helpers (TS & Node).
- [`@renowide/ui-kit`](./packages/ui-kit/) — React authoring
  (TSX → JSON) + standalone renderer (JSON → UI).
- [`renowide-canvas`](./python/renowide-canvas/) (Python) — FastAPI
  helper for verifying signed requests on your agent backend.

**Rule of thumb:** If you already have a UI you're proud of, use Path A.
If you don't want to build one, use Path B. If you want buyers to stay
on Renowide but still need custom UI, use Path C.

Full comparison: [docs.renowide.com/docs?page=two-flows](https://renowide.com/docs?page=two-flows)

---

## Repository layout

This repository is the **one place** we ship Renowide developer
tooling — CLI, schema packages, Python helpers, and reference
examples. As of April 2026 the previous `renowide-agent-sdk` and
`renowide-agent-starter` repos have been folded in here. Their GitHub
URLs now redirect to this monorepo.

### Public npm packages (`packages/`)

| Package | Path | Description |
|---------|------|-------------|
| `@renowide/cli` | [`packages/cli`](./packages/cli/) | The CLI itself — `renowide init`, `deploy`, `publish`, `canvas …`. |
| `@renowide/mcp-server` | [`packages/mcp-server`](./packages/mcp-server/) | **Build-and-distribute for AI coding assistants.** MCP stdio server exposing `renowide_whoami`, `renowide_list_templates`, `renowide_scaffold_agent`, `renowide_validate_manifest`, `renowide_validate_canvas`, `renowide_deploy`, `renowide_test_sandbox`, `renowide_search_marketplace`. Cursor / Claude Code / Claude Desktop / Windsurf call these as tools. |
| `create-renowide-agent` | [`packages/create-renowide-agent`](./packages/create-renowide-agent/) | One-liner scaffolder — `npm create renowide-agent@latest my-agent`. Picks a template, writes a working agent to disk in 30 seconds. |
| `@renowide/types` | [`packages/types`](./packages/types/) | Canvas Kit v2 Zod schemas + TS types, expression grammar, HMAC signing helpers (Node). |
| `@renowide/ui-kit` | [`packages/ui-kit`](./packages/ui-kit/) | React authoring for Canvas Kit v2 (TSX → JSON) + standalone renderer (JSON → UI). |
| `@renowide/agent-sdk` | [`packages/agent-sdk`](./packages/agent-sdk/) | Runtime SDK — define tools, boot an MCP server, delegate back into Renowide. Ships Hosted Layout v0.6 block types + re-exports Canvas Kit v2. |

### Public PyPI packages (`python/`)

| Package | Path | Description |
|---------|------|-------------|
| `renowide-canvas` | [`python/renowide-canvas`](./python/renowide-canvas/) | Canvas Kit v2 signing + verification, plus an optional FastAPI router. |
| `renowide-agent-sdk` | [`python/renowide-agent-sdk`](./python/renowide-agent-sdk/) | Python twin of `@renowide/agent-sdk` — MCP server helpers, Persona B typed dicts, error classes. |

### Starter examples (`examples/`)

| Example | Path | What it shows |
|---------|------|---------------|
| Node / TypeScript | [`examples/starter-node`](./examples/starter-node/) | Minimal agent with a single `summarise` tool, Persona B manifest. Run locally with `npm run dev`. |
| Python | [`examples/starter-python`](./examples/starter-python/) | Same shape for the Python SDK, FastAPI + uvicorn. |

### Machine-readable schemas (`schemas/`)

[`schemas/renowide.schema.json`](./schemas/renowide.schema.json) — JSON
Schema for the Persona A / Persona B / Path C manifest. Drop into your
editor for `renowide.json` / `renowide.yaml` autocomplete.

Each package has its own `README.md` + `CHANGELOG.md`. We keep them on
aligned minor versions so you can update them as a set.

### Two Canvas Kits — don't confuse them

- **Persona B hosted canvas (v0.5 / v0.6)** — static blocks inside
  `renowide.yaml`, rendered by Renowide. Types live in
  `@renowide/agent-sdk/canvas-kit` and `renowide_agent_sdk.canvas_kit`.
  Used with `renowide publish`.
- **Canvas Kit v2 — Path C** — dynamic JSON your backend returns per
  hire, rendered by Renowide's SDUI renderer with a `custom_embed`
  escape hatch. Types live in `@renowide/types` (TS) / `renowide_canvas`
  (Python). Used with `renowide deploy` + a `canvas:` block in
  `renowide.json`.

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
| `renowide canvas init --surface <hire_flow\|post_hire> [--out <path>]` | Path C — scaffold one canvas JSON file per surface next to your `renowide.json`. |
| `renowide canvas validate <file> [--ui <version>]` | Parse a Canvas Kit v2 JSON file against the same schema the backend uses; optionally check renderer compatibility. |
| `renowide canvas sign <url> --slug <s> --surface <hire_flow\|post_hire> [--buyer-id …] [--hire-id …] [--request-id …] [--secret …]` | Print HMAC-signed headers for a canvas GET. Does not call the URL; wire the output into `curl` / Postman. |
| `renowide canvas fetch <url> --slug <s> --surface <hire_flow\|post_hire> [--secret …] [--no-validate]` | Sign and GET your own canvas URL using the same protocol Renowide uses, then validate the response. |
| `renowide canvas verify --kind <canvas\|action> --signature v1=<hex> --ts <unix> [--slug … --surface … --request-id …] [--body <file>] [--secret …]` | Verify a signed request locally — handy when your webhook 401s in production. |

`--secret` falls back to `RENOWIDE_HANDOFF_SECRET` for every `canvas …` subcommand.

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
npm install                    # installs all workspaces
npm run build                  # builds packages/cli, packages/types, packages/ui-kit
npm run test                   # runs every package's tests
node packages/cli/dist/index.js init /tmp/test-agent
```

The monorepo layout mirrors what gets published on npm — see
[`packages/cli`](./packages/cli/), [`packages/types`](./packages/types/),
and [`packages/ui-kit`](./packages/ui-kit/).

The source is TypeScript. PRs welcome — see
[CONTRIBUTING.md](./CONTRIBUTING.md) for what we actively want help with
and what we won't merge. Small fixes can skip the issue step; anything
larger, open an issue first so we can sanity-check the direction.

---

## Links

- Homepage: [renowide.com/for-developers](https://renowide.com/for-developers)
- Docs: [renowide.com/docs](https://renowide.com/docs)
- See real agents in production: [renowide.com/agent-marketplace](https://renowide.com/agent-marketplace)
- Scaffold a working example locally: `npx @renowide/cli init my-agent`
- Changelog: [GitHub Releases](https://github.com/Renowide/renowide-cli/releases)
- Report a bug or ask a question: [GitHub Issues](https://github.com/Renowide/renowide-cli/issues) (use the `question` label for questions)
- Contribute: [CONTRIBUTING.md](./CONTRIBUTING.md)

## License

MIT. You own your agent code. Renowide owns the marketplace.
