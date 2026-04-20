# Canvas Kit v2 — Block reference

All 30 block types, with their JSON shape. The Zod/TS equivalents live
in [`@renowide/types/canvas`](../../packages/types/src/canvas.ts); the
authoring TSX counterparts live in
[`@renowide/ui-kit/authoring`](../../packages/ui-kit/src/authoring/components.tsx).
The backend Pydantic source of truth lives in
`backend/app/schemas/canvas.py` (internal).

Every block has these fields:

| Field | Required | Notes |
|-------|----------|-------|
| `id`  | ✅       | unique across the canvas, matches `^[a-z][a-z0-9_-]{0,63}$` |
| `type`| ✅       | one of the block types below |
| `when`| –        | [expression](./expressions.md) controlling render |
| `props`| ✅ (most)| block-specific; see below |

Containers (`layout_stack`, `layout_grid`, `wizard`, `modal`, `drawer`,
`conditional`) also accept a `children` array of blocks (nested blocks
inherit the same structure).

---

## Primitive content

### `header`

```json
{ "id": "h1", "type": "header", "props": { "text": "Welcome", "level": 2 } }
```

* `text` (string, ≤ 200, supports interpolation)
* `level` (1 | 2 | 3, default 1)

### `markdown`

```json
{ "id": "intro", "type": "markdown", "props": { "source": "Hello **world**" } }
```

* `source` (string, ≤ 8000) — renderer supports a minimal subset
  (paragraphs, `**bold**`, `*italic*`, `` `code` ``, links). For richer
  markdown, pre-render to HTML and put into a `custom_embed`.

### `divider`

```json
{ "id": "d", "type": "divider", "props": {} }
```

No props.

### `info_callout`

```json
{ "id": "note", "type": "info_callout", "props": { "severity": "warning", "text": "FYI", "title": "Heads up" } }
```

* `severity`: `info` (default) | `success` | `warning` | `danger`
* `text` (string, ≤ 1000)
* `title` (string, optional)

### `image`

```json
{ "id": "hero", "type": "image", "props": { "url": "https://…", "alt": "…", "max_height": "280px" } }
```

### `code_block`

```json
{ "id": "snippet", "type": "code_block", "props": { "language": "bash", "source": "curl …" } }
```

### `kpi`

```json
{ "id": "kpi1", "type": "kpi", "props": { "label": "Issues found", "value": "{{custom.issues_count}}", "trend": "down" } }
```

---

## Form inputs

All form inputs auto-bind to `state.form[<blockId>]`.

### `text_input`

```json
{ "id": "email", "type": "text_input", "props": { "label": "Work email", "required": true, "multiline": false, "pattern": "^[^@]+@…$" } }
```

### `checkbox`

```json
{ "id": "agree", "type": "checkbox", "props": { "label": "I agree", "required": true, "default": false } }
```

### `date_picker`

```json
{ "id": "start", "type": "date_picker", "props": { "label": "Start date", "mode": "date" } }
```

### `file_upload`

```json
{ "id": "pdf", "type": "file_upload", "props": { "label": "Attach PDF", "accept": ["application/pdf"], "max_size_mb": 10 } }
```

### `api_key_input`

```json
{ "id": "pat", "type": "api_key_input", "props": { "label": "GitLab PAT", "required": true } }
```

### `oauth_button`

```json
{ "id": "oauth_google", "type": "oauth_button", "props": { "provider": "google", "label": "Continue with Google" } }
```

---

## Actions

### `action_button`

```json
{
  "id": "submit",
  "type": "action_button",
  "props": {
    "label": "Run scan",
    "action": "__submit_hire__",
    "variant": "primary",
    "disabled_when": "!form.agree",
    "loading_label": "Scanning…",
    "confirm": { "title": "Proceed?", "ok_label": "Yes", "cancel_label": "Cancel" }
  }
}
```

Reserved actions:

* `__submit_hire__` — **does not** POST to your webhook; Renowide
  handles the hire creation itself. Exactly one `__submit_hire__`
  (either an `action_button` or a `wizard`'s final step) is **required**
  in every `hire_flow` canvas.
* Any other `action` is POSTed to your `action_webhook_url` with the
  full state tree and an HMAC signature. See [`actions.md`](./actions.md).

### `cta`

Like `action_button`, but always opens an URL in a new tab:

```json
{ "id": "link", "type": "cta", "props": { "label": "Open dashboard", "url": "https://…", "variant": "ghost" } }
```

---

## Layout

### `layout_stack`

```json
{ "id": "col", "type": "layout_stack", "props": { "direction": "vertical", "gap": 12 }, "children": [ … ] }
```

### `layout_grid`

```json
{ "id": "grid", "type": "layout_grid", "props": { "columns": 2, "gap": 16 }, "children": [ … ] }
```

### `conditional`

```json
{
  "id": "cond",
  "type": "conditional",
  "when": "form.agree",
  "children": [ { … } ],
  "else": [ { … } ]
}
```

Note: `when` lives on the block (not in `props`) and is the canonical
conditional syntax — most blocks also support a top-level `when` for
inline gating without wrapping in a `conditional`.

### `modal`

```json
{
  "id": "m1",
  "type": "modal",
  "props": { "title": "Details", "open_when": "ui.modals.m1", "size": "md" },
  "children": [ … ]
}
```

### `drawer`

Analogous to `modal`, but anchored to an edge:

```json
{
  "id": "d1",
  "type": "drawer",
  "props": { "title": "Filters", "open_when": "ui.drawers.d1", "anchor": "right" },
  "children": [ … ]
}
```

---

## Complex widgets

### `wizard`

Multi-step form. The final step's submit button triggers
`__submit_hire__` unless you override it.

```json
{
  "id": "steps",
  "type": "wizard",
  "props": { "allow_back": true },
  "children": [
    {
      "id": "s1",
      "type": "wizard_step",
      "props": { "title": "Connect", "next_enabled_when": "!!form.token" },
      "children": [ { "id": "token", "type": "text_input", "props": { "label": "Token" } } ]
    },
    {
      "id": "s2",
      "type": "wizard_step",
      "props": { "title": "Confirm" },
      "children": [ { "id": "confirm_md", "type": "markdown", "props": { "source": "Ready?" } } ]
    }
  ]
}
```

### `state_subscription`

Declarative "watcher" that POSTs to a callback when a state path
changes. Used for autosave-style flows. See backend docs.

### `pdf_viewer`

```json
{ "id": "pdf", "type": "pdf_viewer", "props": { "url": "https://…/report.pdf", "height": "800px" } }
```

### `custom_embed`

Full escape hatch — see [`custom_embed.md`](./custom_embed.md).

```json
{
  "id": "embed",
  "type": "custom_embed",
  "props": {
    "src": "https://agent-vibescan.embed.renowide.com/",
    "height": "900px",
    "resize": "auto",
    "allow_postmessage_events": ["ready", "resize", "toast", "action"]
  }
}
```

---

## Cheat sheet: where does what validation live?

1. **Authoring time** — `renderToJson()` → Zod schema parse.
2. **CLI validate** — `renowide canvas validate` → Zod + structural.
3. **Backend proxy** — `CanvasResponseSchema.safeParse()` +
   `validateCanvasStructure()` on every fetch. Invalid payloads are
   rejected with a 502 back to the buyer.
4. **Renderer** — trusts the backend; only enforces cross-block
   invariants (e.g. wizard step index).
