/**
 * Canvas Kit v2 state model — in-memory reducer consumed by the renderer.
 *
 * The state tree is the same nested-record shape the expression engine
 * evaluates against:
 *
 *   {
 *     form:   { [blockId]: value, … },   // auto-tracked by form inputs
 *     custom: { [key]: value, … },       // populated from initial_state
 *     wizard: { step: number },          // driven by <Wizard>
 *     ui:     { modals: { … }, drawers: { … } },
 *     auth:   { jwt, hire_id, buyer_id … },  // injected by the host
 *     meta:   { surface, buyer_id … },   // read-only host metadata
 *   }
 *
 * We deliberately keep the reducer tiny and plain-JS — no Redux, no
 * Zustand — because:
 *
 *   • The tree is small (< 100 keys for any realistic canvas).
 *   • Server-side renderers (for docs / preview) must be able to run
 *     this without a browser. A plain reducer is trivially SSR-safe.
 *   • Devs reading the code should be able to follow the data flow in
 *     one file without leaving the package.
 */

import type { StateTree } from "@renowide/types/expression";

export type StatePatchOp =
  | { op: "set"; path: string; value: unknown }
  | { op: "unset"; path: string }
  | { op: "merge"; path: string; value: Record<string, unknown> }
  | { op: "push"; path: string; value: unknown };

export interface CanvasStateAction {
  type: "patch";
  ops: StatePatchOp[];
}

export const EMPTY_STATE: StateTree = {
  form: {},
  custom: {},
  wizard: { step: 0 },
  ui: { modals: {}, drawers: {} },
  auth: {},
  meta: {},
};

/**
 * Deep-clone only the root namespaces (form / custom / …) that a patch
 * touches. We keep unaffected branches by reference so React's re-render
 * path stays cheap for big canvases.
 */
export function applyPatch(state: StateTree, ops: StatePatchOp[]): StateTree {
  if (!ops.length) return state;

  // Clone only the namespaces we need to touch.
  const touchedNamespaces = new Set<string>();
  for (const op of ops) {
    const [ns] = splitPath(op.path);
    if (ns) touchedNamespaces.add(ns);
  }

  const next: StateTree = { ...state };
  for (const ns of touchedNamespaces) {
    next[ns] = cloneShallow(state[ns]);
  }

  for (const op of ops) {
    const parts = splitPath(op.path);
    if (parts.length === 0) continue;

    switch (op.op) {
      case "set":
        setPath(next, parts, op.value);
        break;
      case "unset":
        unsetPath(next, parts);
        break;
      case "merge": {
        const current = getPath(next, parts);
        const merged =
          current && typeof current === "object" && !Array.isArray(current)
            ? { ...(current as Record<string, unknown>), ...op.value }
            : { ...op.value };
        setPath(next, parts, merged);
        break;
      }
      case "push": {
        const current = getPath(next, parts);
        const arr = Array.isArray(current) ? [...current, op.value] : [op.value];
        setPath(next, parts, arr);
        break;
      }
    }
  }
  return next;
}

function splitPath(path: string): string[] {
  return path.split(".").filter(Boolean);
}

function cloneShallow(value: unknown): unknown {
  if (Array.isArray(value)) return [...value];
  if (value && typeof value === "object") {
    return { ...(value as Record<string, unknown>) };
  }
  return value;
}

function getPath(root: Record<string, unknown>, parts: string[]): unknown {
  let cur: unknown = root;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function setPath(root: Record<string, unknown>, parts: string[], value: unknown): void {
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const existing = cur[key];
    if (existing === null || existing === undefined || typeof existing !== "object") {
      cur[key] = {};
    } else {
      // Shallow clone intermediate nodes to avoid mutating referenced state.
      cur[key] = { ...(existing as Record<string, unknown>) };
    }
    cur = cur[key] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

function unsetPath(root: Record<string, unknown>, parts: string[]): void {
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const next = cur[key];
    if (!next || typeof next !== "object") return;
    cur[key] = { ...(next as Record<string, unknown>) };
    cur = cur[key] as Record<string, unknown>;
  }
  delete cur[parts[parts.length - 1]!];
}

export function reducer(state: StateTree, action: CanvasStateAction): StateTree {
  switch (action.type) {
    case "patch":
      return applyPatch(state, action.ops);
    default:
      return state;
  }
}

/** Merge a namespace-level patch that the host wants to impose. */
export function mergeNamespaces(
  state: StateTree,
  overrides: Partial<StateTree>,
): StateTree {
  return { ...state, ...overrides };
}
