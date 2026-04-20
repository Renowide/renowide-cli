/**
 * Canvas Kit v2 — canonical TypeScript/Zod schema.
 *
 * This file is the source of truth for Canvas Kit v2. Every other
 * renderer, authoring layer, validator, or CLI command builds on top of
 * the schemas and constants exported from here.
 *
 * There is a Pydantic mirror of this file in the Renowide backend at
 * `app/schemas/canvas.py` — both must stay in lockstep. Any change here
 * requires a matching PR on the backend in the same release window.
 *
 * Version compatibility rule enforced in every renderer:
 *
 *     response.ui_kit_version ≤ manifest.ui_kit_version ≤ renderer.supported
 *
 * Block type parity with the backend:
 *
 *   v1 grandfathered (19): header, markdown, divider, info_callout, image,
 *     text_input, checkbox, date_picker, file_upload, code_block, kpi,
 *     cta, link_button, quick_reply, oauth_button, api_key_input,
 *     integration_button, table, chart
 *   v2 new (11): wizard, wizard_step, conditional, state_subscription,
 *     action_button, modal, drawer, layout_grid, layout_stack,
 *     custom_embed, pdf_viewer
 */

import { z } from "zod";

export const CANVAS_KIT_VERSION = "2.0.0" as const;

export const RESERVED_ACTION_SUBMIT_HIRE = "__submit_hire__" as const;
export const RESERVED_ACTION_CANCEL_HIRE = "__cancel_hire__" as const;

export const RESERVED_STATE_NAMESPACES = [
  "form",
  "wizard",
  "ui",
  "meta",
  "auth",
] as const;

// ─── Primitives ─────────────────────────────────────────────────────────────

const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const BLOCK_ID_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const SIZE_RE = /^\d+(px|vh)$/;

export const SemverSchema = z
  .string()
  .regex(SEMVER_RE, "not a semver major.minor.patch");

export const BlockIdSchema = z
  .string()
  .regex(
    BLOCK_ID_RE,
    "block id must start with a letter, only [a-z0-9_-], max 64 chars",
  );

export const ExpressionSchema = z
  .string()
  .max(200, "expressions are capped at 200 characters");

const UrlSchema = z.string().url();
const SizeSchema = z.string().regex(SIZE_RE, "size must be <digits>(px|vh)");

const severityEnum = z.enum(["info", "success", "warn", "error"]);
const variantEnum = z.enum(["primary", "secondary", "ghost", "danger"]);
const linkVariantEnum = z.enum(["primary", "secondary", "ghost"]);
const gapEnum = z.enum(["none", "xs", "sm", "md", "lg", "xl"]);

// ─── Base block ─────────────────────────────────────────────────────────────

const baseBlockShape = {
  id: BlockIdSchema,
  when: ExpressionSchema.optional(),
};

// ─── v1 grandfathered blocks ────────────────────────────────────────────────

export const HeaderPropsSchema = z
  .object({
    text: z.string().max(200),
    level: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
  })
  .strict();

export const HeaderBlockSchema = z
  .object({
    ...baseBlockShape,
    type: z.literal("header"),
    props: HeaderPropsSchema,
  })
  .strict();

export const MarkdownPropsSchema = z
  .object({
    source: z.string().max(8000),
  })
  .strict();

export const MarkdownBlockSchema = z
  .object({
    ...baseBlockShape,
    type: z.literal("markdown"),
    props: MarkdownPropsSchema,
  })
  .strict();

export const DividerPropsSchema = z.object({}).strict();

export const DividerBlockSchema = z
  .object({
    ...baseBlockShape,
    type: z.literal("divider"),
    props: DividerPropsSchema.default({}),
  })
  .strict();

export const InfoCalloutPropsSchema = z
  .object({
    severity: severityEnum.default("info"),
    text: z.string().max(1000),
    title: z.string().max(120).optional(),
  })
  .strict();

export const InfoCalloutBlockSchema = z
  .object({
    ...baseBlockShape,
    type: z.literal("info_callout"),
    props: InfoCalloutPropsSchema,
  })
  .strict();

export const ImagePropsSchema = z
  .object({
    url: UrlSchema,
    alt: z.string().max(200),
    caption: z.string().max(200).optional(),
    max_height: z.string().max(20).optional(),
  })
  .strict();

export const ImageBlockSchema = z
  .object({
    ...baseBlockShape,
    type: z.literal("image"),
    props: ImagePropsSchema,
  })
  .strict();

export const TextInputPropsSchema = z
  .object({
    label: z.string().max(120),
    placeholder: z.string().max(120).optional(),
    required: z.boolean().default(false),
    pattern: z.string().max(200).optional(),
    default: z.string().optional(),
    multiline: z.boolean().default(false),
    help: z.string().max(240).optional(),
    max_length: z.number().int().min(1).max(10_000).optional(),
  })
  .strict();

export const TextInputBlockSchema = z
  .object({
    ...baseBlockShape,
    type: z.literal("text_input"),
    props: TextInputPropsSchema,
  })
  .strict();

export const CheckboxPropsSchema = z
  .object({
    label: z.string().max(500),
    required: z.boolean().default(false),
    default: z.boolean().default(false),
  })
  .strict();

export const CheckboxBlockSchema = z
  .object({
    ...baseBlockShape,
    type: z.literal("checkbox"),
    props: CheckboxPropsSchema,
  })
  .strict();

export const DatePickerPropsSchema = z
  .object({
    label: z.string().max(120),
    mode: z.enum(["date", "datetime"]).default("date"),
    required: z.boolean().default(false),
    min: z.string().max(30).optional(),
    max: z.string().max(30).optional(),
    default: z.string().max(30).optional(),
  })
  .strict();

export const DatePickerBlockSchema = z
  .object({
    ...baseBlockShape,
    type: z.literal("date_picker"),
    props: DatePickerPropsSchema,
  })
  .strict();

export const FileUploadPropsSchema = z
  .object({
    label: z.string().max(120),
    required: z.boolean().default(false),
    accept: z.array(z.string()).max(10).default([]),
    max_mb: z.number().int().min(1).max(500).default(20),
    multiple: z.boolean().default(false),
    help: z.string().max(240).optional(),
  })
  .strict();

export const FileUploadBlockSchema = z
  .object({
    ...baseBlockShape,
    type: z.literal("file_upload"),
    props: FileUploadPropsSchema,
  })
  .strict();

export const CodeBlockPropsSchema = z
  .object({
    language: z.string().max(20).default("plaintext"),
    source: z.string().max(10_000),
    filename: z.string().max(120).optional(),
    copyable: z.boolean().default(true),
  })
  .strict();

export const CodeBlockBlockSchema = z
  .object({
    ...baseBlockShape,
    type: z.literal("code_block"),
    props: CodeBlockPropsSchema,
  })
  .strict();

export const KpiPropsSchema = z
  .object({
    label: z.string().max(80),
    value: z.string().max(80),
    trend: z.enum(["up", "down", "flat", "none"]).default("none"),
    trend_label: z.string().max(40).optional(),
    severity: severityEnum.optional(),
  })
  .strict();

export const KpiBlockSchema = z
  .object({
    ...baseBlockShape,
    type: z.literal("kpi"),
    props: KpiPropsSchema,
  })
  .strict();

export const CtaPropsSchema = z
  .object({
    label: z.string().max(80),
    action: z.string().max(120),
    variant: variantEnum.default("primary"),
    disabled: z.boolean().default(false),
    disabled_when: ExpressionSchema.optional(),
  })
  .strict();

export const CtaBlockSchema = z
  .object({
    ...baseBlockShape,
    type: z.literal("cta"),
    props: CtaPropsSchema,
  })
  .strict();

export const LinkButtonPropsSchema = z
  .object({
    label: z.string().max(80),
    url: UrlSchema,
    variant: linkVariantEnum.default("secondary"),
    external: z.boolean().default(true),
  })
  .strict();

export const LinkButtonBlockSchema = z
  .object({
    ...baseBlockShape,
    type: z.literal("link_button"),
    props: LinkButtonPropsSchema,
  })
  .strict();

export const QuickReplyPropsSchema = z
  .object({
    prompts: z.array(z.string()).min(1).max(6),
  })
  .strict();

export const QuickReplyBlockSchema = z
  .object({
    ...baseBlockShape,
    type: z.literal("quick_reply"),
    props: QuickReplyPropsSchema,
  })
  .strict();

export const OAuthButtonPropsSchema = z
  .object({
    provider: z.string().max(60),
    label: z.string().max(80).optional(),
    scopes: z.array(z.string()).max(30).default([]),
    required: z.boolean().default(false),
  })
  .strict();

export const OAuthButtonBlockSchema = z
  .object({
    ...baseBlockShape,
    type: z.literal("oauth_button"),
    props: OAuthButtonPropsSchema,
  })
  .strict();

export const ApiKeyInputPropsSchema = z
  .object({
    label: z.string().max(120),
    placeholder: z.string().max(120).optional(),
    help_url: UrlSchema.optional(),
    required: z.boolean().default(false),
  })
  .strict();

export const ApiKeyInputBlockSchema = z
  .object({
    ...baseBlockShape,
    type: z.literal("api_key_input"),
    props: ApiKeyInputPropsSchema,
  })
  .strict();

export const IntegrationButtonPropsSchema = z
  .object({
    provider: z.string().max(60),
    label: z.string().max(80).optional(),
    scopes: z.array(z.string()).max(30).default([]),
    required: z.boolean().default(false),
  })
  .strict();

export const IntegrationButtonBlockSchema = z
  .object({
    ...baseBlockShape,
    type: z.literal("integration_button"),
    props: IntegrationButtonPropsSchema,
  })
  .strict();

export const TableColumnSchema = z
  .object({
    key: z.string().max(60),
    label: z.string().max(60),
    width: z.string().max(10).optional(),
    align: z.enum(["left", "center", "right"]).default("left"),
  })
  .strict();

export const TableRowActionSchema = z
  .object({
    label: z.string().max(40),
    action: z.string().max(80),
    payload_from: ExpressionSchema.optional(),
  })
  .strict();

export const TablePropsSchema = z
  .object({
    columns: z.array(TableColumnSchema).min(1).max(8),
    rows: z.array(z.record(z.string(), z.any())).max(200).optional(),
    rows_from: ExpressionSchema.optional(),
    row_action: TableRowActionSchema.optional(),
    empty_state: z.string().max(240).optional(),
  })
  .strict()
  .refine(
    (p) => (p.rows !== undefined) !== (p.rows_from !== undefined),
    { message: "table requires exactly one of `rows` or `rows_from`" },
  );

export const TableBlockSchema = z
  .object({
    ...baseBlockShape,
    type: z.literal("table"),
    props: TablePropsSchema,
  })
  .strict();

export const ChartSeriesSchema = z
  .object({
    label: z.string().max(60),
    data: z.array(z.number()).min(1).max(100),
  })
  .strict();

export const ChartPropsSchema = z
  .object({
    chart_type: z.enum(["bar", "line", "pie", "area"]).default("bar"),
    title: z.string().max(120).optional(),
    labels: z.array(z.string()).min(1).max(100),
    series: z.array(ChartSeriesSchema).min(1).max(6),
    stacked: z.boolean().default(false),
  })
  .strict();

export const ChartBlockSchema = z
  .object({
    ...baseBlockShape,
    type: z.literal("chart"),
    props: ChartPropsSchema,
  })
  .strict();

// ─── v2 new blocks (recursive containers use z.lazy) ────────────────────────

export const WizardStepPropsSchema = z
  .object({
    title: z.string().max(120),
    description: z.string().max(400).optional(),
    next_label: z.string().max(40).optional(),
    next_enabled_when: ExpressionSchema.optional(),
    skippable: z.boolean().default(false),
  })
  .strict();

export const WizardPropsSchema = z
  .object({
    submit_label: z.string().max(40).default("Confirm"),
    allow_back: z.boolean().default(true),
    show_progress: z.boolean().default(true),
  })
  .strict();

export const ConditionalPropsSchema = z
  .object({
    if: ExpressionSchema,
  })
  .strict();

export const StateSubscriptionPropsSchema = z
  .object({
    path: z.string().regex(/^state\.[a-zA-Z_][a-zA-Z0-9_.]*$/),
    reconnect_ms: z.number().int().min(1000).max(60_000).default(3000),
    filter_events: z.array(z.string()).max(20).optional(),
    initial_timeout_ms: z.number().int().min(1000).max(60_000).default(10_000),
  })
  .strict();

export const StateSubscriptionBlockSchema = z
  .object({
    ...baseBlockShape,
    type: z.literal("state_subscription"),
    props: StateSubscriptionPropsSchema,
  })
  .strict();

export const ActionConfirmSchema = z
  .object({
    title: z.string().max(120),
    body: z.string().max(400),
    confirm_label: z.string().max(40).default("Confirm"),
    cancel_label: z.string().max(40).default("Cancel"),
    destructive: z.boolean().default(false),
  })
  .strict();

export const ActionButtonPropsSchema = z
  .object({
    label: z.string().max(80),
    action: z.string().max(80),
    payload: z.record(z.string(), z.any()).optional(),
    payload_from: ExpressionSchema.optional(),
    variant: variantEnum.default("primary"),
    loading_label: z.string().max(40).optional(),
    disabled_when: ExpressionSchema.optional(),
    concurrent: z.boolean().default(false),
    confirm: ActionConfirmSchema.optional(),
  })
  .strict();

export const ActionButtonBlockSchema = z
  .object({
    ...baseBlockShape,
    type: z.literal("action_button"),
    props: ActionButtonPropsSchema,
  })
  .strict();

export const OnCloseOpSchema = z
  .object({
    set: z.string().min(1).max(200),
    value: z.any().optional(),
  })
  .strict();

export const ModalPropsSchema = z
  .object({
    open_when: ExpressionSchema,
    title: z.string().max(120).optional(),
    size: z.enum(["sm", "md", "lg"]).default("md"),
    on_close: z.array(OnCloseOpSchema).max(4).optional(),
  })
  .strict();

export const DrawerPropsSchema = z
  .object({
    open_when: ExpressionSchema,
    side: z.enum(["left", "right", "bottom"]).default("right"),
    size: z.enum(["sm", "md", "lg"]).default("md"),
    on_close: z.array(OnCloseOpSchema).max(4).optional(),
  })
  .strict();

export const LayoutGridPropsSchema = z
  .object({
    columns: z.number().int().min(1).max(12).default(2),
    columns_sm: z.number().int().min(1).max(12).optional(),
    gap: gapEnum.default("md"),
  })
  .strict();

export const LayoutStackPropsSchema = z
  .object({
    direction: z.enum(["row", "column"]).default("column"),
    gap: gapEnum.default("md"),
    align: z.enum(["start", "center", "end", "stretch"]).default("stretch"),
    justify: z
      .enum(["start", "center", "end", "space-between", "space-around"])
      .default("start"),
    wrap: z.boolean().default(false),
  })
  .strict();

export const CustomEmbedPropsSchema = z
  .object({
    src: z.string().max(2000),
    height: SizeSchema.default("400px"),
    min_height: SizeSchema.optional(),
    max_height: SizeSchema.optional(),
    resize: z.enum(["fixed", "auto"]).default("fixed"),
    allow_postmessage_events: z
      .array(z.enum(["ready", "resize", "toast", "action"]))
      .default(["ready", "resize"]),
    allow_clipboard_write: z.boolean().default(false),
  })
  .strict();

export const CustomEmbedBlockSchema = z
  .object({
    ...baseBlockShape,
    type: z.literal("custom_embed"),
    props: CustomEmbedPropsSchema,
  })
  .strict();

export const PdfViewerPropsSchema = z
  .object({
    url: z.string().max(2000),
    page: z.number().int().min(1).default(1),
    toolbar: z.boolean().default(true),
    download_filename: z.string().max(120).optional(),
    height: SizeSchema.default("600px"),
  })
  .strict();

export const PdfViewerBlockSchema = z
  .object({
    ...baseBlockShape,
    type: z.literal("pdf_viewer"),
    props: PdfViewerPropsSchema,
  })
  .strict();

// ─── Discriminated union (recursive for containers) ────────────────────────

export type CanvasBlock =
  | z.infer<typeof HeaderBlockSchema>
  | z.infer<typeof MarkdownBlockSchema>
  | z.infer<typeof DividerBlockSchema>
  | z.infer<typeof InfoCalloutBlockSchema>
  | z.infer<typeof ImageBlockSchema>
  | z.infer<typeof TextInputBlockSchema>
  | z.infer<typeof CheckboxBlockSchema>
  | z.infer<typeof DatePickerBlockSchema>
  | z.infer<typeof FileUploadBlockSchema>
  | z.infer<typeof CodeBlockBlockSchema>
  | z.infer<typeof KpiBlockSchema>
  | z.infer<typeof CtaBlockSchema>
  | z.infer<typeof LinkButtonBlockSchema>
  | z.infer<typeof QuickReplyBlockSchema>
  | z.infer<typeof OAuthButtonBlockSchema>
  | z.infer<typeof ApiKeyInputBlockSchema>
  | z.infer<typeof IntegrationButtonBlockSchema>
  | z.infer<typeof TableBlockSchema>
  | z.infer<typeof ChartBlockSchema>
  | z.infer<typeof StateSubscriptionBlockSchema>
  | z.infer<typeof ActionButtonBlockSchema>
  | z.infer<typeof CustomEmbedBlockSchema>
  | z.infer<typeof PdfViewerBlockSchema>
  | WizardBlock
  | WizardStepBlock
  | ConditionalBlock
  | ModalBlock
  | DrawerBlock
  | LayoutGridBlock
  | LayoutStackBlock;

export interface WizardStepBlock {
  id: string;
  when?: string;
  type: "wizard_step";
  props: z.infer<typeof WizardStepPropsSchema>;
  children: CanvasBlock[];
}

export interface WizardBlock {
  id: string;
  when?: string;
  type: "wizard";
  props: z.infer<typeof WizardPropsSchema>;
  children: WizardStepBlock[];
}

export interface ConditionalBlock {
  id: string;
  when?: string;
  type: "conditional";
  props: z.infer<typeof ConditionalPropsSchema>;
  children: CanvasBlock[];
  else?: CanvasBlock[];
}

export interface ModalBlock {
  id: string;
  when?: string;
  type: "modal";
  props: z.infer<typeof ModalPropsSchema>;
  children: CanvasBlock[];
}

export interface DrawerBlock {
  id: string;
  when?: string;
  type: "drawer";
  props: z.infer<typeof DrawerPropsSchema>;
  children: CanvasBlock[];
}

export interface LayoutGridBlock {
  id: string;
  when?: string;
  type: "layout_grid";
  props: z.infer<typeof LayoutGridPropsSchema>;
  children: CanvasBlock[];
}

export interface LayoutStackBlock {
  id: string;
  when?: string;
  type: "layout_stack";
  props: z.infer<typeof LayoutStackPropsSchema>;
  children: CanvasBlock[];
}

// Recursive schemas via z.lazy. Zod's discriminatedUnion requires
// concrete ZodObjects, so for the recursive portion we use z.union.
// The performance hit vs discriminatedUnion is negligible at canvas
// sizes (≤ 80 blocks) and we still get the same validation guarantees.

export const WizardStepBlockSchema: z.ZodType<WizardStepBlock> = z.lazy(() =>
  z
    .object({
      ...baseBlockShape,
      type: z.literal("wizard_step"),
      props: WizardStepPropsSchema,
      children: z.array(CanvasBlockSchema).max(40),
    })
    .strict(),
) as z.ZodType<WizardStepBlock>;

export const WizardBlockSchema: z.ZodType<WizardBlock> = z.lazy(() =>
  z
    .object({
      ...baseBlockShape,
      type: z.literal("wizard"),
      props: WizardPropsSchema,
      children: z.array(WizardStepBlockSchema).min(1).max(10),
    })
    .strict()
    .superRefine((w, ctx) => {
      const ids = w.children.map((c) => c.id);
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "wizard step ids must be unique",
        });
      }
    }),
) as z.ZodType<WizardBlock>;

export const ConditionalBlockSchema: z.ZodType<ConditionalBlock> = z.lazy(() =>
  z
    .object({
      ...baseBlockShape,
      type: z.literal("conditional"),
      props: ConditionalPropsSchema,
      children: z.array(CanvasBlockSchema).min(1).max(40),
      else: z.array(CanvasBlockSchema).max(40).optional(),
    })
    .strict(),
) as z.ZodType<ConditionalBlock>;

export const ModalBlockSchema: z.ZodType<ModalBlock> = z.lazy(() =>
  z
    .object({
      ...baseBlockShape,
      type: z.literal("modal"),
      props: ModalPropsSchema,
      children: z.array(CanvasBlockSchema).max(30),
    })
    .strict(),
) as z.ZodType<ModalBlock>;

export const DrawerBlockSchema: z.ZodType<DrawerBlock> = z.lazy(() =>
  z
    .object({
      ...baseBlockShape,
      type: z.literal("drawer"),
      props: DrawerPropsSchema,
      children: z.array(CanvasBlockSchema).max(30),
    })
    .strict(),
) as z.ZodType<DrawerBlock>;

export const LayoutGridBlockSchema: z.ZodType<LayoutGridBlock> = z.lazy(() =>
  z
    .object({
      ...baseBlockShape,
      type: z.literal("layout_grid"),
      props: LayoutGridPropsSchema,
      children: z.array(CanvasBlockSchema).max(40),
    })
    .strict(),
) as z.ZodType<LayoutGridBlock>;

export const LayoutStackBlockSchema: z.ZodType<LayoutStackBlock> = z.lazy(() =>
  z
    .object({
      ...baseBlockShape,
      type: z.literal("layout_stack"),
      props: LayoutStackPropsSchema,
      children: z.array(CanvasBlockSchema).max(40),
    })
    .strict(),
) as z.ZodType<LayoutStackBlock>;

export const CanvasBlockSchema: z.ZodType<CanvasBlock> = z.lazy(() =>
  z.union([
    HeaderBlockSchema,
    MarkdownBlockSchema,
    DividerBlockSchema,
    InfoCalloutBlockSchema,
    ImageBlockSchema,
    TextInputBlockSchema,
    CheckboxBlockSchema,
    DatePickerBlockSchema,
    FileUploadBlockSchema,
    CodeBlockBlockSchema,
    KpiBlockSchema,
    CtaBlockSchema,
    LinkButtonBlockSchema,
    QuickReplyBlockSchema,
    OAuthButtonBlockSchema,
    ApiKeyInputBlockSchema,
    IntegrationButtonBlockSchema,
    TableBlockSchema,
    ChartBlockSchema,
    StateSubscriptionBlockSchema,
    ActionButtonBlockSchema,
    CustomEmbedBlockSchema,
    PdfViewerBlockSchema,
    WizardStepBlockSchema,
    WizardBlockSchema,
    ConditionalBlockSchema,
    ModalBlockSchema,
    DrawerBlockSchema,
    LayoutGridBlockSchema,
    LayoutStackBlockSchema,
  ]),
) as z.ZodType<CanvasBlock>;

// ─── Canvas root ────────────────────────────────────────────────────────────

export const CanvasResponseSchema = z
  .object({
    ui_kit_version: SemverSchema,
    surface: z.enum(["hire_flow", "post_hire"]),
    cache_ttl_seconds: z.number().int().min(0).max(86_400).optional(),
    initial_state: z
      .record(z.string(), z.any())
      .refine(
        (v) => {
          const reserved = new Set(RESERVED_STATE_NAMESPACES as readonly string[]);
          for (const key of Object.keys(v)) {
            if (reserved.has(key)) return false;
          }
          return true;
        },
        {
          message: `initial_state must not write reserved namespaces (${RESERVED_STATE_NAMESPACES.join(", ")})`,
        },
      )
      .optional(),
    blocks: z.array(CanvasBlockSchema).min(1).max(80),
  })
  .strict();

export type CanvasResponse = z.infer<typeof CanvasResponseSchema>;

// ─── Structural validator ───────────────────────────────────────────────────

function* walkBlocks(blocks: CanvasBlock[]): Generator<CanvasBlock> {
  for (const b of blocks) {
    yield b;
    const children = (b as { children?: CanvasBlock[] }).children;
    if (Array.isArray(children)) yield* walkBlocks(children);
    const elseBranch = (b as { else?: CanvasBlock[] }).else;
    if (Array.isArray(elseBranch)) yield* walkBlocks(elseBranch);
  }
}

/**
 * Structural checks that Zod can't express (unique block ids, one
 * state_subscription, hire_flow submit-trigger cardinality, …).
 *
 * Throws a single `Error` with a multi-line message on the first
 * violation. Mirrors `validate_canvas_structure` in the backend.
 */
export function validateCanvasStructure(canvas: CanvasResponse): void {
  const seen = new Set<string>();
  for (const b of walkBlocks(canvas.blocks)) {
    if (seen.has(b.id)) throw new Error(`duplicate block id: "${b.id}"`);
    seen.add(b.id);
  }

  const subs = Array.from(walkBlocks(canvas.blocks)).filter(
    (b) => b.type === "state_subscription",
  );
  if (subs.length > 1) {
    throw new Error(
      `canvas has ${subs.length} state_subscription blocks — only one allowed`,
    );
  }

  if (canvas.surface === "hire_flow") {
    const submitTriggers: string[] = [];
    for (const b of walkBlocks(canvas.blocks)) {
      if (
        b.type === "action_button" &&
        b.props.action === RESERVED_ACTION_SUBMIT_HIRE
      ) {
        submitTriggers.push(b.id);
      }
      if (b.type === "wizard") submitTriggers.push(`wizard:${b.id}`);
    }
    if (submitTriggers.length === 0) {
      throw new Error(
        'hire_flow canvas must contain exactly one submit trigger (either a wizard or an action_button with action="__submit_hire__")',
      );
    }
    if (submitTriggers.length > 1) {
      throw new Error(
        `hire_flow canvas has ${submitTriggers.length} submit triggers — only one allowed`,
      );
    }
  }

  if (canvas.surface === "post_hire") {
    for (const b of walkBlocks(canvas.blocks)) {
      if (
        b.type === "action_button" &&
        b.props.action === RESERVED_ACTION_SUBMIT_HIRE
      ) {
        throw new Error(
          `post_hire canvas must not contain __submit_hire__ (on block "${b.id}")`,
        );
      }
      if (b.type === "wizard") {
        throw new Error(
          `post_hire canvas must not contain wizard blocks (found "${b.id}")`,
        );
      }
    }
  }
}

// ─── Version compatibility ──────────────────────────────────────────────────

export function parseVersion(v: string): [number, number, number] {
  const m = SEMVER_RE.exec(v);
  if (!m) throw new Error(`not a semver: ${v}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function cmp(
  a: [number, number, number],
  b: [number, number, number],
): number {
  for (let i = 0; i < 3; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    if (ai !== bi) return ai - bi;
  }
  return 0;
}

/**
 * Returns `{ ok: true }` if the triad is compatible, otherwise
 * `{ ok: false, reason: string }` with a human-readable explanation.
 * Mirrors `can_render()` in the backend.
 */
export function canRender(args: {
  response: string;
  manifest: string;
  renderer: string;
}): { ok: true } | { ok: false; reason: string } {
  const r = parseVersion(args.response);
  const m = parseVersion(args.manifest);
  const e = parseVersion(args.renderer);
  if (r[0] !== m[0] || m[0] !== e[0]) {
    return {
      ok: false,
      reason: `major version mismatch (response=${r[0]}, manifest=${m[0]}, renderer=${e[0]})`,
    };
  }
  if (cmp(r, m) > 0) {
    return {
      ok: false,
      reason: `response (${args.response}) exceeds manifest ceiling (${args.manifest})`,
    };
  }
  if (cmp(m, e) > 0) {
    return {
      ok: false,
      reason: `manifest (${args.manifest}) exceeds renderer (${args.renderer}); update the app`,
    };
  }
  return { ok: true };
}
