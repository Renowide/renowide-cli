"""
renowide_agent_sdk — Python SDK for Renowide agents.

Typical usage:

    from renowide_agent_sdk import Tool, AgentContext, define_agent, start_mcp_server

    async def categorise_invoice(input: InvoiceInput, ctx: AgentContext) -> VatLine:
        line = await my_model.classify(input.invoice)
        ctx.audit.log("vat_code_assigned", {"code": line.code})
        return line

    agent = define_agent(
        slug="polish-vat-bookkeeper",
        name="Polish VAT Bookkeeper",
        tools=[Tool(name="categorise_invoice", handler=categorise_invoice)],
    )

    start_mcp_server(agent, port=8787)
"""

from .types import (
    AgentContext,
    AgentDefinition,
    AuditLogger,
    ComplianceContext,
    HireMetadata,
    SandboxReport,
    Tool,
    ToolHandler,
)
from .errors import AgentSDKError, BudgetExceededError, ValidationError
from .mcp_client import RenowideMcpClient, RenowideMcpError
from .server import define_agent, start_mcp_server
from . import canvas_kit  # noqa: F401 — typed dicts for Canvas Kit blocks

__all__ = [
    "AgentContext",
    "AgentDefinition",
    "AgentSDKError",
    "AuditLogger",
    "BudgetExceededError",
    "ComplianceContext",
    "HireMetadata",
    "RenowideMcpClient",
    "RenowideMcpError",
    "SandboxReport",
    "Tool",
    "ToolHandler",
    "ValidationError",
    "canvas_kit",
    "define_agent",
    "start_mcp_server",
]
