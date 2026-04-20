# @renowide/types

Canonical Canvas Kit v2 schema, expression grammar, and signing helpers
for Renowide external agents.

This package is the **single source of truth** for the Canvas Kit v2
wire format. The Renowide backend ships a Pydantic mirror of this file
at `backend/app/schemas/canvas.py` — the two are kept in lockstep by
CI. Every other consumer (the CLI, `@renowide/ui-kit`, a developer's
own webhook server) imports the Zod schemas and helpers from here.

```bash
npm install @renowide/types
```

## What's in the box

| Module | Exports | Use when |
|---|---|---|
| `@renowide/types` (root) | everything below | you want the kitchen sink |
| `@renowide/types/canvas` | `CanvasResponseSchema`, `CanvasBlock`, `validateCanvasStructure`, `canRender`, `CANVAS_KIT_VERSION`, `RESERVED_*` constants | validating a canvas JSON you built or received |
| `@renowide/types/expression` | `parseExpression`, `evalBoolean`, `interpolate`, `extractExpressions`, `validateExpression` | evaluating `{{ form.x }}` / `disabled_when` expressions against a state tree |
| `@renowide/types/canvas-events` | `ActionInvokeRequestSchema`, `ActionInvokeResponseSchema`, `StatePatchOpSchema`, `ToastSchema` | writing an `action_webhook_url` handler |
| `@renowide/types/signing` | `signCanvasRequest`, `signActionRequest`, `verifyCanvasRequest`, `verifyActionRequest` | verifying an inbound request from Renowide, or signing an outbound one (e.g. in tests) |
| `@renowide/types/manifest` | `ManifestCanvasBlockSchema`, `ManifestCanvasHireFlow`, `ManifestCanvasPostHire`, `ManifestCanvasCustomEmbed` | validating the `canvas` stanza of `renowide.json` |

## Example — validate an incoming canvas JSON

```ts
import {
  CanvasResponseSchema,
  validateCanvasStructure,
  canRender,
  CANVAS_KIT_VERSION,
} from "@renowide/types/canvas";

const raw = await fetch("https://my-agent.example.com/canvas/hire_flow.json").then(r => r.json());

const canvas = CanvasResponseSchema.parse(raw);     // pydantic-equivalent field checks
validateCanvasStructure(canvas);                    // unique ids, submit trigger, …

const compat = canRender({
  response: canvas.ui_kit_version,
  manifest: "2.0.0",
  renderer: CANVAS_KIT_VERSION,
});
if (!compat.ok) throw new Error(compat.reason);
```

## Example — verify + handle an action webhook

```ts
import express from "express";
import { verifyActionRequest } from "@renowide/types/signing";
import {
  ActionInvokeRequestSchema,
  ActionInvokeResponseSchema,
} from "@renowide/types/canvas-events";

const app = express();

// IMPORTANT: get the raw body BEFORE JSON middleware so the signature
// matches byte-for-byte.
app.post(
  "/webhook/actions",
  express.raw({ type: "application/json", limit: "64kb" }),
  (req, res) => {
    try {
      verifyActionRequest({
        handoffSecret: process.env.RENOWIDE_WEBHOOK_SECRET!,
        headers: req.headers as Record<string, string>,
        body: req.body,                         // Buffer, the raw bytes
      });
    } catch (e) {
      return res.status(401).json({ ok: false, error: String(e) });
    }

    const { action, state, hire_id } = ActionInvokeRequestSchema.parse(
      JSON.parse(req.body.toString("utf-8")),
    );

    // ... do the work ...

    const out = ActionInvokeResponseSchema.parse({
      ok: true,
      patch: [{ op: "set", path: "state.custom.scan_id", value: "abc-123" }],
      toast: { severity: "success", message: "Scan queued." },
    });
    res.json(out);
  },
);
```

## Example — evaluate an expression against a state tree

```ts
import { evalBoolean, interpolate } from "@renowide/types/expression";

const state = { form: { agree: true, name: "Tim" }, custom: { repo_id: 42 } };

evalBoolean("!form.agree", state);                   // false
evalBoolean("form.agree && custom.repo_id > 0", state); // true
interpolate("Hi {{ form.name }} ({{ custom.repo_id }})", state); // "Hi Tim (42)"
```

## Version compatibility

Every canvas response carries `ui_kit_version`. The Renowide proxy
enforces, and every renderer must enforce:

```
response.ui_kit_version ≤ manifest.ui_kit_version ≤ renderer.supported
```

Use `canRender({ response, manifest, renderer })` — it returns
`{ ok: true }` or `{ ok: false, reason }` with a developer-readable
explanation.

## Block type parity

- **v1 grandfathered (19):** `header`, `markdown`, `divider`, `info_callout`, `image`, `text_input`, `checkbox`, `date_picker`, `file_upload`, `code_block`, `kpi`, `cta`, `link_button`, `quick_reply`, `oauth_button`, `api_key_input`, `integration_button`, `table`, `chart`
- **v2 new (11):** `wizard`, `wizard_step`, `conditional`, `state_subscription`, `action_button`, `modal`, `drawer`, `layout_grid`, `layout_stack`, `custom_embed`, `pdf_viewer`

See [packages/types/src/canvas.ts](./src/canvas.ts) for the full prop
shapes. Every block uses `strict()` — Renowide will reject responses
with unknown keys to keep the schema versionable.

## Reserved actions & state namespaces

- Actions whose names start with `__` are reserved by Renowide. The only
  two defined today are `__submit_hire__` (hire-flow submit) and
  `__cancel_hire__` (reserved for v2.1, currently rejected).
- State keys `form`, `wizard`, `ui`, `meta`, `auth` are reserved. Your
  `initial_state` and any action-response `patch` must NOT write to them.

## Signing

All outbound Renowide → dev requests carry:

```
X-Renowide-Timestamp:   <unix-seconds>
X-Renowide-Request-Id:  <uuid>                 (canvas fetch only)
X-Renowide-Idempotency-Key: <uuid>             (action POST only)
Renowide-Signature:     v1=<hex>
```

Canonical strings:

```
GET   v1:<ts>:<agent_slug>:<surface>:<buyer_id|->:<hire_id|->:<request_id>
POST  v1:<ts>:<raw-body-bytes>
```

See [src/signing.ts](./src/signing.ts) for the reference implementation.
Maximum clock skew is 300 seconds — reject any request where
`|now - ts| > 300`.

## Contributing

Changes to this schema MUST be made in lockstep with the backend pydantic
mirror at `backend/app/schemas/canvas.py`. A CI job compares the
exported JSON Schemas and fails on drift.

## License

MIT
