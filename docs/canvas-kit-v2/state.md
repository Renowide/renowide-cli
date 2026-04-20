# State model

Every canvas has exactly one state tree, shaped like this:

```jsonc
{
  "form":   { "<block_id>": <value>, … },      // auto-bound from form inputs
  "custom": { "<your key>": <value>, … },      // populated from initial_state
  "wizard": { "step": 0 },                     // owned by <Wizard>
  "ui":     { "modals": { }, "drawers": { } }, // open/close state
  "auth":   { "jwt": "…", "hire_id": "…", "buyer_id": "…" },  // host-injected
  "meta":   { "surface": "hire_flow", "buyer_id": "…", "agent_slug": "…" }
}
```

Expressions (`{{form.agree}}`, `"!form.agree"`, `"custom.items.length > 0"`)
read from this tree without mutation. Mutations happen through:

* **Implicit form binding** — the renderer writes to `form.<block_id>`
  whenever a form input changes.
* **Action responses** — your `action_button` webhooks return
  `state_patches` that are applied on receipt (see
  [`actions.md`](./actions.md#state-patches)).
* **`custom_embed` postMessage** — iframes can send `renowide.patch`
  messages that the renderer merges into state.

---

## Reserved namespaces

These five are owned by Renowide / the renderer. You **must not** put
them into `initial_state`; the CLI rejects that with `reserved_state_namespace`.

| Namespace | Owner    | Can developer write? | Can expression read? |
|-----------|----------|----------------------|----------------------|
| `auth`    | host     | ❌                   | ✅                   |
| `meta`    | host     | ❌                   | ✅                   |
| `ui`      | renderer | via `open_when`/actions | ✅                |
| `wizard`  | renderer | via wizard navigation | ✅                  |
| `form`    | renderer | via form inputs/actions | ✅                |

The free-for-all namespace is `custom`. Everything else (arbitrary keys
at the root, like `"scan"` or `"issues"`) is allowed too, as long as
the name isn't reserved.

---

## Seeding state via `initial_state`

```json
{
  "ui_kit_version": "2.0.0",
  "surface": "post_hire",
  "initial_state": {
    "custom": { "repos": [], "selected_repo": null }
  },
  "blocks": [ … ]
}
```

* Must be a plain JSON object of namespace → record.
* Namespaces inside `initial_state` **cannot** be any of the five
  reserved ones (`auth`, `meta`, `ui`, `wizard`, `form`).
* Values are serialised into the renderer's state reducer at mount time
  and *never* refreshed by subsequent canvas fetches. If you need live
  data, drive it from actions or `custom_embed`.

---

## Host-injected state (`auth`, `meta`)

Renowide populates these from the hire context before mounting the
renderer, so developers can read them without mutation:

* `auth.jwt` — short-lived JWT that your agent backend can verify when
  an iframe talks to it.
* `auth.hire_id` — UUID of the hire the buyer is viewing.
* `auth.buyer_id` — opaque buyer identifier (not their email).
* `meta.surface` — `"hire_flow"` | `"post_hire"`.
* `meta.agent_slug` — your agent's marketplace slug.
* `meta.buyer_id` — duplicate of `auth.buyer_id` for convenience.

---

## Reading state in expressions

Path segments use dot notation. Missing paths evaluate to `undefined`.

```
form.agree                            → true | false | undefined
form.email != ""                     → boolean
custom.repos.length > 0              → boolean
{{auth.jwt}}                         → interpolated into a string prop
{{meta.buyer_id || "(guest)"}}       → fallback via `||`
```

See [`expressions.md`](./expressions.md) for the full grammar.

---

## How inputs write to state

Each form block knows its own JSON key:

| Block         | Writes to                    |
|---------------|------------------------------|
| `text_input`  | `form.<id>` (string)         |
| `checkbox`    | `form.<id>` (boolean)        |
| `date_picker` | `form.<id>` (ISO 8601 string)|
| `file_upload` | `form.<id>` (File handle in the renderer; base64 when forwarded) |
| `api_key_input` | `form.<id>` (string)       |

You never have to write an action to "save the form" — the renderer
keeps `form` authoritative.

---

## Rules of thumb

* **Put anything you want to template in `custom`.** It travels with
  actions and is safe to mutate.
* **Don't rely on `auth` being set in preview mode.** Use
  `stateOverrides.auth` in `@renowide/ui-kit/renderer` while developing.
* **Never emit secrets into the canvas.** Everything in the canvas is
  readable by the buyer's browser devtools. Secrets live server-side and
  are only used to sign outbound requests.
