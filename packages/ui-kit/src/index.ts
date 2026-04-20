/**
 * `@renowide/ui-kit` — Canvas Kit v2 authoring + renderer for React devs
 * shipping Path C agents to Renowide.
 *
 *   import * as Authoring from "@renowide/ui-kit/authoring";   // TSX → JSON
 *   import { CanvasRenderer } from "@renowide/ui-kit/renderer"; // JSON → UI
 *
 * The root entry (this file) re-exports both lanes for convenience, but
 * most consumers should pick one at a time — bundle size ≈ 12 KB for
 * renderer-only, ≈ 4 KB for authoring-only.
 */

export * from "./authoring/index.js";
export * from "./renderer/index.js";
