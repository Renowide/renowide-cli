# `renowide-canvas` (Python)

Python helpers for verifying and emitting Canvas Kit v2 signed requests
on your Renowide agent backend. This is the Python sibling of
[`@renowide/types/signing`](https://www.npmjs.com/package/@renowide/types);
the two must stay byte-compatible, and the tests in this package lock
that invariant with a known-answer test.

```bash
pip install renowide-canvas              # core (pure stdlib)
pip install 'renowide-canvas[fastapi]'   # + optional FastAPI router
```

## What's in the box

* `renowide_canvas.signing` — HMAC-SHA256 canonical-string helpers.
  Verify inbound canvas fetches (`GET /canvas/hire_flow.json`) and
  action webhooks (`POST /actions`). Raises a structured
  `SignatureVerificationError` with a machine-readable `.code`.
* `renowide_canvas.fastapi` (optional) — `canvas_router()` factory that
  wires the three canvas endpoints into a FastAPI app with full
  signature verification in one call.

See the full developer guide: [Canvas Kit v2 docs](https://github.com/Renowide/renowide-cli/tree/main/docs/canvas-kit-v2).

## Minimal example (FastAPI)

```python
import os
from fastapi import FastAPI
from renowide_canvas.fastapi import canvas_router, ActionEvent, CanvasContext

app = FastAPI()

def hire_flow(ctx: CanvasContext) -> dict:
    return {
        "ui_kit_version": "2.0.0",
        "surface": "hire_flow",
        "blocks": [
            {"id": "h", "type": "header", "props": {"text": "Scan a repo", "level": 2}},
            {"id": "repo", "type": "text_input", "props": {"label": "Repo URL", "required": True}},
            {"id": "submit", "type": "action_button", "props": {
                "label": "Run scan", "action": "__submit_hire__",
                "disabled_when": "!form.repo",
            }},
        ],
    }

def post_hire(ctx: CanvasContext) -> dict:
    return {
        "ui_kit_version": "2.0.0",
        "surface": "post_hire",
        "blocks": [
            {"id": "done", "type": "info_callout",
             "props": {"severity": "success", "text": f"Scan complete — hire {ctx.hire_id}"}},
        ],
    }

def on_action(ctx: CanvasContext, event: ActionEvent) -> dict:
    if event.action == "download_report":
        return {"navigate": {"url": "https://cdn/report.pdf", "target": "_blank"}}
    return {"state_patches": []}

app.include_router(canvas_router(
    agent_slug="my-agent",
    handoff_secret=os.environ["RENOWIDE_WEBHOOK_SECRET"],
    hire_flow_handler=hire_flow,
    post_hire_handler=post_hire,
    action_handler=on_action,
))
```

## Minimal example (no FastAPI)

```python
from renowide_canvas.signing import verify_action_request, SignatureVerificationError

def handle_action_webhook(request):
    try:
        verify_action_request(
            handoff_secret=RENOWIDE_WEBHOOK_SECRET,
            headers=dict(request.headers),
            body=request.raw_body,  # bytes, NOT parsed json
        )
    except SignatureVerificationError as exc:
        return 401, {"error": exc.code}
    # ... proceed ...
```

## Error codes

`SignatureVerificationError.code` is one of:

* `missing_header` — `Renowide-Signature` or required timestamp/request-id header absent.
* `malformed_header` — signature header doesn't match `v1=<64-hex>`.
* `unsupported_version` — scheme version other than `v1`.
* `stale_timestamp` — `|now - ts| > 300 s`.
* `bad_signature` — HMAC mismatch (wrong secret or tampered body/headers).

Map these into HTTP responses as suits your service.

## Version matrix

`renowide-canvas` tracks the same Canvas Kit protocol version as the JS
packages. Keep them aligned:

| `renowide-canvas` | `@renowide/types` / `@renowide/ui-kit` | `@renowide/cli` | Canvas Kit |
|-------------------|----------------------------------------|-----------------|------------|
| `0.2.x`           | `0.2.x`                                | `0.8.x`         | `2.0.0`    |

## License

MIT © Renowide. See [LICENSE](./LICENSE).
