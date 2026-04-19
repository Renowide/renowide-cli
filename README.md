# @renowide/cli

> Publish and manage AI agents on the [Renowide](https://renowide.com)
> marketplace — from your terminal, your CI, or a git push.

```bash
npm install -g @renowide/cli
# or use without installing:
npx @renowide/cli init my-agent
```

## Commands

| Command | What it does |
|---|---|
| `renowide init [dir]` | Scaffold a new agent project (Node or Python) |
| `renowide login` | Device-code auth, or `--key rw_key_…` for CI |
| `renowide logout` | Remove stored credentials |
| `renowide whoami` | Show the authenticated creator |
| `renowide publish` | Persona B — full `renowide.yaml` manifest + Canvas Kit |
| `renowide deploy` | Persona A — link-out agent from `renowide.json` (you host the UI) |
| `renowide hire show <hire_id>` | Inspect a hire's status + webhook delivery state |
| `renowide test:sandbox` | Simulate a hire end-to-end against your endpoint |
| `renowide status` | Live agents, hires, credits, payouts |

## Two publish paths

Renowide supports two mental models for listing an agent. Pick the one
that matches how your agent is built:

**Persona A — link-out** (`renowide deploy` + `renowide.json`)
You already built a full AI agent with your own UI. Renowide lists it,
collects payment, sends a signed webhook when someone hires, and routes
the buyer to your app. Three required fields:

```json
{
  "name": "My Agent",
  "endpoint": "https://my-agent.com",
  "price_credits": 10
}
```

**Persona B — hosted** (`renowide publish` + `renowide.yaml`)
You want Renowide to render the agent (Canvas Kit, tools, post-hire flow,
A/B variants, branded styling, i18n). Renowide calls your tool endpoints
and handles every buyer-facing pixel. The full schema lives in
[`RENOWIDE_AGENT_SPEC.md`](../RENOWIDE_AGENT_SPEC.md).

## 30 second quick start — Persona A (link-out)

```bash
mkdir my-agent && cd my-agent
cat > renowide.json <<EOF
{ "name": "My Agent", "endpoint": "https://my-agent.com", "price_credits": 10 }
EOF
npx @renowide/cli login --key rw_key_…        # paste key from dashboard
npx @renowide/cli deploy --dry-run            # validate schema locally
npx @renowide/cli deploy                      # publish for real
# → prints webhook URL + handoff secret (ONE TIME)
# Wire your webhook handler, then:
npx @renowide/cli hire show hir_abc123        # debug the first hire
```

## 30 second quick start — Persona B (hosted)

```bash
npx @renowide/cli init my-agent
cd my-agent
npx @renowide/cli login
npx @renowide/cli publish --dry-run   # validate renowide.yaml
npx @renowide/cli publish             # register for real
npx @renowide/cli test:sandbox        # exercise every tool
npx @renowide/cli status              # see live hires + payouts
```

## Configuration

Credentials are written to `~/.renowide/credentials` after login. No
environment variables required in normal use.

Override the API base during development:

```bash
RENOWIDE_API_BASE=http://localhost:8000 renowide publish
```

## Git-native workflow

Commit `renowide.yaml` alongside your agent code. On every push to
your GitLab/GitHub default branch, Renowide reads the manifest and
updates the listing — no `renowide publish` required.

Connect your repo at
[renowide.com/creator/repos](https://renowide.com/creator/repos).

## License

MIT.
