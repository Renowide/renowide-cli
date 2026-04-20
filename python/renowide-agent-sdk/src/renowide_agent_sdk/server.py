"""
FastAPI-based MCP-compatible server for a Renowide agent (Python).

Mirrors the Node server in typescript/src/server.ts.
"""

from __future__ import annotations

import asyncio
import os
import secrets
from typing import Any, Callable, Dict

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

from .errors import AgentSDKError
from .types import (
    AgentContext,
    AgentDefinition,
    ComplianceContext,
    HireMetadata,
    Tool,
    build_default_audit_logger,
)


def define_agent(
    *,
    slug: str,
    name: str,
    tools: list[Tool[Any, Any]],
    on_hire: Callable[[AgentContext], Any] | None = None,
    on_hire_end: Callable[[AgentContext], Any] | None = None,
) -> AgentDefinition:
    seen: Dict[str, None] = {}
    for t in tools:
        if t.name in seen:
            raise ValueError(f'Duplicate tool name in agent "{slug}": {t.name}')
        seen[t.name] = None
    return AgentDefinition(
        slug=slug, name=name, tools=list(tools), on_hire=on_hire, on_hire_end=on_hire_end
    )


def start_mcp_server(
    agent: AgentDefinition,
    *,
    port: int | None = None,
    shared_secret: str | None = None,
) -> FastAPI:
    """Create a FastAPI app for the agent. Caller runs it with uvicorn.

    In production:

        uvicorn agent.server:app --host 0.0.0.0 --port 8787

    The `shared_secret` is compared against `Authorization: Bearer <x>`.
    Renowide always sends the agent's webhook_secret on every call.
    """

    app = FastAPI(title=f"renowide-agent:{agent.slug}")
    tool_map: Dict[str, Tool[Any, Any]] = {t.name: t for t in agent.tools}
    secret = shared_secret or os.environ.get("RENOWIDE_WEBHOOK_SECRET")

    @app.get("/health")
    async def health() -> dict[str, Any]:
        return {"ok": True, "agent": agent.slug, "tools": list(tool_map.keys())}

    @app.post("/mcp")
    async def mcp(request: Request, authorization: str | None = Header(default=None)) -> JSONResponse:
        if secret:
            if authorization != f"Bearer {secret}":
                raise HTTPException(status_code=401, detail="unauthorised")
        payload = await request.json()
        tool_name = str(payload.get("tool", ""))
        tool = tool_map.get(tool_name)
        if tool is None:
            raise HTTPException(status_code=404, detail=f'no tool "{tool_name}"')

        trace_id = str(payload.get("traceId") or _random_trace_id())
        hire_raw = payload.get("hire") or {}
        compliance_raw = payload.get("compliance") or {}

        ctx = AgentContext(
            hire=HireMetadata(
                hire_id=hire_raw.get("hireId", "anonymous"),
                workspace_id=hire_raw.get("workspaceId", "local"),
                workspace_jurisdiction=hire_raw.get("workspaceJurisdiction"),
                billing_model=hire_raw.get("billingModel", "per_run"),
                remaining_credits=int(hire_raw.get("remainingCredits", 10**9)),
                credit_budget=int(hire_raw.get("creditBudget", 10**9)),
            ),
            compliance=ComplianceContext(
                allowed_residency=list(compliance_raw.get("allowedResidency", ["ANY"])),
                tags=list(compliance_raw.get("tags", [])),
                jurisdiction=list(compliance_raw.get("jurisdiction", [])),
            ),
            audit=build_default_audit_logger(trace_id),
            trace_id=trace_id,
            cancel_event=asyncio.Event(),
        )

        try:
            result = await tool.handler(payload.get("input", {}), ctx)
            return JSONResponse({"ok": True, "result": result, "traceId": trace_id})
        except AgentSDKError as exc:
            status = {
                "validation": 400,
                "budget_exceeded": 402,
            }.get(exc.kind, 500)
            return JSONResponse(
                {"ok": False, "error": {"kind": exc.kind, "message": str(exc)}, "traceId": trace_id},
                status_code=status,
            )
        except Exception as exc:
            return JSONResponse(
                {
                    "ok": False,
                    "error": {"kind": "internal_error", "message": str(exc)},
                    "traceId": trace_id,
                },
                status_code=500,
            )

    return app


def _random_trace_id() -> str:
    return f"tr_{secrets.token_hex(6)}"
