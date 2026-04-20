/**
 * Authoring components — TSX surfaces that compile to Canvas Kit v2 JSON.
 *
 * Each component is effectively a typed no-op at runtime: its React
 * rendering never actually runs in the browser (`renderToJson` walks the
 * `ReactElement` tree statically and emits JSON). The component is still
 * a real React component so that editors get IntelliSense/autocomplete
 * from `@types/react`.
 *
 * The marker `[CANVAS_BLOCK_META]` property on each component function
 * identifies the block type and any prop renaming / child walking rules.
 *
 * We intentionally use named prop types (HeaderProps, ActionButtonProps…)
 * rather than `z.infer` from @renowide/types, to keep the public authoring
 * surface stable even if the internal zod schemas shift (e.g. defaults
 * move around). We still pull the inferred types where the surface is
 * identical (most blocks).
 */

import type { ReactNode } from "react";

import type {
  HeaderPropsSchema,
  MarkdownPropsSchema,
  InfoCalloutPropsSchema,
  ImagePropsSchema,
  TextInputPropsSchema,
  CheckboxPropsSchema,
  DatePickerPropsSchema,
  FileUploadPropsSchema,
  CodeBlockPropsSchema,
  KpiPropsSchema,
  CtaPropsSchema,
  LinkButtonPropsSchema,
  QuickReplyPropsSchema,
  OAuthButtonPropsSchema,
  ApiKeyInputPropsSchema,
  IntegrationButtonPropsSchema,
  TablePropsSchema,
  ChartPropsSchema,
  ActionButtonPropsSchema,
  ModalPropsSchema,
  DrawerPropsSchema,
  LayoutGridPropsSchema,
  LayoutStackPropsSchema,
  CustomEmbedPropsSchema,
  PdfViewerPropsSchema,
  WizardPropsSchema,
  WizardStepPropsSchema,
  ConditionalPropsSchema,
  StateSubscriptionPropsSchema,
  DividerPropsSchema,
} from "@renowide/types/canvas";
import type { z } from "zod";

import { CANVAS_BLOCK_META, type CanvasBlockMeta } from "./symbols.js";

// ─── Type helpers ────────────────────────────────────────────────────────────

type InferProps<T> = T extends z.ZodType<infer U> ? U : never;

interface CommonBlockProps {
  /** Canvas Kit v2 block id — lowercase kebab or snake, 1–64 chars. */
  id: string;
  /** Boolean guard — block is only rendered when this evaluates true. */
  when?: string;
}

function canvasBlock<P>(type: string, meta: Omit<CanvasBlockMeta, "type"> = {}) {
  const component = (_props: P): null => null;
  (component as any)[CANVAS_BLOCK_META] = { type, ...meta } satisfies CanvasBlockMeta;
  component.displayName = `Canvas(${type})`;
  return component;
}

// ─── Canvas root ─────────────────────────────────────────────────────────────

export interface CanvasProps {
  surface: "hire_flow" | "post_hire";
  uiKitVersion?: string;
  cacheTtlSeconds?: number;
  initialState?: Record<string, unknown>;
  children: ReactNode;
}

export const Canvas = canvasBlock<CanvasProps>("__canvas_root__", {
  propMap: {
    uiKitVersion: "ui_kit_version",
    cacheTtlSeconds: "cache_ttl_seconds",
    initialState: "initial_state",
  },
  rootKeys: ["surface", "ui_kit_version", "cache_ttl_seconds", "initial_state"],
  childrenJsonKey: "blocks",
});

// ─── v1 grandfathered blocks ────────────────────────────────────────────────

type HeaderJsonProps = InferProps<typeof HeaderPropsSchema>;
export type HeaderProps = CommonBlockProps & HeaderJsonProps;
export const Header = canvasBlock<HeaderProps>("header");

type MarkdownJsonProps = InferProps<typeof MarkdownPropsSchema>;
export type MarkdownProps = CommonBlockProps & MarkdownJsonProps;
export const Markdown = canvasBlock<MarkdownProps>("markdown");

type DividerJsonProps = InferProps<typeof DividerPropsSchema>;
export type DividerProps = CommonBlockProps & DividerJsonProps;
export const Divider = canvasBlock<DividerProps>("divider");

type InfoCalloutJsonProps = InferProps<typeof InfoCalloutPropsSchema>;
export type InfoCalloutProps = CommonBlockProps & InfoCalloutJsonProps;
export const InfoCallout = canvasBlock<InfoCalloutProps>("info_callout");

type ImageJsonProps = InferProps<typeof ImagePropsSchema>;
export type ImageProps = CommonBlockProps & ImageJsonProps;
export const Image = canvasBlock<ImageProps>("image");

type TextInputJsonProps = InferProps<typeof TextInputPropsSchema>;
export type TextInputProps = CommonBlockProps & TextInputJsonProps;
export const TextInput = canvasBlock<TextInputProps>("text_input");

type CheckboxJsonProps = InferProps<typeof CheckboxPropsSchema>;
export type CheckboxProps = CommonBlockProps & CheckboxJsonProps;
export const Checkbox = canvasBlock<CheckboxProps>("checkbox");

type DatePickerJsonProps = InferProps<typeof DatePickerPropsSchema>;
export type DatePickerProps = CommonBlockProps & DatePickerJsonProps;
export const DatePicker = canvasBlock<DatePickerProps>("date_picker");

type FileUploadJsonProps = InferProps<typeof FileUploadPropsSchema>;
export type FileUploadProps = CommonBlockProps & FileUploadJsonProps;
export const FileUpload = canvasBlock<FileUploadProps>("file_upload");

type CodeBlockJsonProps = InferProps<typeof CodeBlockPropsSchema>;
export type CodeBlockProps = CommonBlockProps & CodeBlockJsonProps;
export const CodeBlock = canvasBlock<CodeBlockProps>("code_block");

type KpiJsonProps = InferProps<typeof KpiPropsSchema>;
export type KpiProps = CommonBlockProps & KpiJsonProps;
export const Kpi = canvasBlock<KpiProps>("kpi");

type CtaJsonProps = InferProps<typeof CtaPropsSchema>;
export type CtaProps = CommonBlockProps & CtaJsonProps;
export const Cta = canvasBlock<CtaProps>("cta");

type LinkButtonJsonProps = InferProps<typeof LinkButtonPropsSchema>;
export type LinkButtonProps = CommonBlockProps & LinkButtonJsonProps;
export const LinkButton = canvasBlock<LinkButtonProps>("link_button");

type QuickReplyJsonProps = InferProps<typeof QuickReplyPropsSchema>;
export type QuickReplyProps = CommonBlockProps & QuickReplyJsonProps;
export const QuickReply = canvasBlock<QuickReplyProps>("quick_reply");

type OAuthButtonJsonProps = InferProps<typeof OAuthButtonPropsSchema>;
export type OAuthButtonProps = CommonBlockProps & OAuthButtonJsonProps;
export const OAuthButton = canvasBlock<OAuthButtonProps>("oauth_button");

type ApiKeyInputJsonProps = InferProps<typeof ApiKeyInputPropsSchema>;
export type ApiKeyInputProps = CommonBlockProps & ApiKeyInputJsonProps;
export const ApiKeyInput = canvasBlock<ApiKeyInputProps>("api_key_input");

type IntegrationButtonJsonProps = InferProps<typeof IntegrationButtonPropsSchema>;
export type IntegrationButtonProps = CommonBlockProps & IntegrationButtonJsonProps;
export const IntegrationButton = canvasBlock<IntegrationButtonProps>("integration_button");

type TableJsonProps = InferProps<typeof TablePropsSchema>;
export type TableProps = CommonBlockProps & TableJsonProps;
export const Table = canvasBlock<TableProps>("table");

type ChartJsonProps = InferProps<typeof ChartPropsSchema>;
export type ChartProps = CommonBlockProps & ChartJsonProps;
export const Chart = canvasBlock<ChartProps>("chart");

// ─── v2 blocks ──────────────────────────────────────────────────────────────

type ActionButtonJsonProps = InferProps<typeof ActionButtonPropsSchema>;
export type ActionButtonProps = CommonBlockProps & ActionButtonJsonProps;
export const ActionButton = canvasBlock<ActionButtonProps>("action_button");

type CustomEmbedJsonProps = InferProps<typeof CustomEmbedPropsSchema>;
export type CustomEmbedProps = CommonBlockProps & CustomEmbedJsonProps;
export const CustomEmbed = canvasBlock<CustomEmbedProps>("custom_embed");

type PdfViewerJsonProps = InferProps<typeof PdfViewerPropsSchema>;
export type PdfViewerProps = CommonBlockProps & PdfViewerJsonProps;
export const PdfViewer = canvasBlock<PdfViewerProps>("pdf_viewer");

type StateSubscriptionJsonProps = InferProps<typeof StateSubscriptionPropsSchema>;
export type StateSubscriptionProps = CommonBlockProps & StateSubscriptionJsonProps;
export const StateSubscription = canvasBlock<StateSubscriptionProps>("state_subscription");

// ── Container blocks — emit `children` into a nested array ──────────────

type ModalJsonPropsBase = InferProps<typeof ModalPropsSchema>;
export type ModalProps = CommonBlockProps &
  ModalJsonPropsBase & { children: ReactNode };
export const Modal = canvasBlock<ModalProps>("modal");

type DrawerJsonPropsBase = InferProps<typeof DrawerPropsSchema>;
export type DrawerProps = CommonBlockProps &
  DrawerJsonPropsBase & { children: ReactNode };
export const Drawer = canvasBlock<DrawerProps>("drawer");

type LayoutGridJsonPropsBase = InferProps<typeof LayoutGridPropsSchema>;
export type LayoutGridProps = CommonBlockProps &
  LayoutGridJsonPropsBase & { children: ReactNode };
export const LayoutGrid = canvasBlock<LayoutGridProps>("layout_grid");

type LayoutStackJsonPropsBase = InferProps<typeof LayoutStackPropsSchema>;
export type LayoutStackProps = CommonBlockProps &
  LayoutStackJsonPropsBase & { children: ReactNode };
export const LayoutStack = canvasBlock<LayoutStackProps>("layout_stack");

// ── Wizard + WizardStep ───────────────────────────────────────────────────

type WizardJsonPropsBase = InferProps<typeof WizardPropsSchema>;
export type WizardProps = CommonBlockProps &
  Omit<WizardJsonPropsBase, "steps"> & { children: ReactNode };
export const Wizard = canvasBlock<WizardProps>("wizard", {
  childrenJsonKey: "steps",
});

type WizardStepJsonPropsBase = InferProps<typeof WizardStepPropsSchema>;
export type WizardStepProps = CommonBlockProps &
  Omit<WizardStepJsonPropsBase, "blocks"> & {
    label: string;
    children: ReactNode;
  };
export const WizardStep = canvasBlock<WizardStepProps>("wizard_step", {
  childrenJsonKey: "blocks",
});

// ── Conditional — dual-children (if/else) ─────────────────────────────────

type ConditionalJsonPropsBase = InferProps<typeof ConditionalPropsSchema>;
export type ConditionalProps = CommonBlockProps &
  ConditionalJsonPropsBase & {
    children: ReactNode;
    else?: ReactNode;
  };
export const Conditional = canvasBlock<ConditionalProps>("conditional", {
  extraChildrenKey: { prop: "else", json: "else" },
});
