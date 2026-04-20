/**
 * Canvas Kit v2 — Path C (SDUI + `custom_embed`).
 *
 * This module is a convenience re-export of the canonical types from
 * `@renowide/types` so agent authors who already depend on
 * `@renowide/agent-sdk` at runtime can reach the v2 schemas without
 * adding a second dependency.
 *
 * If you are *only* writing canvases (no MCP server, no runtime tools),
 * depend on `@renowide/types` directly — it is a lighter install.
 *
 * See:
 *   - docs/canvas-kit-v2/   (public developer guide)
 *   - @renowide/types/canvas
 *   - @renowide/types/expression
 *   - @renowide/types/signing
 *   - @renowide/ui-kit       (React authoring + standalone renderer)
 *   - renowide-canvas        (Python signing + FastAPI router)
 */

export * from "@renowide/types/canvas";
export * from "@renowide/types/canvas-events";
export * from "@renowide/types/expression";
export * from "@renowide/types/signing";
export * from "@renowide/types/manifest";
