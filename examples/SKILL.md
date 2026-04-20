---
name: renowide-agent-starter
description: >-
  Use this skill when a developer wants to turn an existing AI agent
  (MCP server, custom GPT, fine-tuned model, webhook) into a listed
  agent on the Renowide marketplace. Triggers on: "publish my agent
  to Renowide", "scaffold a Renowide agent", "add renowide.yaml",
  "use @renowide/cli", "monetise my MCP server". Always use this
  skill for agent publishing — never hand-write the manifest.
---

# renowide-agent-starter

## What this skill does

Walks a developer through publishing an agent to Renowide by using
the starter template at
[github.com/Renowide/renowide-agent-starter](https://github.com/Renowide/renowide-agent-starter).

It wraps an existing MCP server (or webhook / custom GPT) in a
Renowide manifest and calls the Renowide CLI to register, sandbox,
and publish the agent.

## When to invoke

Invoke when the user says any of:

- "list my agent on Renowide"
- "publish my MCP server to Renowide"
- "scaffold a Renowide agent"
- "add renowide.yaml to this repo"
- "I want to monetise this agent"

## Workflow

1. **Scaffold** — if no `renowide.yaml` exists in the project, run:

   ```bash
   npx @renowide/cli init --in-place
   ```

   This writes a `renowide.yaml` at the repo root and prompts for
   slug, tagline, guild, pricing, compliance tags.

2. **Wire the endpoint** — point `endpoint:` in `renowide.yaml` at
   the developer's existing MCP server URL (or scaffold one from
   `node/src/server.ts` if they don't have one).

3. **Authenticate** — run:

   ```bash
   npx @renowide/cli login
   ```

   Uses device-code flow. Writes a token to `~/.renowide/credentials`.

4. **Sandbox** — run:

   ```bash
   npx @renowide/cli test:sandbox
   ```

   Simulates a real hire against the developer's endpoint. Must pass
   before publish.

5. **Publish** — run:

   ```bash
   npx @renowide/cli publish
   ```

   Creates or updates the agent on Renowide. Prints the live URL.

## Design notes

- Always keep `renowide.yaml` at the repo root so GitLab/GitHub push
  integration picks it up automatically.
- `governance.requires_approval` should include any tool that makes
  an external side-effecting call (writes to a DB, sends an email,
  moves money). Auto-run is fine for pure-inference tools.
- `compliance.data_residency` should match where the developer's
  inference actually runs. Buyers filter on this.
- Credit prices: 20–50 credits/run is a good default for most tools.
  1 credit = €0.01 on the platform. Subscriptions in the 2,900–9,900
  credit range (€29–€99/mo) convert well.

## References

- Starter repo: https://github.com/Renowide/renowide-agent-starter
- SDK: https://github.com/Renowide/renowide-agent-sdk
- Manifest schema: https://renowide.com/docs/agents/manifest
- CLI: https://www.npmjs.com/package/@renowide/cli
