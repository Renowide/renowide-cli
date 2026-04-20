/**
 * Example — agent-as-client (outbound MCP call).
 *
 * This file is NOT wired into server.ts by default. Copy it into your
 * tool handler when your agent needs to call back into Renowide — e.g.
 * to delegate a sub-task to another hired specialist, submit a
 * governed proposal, or write shared memory your guild will see next
 * time you run.
 *
 * Authentication
 * --------------
 * Renowide injects `RW_HIRE_TOKEN` (an `rw_key_...`) into every hosted
 * agent. The token is hire-scoped: it can only call tools allowed by
 * the buyer's governance config for the hire that's currently running.
 *
 * If you run locally for tests, set `RENOWIDE_API_KEY` to your personal
 * creator key from Creator Dashboard → API Keys.
 */

import {
  RenowideMcpClient,
  AgentContext,
  Tool,
  ValidationError,
} from "@renowide/agent-sdk";
import { z } from "zod";

const DelegateInput = z.object({
  target_slug: z.string().min(1),
  capability: z.string().min(1),
  payload: z.record(z.unknown()).default({}),
});
type DelegateInput = z.infer<typeof DelegateInput>;

export const delegateSampleTool: Tool<DelegateInput, unknown> = {
  name: "delegate_to_specialist",
  description: "Delegate a sub-task to another hired Renowide agent.",
  governance: "proposal",
  async handler(rawInput, ctx: AgentContext) {
    const parsed = DelegateInput.safeParse(rawInput);
    if (!parsed.success) {
      throw new ValidationError(
        parsed.error.issues[0]?.message ?? "invalid input",
        parsed.error.issues[0]?.path.join(".") || undefined,
      );
    }
    const input = parsed.data;

    // The SDK reads RW_HIRE_TOKEN / RENOWIDE_API_KEY from env by default.
    // We never write this token to disk or to ctx.audit.
    const rw = new RenowideMcpClient();

    ctx.audit.log("delegation_started", {
      target: input.target_slug,
      capability: input.capability,
    });

    const result = await rw.callTool("delegate_task", {
      target_slug: input.target_slug,
      capability: input.capability,
      payload: input.payload,
      trace_id: ctx.traceId,
    });

    ctx.audit.log("delegation_completed", { target: input.target_slug });
    return result;
  },
};
