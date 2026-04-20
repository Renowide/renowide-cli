/**
 * `renderToJson(<Canvas>...</Canvas>)` — compile an authoring TSX tree into
 * the Canvas Kit v2 JSON format that the Renowide backend accepts.
 *
 * Design constraints:
 *
 *   • Zero React runtime dependency for walking. We read `ReactElement`
 *     shapes directly (type, props, children) — no react-dom, no hooks,
 *     no suspense. The authoring components themselves return `null` at
 *     runtime; this function never asks React to actually render them.
 *
 *   • Strictly typed output. We validate the result with
 *     `CanvasResponseSchema` before returning so the compiler catches
 *     authoring mistakes (duplicate ids, missing `id`, invalid prop
 *     enums) at build time instead of at buyer-device time.
 *
 *   • No user-land fragments. Fragments are flattened transparently so
 *     `<><Header …/><Markdown …/></>` works as expected.
 *
 *   • No raw HTML nor raw strings. A stray `"hello"` in the tree is a
 *     compiler error, not silent JSON pollution.
 *
 * Anything NOT written with a `@renowide/ui-kit` authoring component
 * (plain HTML elements, arbitrary React components from other libs) is
 * rejected. This is by design: Canvas JSON has a closed block
 * vocabulary, and sneaking in `<div>` would break every renderer the
 * moment Renowide's proxy rejected the payload.
 */

import type { ReactElement, ReactNode } from "react";
import { Children, Fragment, isValidElement } from "react";

import {
  CanvasResponseSchema,
  type CanvasResponse,
  validateCanvasStructure,
} from "@renowide/types/canvas";

import { CANVAS_BLOCK_META, type CanvasBlockMeta } from "./symbols.js";

export interface RenderToJsonOptions {
  /** Skip the schema validation step (not recommended in CI). */
  skipValidation?: boolean;
  /** Skip the structural validation step (not recommended in CI). */
  skipStructuralValidation?: boolean;
}

export function renderToJson(
  root: ReactNode,
  opts: RenderToJsonOptions = {},
): CanvasResponse {
  if (!isValidElement(root)) {
    throw new RenderToJsonError(
      "root must be a single <Canvas>…</Canvas> element",
    );
  }
  const rootMeta = getMeta(root);
  if (!rootMeta || rootMeta.type !== "__canvas_root__") {
    throw new RenderToJsonError(
      "root must be <Canvas>…</Canvas> (imported from @renowide/ui-kit/authoring)",
    );
  }

  const json = serialiseCanvas(root, rootMeta);

  if (opts.skipValidation !== true) {
    const parsed = CanvasResponseSchema.safeParse(json);
    if (!parsed.success) {
      throw new RenderToJsonError(
        "renderToJson output failed schema validation:\n" +
          parsed.error.issues
            .map((i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`)
            .join("\n"),
      );
    }
    if (opts.skipStructuralValidation !== true) {
      try {
        validateCanvasStructure(parsed.data);
      } catch (err) {
        throw new RenderToJsonError(
          `renderToJson output failed structural validation: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return parsed.data;
  }
  return json as CanvasResponse;
}

// ─── Internals ──────────────────────────────────────────────────────────────

export class RenderToJsonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RenderToJsonError";
  }
}

function getMeta(element: ReactElement): CanvasBlockMeta | undefined {
  const t = element.type as unknown;
  if (typeof t !== "function") return undefined;
  const carrier = t as unknown as { [CANVAS_BLOCK_META]?: CanvasBlockMeta };
  return carrier[CANVAS_BLOCK_META];
}

function flattenNodes(nodes: ReactNode): ReactElement[] {
  const out: ReactElement[] = [];
  Children.forEach(nodes, (node) => {
    if (node === null || node === undefined || node === false) return;
    if (node === true) return;
    if (typeof node === "string" || typeof node === "number") {
      throw new RenderToJsonError(
        `raw ${typeof node} "${String(node).slice(0, 40)}" is not allowed — wrap it in <Markdown> or put it in a prop`,
      );
    }
    if (!isValidElement(node)) {
      throw new RenderToJsonError(
        `unexpected child node: ${String(node)}; expected a @renowide/ui-kit block`,
      );
    }
    if (node.type === Fragment) {
      const fragChildren = (node.props as { children?: ReactNode }).children;
      out.push(...flattenNodes(fragChildren));
      return;
    }
    out.push(node);
  });
  return out;
}

function serialiseCanvas(
  element: ReactElement,
  meta: CanvasBlockMeta,
): unknown {
  const props = element.props as Record<string, unknown>;
  const {
    surface,
    uiKitVersion,
    cacheTtlSeconds,
    initialState,
    children,
    ...rest
  } = props as {
    surface?: string;
    uiKitVersion?: string;
    cacheTtlSeconds?: number;
    initialState?: Record<string, unknown>;
    children?: ReactNode;
    [key: string]: unknown;
  };

  for (const unexpected of Object.keys(rest)) {
    throw new RenderToJsonError(
      `<Canvas> got unexpected prop "${unexpected}" — only surface, uiKitVersion, cacheTtlSeconds, initialState are allowed`,
    );
  }

  const blocks = flattenNodes(children).map(serialiseBlock);
  const out: Record<string, unknown> = {
    ui_kit_version: uiKitVersion ?? "2.0.0",
    surface,
    blocks,
  };
  if (cacheTtlSeconds !== undefined) out.cache_ttl_seconds = cacheTtlSeconds;
  if (initialState !== undefined) out.initial_state = initialState;
  return out;
}

function serialiseBlock(element: ReactElement): unknown {
  const meta = getMeta(element);
  if (!meta) {
    throw new RenderToJsonError(
      `<${(element.type as { displayName?: string } | string | null)?.toString() ?? "?"}> is not a @renowide/ui-kit block — did you mean to import from @renowide/ui-kit/authoring?`,
    );
  }
  if (meta.type === "__canvas_root__") {
    throw new RenderToJsonError(
      "<Canvas> cannot be nested inside another <Canvas>",
    );
  }

  const { children, ["else"]: elseChildren, id, when, ...rawProps } = element.props as Record<string, unknown>;

  if (typeof id !== "string") {
    throw new RenderToJsonError(
      `<${meta.type}> is missing the required "id" prop`,
    );
  }

  // Map authoring-side prop names → JSON-side prop names.
  const renamed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rawProps)) {
    if (value === undefined) continue;
    const jsonKey = meta.propMap?.[key] ?? key;
    renamed[jsonKey] = value;
  }

  const block: Record<string, unknown> = {
    id,
    type: meta.type,
    props: renamed,
  };
  if (when !== undefined) block.when = when;

  // Walk children — either into a single array or two (conditional).
  if (children !== undefined) {
    const kids = flattenNodes(children as ReactNode).map(serialiseBlock);
    const key = meta.childrenJsonKey ?? "children";
    block[key] = kids;
  }
  if (meta.extraChildrenKey && elseChildren !== undefined) {
    const extras = flattenNodes(elseChildren as ReactNode).map(serialiseBlock);
    block[meta.extraChildrenKey.json] = extras;
  }

  // Divider special-case: `props` is always empty in JSON to match
  // `DividerPropsSchema.strict()` (which accepts `{}` with defaults).
  if (meta.type === "divider") {
    block.props = {};
  }

  return block;
}
