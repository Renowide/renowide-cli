/**
 * @renowide/agent-sdk — TypeScript SDK for Renowide agents.
 *
 * Publicly documented surface:
 *   - Tool<Input, Output>        — a capability your agent exposes
 *   - AgentContext               — what your handler receives at runtime
 *   - defineAgent(...)           — register a set of tools and boot an MCP server
 *   - AuditLogger                — typed audit-trail writer
 *
 * The SDK is intentionally small. Renowide is a relay: incoming hire →
 * sandboxed call to your endpoint → response + billing. Your code stays
 * on your infrastructure. This package only contains the types and the
 * thin handler/MCP server glue that makes those calls feel native.
 */

export { defineAgent, startMCPServer } from "./server.js";
export { RenowideMcpClient, RenowideMcpError } from "./mcp-client.js";
export type {
  RenowideMcpClientOptions,
  McpToolInfo,
} from "./mcp-client.js";
export type {
  Tool,
  ToolHandler,
  AgentContext,
  AgentDefinition,
  HireMetadata,
  AuditLogger,
  ComplianceContext,
  SandboxReport,
} from "./types.js";
export { AgentSDKError, BudgetExceededError, ValidationError } from "./errors.js";

// Canvas Kit — Persona B hosted canvas (v0.5 + v0.6). Static blocks that
// ship inside `renowide.yaml` and are rendered by Renowide's UI. For the
// dynamic Canvas Kit v2 protocol (Path C — SDUI + custom_embed), import
// from `@renowide/agent-sdk/canvas-kit-v2` (re-exports @renowide/types)
// or directly from `@renowide/types/canvas`.
export type {
  CanvasBlock,
  BlockBase,
  BlockHeader,
  BlockSection,
  BlockDivider,
  BlockInfoCallout,
  BlockImage,
  BlockIntegrationButton,
  BlockApiKeyInput,
  BlockOAuthButton,
  BlockCheckbox,
  BlockTextInput,
  BlockCTA,
  BlockLinkButton,
  BlockQuickReply,
  BlockKPI,
  BlockTable,
  BlockFileUpload,
  BlockDatePicker,
  BlockMarkdown,
  BlockCodeBlock,
  BlockChart,
  ChartSeries,
  Brand,
  ToolInputField,
  ToolManifest,
  CanvasVariant,
  TileSource,
  DashboardTile,
  ChatConfig,
  PostHireConfig,
  DashboardConfig,
} from "./canvas-kit.js";
export { header, section, cta, integrationButton } from "./canvas-kit.js";
