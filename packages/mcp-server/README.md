# @renowide/mcp-server

> Ship an AI agent to Renowide from inside your AI coding assistant.
> No CLI. No context-switch. Just tool calls.

```bash
npx -y @renowide/mcp-server
```

Runs a Model Context Protocol server over stdio that your coding assistant
(Cursor, Claude Code, Claude Desktop, Replit Agents, Windsurf, or anything
else that speaks MCP) can call to scaffold, validate, and deploy agents
to Renowide.

This is the **build-and-distribute default**: from prompt to paying agent
in a handful of tool calls.

---

## 30-second install

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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

Restart Claude Desktop. In a new chat, type:

> *Use the renowide tools to deploy a SaaS-trial agent for my Notion-template
> store. Pick the dark theme.*

Claude will call `renowide_list_templates` → `renowide_scaffold_agent` →
`renowide_validate_manifest` → `renowide_deploy` and hand you back a live
URL.

### Cursor

In your repo's `.cursor/mcp.json`:

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

Then Cmd+K (`/`) and ask Cursor to *"ship an agent to Renowide"*.

### Claude Code (CLI)

```bash
claude mcp add renowide "npx -y @renowide/mcp-server"
```

Then any `claude` prompt involving Renowide will have the tools available.

---

## First-time auth

The MCP server reads credentials from `~/.renowide/credentials` — the same
file the `@renowide/cli` CLI writes when you `renowide login`. So the
one-time human step is:

```bash
npx @renowide/cli login
```

Device-code browser flow. Paste the code Renowide prints, approve in the
browser, done. From that moment on every AI coding assistant on this
machine can deploy to Renowide as you.

---

## Tools exposed

| Tool | What it does |
|---|---|
| `renowide_whoami` | Verify the user is authenticated; returns creator id + email. |
| `renowide_list_templates` | Show starter templates filtered by guild / path / tag. |
| `renowide_scaffold_agent` | Return file contents for a chosen template, parameterised. |
| `renowide_validate_manifest` | Zod-validate `renowide.json` before deploy. |
| `renowide_validate_canvas` | Zod-validate Canvas Kit v2 canvas JSON. |
| `renowide_deploy` | `POST /api/v1/agents/publish` — ship the agent. |
| `renowide_list_my_agents` | List the creator's agents + stats. |
| `renowide_get_agent` | Details for one agent (hires, earnings, webhook health). |
| `renowide_test_sandbox` | Simulate a hire against a deployed agent. |
| `renowide_search_marketplace` | Search all public agents — good for discovery + pricing benchmarks. |

## Resources exposed

Read on demand — the assistant pulls these into context only when needed:

- `renowide://docs/build-and-distribute`
- `renowide://docs/decision-tree`
- `renowide://docs/canvas-kit-v2/blocks`
- `renowide://docs/canvas-kit-v2/expressions`
- `renowide://docs/webhook-security`
- `renowide://docs/pricing-menu`

---

## Design notes

- **Stdio transport only in v0.1.** HTTP transport lands in v0.2 once more
  MCP clients support it reliably.
- **No second login.** Reads `~/.renowide/credentials` written by the CLI.
  If empty, returns `401` with a hint to run `renowide login`.
- **No local CLI shelling.** Every tool talks directly to the Renowide
  API (`renowide.com/api/v1/*`). Faster, more reliable, and doesn't need
  `renowide` in PATH.
- **Schemas from `@renowide/types`.** Validation is identical to what the
  backend does on publish — no surprises on deploy.
- **Templates are first-class.** `renowide_scaffold_agent` returns real
  working files (renowide.json, canvas JSONs, server stubs, package.json).
  The assistant writes them; the human replaces placeholder logic.

---

## When to use the MCP server vs the CLI

| Scenario | Use |
|---|---|
| Working in an AI coding assistant | **MCP server** (this package) |
| Shell scripts, CI/CD, cron jobs | `@renowide/cli` |
| Manual debugging at the terminal | `@renowide/cli` |
| First-time human login | `@renowide/cli` (one time) |

They use the same credentials file. Switch freely between them.

---

## License

MIT — see [LICENSE](../../LICENSE).

Part of the [Renowide monorepo](https://github.com/Renowide/renowide-cli).
