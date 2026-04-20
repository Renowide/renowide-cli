# `custom_embed`

The escape hatch for rendering arbitrary HTML/JS inside a Canvas Kit v2
surface. Use it when SDUI blocks aren't expressive enough — e.g. for a
complex interactive chart, a canvas-drawing tool, or an existing SPA
you want to lift into the hire flow.

```json
{
  "id": "embed",
  "type": "custom_embed",
  "props": {
    "src": "https://agent-vibescan.embed.renowide.com/embed?v=1",
    "height": "900px",
    "resize": "auto",
    "allow_postmessage_events": ["ready", "resize", "toast", "action"],
    "allow_clipboard_write": false
  }
}
```

## Where the iframe runs

Renowide's renderer loads your `custom_embed` in an iframe with:

```html
<iframe
  src="…"
  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
  referrerpolicy="no-referrer"
  loading="lazy"
/>
```

The origin of your `src` **must** match one of the
`custom_embed_allowed_origins` on your agent profile (`renowide
deploy` sets this up from your `canvas.custom_embed.allowed_origins`
list). Browsers enforce this via Renowide's CSP `frame-src`.

## JWT handoff

The iframe receives the buyer's short-lived JWT in two places:

1. The query string: `?rw_hire=<jwt>` (if you set
   `canvas.custom_embed.propagate_jwt_via: "query"`).
2. A `postMessage` on load:
   `{ type: "renowide.auth", jwt: "<jwt>", hire_id: "…", buyer_id: "…" }`.

The JWT is signed by Renowide with your `webhook_secret` and has a
60-second TTL. Verify it on your backend whenever your iframe talks to
its own API.

## `postMessage` bridge

The renderer subscribes to a fixed set of message types. Only messages
whose `type` is in `allow_postmessage_events` are processed — anything
else is silently dropped.

| Message type            | Payload                                                              | Effect                                |
|-------------------------|----------------------------------------------------------------------|---------------------------------------|
| `renowide.ready`        | `{ height?: number }`                                                | Ack; renderer may resize iframe.      |
| `renowide.resize`       | `{ height: number }`                                                 | Resizes iframe (only if `resize: "auto"`). |
| `renowide.toast`        | `{ severity, message }`                                              | Displays a toast.                     |
| `renowide.action`       | `{ action, payload?, block_id? }`                                    | Dispatches an action (same path as `action_button`). |
| `renowide.patch`        | `{ ops: StatePatchOp[] }`                                            | Applies state patches (subject to reserved-namespace rules). |
| `renowide.submit_hire`  | `{ payload? }`                                                       | Short-circuits into `__submit_hire__` — only valid on `hire_flow`. |

Send messages from the iframe:

```ts
window.parent.postMessage(
  { type: "renowide.patch", ops: [{ op: "set", path: "custom.repo", value: "acme/app" }] },
  "*",
);
```

The `targetOrigin: "*"` is fine because Renowide's host verifies the
`source` window reference, not the origin string. Hosts that want
stricter origin checks can post to `"https://renowide.com"` instead.

## Security flags

* **`sandbox`** — fixed at `allow-scripts allow-same-origin allow-forms
  allow-popups`. No `allow-top-navigation` — your iframe cannot
  escape the host.
* **`allow_clipboard_write`** (bool, default `false`) — if `true`, the
  iframe gets `clipboard-write` via Permissions-Policy. `clipboard-read`
  is never granted.
* **CSP** — Renowide's host serves
  `frame-ancestors 'self' https://renowide.com` so only Renowide can
  embed your iframe, and your iframe can only be loaded by Renowide.

## Sizing

* `resize: "fixed"` — iframe height is pinned to `height` (required).
* `resize: "auto"` — iframe listens for `renowide.resize` messages and
  grows / shrinks to match. Clamp with `min_height` and `max_height`.

## Local preview

During development you almost certainly want to test the embed in
isolation. The `@renowide/ui-kit/renderer` renders a `custom_embed` as a
real iframe, so you can point it at `http://localhost:5173/embed`:

```tsx
<CanvasRenderer
  canvas={{
    ui_kit_version: "2.0.0",
    surface: "hire_flow",
    blocks: [
      {
        id: "embed",
        type: "custom_embed",
        props: {
          src: "http://localhost:5173/embed",
          height: "900px",
          resize: "auto",
          allow_postmessage_events: ["ready", "resize", "toast", "action", "patch"],
        },
      },
    ],
  }}
  stateOverrides={{ auth: { jwt: "dev-jwt", hire_id: "dev-hire" } }}
/>
```

## Common pitfalls

* Forgetting to add your origin to `custom_embed.allowed_origins` in
  `renowide.json` — the browser blocks the iframe silently (check the
  console for CSP violations).
* Sending unsigned `renowide.action` messages — Renowide signs them on
  your behalf before POSTing to your webhook, using the same
  `webhook_secret`.
* Trying to render the iframe in preview mode without CORS set up —
  your dev server must allow framing from the preview host.
