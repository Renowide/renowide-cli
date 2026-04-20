/**
 * Canvas Kit — v0.5 / v0.6 block DSL for **Persona B hosted canvases**.
 *
 * These types describe the static blocks Renowide renders inside its own
 * buyer UI when you publish a Persona B agent (`renowide publish` with a
 * `renowide.yaml` that ships a `hire_page_canvas:` / `post_hire_canvas:`
 * tree directly in the manifest). The backend zod-validates the YAML
 * into this shape; your Python / TS code can construct the same blocks
 * at runtime (e.g. to render chat replies or dashboard tiles).
 *
 * ⚠️  Not the same protocol as Canvas Kit v2 (Path C — SDUI +
 * `custom_embed`). Canvas Kit v2 is a dynamic JSON response fetched
 * over HTTP from your backend on each render, with its own richer block
 * set, expression grammar, and HMAC signing. For that, import from
 * `@renowide/agent-sdk/canvas-kit-v2` (a re-export of `@renowide/types`)
 * or directly from `@renowide/types/canvas`.
 *
 * TL;DR:
 *   Persona B (this file)  → static blocks in `renowide.yaml` → hosted by Renowide
 *   Path C (canvas-kit-v2) → dynamic JSON per hire  → hosted by you, rendered by Renowide
 */

export interface BlockBase {
  when?: string;
}

export interface BlockHeader extends BlockBase {
  type: "header";
  text: string;
}
export interface BlockSection extends BlockBase {
  type: "section";
  text: string;
}
export interface BlockDivider extends BlockBase {
  type: "divider";
}
export interface BlockInfoCallout extends BlockBase {
  type: "info_callout";
  variant?: "info" | "warn" | "success";
  text: string;
}
export interface BlockImage extends BlockBase {
  type: "image";
  url: string;
  alt: string;
  caption?: string;
}
export interface BlockIntegrationButton extends BlockBase {
  type: "integration_button";
  provider: string;
  scopes?: string[];
  required?: boolean;
  label?: string;
}
export interface BlockApiKeyInput extends BlockBase {
  type: "api_key_input";
  id: string;
  label: string;
  placeholder?: string;
  help_url?: string;
  required?: boolean;
}
export interface BlockOAuthButton extends BlockBase {
  type: "oauth_button";
  provider: string;
  label?: string;
  scopes?: string[];
}
export interface BlockCheckbox extends BlockBase {
  type: "checkbox";
  id: string;
  text: string;
  required?: boolean;
  default?: boolean;
}
export interface BlockTextInput extends BlockBase {
  type: "text_input";
  id: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  pattern?: string;
}
export interface BlockCTA extends BlockBase {
  type: "cta";
  text: string;
  action: string;
  style?: "primary" | "secondary";
}
export interface BlockLinkButton extends BlockBase {
  type: "link_button";
  text: string;
  url: string;
}
export interface BlockQuickReply extends BlockBase {
  type: "quick_reply";
  prompts: string[];
}
export interface BlockKPI extends BlockBase {
  type: "kpi";
  label: string;
  value: string;
  trend?: string;
}
export interface BlockTable extends BlockBase {
  type: "table";
  columns: string[];
  rows: Array<Array<string | number | boolean | null>>;
}

// ── v0.6 blocks ────────────────────────────────────────────────────────────

export interface BlockFileUpload extends BlockBase {
  type: "file_upload";
  id: string;
  label: string;
  required?: boolean;
  accept?: string[];
  max_mb?: number;
  help?: string;
}
export interface BlockDatePicker extends BlockBase {
  type: "date_picker";
  id: string;
  label: string;
  mode?: "date" | "datetime";
  required?: boolean;
  min?: string;
  max?: string;
  default?: string;
}
export interface BlockMarkdown extends BlockBase {
  type: "markdown";
  source: string;
}
export interface BlockCodeBlock extends BlockBase {
  type: "code_block";
  language?:
    | "plaintext" | "bash" | "sh" | "json" | "yaml" | "python"
    | "typescript" | "javascript" | "tsx" | "jsx" | "go" | "rust"
    | "sql" | "html" | "css" | "md";
  source: string;
  filename?: string;
}
export interface ChartSeries {
  label: string;
  data: number[];
}
export interface BlockChart extends BlockBase {
  type: "chart";
  chart_type?: "bar" | "line" | "pie" | "area";
  title?: string;
  labels: string[];
  series: ChartSeries[];
  stacked?: boolean;
}

export type CanvasBlock =
  | BlockHeader
  | BlockSection
  | BlockDivider
  | BlockInfoCallout
  | BlockImage
  | BlockIntegrationButton
  | BlockApiKeyInput
  | BlockOAuthButton
  | BlockCheckbox
  | BlockTextInput
  | BlockCTA
  | BlockLinkButton
  | BlockQuickReply
  | BlockKPI
  | BlockTable
  | BlockFileUpload
  | BlockDatePicker
  | BlockMarkdown
  | BlockCodeBlock
  | BlockChart;

// ── v0.6 Brand + Tool schema ───────────────────────────────────────────────

export interface Brand {
  primary_color?: string;
  accent_color?: string;
  text_color?: string;
  surface_color?: string;
  font_family?:
    | "inter"
    | "ibm_plex_sans"
    | "roboto"
    | "space_grotesk"
    | "source_serif_pro"
    | "jetbrains_mono"
    | "system";
  border_radius?: "none" | "small" | "medium" | "large";
}

export interface ToolInputField {
  name: string;
  type: "string" | "number" | "integer" | "boolean" | "date" | "file" | "enum";
  description?: string;
  required?: boolean;
  enum?: string[];
  default?: string | number | boolean;
}

export interface ToolManifest {
  name: string;
  display_name?: string;
  description: string;
  category: "read" | "write" | "communicate" | "analyse" | "act";
  inputs: ToolInputField[];
  requires_approval: boolean;
  icon?: string;
}

export interface CanvasVariant {
  id: string;
  weight?: number;
  blocks: CanvasBlock[];
}

export interface TileSource {
  type: "tool_call" | "static";
  tool?: string;
  data?: Record<string, unknown>;
}

export interface DashboardTile {
  id: string;
  title: string;
  size?: "small" | "medium" | "large";
  source?: TileSource;
  render: CanvasBlock[];
}

export interface ChatConfig {
  primary_color?: string;
  avatar?: string;
  greeting?: string;
  starter_prompts?: string[];
  canvas?: CanvasBlock[];
  variants?: CanvasVariant[];
}

export interface PostHireConfig {
  welcome_message?: string;
  welcome_canvas?: CanvasBlock[];
  variants?: CanvasVariant[];
}

export interface DashboardConfig {
  tiles: DashboardTile[];
}

// Convenience helpers for authors composing blocks programmatically.
export const header = (text: string, when?: string): BlockHeader => ({
  type: "header",
  text,
  when,
});
export const section = (text: string, when?: string): BlockSection => ({
  type: "section",
  text,
  when,
});
export const cta = (
  text: string,
  action: string,
  opts: { style?: "primary" | "secondary"; when?: string } = {},
): BlockCTA => ({
  type: "cta",
  text,
  action,
  style: opts.style ?? "primary",
  when: opts.when,
});
export const integrationButton = (
  provider: string,
  opts: { required?: boolean; scopes?: string[]; label?: string; when?: string } = {},
): BlockIntegrationButton => ({
  type: "integration_button",
  provider,
  required: opts.required ?? false,
  scopes: opts.scopes,
  label: opts.label,
  when: opts.when,
});
