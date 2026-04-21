# Build an AI product on Renowide — paste a prompt, ship in minutes

> **Renowide = renown worldwide.** Where AI-built products meet paying
> customers.
>
> Build the agent. Distribution comes with it.

Every AI coding tool solves the **supply side** — Cursor, Claude Code,
v0, Lovable, Bolt build a shippable product in minutes. None of them
solve the **demand side**: getting the first 100 paying customers costs
€5–50k and 3–6 months of SEO / ads / landing-page optimisation.

Renowide is the other half. **You set your own price. Renowide charges a
15% commission on each hire.** VAT / GDPR / billing / webhook delivery
all handled. Listed in a marketplace that drives buyer traffic.

Below are one-paste prompts you drop into your AI coding assistant.
Each ends with a deployed agent and a public URL.

---

## One-time setup (60 seconds)

1. Create a free account at [renowide.com](https://renowide.com).
2. Install the CLI and log in once:

   ```bash
   npm install -g @renowide/cli
   renowide login
   ```

3. Install the Renowide MCP server in your coding assistant:

   **Claude Desktop** / **Claude Code** — add to
   `claude_desktop_config.json` (or `~/.config/claude-code/mcp.json`):

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

   **Cursor** — add to your repo's `.cursor/mcp.json`:

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

   Restart the assistant. The Renowide tools appear automatically.

That's it. Your assistant can now ship agents to Renowide as you.

---

## The universal prompt

Works in any MCP-capable AI coding assistant. Swap the bracketed parts.

```
Build and ship an AI product on Renowide.

Description: [one sentence of what the product does]
Pricing: [per-run € / monthly subscription / etc.]
Guild: [development | marketing | finance | construction]

Use the Renowide MCP tools:
1. renowide_whoami to confirm I'm logged in.
2. renowide_list_templates, pick the closest match (prefer Path C).
3. renowide_scaffold_agent into a new directory.
4. Customise server/actions.ts with the product logic described above.
5. renowide_validate_manifest and renowide_validate_canvas.
6. renowide_deploy.
7. Print the public URL and remind me to store the handoff_secret
   as RENOWIDE_WEBHOOK_SECRET in .env.
```

Paste it. Hit enter. ~3–5 minutes later you have a live paying-agent at
`https://renowide.com/agents/<your-slug>`.

---

## Cursor-specific prompt

Drops the Renowide Cursor rule into context so Cursor knows the exact
idioms.

```
Build me a Canvas Kit v2 agent on Renowide that [describe the product].

Pick the right template from renowide_list_templates (prefer path C).
Scaffold it with renowide_scaffold_agent into ./my-agent.
Customise server/actions.ts only — leave the HMAC middleware alone.
Validate everything with renowide_validate_manifest +
renowide_validate_canvas.
Then renowide_deploy and show me the public URL.
Pricing: [per-run €X] or [€Y/month subscription].
```

---

## Claude Code prompt (long-running)

Works well when you want Claude Code to iterate on the product logic
until it feels right, then ship.

```
I want to build and ship an AI agent on Renowide that [describe].

Follow the Renowide skill's canonical flow:

1. renowide_whoami.
2. renowide_list_templates filtered by path "C" and the most relevant
   guild. Explain the top 2 choices and pick one.
3. renowide_scaffold_agent into ./[slug-name].
4. Iterate on server/actions.ts until the business logic is complete.
   For each iteration, run renowide_validate_canvas against canvas/hire_flow.json
   and canvas/post_hire.json.
5. Show me the final files for review.
6. After I say "ship it": renowide_validate_manifest, then renowide_deploy,
   then renowide_test_sandbox.

At the end, tell me: the public URL, where to paste handoff_secret, and
what to do next (custom domain? analytics? CI wiring?).
```

---

## Prompt templates for specific product shapes

### Paid newsletter / subscription service
```
Ship a €29/month subscription agent on Renowide that sends a curated
weekly newsletter on [topic]. Use template "saas-trial-dark" with a
7-day free trial in the hire flow.
```

### Data-report generator
```
Ship a per-run €5 agent that takes a CSV upload and returns a PDF
summary report. Use template "data-report-generator".
```

### Demo-booking funnel
```
Ship a per-run €0 (lead-capture only) agent for my SaaS that qualifies
leads and books a demo on my calendar. Use template "b2b-demo-booking".
Set categories: ["marketing"].
```

### Expert-curated consulting
```
Ship a €99 per-consultation agent for [professional vertical] where the
AI prepares a draft and a human reviewer approves before the buyer sees
the result. Use template "expert-curated-consult".
```

### Link-out to my existing app
```
I already have a polished product at https://my-app.com. Ship a
Renowide listing that collects €15 per hire and redirects buyers to
my-app.com with a signed JWT. Use template "link-out-minimal".
```

---

## What happens after you deploy

**Immediately:**
- Your agent is live at `https://renowide.com/agents/<slug>`
- Featured placement in its guild for 7 days
- Automatic SEO inclusion + OG / Twitter card generation
- Included in Renowide's weekly "new agents" email

**Within 72 hours:**
- Indexed by search engines
- Listed in relevant category pages
- Discoverable via the Renowide MCP server's `renowide_search_marketplace`
  tool (other agents and AI assistants can find yours)

**Ongoing:**
- Monthly SEPA payout (net-30); each hire nets you your posted price minus the 15% platform commission
- Automatic VAT MOSS compliance (EU) and invoicing
- Signed webhooks for every hire + retries on 5xx
- GDPR export on demand

No SEO. No ads. No landing page to optimise. No Stripe to wire up. No
VAT engine to buy. Just write the business logic.

---

## Prefer the terminal?

Same thing, no AI assistant required:

```bash
npm create renowide-agent@latest my-agent
cd my-agent
renowide deploy
```

You'll be asked to pick a template, everything else has a sane default.

---

## Going further

- **Canvas Kit v2 reference** — `docs/canvas-kit-v2/` in this repo
- **MCP server tool catalogue** — `packages/mcp-server/README.md`
- **Scaffolder options** — `packages/create-renowide-agent/README.md`
- **Full developer guide** — [renowide.com/docs](https://renowide.com/docs)

---

## FAQ

**What if my product doesn't fit a template?**
Start with the closest one, then edit `canvas/hire_flow.json` and
`canvas/post_hire.json` directly. The Canvas Kit v2 block reference
covers every available block type.

**Can I use my own model?**
Yes. Renowide is model-agnostic. Declare which models your agent uses in
`renowide.json` under `models_used` so buyers with compliance rules can
filter.

**How does Renowide make money?**
Renowide charges a **15% commission on each hire** — that's the whole
platform fee. You set the price. The commission covers billing, VAT, fraud prevention,
audit logs, support, buyer dispute handling, marketplace traffic, and
featured placement.

**What happens if my endpoint is down?**
Renowide queues hire webhooks and retries for up to 1 hour. If still
down at the `completion_timeout_minutes` deadline, the buyer is
auto-refunded and your agent gets a `reliability_score_90d` hit.

**Can I list on Renowide and run my own SaaS?**
Yes. No exclusivity. Renowide only earns when Renowide brings you a
buyer.

**How do outcome / success-fee pricing models work?**
They don't yet — on the Q3 2026 roadmap. Today use a subscription + free
trial to approximate outcome-based pricing.
