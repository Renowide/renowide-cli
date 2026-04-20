"""
Core types every Renowide agent handler sees (Python).

Mirror of `typescript/src/types.ts`. Kept intentionally flat so it's
easy to read — these types are the contract your code depends on.
"""

from __future__ import annotations

import asyncio
import json
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import (
    Any,
    Awaitable,
    Callable,
    Generic,
    List,
    Literal,
    Optional,
    Protocol,
    TypeVar,
)

TIn = TypeVar("TIn")
TOut = TypeVar("TOut")

BillingModel = Literal["per_run", "per_hour", "per_token", "subscription"]


@dataclass
class HireMetadata:
    hire_id: str
    workspace_id: str
    workspace_jurisdiction: Optional[str]
    billing_model: BillingModel
    remaining_credits: int
    credit_budget: int


@dataclass
class ComplianceContext:
    allowed_residency: List[str] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)
    jurisdiction: List[str] = field(default_factory=list)


class AuditLogger(Protocol):
    def log(self, event_type: str, payload: dict[str, Any]) -> None: ...
    def warn(self, event_type: str, payload: dict[str, Any]) -> None: ...
    def error(self, event_type: str, payload: dict[str, Any]) -> None: ...


@dataclass
class AgentContext:
    hire: HireMetadata
    compliance: ComplianceContext
    audit: AuditLogger
    trace_id: str
    cancel_event: asyncio.Event

    @property
    def cancelled(self) -> bool:
        return self.cancel_event.is_set()


ToolHandler = Callable[[TIn, AgentContext], Awaitable[TOut]]


@dataclass
class Tool(Generic[TIn, TOut]):
    name: str
    handler: ToolHandler[TIn, TOut]
    description: Optional[str] = None
    governance: Literal["auto", "proposal"] = "auto"


@dataclass
class AgentDefinition:
    slug: str
    name: str
    tools: List[Tool[Any, Any]]
    on_hire: Optional[Callable[[AgentContext], Awaitable[None]]] = None
    on_hire_end: Optional[Callable[[AgentContext], Awaitable[None]]] = None


@dataclass
class SandboxToolResult:
    name: str
    runs: int
    p50_latency_ms: float
    p95_latency_ms: float
    credits_per_run: int
    audit_events: int
    failed: int


@dataclass
class SandboxReport:
    passed: bool
    tools_exercised: List[SandboxToolResult] = field(default_factory=list)
    residency_enforced: bool = True
    manifest_matches_runtime: bool = True
    audit_trail_schema_valid: bool = True
    warnings: List[str] = field(default_factory=list)


class _StdoutAuditLogger:
    """Default audit logger — emits one JSON line per event to stdout.

    The Renowide runtime intercepts stdout from your process and forwards
    every well-formed JSON line to the audit store. This keeps your code
    free of SDK transport concerns.
    """

    def __init__(self, trace_id: str) -> None:
        self.trace_id = trace_id

    def _emit(self, level: str, event_type: str, payload: dict[str, Any]) -> None:
        entry = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": level,
            "traceId": self.trace_id,
            "eventType": event_type,
            **payload,
        }
        sys.stdout.write(json.dumps(entry) + "\n")
        sys.stdout.flush()

    def log(self, event_type: str, payload: dict[str, Any]) -> None:
        self._emit("info", event_type, payload)

    def warn(self, event_type: str, payload: dict[str, Any]) -> None:
        self._emit("warn", event_type, payload)

    def error(self, event_type: str, payload: dict[str, Any]) -> None:
        self._emit("error", event_type, payload)


def build_default_audit_logger(trace_id: str) -> AuditLogger:
    return _StdoutAuditLogger(trace_id)
