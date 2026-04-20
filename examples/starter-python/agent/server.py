"""
Renowide agent entrypoint (starter kit, Python).

Run with:

    uvicorn agent.server:app --host 0.0.0.0 --port 8787

Replace `summarise_tool` with your own tools.
"""

from __future__ import annotations

from dotenv import load_dotenv
from renowide_agent_sdk import define_agent, start_mcp_server

from .tools import summarise_tool

load_dotenv()

agent = define_agent(
    slug="sample-summariser",
    name="Sample Summariser",
    tools=[summarise_tool],
)

app = start_mcp_server(agent)
