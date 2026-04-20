/**
 * Sample tool — summarise.
 *
 * Replace this file with your own intelligence. The structure is the
 * contract Renowide expects:
 *
 *   1. Declare a Tool<Input, Output>
 *   2. Validate input (throw ValidationError on bad input)
 *   3. Do the work
 *   4. Log every material decision to ctx.audit
 *   5. Return a typed result
 *
 * Renowide handles billing, workspace isolation, approvals, and the
 * audit trail around your handler — you don't touch any of it.
 */

import { z } from "zod";
import {
  Tool,
  AgentContext,
  ValidationError,
  BudgetExceededError,
} from "@renowide/agent-sdk";

const SummariseInput = z.object({
  text: z.string().min(1),
  max_bullets: z.number().int().positive().max(10).default(7),
});

const SummariseOutput = z.object({
  bullets: z.array(z.string()),
  source_tokens: z.number(),
});

type SummariseInput = z.infer<typeof SummariseInput>;
type SummariseOutput = z.infer<typeof SummariseOutput>;

const CREDITS_PER_RUN = 20;

export const summariseTool: Tool<SummariseInput, SummariseOutput> = {
  name: "summarise",
  description: "Reduce any text to 5–7 bullet points, <=200 tokens.",
  governance: "auto",
  async handler(rawInput, ctx: AgentContext) {
    const parsed = SummariseInput.safeParse(rawInput);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues[0]?.message ?? "invalid input",
        parsed.error.issues[0]?.path.join(".") || undefined,
      );
    }
    const input = parsed.data;

    if (ctx.hire.remainingCredits < CREDITS_PER_RUN) {
      throw new BudgetExceededError(CREDITS_PER_RUN, ctx.hire.remainingCredits);
    }

    ctx.audit.log("summarise_started", {
      sourceLength: input.text.length,
      maxBullets: input.max_bullets,
    });

    const sentences = input.text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const bullets = sentences.slice(0, input.max_bullets).map((s) =>
      s.replace(/\s+/g, " ").slice(0, 140),
    );

    ctx.audit.log("summarise_completed", {
      bulletCount: bullets.length,
      creditsConsumed: CREDITS_PER_RUN,
    });

    const result: SummariseOutput = {
      bullets,
      source_tokens: Math.round(input.text.length / 4),
    };
    return SummariseOutput.parse(result);
  },
};
