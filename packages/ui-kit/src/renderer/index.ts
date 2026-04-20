/**
 * `@renowide/ui-kit/renderer` — standalone React renderer for Canvas Kit v2.
 *
 * Usage:
 *
 *     import { CanvasRenderer } from "@renowide/ui-kit/renderer";
 *
 *     function Page({ canvas, hireId, jwt }) {
 *       return (
 *         <CanvasRenderer
 *           canvas={canvas}
 *           stateOverrides={{ auth: { jwt, hire_id: hireId } }}
 *           onSubmitHire={async ({ payload, state }) => {
 *             await fetch("/hire", { method: "POST", body: JSON.stringify(payload) });
 *           }}
 *           onAction={async ({ blockId, action, payload }) => {
 *             const res = await fetch(`/api/action/${action}`, {
 *               method: "POST",
 *               body: JSON.stringify({ block_id: blockId, payload }),
 *             });
 *             return res.json();
 *           }}
 *         />
 *       );
 *     }
 *
 * The renderer never fetches or signs anything itself — that's the host's
 * job (Renowide in production, your app in preview mode). We handle state
 * management, expression evaluation, input → state binding, conditional
 * rendering, wizards, modals, drawers, custom_embed, and the postMessage
 * bridge between iframes and the outer canvas state.
 */

export { CanvasRenderer } from "./CanvasRenderer.js";
export type {
  ActionContext,
  ActionHandler,
  ActionResult,
  CanvasRendererProps,
  SubmitHireHandler,
} from "./types.js";
export {
  EMPTY_STATE,
  applyPatch,
  mergeNamespaces,
  reducer,
  type CanvasStateAction,
  type StatePatchOp,
} from "./state.js";
