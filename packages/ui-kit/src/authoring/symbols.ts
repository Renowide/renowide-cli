/**
 * Internal marker symbol used by authoring components to identify
 * themselves to `renderToJson`. Every `<Header>`, `<ActionButton>`, …
 * component has a `.__canvasBlock` property carrying its block `type`
 * and a list of children prop names to walk into when serialising.
 *
 * This approach is much cheaper than introspecting the rendered JSX tree
 * with React internals (no private API access, no instanceof checks, no
 * react-reconciler dependency).
 */

import type { ReactElement } from "react";

export interface CanvasBlockMeta {
  /** Canvas Kit v2 block type (e.g. "header", "action_button"). */
  type: string;
  /**
   * Map from React-side prop name → JSON-side prop name.
   * Used for renaming (e.g. authoring `text` → JSON `source` for markdown).
   * If absent, all props go through unchanged.
   */
  propMap?: Record<string, string>;
  /**
   * Keys on `props` that should be emitted at block-root (like `id`, `when`)
   * instead of being nested under `props`.
   */
  rootKeys?: string[];
  /**
   * Optional child prop walker. Return an array of named buckets; each
   * bucket becomes a child array on the block JSON under the given key.
   * Defaults to `{ children: "children" }` when omitted.
   */
  childrenKey?: string;
  /**
   * For `conditional` blocks which have both `children` (if-branch) and
   * `else` (else-branch) arrays.
   */
  extraChildrenKey?: { prop: string; json: string };
  /**
   * For `wizard` blocks which emit `steps` rather than `children`.
   */
  childrenJsonKey?: string;
}

export const CANVAS_BLOCK_META = Symbol.for("@renowide/ui-kit/canvasBlockMeta");

export type CanvasAuthoringElement = ReactElement & {
  type: { [CANVAS_BLOCK_META]?: CanvasBlockMeta };
};
