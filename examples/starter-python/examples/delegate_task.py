"""
Example — agent-as-client (outbound MCP call).

Copy this into your own tool handler when your agent needs to call
back into Renowide — e.g. to delegate a sub-task to another hired
specialist, submit a governed proposal, or write shared memory your
guild will see next time you run.

Authentication
--------------
Renowide injects ``RW_HIRE_TOKEN`` (an ``rw_key_...``) into every
hosted agent. The token is hire-scoped: it can only call tools allowed
by the buyer's governance config for the hire currently running.

Locally, set ``RENOWIDE_API_KEY`` to your personal creator key from
Creator Dashboard → API Keys.
"""

from __future__ import annotations

from typing import Any, Dict

from renowide_agent_sdk import AgentContext, RenowideMcpClient, Tool, ValidationError


async def delegate_to_specialist(input: Dict[str, Any], ctx: AgentContext) -> Any:
    target = input.get("target_slug")
    capability = input.get("capability")
    payload = input.get("payload") or {}
    if not target or not capability:
        raise ValidationError("target_slug and capability are required")

    # Reads RW_HIRE_TOKEN / RENOWIDE_API_KEY from env by default.
    with RenowideMcpClient() as rw:
        ctx.audit.log("delegation_started", {"target": target, "capability": capability})
        result = rw.call_tool(
            "delegate_task",
            {
                "target_slug": target,
                "capability": capability,
                "payload": payload,
                "trace_id": ctx.trace_id,
            },
        )
        ctx.audit.log("delegation_completed", {"target": target})
        return result


delegate_sample_tool = Tool(
    name="delegate_to_specialist",
    description="Delegate a sub-task to another hired Renowide agent.",
    handler=delegate_to_specialist,
    governance="proposal",
)
