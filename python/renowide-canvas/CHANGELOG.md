# Changelog

All notable changes to `renowide-canvas` are documented here.

## 0.2.0 — 2026-04-20

Initial public release. Targets Canvas Kit v2.0.0 and mirrors
[`@renowide/types@0.2.0`](https://www.npmjs.com/package/@renowide/types).

### Added

* `renowide_canvas.signing` — pure-stdlib HMAC-SHA256 canonical string
  helpers:
  * `sign_canvas_request`, `sign_action_request` (outbound).
  * `verify_canvas_request`, `verify_action_request` (inbound).
  * `SignatureVerificationError` with a machine-readable `.code`.
* `renowide_canvas.fastapi.canvas_router` — one-call FastAPI router
  that wires `GET /canvas/hire_flow.json`, `GET /canvas/post_hire.json`,
  and `POST /actions` with signature verification. Optional extra; core
  package has no runtime dependencies.
* Known-answer test locking the canonical-string format against
  `@renowide/types`.
