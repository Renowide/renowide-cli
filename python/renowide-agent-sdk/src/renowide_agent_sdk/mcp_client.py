"""
RenowideMcpClient — agent-as-client helper (Python).

Mirror of typescript/src/mcp-client.ts. Lets a deployed Renowide agent
call back into the Renowide MCP server with its own ``rw_key_`` token
to delegate tasks, submit proposals, log actions, read knowledge base,
etc.

The Renowide MCP server speaks JSON-RPC 2.0 at
    POST https://renowide.com/api/v1/mcp
with ``Authorization: Bearer <rw_key_...>``.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional

import httpx


DEFAULT_MCP_URL = "https://renowide.com/api/v1/mcp"


class RenowideMcpError(RuntimeError):
    """Raised when a Renowide MCP call fails."""

    def __init__(self, message: str, *, code: Any = None, method: str = "") -> None:
        super().__init__(message)
        self.code = code
        self.method = method


class RenowideMcpClient:
    """Thin client for the Renowide MCP server."""

    def __init__(
        self,
        *,
        mcp_url: Optional[str] = None,
        token: Optional[str] = None,
        timeout_s: float = 20.0,
        transport: Optional[httpx.BaseTransport] = None,
    ) -> None:
        self.mcp_url = (
            mcp_url
            or os.environ.get("RW_MCP_URL")
            or DEFAULT_MCP_URL
        )
        resolved_token = (
            token
            or os.environ.get("RW_HIRE_TOKEN")
            or os.environ.get("RENOWIDE_API_KEY")
            or ""
        )
        if not resolved_token:
            raise ValueError(
                "RenowideMcpClient: missing token. Pass `token` or set "
                "RW_HIRE_TOKEN / RENOWIDE_API_KEY."
            )
        self.token = resolved_token
        self.timeout_s = timeout_s
        self._client = httpx.Client(timeout=timeout_s, transport=transport)

    # ── Public API ────────────────────────────────────────────────────────

    def list_tools(self) -> List[Dict[str, Any]]:
        """Return every tool this token is allowed to call."""
        result = self._rpc("tools/list", {})
        return list(result.get("tools", []))

    def call_tool(self, name: str, arguments: Optional[Dict[str, Any]] = None) -> Any:
        """Call a Renowide MCP tool. JSON content is transparently decoded."""
        result = self._rpc("tools/call", {"name": name, "arguments": arguments or {}})
        content = result.get("content") or []
        if content:
            first = content[0]
            if first.get("type") == "text":
                text = (first.get("text") or "").strip()
                if text.startswith(("{", "[")):
                    try:
                        return json.loads(text)
                    except json.JSONDecodeError:
                        return first["text"]
                return first.get("text")
        return result

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "RenowideMcpClient":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.close()

    # ── Internals ─────────────────────────────────────────────────────────

    def _rpc(self, method: str, params: Dict[str, Any]) -> Dict[str, Any]:
        payload = {
            "jsonrpc": "2.0",
            "id": f"rw_{os.urandom(4).hex()}",
            "method": method,
            "params": params,
        }
        try:
            response = self._client.post(
                self.mcp_url,
                json=payload,
                headers={
                    "authorization": f"Bearer {self.token}",
                    "accept": "application/json",
                },
            )
        except httpx.HTTPError as exc:
            raise RenowideMcpError(
                f"Transport error on {method}: {exc}",
                code="transport_error",
                method=method,
            ) from exc

        try:
            body = response.json()
        except ValueError:
            body = {}

        if response.status_code >= 400 or body.get("error"):
            err = body.get("error") or {}
            raise RenowideMcpError(
                err.get("message") or f"Renowide MCP {method} failed ({response.status_code})",
                code=err.get("code", response.status_code),
                method=method,
            )
        return body.get("result") or {}
