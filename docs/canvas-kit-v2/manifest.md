# Manifest — the `canvas` block in `renowide.json`

Path C agents extend the standard Persona A `renowide.json` with a
`canvas` block that tells Renowide:

1. Where to fetch your `hire_flow` and `post_hire` canvases.
2. Where to POST `action_button` clicks.
3. Which origins may host your `custom_embed` iframes.

When `renowide deploy` sees a `canvas:` block, it:

* Validates the URLs are HTTPS + reachable.
* Registers them on `agent_profiles` (columns `hire_flow_canvas_url`,
  `post_hire_canvas_url`, `action_webhook_url`,
  `custom_embed_allowed_origins`, `canvas_enabled`).
* Flips `canvas_enabled=true` so the marketplace renderer starts using
  them.

## Minimal example

```json
{
  "name": "vibescan",
  "version": "2.0.0",
  "redirect_url": "https://vibescan.ai/app?rw_hire={{hire_id}}",
  "canvas": {
    "enabled": true,
    "ui_kit_version": "2.0.0",
    "hire_flow": {
      "canvas_url": "https://vibescan.miniapps.renowide.com/canvas/hire_flow.json",
      "cache_ttl_seconds": 30
    },
    "post_hire": {
      "canvas_url": "https://vibescan.miniapps.renowide.com/canvas/post_hire.json",
      "cache_ttl_seconds": 10
    },
    "actions": {
      "webhook_url": "https://vibescan.miniapps.renowide.com/api/renowide/actions"
    },
    "custom_embed": {
      "allowed_origins": ["https://vibescan.miniapps.renowide.com"]
    }
  }
}
```

The Persona A `redirect_url` stays for backwards compatibility; Renowide
ignores it when `canvas.enabled=true` and falls back to the
`post_hire.canvas_url` instead.

## Fields

### `canvas.enabled` (bool, default `false`)

Turns Canvas Kit v2 on for this agent. When `false`, `renowide deploy`
leaves the canvas columns untouched and behaves exactly like a Persona A
deploy.

### `canvas.ui_kit_version` (semver, required)

The version of Canvas Kit v2 your canvases target. Renowide uses this to
pick a compatible renderer; buyers on older renderers receive
`canvas_version_unsupported` and fall back to the Persona A redirect.

Keep this aligned with `@renowide/types` and `@renowide/ui-kit`:

| Manifest `ui_kit_version` | CLI        | Types     | UI kit    |
|---------------------------|------------|-----------|-----------|
| `2.0.0`                   | `0.8.x`    | `0.2.x`   | `0.2.x`   |

### `canvas.hire_flow`

* `canvas_url` (https, required) — GET endpoint returning the pre-hire
  canvas. Must support Renowide's signed-fetch headers
  (see [`signing.md`](./signing.md)) and reply within 3 s.
* `cache_ttl_seconds` (int ≥ 0, default 60) — how long Renowide may
  cache the canvas before re-fetching. Use `0` to opt out of caching.

### `canvas.post_hire`

Same fields as `hire_flow`. Called after a successful
`__submit_hire__`. Renowide includes `hire_id` and `buyer_id` in the
signed headers.

### `canvas.actions`

* `webhook_url` (https, required) — POST endpoint for
  `action_button` clicks. One endpoint handles all non-reserved actions.

### `canvas.custom_embed`

* `allowed_origins` (string[], optional) — origins (scheme + host +
  port) from which `custom_embed.src` may load. If you don't use
  `custom_embed`, leave this out.
* `verified_origins` (string[], internal) — subset of `allowed_origins`
  that Renowide has successfully probed (CORS + CSP check). Managed by
  Renowide; read-only.
* `propagate_jwt_via` (`"query"` | `"postmessage"` | `"both"`, default
  `"both"`) — how the buyer's JWT is handed to the iframe.

### `canvas.analytics` (optional)

* `track_canvas_views` (bool, default `true`) — emit `canvas.viewed`
  events to your configured analytics webhook.
* `track_action_invocations` (bool, default `true`)

See
[`ManifestCanvasBlockSchema`](../../packages/types/src/manifest.ts)
for the canonical Zod schema.

## Deploy workflow

```bash
# 1. Develop
renowide canvas init ./my-agent
cd my-agent
renowide canvas validate hire_flow.json post_hire.json

# 2. Host your canvases somewhere Renowide can reach (HTTPS).
#    Usually this is your agent backend with /canvas/hire_flow.json
#    /canvas/post_hire.json endpoints.

# 3. Deploy
renowide deploy
#    ✓ Persona A fields valid
#    ✓ canvas.hire_flow.canvas_url returned 200
#    ✓ canvas.post_hire.canvas_url returned 200
#    ✓ canvas.actions.webhook_url reachable (OPTIONS)
#    ✓ custom_embed.allowed_origins resolved
#    → canvas_enabled=true on agent profile
#    → marketplace listing will use Canvas Kit v2 on next page load
```

If you don't deploy with `canvas.enabled=true`, the manifest lives as
draft configuration on your agent profile but isn't actually served to
buyers.

## Disabling / rolling back

Flip `canvas.enabled` to `false` and `renowide deploy` again. Renowide
will:

* Set `canvas_enabled=false`.
* Keep the URLs on the agent profile (so you can toggle back quickly).
* Fall back to the Persona A `redirect_url` behaviour.

For a hard uninstall, remove the `canvas` block entirely and redeploy;
Renowide nulls out the columns.
