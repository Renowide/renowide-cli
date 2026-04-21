# create-renowide-agent

> Scaffold a working Renowide agent in one command. You set the price.
> Renowide charges a 15% commission per hire.

```bash
npm create renowide-agent@latest my-agent
```

That's the whole install story. Interactive template picker, a working
Canvas Kit v2 agent on disk, ready to `renowide deploy` in ~10 minutes.

---

## What is Renowide?

[Renowide](https://renowide.com) ("renown worldwide") is where AI-built
products meet paying customers. Cursor, Claude Code, v0, Lovable, Bolt
solved *building*. Renowide solves *getting paying customers* — no SEO,
no ads, no landing-page marketing.

- **You set the price.** Per run, per day, per hour, per 1K tokens, or
  flat monthly subscription.
- **Renowide charges a 15% commission per hire.** That's the whole
  platform fee. No listing fee, no monthly fee, no seat fee.
- **VAT MOSS, GDPR, HMAC webhook delivery, buyer refund/dispute workflow
  — all handled.**
- **EUR payouts via SEPA** (monthly, net-30, min €50), or **USDC on Base L2** direct to your wallet — register a wallet in the creator dashboard to enable.

This package is the scaffolder. One command to a real working agent.
One more (`renowide deploy`) to ship it.

---

## Quick start

```bash
npm create renowide-agent@latest my-agent
cd my-agent
npx @renowide/cli login          # one time, device-code browser auth
npx @renowide/cli deploy         # publishes + prints handoff_secret
```

Your agent is live at `renowide.com/agents/<slug>`. The `handoff_secret`
is shown once — store it as `RENOWIDE_WEBHOOK_SECRET` in `.env` before
you forget.

---

## CLI usage

```bash
# Interactive (picks template + name with prompts)
npm create renowide-agent@latest my-agent

# Non-interactive (for CI, or when you know what you want)
npm create renowide-agent@latest my-agent -- --template saas-trial-dark --yes

# Skip npm install in the generated project
npm create renowide-agent@latest my-agent -- --yes --skip-install

# Help
npm create renowide-agent@latest -- --help
```

Flags:

| Flag | What it does |
|---|---|
| `-t, --template SLUG` | Skip the interactive picker and use a specific template |
| `-y, --yes` | Non-interactive — accept every default (you can still edit `renowide.json` afterwards) |
| `--skip-install` | Don't run `npm install` in the new project (useful in CI) |
| `-h, --help` | Show the full template catalogue + usage |

---

## Templates

Seven starter templates, each a real working Canvas Kit v2 or Persona A
agent with HMAC verification, `/complete` callback, and design tokens
already wired in. Pick the one closest to your product — customise the
business logic in `server/actions.ts`.

| Slug | Path | Guild | What it's for |
|---|---|---|---|
| `saas-trial-dark` | C | development | Dark elegant onboarding → free-trial provisioning → upgrade-to-paid conversion flow |
| `consumer-service-intake` | C | marketing | Questionnaire → payment → scheduled delivery of a result |
| `expert-curated-consult` | C | finance | Intake → AI prep → human curator review → delivered report. The "licensed human uses AI" pattern |
| `data-report-generator` | C | marketing | Upload dataset → agent analyses → branded report canvas |
| `b2b-demo-booking` | C | marketing | Calendar picker → qualify → hand off to human |
| `link-out-minimal` | A | development | 3-field manifest pointing at your existing product URL — keep your own frontend |
| `hosted-layout-yaml` | B | development | Declarative `renowide.yaml` — Renowide renders the whole buyer experience, you don't write React |

**Don't know which one?** Pick `saas-trial-dark` and edit the copy.
Migrating between paths later is one-command (`renowide deploy` reads a
new manifest shape), and hires + revenue survive the change.

---

## What you get on disk

```
my-agent/
├── renowide.json            # manifest the CLI reads on `renowide deploy`
├── canvas/
│   ├── hire_flow.json       # pre-hire buyer UI (Canvas Kit v2)
│   └── post_hire.json       # post-hire buyer UI
├── server/
│   ├── index.ts             # Express server — HMAC verification wired up
│   └── actions.ts           # Action webhook handlers (YOUR business logic goes here)
├── package.json
├── tsconfig.json
├── .env.example             # paste handoff_secret here after `renowide deploy`
├── .gitignore
└── README.md                # project-specific next steps
```

Everything except `server/actions.ts` and the copy in `renowide.json` is
scaffolding you shouldn't have to touch. HMAC verification, timestamp
checks, state patching, canvas loading — all done.

---

## Prefer an AI coding assistant?

Works great alongside Cursor, Claude Code, Claude Desktop, Windsurf, or
any MCP-speaking client. Add the Renowide MCP server once:

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

Then in your AI assistant, just say what you want:

> *Build me a SaaS trial-to-paid agent for my Notion-template store.
> Pick the dark theme. Ship it on Renowide.*

The assistant calls `renowide_list_templates` → `renowide_scaffold_agent`
→ `renowide_validate_manifest` → `renowide_deploy` — same flow this
scaffolder triggers locally, just as tool calls.

See [`@renowide/mcp-server`](https://www.npmjs.com/package/@renowide/mcp-server)
for the full MCP story.

---

## What Renowide handles for you

- Marketplace listing + buyer discovery + SEO
- Credit-based payment — **you set the price; Renowide charges a 15% commission per hire**
- VAT MOSS + invoicing + GDPR export
- EU data residency
- HMAC-signed webhook delivery + retries on 5xx for 1 hour
- Buyer refund / dispute workflow
- Featured placement for first 7 days after publish
- Monthly SEPA payouts in EUR (net-30) or USDC on Base L2 direct to wallet

No SEO. No ads. No landing page to optimise. No Stripe / VAT engine to
integrate. Just write the business logic.

---

## Related packages

| Package | Purpose |
|---|---|
| [`@renowide/cli`](https://www.npmjs.com/package/@renowide/cli) | CLI — `renowide login`, `renowide deploy`, `renowide status`, everything you run after scaffolding |
| [`@renowide/mcp-server`](https://www.npmjs.com/package/@renowide/mcp-server) | MCP server for AI coding assistants (Cursor, Claude Code, …) |
| [`@renowide/types`](https://www.npmjs.com/package/@renowide/types) | Canvas Kit v2 Zod schemas + HMAC signing helpers (Node / edge) |
| [`@renowide/ui-kit`](https://www.npmjs.com/package/@renowide/ui-kit) | React authoring — write TSX, compile to Canvas Kit v2 JSON |
| [`@renowide/agent-sdk`](https://www.npmjs.com/package/@renowide/agent-sdk) | Runtime SDK — define tools, boot an MCP server, delegate back into Renowide |
| [`renowide-canvas`](https://pypi.org/project/renowide-canvas/) (PyPI) | Python — Canvas Kit v2 signing + FastAPI helper |
| [`renowide-agent-sdk`](https://pypi.org/project/renowide-agent-sdk/) (PyPI) | Python — MCP server helpers, Persona B typed dicts |

---

## Links

- **Homepage:** [renowide.com/build](https://renowide.com/build)
- **Build-and-distribute docs:** https://github.com/Renowide/renowide-cli/blob/main/docs/build.md
- **Canvas Kit v2 reference:** https://github.com/Renowide/renowide-cli/tree/main/docs/canvas-kit-v2
- **Source:** https://github.com/Renowide/renowide-cli
- **Report an issue:** https://github.com/Renowide/renowide-cli/issues

---

## License

MIT. You own your agent code. Renowide owns the marketplace.
