import type { ReactNode } from "react";
import type {
  CanvasBlock,
  CanvasResponse,
} from "@renowide/types/canvas";
import type { StateTree } from "@renowide/types/expression";
import type { StatePatchOp } from "./state.js";

export interface ActionResult {
  state_patches?: StatePatchOp[];
  toast?: { message: string; severity: "info" | "success" | "warn" | "error" };
  canvas?: CanvasResponse;
  redirect_url?: string;
}

export interface ActionContext {
  blockId: string;
  action: string;
  payload: Record<string, unknown>;
  state: StateTree;
}

/**
 * Host-provided handler invoked when the user clicks an `action_button`.
 * The handler is expected to POST to the developer's action webhook,
 * verify the response, and return the server's `ActionInvokeResponse`.
 *
 * The renderer then applies `state_patches`, shows any `toast`, and
 * optionally hot-swaps the canvas for a fresh one.
 */
export type ActionHandler = (ctx: ActionContext) => Promise<ActionResult | void>;

/** Host-provided handler invoked when the user hits `__submit_hire__`. */
export type SubmitHireHandler = (ctx: {
  payload: Record<string, unknown>;
  state: StateTree;
}) => Promise<void>;

export interface CanvasRendererProps {
  canvas: CanvasResponse;
  /** Overrides merged into the initial state (e.g. auth namespace). */
  stateOverrides?: Partial<StateTree>;
  /**
   * Called when an `action_button` with a non-reserved action is clicked.
   * If omitted, clicks log a console warning and are otherwise ignored.
   */
  onAction?: ActionHandler;
  /**
   * Called when the user hits the `__submit_hire__` action. This is how
   * Renowide tells the host that the buyer is ready to spend credits.
   */
  onSubmitHire?: SubmitHireHandler;
  /**
   * Called when the renderer would open a `link_button` or external
   * redirect. Host can override navigation (e.g. router.push) or leave
   * undefined to fall back to `window.location.assign`.
   */
  onNavigate?: (url: string, target?: string) => void;
  /**
   * Render a loading indicator while an action is in flight. Defaults
   * to a small grey spinner inside the button.
   */
  loadingFallback?: ReactNode;
  /**
   * Extra class name to apply to the root container for host styling.
   */
  className?: string;
}
