/**
 * Error classes handlers may throw and the runtime will surface with
 * the right semantics to the buyer (billing/audit/UI).
 */

export class AgentSDKError extends Error {
  readonly kind: string;
  constructor(kind: string, message: string) {
    super(message);
    this.name = "AgentSDKError";
    this.kind = kind;
  }
}

/**
 * Throw when the remaining credits on a hire are insufficient for the
 * requested operation. The runtime will surface this to the buyer as a
 * "budget exceeded" notification and stop billing.
 */
export class BudgetExceededError extends AgentSDKError {
  readonly requiredCredits: number;
  readonly remainingCredits: number;
  constructor(requiredCredits: number, remainingCredits: number) {
    super(
      "budget_exceeded",
      `Tool requires ${requiredCredits} credits but only ${remainingCredits} remain on this hire.`,
    );
    this.name = "BudgetExceededError";
    this.requiredCredits = requiredCredits;
    this.remainingCredits = remainingCredits;
  }
}

/**
 * Throw when the tool's input fails validation. The runtime will NOT
 * charge for the run and will return a 400-equivalent to the buyer's
 * client.
 */
export class ValidationError extends AgentSDKError {
  readonly field?: string;
  constructor(message: string, field?: string) {
    super("validation", message);
    this.name = "ValidationError";
    this.field = field;
  }
}
