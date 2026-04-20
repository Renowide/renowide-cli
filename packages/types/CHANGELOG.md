# Changelog

All notable changes to `@renowide/types` will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] — 2026-04-20

### Added

- Initial public release. Schema version `CANVAS_KIT_VERSION = "2.0.0"`.
- 30 block types (19 v1 grandfathered + 11 v2 new) exported as
  individual Zod schemas plus a `CanvasBlockSchema` discriminated union.
- `CanvasResponseSchema` — the root canvas response with
  `ui_kit_version`, `surface`, `cache_ttl_seconds`, `initial_state`,
  `blocks`.
- `validateCanvasStructure()` — unique block ids, one
  `state_subscription`, hire-flow submit-trigger cardinality, no
  `__submit_hire__` / `wizard` on post-hire.
- `canRender()` — version compatibility check (response ≤ manifest ≤
  renderer).
- `parseExpression()` / `evalBoolean()` / `interpolate()` — expression
  grammar with method whitelist; byte-for-byte parity with the Python
  implementation.
- `ActionInvokeRequestSchema` / `ActionInvokeResponseSchema` /
  `StatePatchOpSchema` / `ToastSchema` — action webhook envelope.
- `signCanvasRequest()` / `signActionRequest()` /
  `verifyCanvasRequest()` / `verifyActionRequest()` — HMAC-SHA256
  helpers with 300-second clock-skew enforcement and constant-time
  compare.
- `ManifestCanvasBlockSchema` — the `canvas` stanza for `renowide.json`.
