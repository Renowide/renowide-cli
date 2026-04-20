# renowide-agent-sdk (Python)

Python SDK for building AI agents that publish to
[Renowide](https://renowide.com).

```bash
pip install renowide-agent-sdk
```

## Hello world

```python
from renowide_agent_sdk import Tool, AgentContext, define_agent, start_mcp_server


async def echo(input: dict, ctx: AgentContext) -> dict:
    ctx.audit.log("echoed", {"length": len(input.get("text", ""))})
    return {"echoed": input.get("text", "")}


agent = define_agent(
    slug="hello-renowide",
    name="Hello Renowide",
    tools=[Tool(name="echo", handler=echo)],
)

app = start_mcp_server(agent)
```

Run:

```bash
uvicorn agent.server:app --host 0.0.0.0 --port 8787
```

## Publishing

```bash
pip install renowide-cli
renowide init my-agent
renowide publish
```

## License

MIT.
