# Actions

An "action" is what happens when a buyer clicks an `action_button`. It
is the only canonical way for a canvas to reach back into your agent
backend.

Flow:

```
Buyer clicks <action_button action="scan">
      │
      ▼
Renderer bundles a request and POSTs to Renowide
  Renowide signs it and POSTs to your `action_webhook_url`
      │
      ▼
Your backend does the work
  and returns an ActionInvokeResponse (state_patches, toast, navigate)
      │
      ▼
Renowide relays the response to the renderer
Renderer applies state_patches, shows toast, navigates if requested
```

## Request format

Renowide POSTs your `action_webhook_url` with JSON like:

```json
{
  "canvas_kit_version": "2.0.0",
  "agent_slug": "vibescan",
  "hire_id": "hire_01HX…",
  "buyer_id": "buyer_8e4…",
  "surface": "post_hire",
  "block_id": "run_scan",
  "action": "scan",
  "payload": { "repo_url": "https://gitlab.com/acme/app" },
  "state": { "form": { … }, "custom": { … }, "auth": { "jwt": "…" } },
  "request_id": "req_01HX…",
  "ts": 1743567890
}
```

…with HTTP headers:

```
x-renowide-signature:         v1:<timestamp>:<hex-hmac>
x-renowide-signature-version: v1
x-renowide-request-id:        req_01HX…
```

Verification uses the canonical string `v1:<ts>:<raw_body>` with
`webhook_secret` as the HMAC key. See [`signing.md`](./signing.md) for
the exact algorithm, or import
[`verifyActionRequest`](../../packages/types/src/signing.ts).

## Response format (`ActionInvokeResponse`)

Your webhook must reply with JSON:

```json
{
  "state_patches": [
    { "op": "set", "path": "custom.issues", "value": [ … ] },
    { "op": "merge", "path": "custom", "value": { "last_run_at": "2026-04-20T10:00:00Z" } }
  ],
  "toast": { "severity": "success", "message": "Scan complete" },
  "navigate": null,
  "open_modal": null,
  "close_modal": null
}
```

All fields are optional except `state_patches` (which may be empty).
Schema: [`ActionInvokeResponseSchema`](../../packages/types/src/canvas-events.ts).

### State patches

Each `StatePatchOp` is one of:

* `{ "op": "set",   "path": "custom.x",     "value": … }`
* `{ "op": "merge", "path": "custom",       "value": { k: v, … } }`
* `{ "op": "unset", "path": "custom.x" }`
* `{ "op": "push",  "path": "custom.items", "value": … }`

`path` uses dot notation. Writing into reserved namespaces (`auth`,
`meta`, `ui`, `wizard`) is rejected. Writing to `form.<id>` overwrites
the buyer's input — use sparingly.

### `toast`

```json
{ "severity": "info" | "success" | "warning" | "danger", "message": "≤ 200 chars" }
```

### `navigate`

```json
{ "url": "https://renowide.com/…", "target": "_self" | "_blank" | null }
```

Opening external URLs in `_self` is rejected — the renderer forces
`_blank` for non-Renowide domains.

### `open_modal` / `close_modal`

```json
{ "id": "m1" }
```

The renderer merges this into `ui.modals[id]` so your modal block (with
`open_when: "ui.modals.m1"`) pops up.

## The reserved `__submit_hire__` action

When an `action_button` (or the final step of a `wizard`) has
`action: "__submit_hire__"`:

* The click does **not** hit your webhook.
* Renowide creates / finalises the hire record itself.
* Your `post_hire.canvas_url` is fetched and rendered.
* Your `action_webhook_url` is **not** informed; if you need to know
  when a hire happens, subscribe to the `hire.created` webhook event
  (documented in the main CLI README under "Event subscriptions").

Every `hire_flow` canvas **must** contain exactly one `__submit_hire__`
trigger. The backend rejects canvases that don't.

## Retries + timeouts

* Renowide enforces a **3 s** timeout on action webhooks. Slower
  actions should return immediately with an optimistic `toast` and run
  the work async (using `state_subscription` or background jobs).
* Renowide retries network-level failures up to twice with exponential
  backoff. Make your handlers idempotent (use `request_id` as an
  idempotency key).
* `concurrent: false` (the default) causes the renderer to block
  additional clicks while an action is in flight.

## Examples

```jsonc
// Log the scan start, then navigate to the live report
{
  "state_patches": [
    { "op": "set", "path": "custom.status", "value": "running" }
  ],
  "toast": { "severity": "info", "message": "Scan running…" },
  "navigate": { "url": "https://renowide.com/hires/{{auth.hire_id}}", "target": "_self" }
}
```
