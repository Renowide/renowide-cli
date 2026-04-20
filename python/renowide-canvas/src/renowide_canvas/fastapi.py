"""FastAPI helper for Canvas Kit v2 agent backends.

Optional extra — install with ``pip install 'renowide-canvas[fastapi]'``.

Exposes :func:`canvas_router`, which wires three routes in a single
call:

*   ``GET  /canvas/hire_flow.json``
*   ``GET  /canvas/post_hire.json``
*   ``POST /actions``

You supply the three handlers (as plain callables returning the canvas
JSON or an action response). Signature verification, request-id
propagation, and clock-skew rejection are handled by the router.

Typical usage
-------------

.. code-block:: python

    from fastapi import FastAPI
    from renowide_canvas.fastapi import canvas_router

    app = FastAPI()

    def hire_flow(ctx):
        return {
            "ui_kit_version": "2.0.0",
            "surface": "hire_flow",
            "blocks": [ ... ],
        }

    def post_hire(ctx):
        return {
            "ui_kit_version": "2.0.0",
            "surface": "post_hire",
            "blocks": [ ... ],
        }

    def on_action(ctx, event):
        return { "state_patches": [] }

    app.include_router(canvas_router(
        agent_slug="vibescan",
        handoff_secret=os.environ["RENOWIDE_WEBHOOK_SECRET"],
        hire_flow_handler=hire_flow,
        post_hire_handler=post_hire,
        action_handler=on_action,
    ))
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, Mapping, Optional, Union

try:  # pragma: no cover - import guard
    from fastapi import APIRouter, Header, HTTPException, Request
    from fastapi.responses import JSONResponse
except ImportError as exc:  # pragma: no cover
    raise ImportError(
        "renowide_canvas.fastapi requires the 'fastapi' extra. "
        "Install with `pip install 'renowide-canvas[fastapi]'`."
    ) from exc

from .signing import (
    SignatureVerificationError,
    verify_action_request,
    verify_canvas_request,
)


@dataclass(frozen=True)
class CanvasContext:
    """Per-request metadata passed to the three handler callables.

    You don't instantiate this yourself; the router builds one from the
    signed request headers.
    """

    request_id: str
    buyer_id: Optional[str]
    hire_id: Optional[str]
    timestamp: int
    surface: str
    raw_request: Request


@dataclass(frozen=True)
class ActionEvent:
    """Decoded payload for an ``action_button`` webhook."""

    action: str
    block_id: Optional[str]
    payload: Dict[str, Any]
    state: Dict[str, Any]
    hire_id: Optional[str]
    buyer_id: Optional[str]
    surface: str


HireFlowHandler = Callable[[CanvasContext], Union[Dict[str, Any], Awaitable[Dict[str, Any]]]]
PostHireHandler = Callable[[CanvasContext], Union[Dict[str, Any], Awaitable[Dict[str, Any]]]]
ActionHandler = Callable[[CanvasContext, ActionEvent], Union[Dict[str, Any], Awaitable[Dict[str, Any]]]]


def canvas_router(
    *,
    agent_slug: str,
    handoff_secret: str,
    hire_flow_handler: HireFlowHandler,
    post_hire_handler: PostHireHandler,
    action_handler: ActionHandler,
    prefix: str = "",
) -> APIRouter:
    """Build an :class:`APIRouter` wiring the three Canvas Kit v2 routes.

    ``prefix`` lets you mount the endpoints under a sub-path (e.g. if
    you already have your own ``/api/...`` prefix).
    """

    router = APIRouter(prefix=prefix)

    async def _call_sync_or_async(cb, *args):  # type: ignore[no-untyped-def]
        result = cb(*args)
        if hasattr(result, "__await__"):
            result = await result  # type: ignore[assignment]
        return result

    def _verify_canvas(request: Request, surface: str) -> CanvasContext:
        try:
            verify_canvas_request(
                handoff_secret=handoff_secret,
                headers=dict(request.headers),
                agent_slug=agent_slug,
                surface=surface,
            )
        except SignatureVerificationError as exc:
            raise HTTPException(status_code=401, detail={"code": exc.code, "message": str(exc)})

        headers = request.headers
        try:
            ts = int(headers.get("x-renowide-timestamp", "0"))
        except ValueError:
            ts = 0

        return CanvasContext(
            request_id=headers.get("x-renowide-request-id", ""),
            buyer_id=headers.get("x-renowide-buyer-id") or None,
            hire_id=headers.get("x-renowide-hire-id") or None,
            timestamp=ts,
            surface=surface,
            raw_request=request,
        )

    @router.get("/canvas/hire_flow.json")
    async def _hire_flow(request: Request) -> JSONResponse:
        ctx = _verify_canvas(request, "hire_flow")
        payload = await _call_sync_or_async(hire_flow_handler, ctx)
        return JSONResponse(payload)

    @router.get("/canvas/post_hire.json")
    async def _post_hire(request: Request) -> JSONResponse:
        ctx = _verify_canvas(request, "post_hire")
        payload = await _call_sync_or_async(post_hire_handler, ctx)
        return JSONResponse(payload)

    @router.post("/actions")
    async def _actions(request: Request) -> JSONResponse:
        body = await request.body()
        try:
            verify_action_request(
                handoff_secret=handoff_secret,
                headers=dict(request.headers),
                body=body,
            )
        except SignatureVerificationError as exc:
            raise HTTPException(status_code=401, detail={"code": exc.code, "message": str(exc)})

        try:
            decoded = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise HTTPException(status_code=400, detail="body is not valid UTF-8 JSON")
        if not isinstance(decoded, Mapping):
            raise HTTPException(status_code=400, detail="body must be a JSON object")

        ctx = CanvasContext(
            request_id=request.headers.get("x-renowide-request-id", ""),
            buyer_id=decoded.get("buyer_id") or None,
            hire_id=decoded.get("hire_id") or None,
            timestamp=int(request.headers.get("x-renowide-timestamp", "0") or 0),
            surface=decoded.get("surface", ""),
            raw_request=request,
        )
        event = ActionEvent(
            action=str(decoded.get("action", "")),
            block_id=decoded.get("block_id"),
            payload=dict(decoded.get("payload") or {}),
            state=dict(decoded.get("state") or {}),
            hire_id=ctx.hire_id,
            buyer_id=ctx.buyer_id,
            surface=ctx.surface,
        )
        response = await _call_sync_or_async(action_handler, ctx, event)
        return JSONResponse(response)

    return router


__all__ = [
    "ActionEvent",
    "ActionHandler",
    "CanvasContext",
    "HireFlowHandler",
    "PostHireHandler",
    "canvas_router",
]
