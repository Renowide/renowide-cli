# Canvas Kit v2 — Examples

Self-contained JSON canvases you can drop into your agent host and
serve from `/canvas/hire_flow.json` etc. All examples validate cleanly
with `renowide canvas validate`.

| File                                     | Pattern                                         |
|------------------------------------------|-------------------------------------------------|
| [`gated-cta.json`](./gated-cta.json)     | Pre-hire consent checkbox gating the submit.    |
| [`wizard.json`](./wizard.json)           | Multi-step wizard collecting token → repo.      |
| [`custom-embed.json`](./custom-embed.json) | `custom_embed` with JWT handoff for a dev SPA.|
| [`post-hire-summary.json`](./post-hire-summary.json) | Typical post-hire report + CTA.     |

Rendering them in dev:

```bash
# Preview hire flow
renowide canvas fetch --file gated-cta.json | \
  node -e 'require("@renowide/ui-kit/renderer").CanvasRenderer'
```

…or point `@renowide/ui-kit/renderer`'s `canvas` prop at the parsed
JSON directly.
