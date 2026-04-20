# Changelog

All notable changes to `@renowide/ui-kit` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.2.0 — 2026-04-20

Initial public release. Ships alongside `@renowide/types@0.2.0` and
`@renowide/cli@0.8.0`, targeting Canvas Kit v2.0.0 on the Renowide
backend.

### Added

* **Authoring lane** (`@renowide/ui-kit/authoring`) with React
  components for all 30 Canvas Kit v2 blocks and a `renderToJson()`
  compiler that validates output against the canonical Zod schema.
* **Standalone renderer** (`@renowide/ui-kit/renderer`) with
  `<CanvasRenderer />` — expression-driven state, form input auto-bind,
  wizard / modal / drawer handling, `__submit_hire__` short-circuit,
  and `custom_embed` `postMessage` bridge. Inline styled (≈ 12 KB
  gzipped), no runtime dependencies beyond React + `@renowide/types`.
* Smoke test suite for both lanes (`node:test` via `tsx`).

### Known limitations

* Renderer ships with pragmatic "good-enough" styling. Hosts that want
  theming should wrap the renderer and pass a `className` prop, or
  contribute a theming layer to the next minor.
* Markdown parsing is intentionally minimal (paragraphs, bold, italic,
  inline code, links). GFM tables / lists require pre-parsing by the
  host before feeding into the renderer.
