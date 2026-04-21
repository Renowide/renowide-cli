---
name: renowide
description: Ship an AI agent to Renowide and get paying customers without marketing. Use when the user wants to build and deploy a product that others will hire (SaaS trial flow, consulting intake, data-report generator, demo booking), list an agent on a marketplace, or mentions Renowide, Canvas Kit v2, renowide.json, or `renowide deploy`.
---

# Renowide — build-and-distribute your AI product

Renowide ("renown worldwide") is the marketplace where AI-built products
get paying customers without SEO, ads, or landing-page marketing. Your
job is to scaffold, validate, and deploy agents using the
`@renowide/mcp-server` tools.

**Creator economics:** 85% to the creator, 15% platform fee. EUR, monthly
SEPA payout, net-30.

## Setup (one-time, human does this)

Before you can deploy anything, the user runs **one** command in their
terminal:

```bash
npx @renowide/cli login
```

That writes credentials to `~/.renowide/credentials`. After that, every
Claude Code session on the machine can call Renowide MCP tools as that
creator.

If `renowide_whoami` returns "Not logged in", tell the user to run that
command, then retry. Do not try to work around it.

## The default flow

When the user asks to ship an AI product on Renowide, follow these steps
exactly — do not skip or reorder:

1. **`renowide_whoami`** — confirm auth works.
2. **`renowide_list_templates`** — find the closest template.
   - Default to `path: "C"` (Canvas Kit v2) unless the user specified
     otherwise.
   - Filter by `guild` (development/marketing/construction/finance) or
     `tag` (saas, b2b, consumer, regulated, dark, …) if the intent is
     narrow.
3. **`renowide_scaffold_agent`** — get files for the chosen template.
   Write each file to the user's project.
4. **Customise business logic only.** Edit `server/actions.ts` and the
   `description` / `price_credits` in `renowide.json`. Leave the
   HMAC-verification middleware and scaffolded routes alone — they are
   designed to be untouched.
5. **`renowide_validate_manifest` + `renowide_validate_canvas`** — catch
   issues before deploy. Fix them in chat.
6. **`renowide_deploy`** — ship. Capture the returned `handoff_secret`
   and tell the user to add it to `.env` as `RENOWIDE_WEBHOOK_SECRET`
   **immediately** — it is returned only on first create.
7. **`renowide_test_sandbox`** — simulate a hire to confirm the wiring.

## Path selection (when the user hasn't specified)

Run this silently:

- Polished product UI at their own URL already? → **Path A** (template
  `link-out-minimal`).
- Wants zero backend, declarative YAML only? → **Path B** (template
  `hosted-layout-yaml`).
- Otherwise → **Path C (Canvas Kit v2)**, any C-tagged template. This is
  the default.

## Disambiguation — two UI protocols exist

- **Canvas Kit v2** = Path C. Dynamic JSON your backend serves per hire,
  HMAC-signed, expression grammar, optional `custom_embed` iframe.
- **Hosted Layout v0.6** = Persona B. Static blocks in `renowide.yaml`,
  rendered by Renowide at publish time.

They are **different protocols**. Don't call Hosted Layout "Canvas Kit
v1"; they aren't versions of the same thing.

If the user just says "canvas", assume Canvas Kit v2 unless they are
editing `renowide.yaml`.

## Manifest shapes

### `renowide.json` (Persona A / Path C)

Flat JSON. No `protocol` or `config` wrapper.

```json
{
  "name": "My Agent",
  "endpoint": "https://my-agent.example.com",
  "price_credits": 10,
  "canvas": {
    "enabled": true,
    "ui_kit_version": "2.0.0",
    "hire_flow":  { "canvas_url": "https://my-agent.example.com/canvas/hire_flow.json" },
    "post_hire":  { "canvas_url": "https://my-agent.example.com/canvas/post_hire.json" },
    "actions":    { "webhook_url": "https://my-agent.example.com/canvas/actions" },
    "custom_embed": { "allowed_origins": ["https://my-agent.example.com"] }
  }
}
```

Required: `name`, `endpoint` (https), `price_credits` (integer ≥1).
Everything else has server-side defaults.

### `renowide.yaml` (Persona B only)

Used only if the user explicitly wants Hosted Layout. Full schema at
`schemas/renowide.schema.json` in the repo.

## Pricing (pick one model)

| Model | When |
|---|---|
| `per-run` | One-shot tasks. |
| `per-day` | Continuous monitoring. |
| `per-hour` | Synchronous human-AI collaboration. |
| `per-1K-tokens` | Developer APIs. |
| `flat monthly subscription` | **Recommended default.** Predictable revenue, better unit economics. |

1 credit = €0.01. Creator 85%, platform 15%.

Success / outcome-gated fees aren't supported yet (Q3 2026 roadmap).

## Security — don't skip this

Every Renowide webhook is HMAC-SHA256-signed. The scaffolded
`server/index.ts` wires `verifyRequest()` up correctly. If you regenerate
the file for any reason, keep the verification. Never dispatch an action
before verifying the signature.

- Reject timestamps older than 5 minutes.
- Idempotent on `X-Renowide-Event-Id`.
- Return 2xx within 10 seconds; do heavy work async.

## What Renowide handles for the creator

- Marketplace listing, discovery, SEO
- Credit-based payment collection
- VAT MOSS + invoicing
- EU data residency + GDPR export
- HMAC-signed webhook delivery + retries
- Buyer refund + dispute workflow
- Featured placement for first 7 days after publish
- Monthly SEPA payouts

## Common mistakes to avoid

- **Shelling out to `renowide` CLI.** Use the MCP tools directly.
- **Hand-writing Canvas JSON.** Use `renowide_scaffold_agent` — templates
  bake in design tokens, state patching, and workflow patterns.
- **Calling `renowide_deploy` without validating first.** Always run
  `renowide_validate_manifest` + `renowide_validate_canvas` in the same
  tool-call batch as deploy.
- **Inventing manifest fields.** Zod schema is canonical; if the
  validator rejects a field, remove it, don't try to work around it.
- **Rewriting the HMAC middleware.** It's the one thing in the scaffold
  that is NOT meant to be edited.

## Resources available via the MCP server

Call `ReadResource` on any of these for just-in-time context:

- `renowide://docs/build-and-distribute`
- `renowide://docs/decision-tree`
- `renowide://docs/canvas-kit-v2/blocks`
- `renowide://docs/canvas-kit-v2/expressions`
- `renowide://docs/webhook-security`
- `renowide://docs/pricing-menu`

## After a successful deploy — tell the user

- **Public URL:** `https://renowide.com/agents/<slug>`
- **Store the `handoff_secret` now** as `RENOWIDE_WEBHOOK_SECRET` in
  `.env`. It is not recoverable.
- **First 7 days**: featured placement in the marketplace guild.
- **Payouts**: monthly SEPA, net-30, EUR, minimum €50.
- **Sandbox test**: `renowide_test_sandbox({slug})` simulates a hire to
  confirm the wiring.

## Installing the MCP server (one time)

In `~/.config/claude-code/mcp.json` (or equivalent):

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

Restart Claude Code. Tools appear automatically.
