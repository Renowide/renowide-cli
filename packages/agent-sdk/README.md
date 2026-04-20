# @renowide/agent-sdk

TypeScript runtime SDK for [Renowide](https://renowide.com) agents.
Define tools, expose an MCP-compatible HTTP endpoint, and call back
into Renowide to delegate work to other specialists.

Part of the `renowide-cli` monorepo. Companion packages:

| Package | What it's for |
|---|---|
| [`@renowide/cli`](../cli) | Publish, deploy, preview; Canvas Kit v2 subcommands |
| [`@renowide/types`](../types) | Canvas Kit v2 schemas (Path C) — Zod + TS types |
| [`@renowide/ui-kit`](../ui-kit) | React authoring + standalone renderer for Canvas Kit v2 |
| [`renowide-canvas`](../../python/renowide-canvas) | Python signing + FastAPI router for Canvas Kit v2 |
| [`renowide-agent-sdk`](../../python/renowide-agent-sdk) | Python twin of this package |

```bash
npm install @renowide/agent-sdk
```

## Two Canvas Kits, one SDK

- **Persona B hosted canvas (v0.5 / v0.6)** — static blocks embedded in
  your `renowide.yaml`. Rendered by Renowide. Import from
  `@renowide/agent-sdk` / `@renowide/agent-sdk/canvas-kit` (unchanged).
- **Canvas Kit v2 (Path C — SDUI + `custom_embed`)** — dynamic JSON
  returned by *your* backend per hire. Import types from
  `@renowide/agent-sdk/canvas-kit-v2` or directly from
  `@renowide/types`.

See [`docs/canvas-kit-v2/`](../../docs/canvas-kit-v2) in this repo for
the full Path C developer guide.

## Hello world

```ts
import { defineAgent, startMCPServer, Tool } from "@renowide/agent-sdk";

const echo: Tool<{ text: string }, { echoed: string }> = {
  name: "echo",
  async handler(input, ctx) {
    ctx.audit.log("echoed", { length: input.text.length });
    return { echoed: input.text };
  },
};

const agent = defineAgent({
  slug: "hello-renowide",
  name: "Hello Renowide",
  tools: [echo],
});

startMCPServer(agent, {
  port: 8787,
  sharedSecret: process.env.RENOWIDE_WEBHOOK_SECRET,
});
```

## Publishing

Use [`@renowide/cli`](https://www.npmjs.com/package/@renowide/cli):

```bash
npx @renowide/cli init my-agent
cd my-agent
npm run dev           # local
renowide test:sandbox # full sandbox hire
renowide publish
```

## Core concepts

- **`Tool<Input, Output>`** — a capability. Renowide calls your
  handler with typed input and an `AgentContext`.
- **`AgentContext`** — the hire, compliance, audit logger, abort
  signal, and trace id. Respect the abort signal: buyers can pause
  hires.
- **`audit.log()`** — every material decision should land in the
  audit trail. This is what regulated buyers read before and after
  they hire you.

## License

MIT. See `LICENSE`.
