/**
 * Standalone React renderer for Canvas Kit v2.
 *
 * Design notes
 *
 * 1. Self-contained — no Redux / Zustand / MUI / Chakra. Styling is
 *    inline to keep the bundle tiny (≈ 12 KB gzipped before peerDeps).
 *    Hosts that want richer styling can override via the `className`
 *    prop and CSS custom properties on the root container.
 *
 * 2. State is a `useReducer` tree shaped like the expression grammar's
 *    `StateTree` — form / custom / wizard / ui / auth / meta. We apply
 *    host-provided overrides (typically the `auth` namespace) on every
 *    render, and auto-populate `form[<blockId>]` whenever an input
 *    changes.
 *
 * 3. Conditional rendering uses the canonical expression evaluator from
 *    `@renowide/types/expression` so `when`, `disabled_when`,
 *    `open_when`, etc. behave exactly the same in the renderer, the
 *    authoring layer, the backend proxy, and the CLI validator. There
 *    is one source of truth for grammar.
 *
 * 4. `action_button` clicks fan out via host-provided `onAction`. For
 *    the reserved `__submit_hire__` action we short-circuit into
 *    `onSubmitHire` without ever hitting the network — that call is
 *    Renowide-internal and must not leak buyer JSON to the dev server.
 *
 * 5. `custom_embed` blocks are rendered as `<iframe>`s with a strict
 *    sandbox and a postMessage bridge. The bridge listens only for
 *    messages the canvas opts into (via `allow_postmessage_events`)
 *    and dispatches patches / toasts / actions back into the host.
 */

import {
  Fragment,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import type {
  CanvasBlock,
  CanvasResponse,
} from "@renowide/types/canvas";
import {
  evalBoolean,
  evalExpression,
  interpolate,
  type StateTree,
} from "@renowide/types/expression";

import {
  EMPTY_STATE,
  applyPatch,
  mergeNamespaces,
  reducer,
  type StatePatchOp,
} from "./state.js";
import type {
  ActionContext,
  ActionHandler,
  CanvasRendererProps,
  SubmitHireHandler,
} from "./types.js";

// ─── Context ────────────────────────────────────────────────────────────────

interface RendererContextValue {
  state: StateTree;
  patch: (ops: StatePatchOp[]) => void;
  onAction?: ActionHandler;
  onSubmitHire?: SubmitHireHandler;
  onNavigate?: (url: string, target?: string) => void;
}

const RendererContext = createContext<RendererContextValue | null>(null);

function useRenderer(): RendererContextValue {
  const ctx = useContext(RendererContext);
  if (!ctx) {
    throw new Error(
      "Canvas block rendered outside <CanvasRenderer> — this shouldn't happen",
    );
  }
  return ctx;
}

/**
 * Safely read a namespace of the state tree as a record. StateTree is typed
 * as `Record<string, unknown>` (to mirror the backend expression engine),
 * so we narrow to a plain dict when we know the namespace is populated.
 */
function ns(state: StateTree, name: string): Record<string, unknown> {
  const v = state[name];
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

// ─── Public component ───────────────────────────────────────────────────────

export function CanvasRenderer(props: CanvasRendererProps) {
  const { canvas, stateOverrides, onAction, onSubmitHire, onNavigate, className } = props;

  const initialState = useMemo<StateTree>(() => {
    const base: StateTree = { ...EMPTY_STATE };
    for (const [ns, value] of Object.entries(canvas.initial_state ?? {})) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        base[ns] = { ...(value as Record<string, unknown>) };
      } else {
        base[ns] = value as Record<string, unknown>;
      }
    }
    return stateOverrides ? mergeNamespaces(base, stateOverrides) : base;
  }, [canvas.initial_state, stateOverrides]);

  const [state, dispatch] = useReducer(reducer, initialState);

  // If host-provided overrides change (e.g. auth JWT refreshes), re-merge
  // them into state without resetting the form / custom namespaces the
  // user has already filled in.
  useEffect(() => {
    if (!stateOverrides) return;
    const overrideOps: StatePatchOp[] = [];
    for (const [nsKey, value] of Object.entries(stateOverrides)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        overrideOps.push({
          op: "merge",
          path: nsKey,
          value: value as Record<string, unknown>,
        });
      } else {
        overrideOps.push({ op: "set", path: nsKey, value });
      }
    }
    dispatch({ type: "patch", ops: overrideOps });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(stateOverrides)]);

  const patch = useCallback((ops: StatePatchOp[]) => {
    dispatch({ type: "patch", ops });
  }, []);

  const ctxValue = useMemo<RendererContextValue>(
    () => ({ state, patch, onAction, onSubmitHire, onNavigate }),
    [state, patch, onAction, onSubmitHire, onNavigate],
  );

  return (
    <RendererContext.Provider value={ctxValue}>
      <div
        className={className}
        style={{
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
          color: "#0f172a",
          lineHeight: 1.5,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {canvas.blocks.map((b) => (
          <RenderBlock key={b.id} block={b} />
        ))}
      </div>
    </RendererContext.Provider>
  );
}

// ─── Block dispatcher ───────────────────────────────────────────────────────

function RenderBlock({ block }: { block: CanvasBlock }): ReactNode {
  const { state } = useRenderer();
  if (block.when && !safeBool(block.when, state, true)) return null;

  switch (block.type) {
    case "header":
      return <HeaderBlock block={block} />;
    case "markdown":
      return <MarkdownBlock block={block} />;
    case "divider":
      return <DividerBlock />;
    case "info_callout":
      return <InfoCalloutBlock block={block} />;
    case "image":
      return <ImageBlock block={block} />;
    case "text_input":
      return <TextInputBlock block={block} />;
    case "checkbox":
      return <CheckboxBlock block={block} />;
    case "date_picker":
      return <DatePickerBlock block={block} />;
    case "file_upload":
      return <FileUploadBlock block={block} />;
    case "code_block":
      return <CodeBlockBlock block={block} />;
    case "kpi":
      return <KpiBlock block={block} />;
    case "cta":
      return <CtaBlock block={block} />;
    case "link_button":
      return <LinkButtonBlock block={block} />;
    case "quick_reply":
      return <QuickReplyBlock block={block} />;
    case "oauth_button":
      return <OAuthButtonBlock block={block} />;
    case "api_key_input":
      return <ApiKeyInputBlock block={block} />;
    case "integration_button":
      return <IntegrationButtonBlock block={block} />;
    case "table":
      return <TableBlock block={block} />;
    case "chart":
      return <ChartBlock block={block} />;
    case "state_subscription":
      return null;
    case "action_button":
      return <ActionButtonBlock block={block} />;
    case "custom_embed":
      return <CustomEmbedBlock block={block} />;
    case "pdf_viewer":
      return <PdfViewerBlock block={block} />;
    case "wizard":
      return <WizardBlock block={block} />;
    case "wizard_step":
      return null;
    case "conditional":
      return <ConditionalBlock block={block} />;
    case "modal":
      return <ModalBlock block={block} />;
    case "drawer":
      return <DrawerBlock block={block} />;
    case "layout_grid":
      return <LayoutGridBlock block={block} />;
    case "layout_stack":
      return <LayoutStackBlock block={block} />;
    default: {
      const _exhaustive: never = block;
      void _exhaustive;
      return null;
    }
  }
}

function safeBool(expr: string, state: StateTree, defaultValue: boolean): boolean {
  try {
    return evalBoolean(expr, state);
  } catch (err) {
    if (typeof console !== "undefined") {
      console.warn(`[canvas] expression eval failed: ${expr}`, err);
    }
    return defaultValue;
  }
}

function safeInterpolate(text: string, state: StateTree): string {
  try {
    return interpolate(text, state);
  } catch (err) {
    if (typeof console !== "undefined") {
      console.warn(`[canvas] interpolate failed: ${text}`, err);
    }
    return text;
  }
}

// ─── Leaf block renderers ───────────────────────────────────────────────────

function HeaderBlock({ block }: { block: Extract<CanvasBlock, { type: "header" }> }) {
  const { state } = useRenderer();
  const Tag = (`h${block.props.level}` as const);
  const text = safeInterpolate(block.props.text, state);
  const style: CSSProperties = {
    margin: 0,
    fontWeight: 600,
    fontSize: block.props.level === 1 ? 28 : block.props.level === 2 ? 22 : 18,
  };
  return <Tag style={style}>{text}</Tag>;
}

function MarkdownBlock({ block }: { block: Extract<CanvasBlock, { type: "markdown" }> }) {
  const { state } = useRenderer();
  const source = safeInterpolate(block.props.source, state);
  // Intentionally NOT a full markdown parser — we apply only paragraph
  // splitting + link auto-detection. Hosts that need GFM can wrap the
  // renderer and pre-parse markdown blocks before passing them in.
  const html = renderBasicMarkdown(source);
  return (
    <div
      style={{ fontSize: 15, color: "#334155" }}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function DividerBlock() {
  return <hr style={{ border: 0, borderTop: "1px solid #e2e8f0", margin: 0 }} />;
}

function InfoCalloutBlock({
  block,
}: {
  block: Extract<CanvasBlock, { type: "info_callout" }>;
}) {
  const { state } = useRenderer();
  const text = safeInterpolate(block.props.text, state);
  const title = block.props.title ? safeInterpolate(block.props.title, state) : undefined;
  const palette: Record<string, { bg: string; fg: string; border: string }> = {
    info: { bg: "#eff6ff", fg: "#1e3a8a", border: "#bfdbfe" },
    success: { bg: "#ecfdf5", fg: "#065f46", border: "#a7f3d0" },
    warn: { bg: "#fffbeb", fg: "#78350f", border: "#fde68a" },
    error: { bg: "#fef2f2", fg: "#7f1d1d", border: "#fecaca" },
  };
  const p = palette[block.props.severity] ?? palette.info!;
  return (
    <div
      style={{
        background: p.bg,
        color: p.fg,
        border: `1px solid ${p.border}`,
        borderRadius: 8,
        padding: "12px 14px",
        fontSize: 14,
      }}
    >
      {title && <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>}
      <div>{text}</div>
    </div>
  );
}

function ImageBlock({ block }: { block: Extract<CanvasBlock, { type: "image" }> }) {
  const { props } = block;
  return (
    <figure style={{ margin: 0 }}>
      <img
        src={props.url}
        alt={props.alt}
        style={{ maxWidth: "100%", maxHeight: props.max_height, borderRadius: 8 }}
      />
      {props.caption && (
        <figcaption style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
          {props.caption}
        </figcaption>
      )}
    </figure>
  );
}

function TextInputBlock({
  block,
}: {
  block: Extract<CanvasBlock, { type: "text_input" }>;
}) {
  const { state, patch } = useRenderer();
  const raw = (ns(state, "form")[block.id] ?? block.props.default ?? "") as string;
  const Component = block.props.multiline ? "textarea" : "input";
  return (
    <label style={labelStyle}>
      <span style={labelTextStyle}>
        {block.props.label}
        {block.props.required && <em style={{ color: "#dc2626", marginLeft: 4 }}>*</em>}
      </span>
      <Component
        value={raw}
        placeholder={block.props.placeholder}
        pattern={block.props.pattern}
        required={block.props.required}
        maxLength={block.props.max_length}
        onChange={(e: any) =>
          patch([{ op: "set", path: `form.${block.id}`, value: e.target.value }])
        }
        style={inputStyle(Component === "textarea")}
      />
      {block.props.help && <span style={helpStyle}>{block.props.help}</span>}
    </label>
  );
}

function CheckboxBlock({
  block,
}: {
  block: Extract<CanvasBlock, { type: "checkbox" }>;
}) {
  const { state, patch } = useRenderer();
  const value = Boolean(ns(state, "form")[block.id] ?? block.props.default);
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 14,
        cursor: "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={value}
        required={block.props.required}
        onChange={(e) =>
          patch([{ op: "set", path: `form.${block.id}`, value: e.target.checked }])
        }
      />
      <span>{block.props.label}</span>
    </label>
  );
}

function DatePickerBlock({
  block,
}: {
  block: Extract<CanvasBlock, { type: "date_picker" }>;
}) {
  const { state, patch } = useRenderer();
  const value = (ns(state, "form")[block.id] ?? block.props.default ?? "") as string;
  return (
    <label style={labelStyle}>
      <span style={labelTextStyle}>
        {block.props.label}
        {block.props.required && <em style={{ color: "#dc2626", marginLeft: 4 }}>*</em>}
      </span>
      <input
        type={block.props.mode === "datetime" ? "datetime-local" : "date"}
        value={value}
        min={block.props.min}
        max={block.props.max}
        required={block.props.required}
        onChange={(e) =>
          patch([{ op: "set", path: `form.${block.id}`, value: e.target.value }])
        }
        style={inputStyle(false)}
      />
    </label>
  );
}

function FileUploadBlock({
  block,
}: {
  block: Extract<CanvasBlock, { type: "file_upload" }>;
}) {
  const { patch } = useRenderer();
  return (
    <label style={labelStyle}>
      <span style={labelTextStyle}>
        {block.props.label}
        {block.props.required && <em style={{ color: "#dc2626", marginLeft: 4 }}>*</em>}
      </span>
      <input
        type="file"
        multiple={block.props.multiple}
        accept={block.props.accept?.length ? block.props.accept.join(",") : undefined}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []).map((f) => ({
            name: f.name,
            size: f.size,
            type: f.type,
          }));
          patch([{ op: "set", path: `form.${block.id}`, value: files }]);
        }}
      />
      {block.props.help && <span style={helpStyle}>{block.props.help}</span>}
    </label>
  );
}

function CodeBlockBlock({
  block,
}: {
  block: Extract<CanvasBlock, { type: "code_block" }>;
}) {
  return (
    <pre
      style={{
        background: "#0f172a",
        color: "#e2e8f0",
        borderRadius: 8,
        padding: 12,
        fontSize: 13,
        lineHeight: 1.55,
        overflow: "auto",
        margin: 0,
      }}
    >
      {block.props.filename && (
        <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 6 }}>
          {block.props.filename}
        </div>
      )}
      <code>{block.props.source}</code>
    </pre>
  );
}

function KpiBlock({ block }: { block: Extract<CanvasBlock, { type: "kpi" }> }) {
  const { state } = useRenderer();
  const value = safeInterpolate(block.props.value, state);
  const trendChar: Record<string, string> = {
    up: "▲",
    down: "▼",
    flat: "▬",
    none: "",
  };
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: 12,
        border: "1px solid #e2e8f0",
        borderRadius: 8,
      }}
    >
      <span style={{ fontSize: 13, color: "#64748b" }}>{block.props.label}</span>
      <span style={{ fontSize: 24, fontWeight: 600 }}>{value}</span>
      {block.props.trend && block.props.trend !== "none" && (
        <span style={{ fontSize: 12, color: "#475569" }}>
          {trendChar[block.props.trend]} {block.props.trend_label ?? ""}
        </span>
      )}
    </div>
  );
}

function CtaBlock({ block }: { block: Extract<CanvasBlock, { type: "cta" }> }) {
  const { state, onAction } = useRenderer();
  const disabled =
    block.props.disabled ||
    (block.props.disabled_when ? safeBool(block.props.disabled_when, state, false) : false);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={async () => {
        if (disabled) return;
        await onAction?.({
          blockId: block.id,
          action: block.props.action,
          payload: {},
          state,
        });
      }}
      style={buttonStyle(block.props.variant, disabled)}
    >
      {block.props.label}
    </button>
  );
}

function LinkButtonBlock({
  block,
}: {
  block: Extract<CanvasBlock, { type: "link_button" }>;
}) {
  const { onNavigate } = useRenderer();
  const target = block.props.external ? "_blank" : "_self";
  return (
    <a
      href={block.props.url}
      target={target}
      rel={block.props.external ? "noreferrer noopener" : undefined}
      onClick={(e) => {
        if (onNavigate) {
          e.preventDefault();
          onNavigate(block.props.url, target);
        }
      }}
      style={{
        ...buttonStyle(block.props.variant === "primary" ? "primary" : "secondary", false),
        textDecoration: "none",
        display: "inline-block",
        textAlign: "center",
      }}
    >
      {block.props.label}
    </a>
  );
}

function QuickReplyBlock({
  block,
}: {
  block: Extract<CanvasBlock, { type: "quick_reply" }>;
}) {
  const { state, onAction } = useRenderer();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {block.props.prompts.map((p, i) => (
        <button
          key={i}
          type="button"
          onClick={() =>
            onAction?.({
              blockId: block.id,
              action: "quick_reply",
              payload: { prompt: p },
              state,
            })
          }
          style={chipStyle}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

function OAuthButtonBlock({
  block,
}: {
  block: Extract<CanvasBlock, { type: "oauth_button" }>;
}) {
  const { state, onAction } = useRenderer();
  return (
    <button
      type="button"
      onClick={() =>
        onAction?.({
          blockId: block.id,
          action: "oauth_connect",
          payload: { provider: block.props.provider, scopes: block.props.scopes ?? [] },
          state,
        })
      }
      style={buttonStyle("secondary", false)}
    >
      {block.props.label ?? `Connect ${block.props.provider}`}
    </button>
  );
}

function ApiKeyInputBlock({
  block,
}: {
  block: Extract<CanvasBlock, { type: "api_key_input" }>;
}) {
  const { state, patch } = useRenderer();
  const value = (ns(state, "form")[block.id] ?? "") as string;
  return (
    <label style={labelStyle}>
      <span style={labelTextStyle}>
        {block.props.label}
        {block.props.required && <em style={{ color: "#dc2626", marginLeft: 4 }}>*</em>}
      </span>
      <input
        type="password"
        value={value}
        autoComplete="off"
        placeholder={block.props.placeholder}
        required={block.props.required}
        onChange={(e) =>
          patch([{ op: "set", path: `form.${block.id}`, value: e.target.value }])
        }
        style={inputStyle(false)}
      />
      {block.props.help_url && (
        <a
          href={block.props.help_url}
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: 12, color: "#2563eb", marginTop: 2 }}
        >
          Where do I find this?
        </a>
      )}
    </label>
  );
}

function IntegrationButtonBlock({
  block,
}: {
  block: Extract<CanvasBlock, { type: "integration_button" }>;
}) {
  const { state, onAction } = useRenderer();
  return (
    <button
      type="button"
      onClick={() =>
        onAction?.({
          blockId: block.id,
          action: "integration_connect",
          payload: { provider: block.props.provider, scopes: block.props.scopes ?? [] },
          state,
        })
      }
      style={buttonStyle("secondary", false)}
    >
      {block.props.label ?? `Connect ${block.props.provider}`}
    </button>
  );
}

function TableBlock({ block }: { block: Extract<CanvasBlock, { type: "table" }> }) {
  const { state } = useRenderer();
  const rows = block.props.rows_from
    ? (safeEval(block.props.rows_from, state) as Record<string, unknown>[] | undefined) ?? []
    : block.props.rows ?? [];
  if (rows.length === 0 && block.props.empty_state) {
    return (
      <div style={{ color: "#64748b", fontSize: 14 }}>{block.props.empty_state}</div>
    );
  }
  return (
    <div style={{ overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <thead>
          <tr>
            {block.props.columns.map((c) => (
              <th
                key={c.key}
                style={{
                  textAlign: c.align,
                  padding: "6px 8px",
                  borderBottom: "1px solid #e2e8f0",
                  fontWeight: 600,
                  width: c.width,
                }}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {block.props.columns.map((c) => (
                <td
                  key={c.key}
                  style={{
                    padding: "6px 8px",
                    borderBottom: "1px solid #f1f5f9",
                    textAlign: c.align,
                  }}
                >
                  {String(row[c.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartBlock({ block }: { block: Extract<CanvasBlock, { type: "chart" }> }) {
  // Non-trivial to render a real chart without a dep; we show a textual
  // fallback + legend. Hosts that need the real thing can override by
  // swapping CanvasRenderer for a custom fork or by rendering this
  // block via a `custom_embed`.
  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 12 }}>
      {block.props.title && (
        <div style={{ fontWeight: 600, marginBottom: 6 }}>{block.props.title}</div>
      )}
      <div style={{ color: "#64748b", fontSize: 13, marginBottom: 8 }}>
        {block.props.chart_type} chart — install your own chart lib to render visually
      </div>
      <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13 }}>
        {block.props.series.map((s, i) => (
          <li key={i}>
            <strong>{s.label}</strong>:{" "}
            {s.data.map((d, j) => (
              <span key={j} style={{ marginRight: 6 }}>
                {block.props.labels[j] ?? ""}={d}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ActionButtonBlock({
  block,
}: {
  block: Extract<CanvasBlock, { type: "action_button" }>;
}) {
  const { state, patch, onAction, onSubmitHire } = useRenderer();
  const [loading, setLoading] = useState(false);

  const disabled =
    loading ||
    (block.props.disabled_when ? safeBool(block.props.disabled_when, state, false) : false);

  async function run() {
    if (disabled) return;
    if (block.props.confirm) {
      if (typeof window !== "undefined") {
        const ok = window.confirm(
          `${block.props.confirm.title}\n\n${block.props.confirm.body}`,
        );
        if (!ok) return;
      }
    }

    const payload: Record<string, unknown> = { ...(block.props.payload ?? {}) };
    if (block.props.payload_from) {
      const extra = safeEval(block.props.payload_from, state);
      if (extra && typeof extra === "object" && !Array.isArray(extra)) {
        Object.assign(payload, extra);
      }
    }

    if (block.props.action === "__submit_hire__") {
      setLoading(true);
      try {
        await onSubmitHire?.({ payload, state });
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!onAction) {
      if (typeof console !== "undefined") {
        console.warn(
          `[canvas] action_button "${block.id}" fired but no onAction handler provided`,
        );
      }
      return;
    }

    setLoading(true);
    try {
      const ctx: ActionContext = { blockId: block.id, action: block.props.action, payload, state };
      const result = await onAction(ctx);
      if (result?.state_patches?.length) patch(result.state_patches);
      if (result?.toast && typeof console !== "undefined") {
        console.log(`[canvas toast/${result.toast.severity}]`, result.toast.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={run}
      style={buttonStyle(block.props.variant, disabled)}
    >
      {loading && block.props.loading_label ? block.props.loading_label : block.props.label}
    </button>
  );
}

function CustomEmbedBlock({
  block,
}: {
  block: Extract<CanvasBlock, { type: "custom_embed" }>;
}) {
  const { state, patch, onAction } = useRenderer();
  const src = safeInterpolate(block.props.src, state);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [dynamicHeight, setDynamicHeight] = useState<string | null>(null);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (!iframeRef.current || ev.source !== iframeRef.current.contentWindow) return;
      const data = ev.data;
      if (!data || typeof data !== "object") return;

      const allow = new Set(block.props.allow_postmessage_events ?? []);
      switch (data.type) {
        case "ready":
          if (!allow.has("ready")) return;
          return;
        case "resize":
          if (!allow.has("resize")) return;
          if (typeof data.height === "number" && block.props.resize === "auto") {
            setDynamicHeight(`${Math.max(0, Math.min(4000, data.height))}px`);
          }
          return;
        case "toast":
          if (!allow.has("toast")) return;
          if (typeof console !== "undefined") {
            console.log(`[custom_embed/${block.id}/toast]`, data.message);
          }
          return;
        case "action":
          if (!allow.has("action")) return;
          if (typeof data.action === "string") {
            void onAction?.({
              blockId: block.id,
              action: data.action,
              payload: (data.payload ?? {}) as Record<string, unknown>,
              state,
            }).then((result) => {
              if (result?.state_patches?.length) patch(result.state_patches);
            });
          }
          return;
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [block.id, block.props.allow_postmessage_events, block.props.resize, onAction, patch, state]);

  const height = dynamicHeight ?? block.props.height;
  return (
    <iframe
      ref={iframeRef}
      src={src}
      title={block.id}
      sandbox={
        "allow-scripts allow-same-origin allow-forms allow-popups" +
        (block.props.allow_clipboard_write ? " allow-clipboard-write" : "")
      }
      style={{
        width: "100%",
        height,
        minHeight: block.props.min_height,
        maxHeight: block.props.max_height,
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        background: "#fff",
      }}
    />
  );
}

function PdfViewerBlock({
  block,
}: {
  block: Extract<CanvasBlock, { type: "pdf_viewer" }>;
}) {
  const { state } = useRenderer();
  const url = safeInterpolate(block.props.url, state);
  return (
    <object
      data={`${url}#page=${block.props.page}${block.props.toolbar ? "" : "&toolbar=0"}`}
      type="application/pdf"
      style={{
        width: "100%",
        height: block.props.height,
        border: "1px solid #e2e8f0",
        borderRadius: 8,
      }}
    >
      <a href={url} download={block.props.download_filename}>
        Download PDF
      </a>
    </object>
  );
}

// ─── Container block renderers ──────────────────────────────────────────────

function ConditionalBlock({
  block,
}: {
  block: Extract<CanvasBlock, { type: "conditional" }>;
}) {
  const { state } = useRenderer();
  const branch = safeBool(block.props.if, state, false)
    ? block.children
    : block.else ?? [];
  return (
    <Fragment>
      {branch.map((b) => (
        <RenderBlock key={b.id} block={b} />
      ))}
    </Fragment>
  );
}

function LayoutGridBlock({
  block,
}: {
  block: Extract<CanvasBlock, { type: "layout_grid" }>;
}) {
  const columns = block.props.columns;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: gapSize(block.props.gap),
      }}
    >
      {block.children.map((b) => (
        <RenderBlock key={b.id} block={b} />
      ))}
    </div>
  );
}

function LayoutStackBlock({
  block,
}: {
  block: Extract<CanvasBlock, { type: "layout_stack" }>;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: block.props.direction,
        alignItems:
          block.props.align === "stretch" ? "stretch" : block.props.align,
        justifyContent:
          block.props.justify === "space-between"
            ? "space-between"
            : block.props.justify === "space-around"
              ? "space-around"
              : block.props.justify,
        gap: gapSize(block.props.gap),
        flexWrap: block.props.wrap ? "wrap" : "nowrap",
      }}
    >
      {block.children.map((b) => (
        <RenderBlock key={b.id} block={b} />
      ))}
    </div>
  );
}

function ModalBlock({ block }: { block: Extract<CanvasBlock, { type: "modal" }> }) {
  const { state, patch } = useRenderer();
  const open = safeBool(block.props.open_when, state, false);
  if (!open) return null;
  const onClose = () => {
    if (block.props.on_close) {
      patch(
        block.props.on_close.map((op) => ({
          op: "set" as const,
          path: op.set,
          value: op.value ?? false,
        })),
      );
    }
  };
  return (
    <div
      role="dialog"
      aria-modal
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 20,
          maxWidth:
            block.props.size === "lg" ? 720 : block.props.size === "sm" ? 360 : 520,
          width: "95%",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        }}
      >
        {block.props.title && (
          <div style={{ fontSize: 18, fontWeight: 600 }}>{block.props.title}</div>
        )}
        {block.children.map((b) => (
          <RenderBlock key={b.id} block={b} />
        ))}
      </div>
    </div>
  );
}

function DrawerBlock({ block }: { block: Extract<CanvasBlock, { type: "drawer" }> }) {
  const { state, patch } = useRenderer();
  const open = safeBool(block.props.open_when, state, false);
  if (!open) return null;
  const onClose = () => {
    if (block.props.on_close) {
      patch(
        block.props.on_close.map((op) => ({
          op: "set" as const,
          path: op.set,
          value: op.value ?? false,
        })),
      );
    }
  };
  const sideStyle: CSSProperties = {
    position: "fixed",
    background: "#fff",
    boxShadow: "-12px 0 30px rgba(0,0,0,0.15)",
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    zIndex: 50,
    overflow: "auto",
  };
  const size = block.props.size === "lg" ? 520 : block.props.size === "sm" ? 280 : 380;
  if (block.props.side === "left") {
    Object.assign(sideStyle, { top: 0, bottom: 0, left: 0, width: size });
  } else if (block.props.side === "bottom") {
    Object.assign(sideStyle, { left: 0, right: 0, bottom: 0, height: size });
  } else {
    Object.assign(sideStyle, { top: 0, bottom: 0, right: 0, width: size });
  }
  return (
    <Fragment>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15, 23, 42, 0.3)",
          zIndex: 49,
        }}
      />
      <div style={sideStyle}>
        {block.children.map((b) => (
          <RenderBlock key={b.id} block={b} />
        ))}
      </div>
    </Fragment>
  );
}

function WizardBlock({ block }: { block: Extract<CanvasBlock, { type: "wizard" }> }) {
  const { state, patch, onSubmitHire } = useRenderer();
  const current = Number(ns(state, "wizard").step ?? 0);
  const steps = block.children;
  const step = steps[current];
  if (!step) return null;

  const nextEnabled = step.props.next_enabled_when
    ? safeBool(step.props.next_enabled_when, state, true)
    : true;
  const onBack = () => {
    if (current > 0 && block.props.allow_back) {
      patch([{ op: "set", path: "wizard.step", value: current - 1 }]);
    }
  };
  const isLast = current === steps.length - 1;
  const onNext = async () => {
    if (isLast) {
      await onSubmitHire?.({
        payload: {},
        state,
      });
      return;
    }
    patch([{ op: "set", path: "wizard.step", value: current + 1 }]);
  };

  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: 8,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {block.props.show_progress && (
        <div style={{ fontSize: 12, color: "#64748b" }}>
          Step {current + 1} of {steps.length}
        </div>
      )}
      <div style={{ fontSize: 18, fontWeight: 600 }}>{step.props.title}</div>
      {step.props.description && (
        <div style={{ fontSize: 14, color: "#475569" }}>{step.props.description}</div>
      )}
      {step.children.map((b) => (
        <RenderBlock key={b.id} block={b} />
      ))}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
        {block.props.allow_back && current > 0 && (
          <button type="button" onClick={onBack} style={buttonStyle("ghost", false)}>
            Back
          </button>
        )}
        {step.props.skippable && !isLast && (
          <button
            type="button"
            onClick={() => patch([{ op: "set", path: "wizard.step", value: current + 1 }])}
            style={buttonStyle("ghost", false)}
          >
            Skip
          </button>
        )}
        <button
          type="button"
          onClick={onNext}
          disabled={!nextEnabled}
          style={buttonStyle("primary", !nextEnabled)}
        >
          {isLast ? block.props.submit_label : step.props.next_label ?? "Next"}
        </button>
      </div>
    </div>
  );
}

// ─── Styling primitives ─────────────────────────────────────────────────────

const labelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const labelTextStyle: CSSProperties = {
  fontSize: 13,
  color: "#334155",
  fontWeight: 500,
};

const helpStyle: CSSProperties = {
  fontSize: 12,
  color: "#64748b",
  marginTop: 2,
};

function inputStyle(multiline: boolean): CSSProperties {
  return {
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 14,
    minHeight: multiline ? 80 : undefined,
    fontFamily: "inherit",
    outline: "none",
  };
}

function buttonStyle(
  variant: "primary" | "secondary" | "ghost" | "danger",
  disabled: boolean,
): CSSProperties {
  const palette: Record<string, { bg: string; fg: string; border: string }> = {
    primary: { bg: "#2563eb", fg: "#ffffff", border: "#2563eb" },
    secondary: { bg: "#f8fafc", fg: "#0f172a", border: "#cbd5e1" },
    ghost: { bg: "transparent", fg: "#0f172a", border: "transparent" },
    danger: { bg: "#dc2626", fg: "#ffffff", border: "#dc2626" },
  };
  const p = palette[variant] ?? palette.primary!;
  return {
    padding: "8px 14px",
    borderRadius: 8,
    border: `1px solid ${p.border}`,
    background: p.bg,
    color: p.fg,
    fontWeight: 500,
    fontSize: 14,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
}

const chipStyle: CSSProperties = {
  padding: "6px 12px",
  borderRadius: 999,
  border: "1px solid #cbd5e1",
  background: "#f8fafc",
  fontSize: 13,
  cursor: "pointer",
};

function gapSize(gap: "none" | "xs" | "sm" | "md" | "lg" | "xl"): number {
  switch (gap) {
    case "none":
      return 0;
    case "xs":
      return 4;
    case "sm":
      return 8;
    case "md":
      return 16;
    case "lg":
      return 24;
    case "xl":
      return 32;
  }
}

function safeEval(expr: string, state: StateTree): unknown {
  try {
    return evalExpression(expr, state);
  } catch {
    return undefined;
  }
}

function renderBasicMarkdown(src: string): string {
  // Very small subset: paragraphs, bold, italic, inline code, links.
  // We escape HTML first so the output is safe regardless of user input.
  const escaped = src
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const transformed = escaped
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  return transformed
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");
}
