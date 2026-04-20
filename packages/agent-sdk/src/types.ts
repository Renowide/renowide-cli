/**
 * Core types every Renowide agent handler sees.
 *
 * The single most important type is `Tool<Input, Output>`. It is the
 * contract between your intelligence and the Renowide runtime. The
 * runtime handles billing, workspace isolation, audit, compliance —
 * you handle the actual work.
 */

export interface HireMetadata {
  /** UUID of the hire row on Renowide — one hire per buyer per agent. */
  hireId: string;
  /** UUID of the business workspace that hired the agent. */
  workspaceId: string;
  /** ISO country tag of the hiring workspace, from their billing profile. */
  workspaceJurisdiction: string | null;
  /** How the buyer pays: per_run, per_hour, per_token, subscription. */
  billingModel: "per_run" | "per_hour" | "per_token" | "subscription";
  /**
   * Remaining credits on this hire. If your tool consumes credits and
   * this drops below `ctx.minCreditsToRun`, reject the request.
   */
  remainingCredits: number;
  /**
   * A soft ceiling set by the buyer at hire time. You should respect
   * it — Renowide will also enforce it at the billing layer, but
   * honouring it in your handler gives the buyer better UX.
   */
  creditBudget: number;
}

export interface ComplianceContext {
  /**
   * List of data-residency regions the buyer's workspace will accept.
   * Example: ["EU"]. If your tool is going to call out to an inference
   * provider that breaks this, throw — don't call it.
   */
  allowedResidency: string[];
  /**
   * Buyer-level compliance tags enforced at workspace creation. Examples:
   * "gdpr", "hipaa", "sox". You can read these in your handler to adapt
   * model choice or audit depth.
   */
  tags: string[];
  /**
   * ISO 3166-1 alpha-2 jurisdictions the buyer operates in. Useful for
   * agents that adapt to local tax/legal rules (e.g. VAT).
   */
  jurisdiction: string[];
}

export interface AuditLogger {
  /**
   * Write a structured event to the buyer's audit trail. All events
   * are cryptographically chained and exportable as JSONL.
   *
   * Use semantic event names, not sentences:
   *   ctx.audit.log("vat_code_assigned", { code: "23%" })
   *   ctx.audit.log("invoice_rejected", { reason: "missing_vat_id" })
   */
  log(eventType: string, payload: Record<string, unknown>): void;

  /** Log a warning (visible to buyer in the hire dashboard). */
  warn(eventType: string, payload: Record<string, unknown>): void;

  /** Log an error (surfaces as a proposal failure to the buyer). */
  error(eventType: string, payload: Record<string, unknown>): void;
}

export interface AgentContext {
  /** Metadata about who hired the agent and how they're paying. */
  hire: HireMetadata;
  /** Data-residency / compliance context for this hire. */
  compliance: ComplianceContext;
  /** Audit-trail writer — use it for every material decision. */
  audit: AuditLogger;
  /**
   * AbortSignal that fires if the buyer pauses the hire, the budget
   * is exhausted, or the platform is shutting your handler down.
   * Respect it and return early.
   */
  signal: AbortSignal;
  /**
   * Opaque correlation id. Include it in any external service call
   * so cross-system traces match Renowide's audit trail.
   */
  traceId: string;
}

export type ToolHandler<Input, Output> = (
  input: Input,
  ctx: AgentContext,
) => Promise<Output>;

export interface Tool<Input = unknown, Output = unknown> {
  /** Must match a capability id in your renowide.yaml. */
  name: string;
  /** Optional: describe the tool for the marketplace listing. */
  description?: string;
  /** Optional: zod schema validated before the handler runs. */
  inputSchema?: unknown;
  /** Optional: zod schema validated against the handler's return value. */
  outputSchema?: unknown;
  /**
   * Whether the tool may auto-run or must wait for human approval.
   * Overrides what's in renowide.yaml for safety — if a tool is
   * destructive, set this to "proposal" in code so a misconfigured
   * manifest can never expose it to auto-run.
   */
  governance?: "auto" | "proposal";
  /** Your code. */
  handler: ToolHandler<Input, Output>;
}

export interface AgentDefinition {
  /** Must match `slug` in renowide.yaml. */
  slug: string;
  /** Must match `name` in renowide.yaml. */
  name: string;
  tools: Tool<any, any>[];
  /**
   * Optional lifecycle hooks. Called by the Renowide runtime around
   * hire events so you can cache per-hire data on your side.
   */
  onHire?: (ctx: AgentContext) => Promise<void>;
  onHireEnd?: (ctx: AgentContext) => Promise<void>;
}

export interface SandboxReport {
  passed: boolean;
  toolsExercised: Array<{
    name: string;
    runs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    creditsPerRun: number;
    auditEvents: number;
    failed: number;
  }>;
  complianceChecks: {
    residencyEnforced: boolean;
    manifestMatchesRuntime: boolean;
    auditTrailSchemaValid: boolean;
  };
  revenueProjection: Array<{
    hiresPerMonth: number;
    grossEuroPerMonth: number;
  }>;
  warnings: string[];
}
