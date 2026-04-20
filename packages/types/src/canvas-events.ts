/**
 * Canvas Kit v2 action/webhook event schemas.
 *
 * These mirror `backend/app/services/canvas/action_dispatcher.py`. They
 * describe:
 *
 *   1. The request body Renowide POSTs to the developer's
 *      `action_webhook_url` when an `action_button` fires.
 *   2. The JSON envelope the developer must return (`ActionInvokeResponse`).
 *   3. The state-patch ops the developer may include in that response.
 *
 * If you're writing an action webhook handler in TypeScript (Express,
 * Fastify, Hono, …), import `ActionInvokeRequestSchema` /
 * `ActionInvokeResponseSchema` from here — they're the canonical shape
 * Renowide ships.
 */

import { z } from "zod";

// ─── State-patch operations ────────────────────────────────────────────────

export const StatePatchOpSetSchema = z
  .object({
    op: z.literal("set"),
    path: z.string().min(1).max(200),
    value: z.unknown().optional(),
  })
  .strict();

export const StatePatchOpMergeSchema = z
  .object({
    op: z.literal("merge"),
    path: z.string().min(1).max(200),
    value: z.record(z.string(), z.unknown()),
  })
  .strict();

export const StatePatchOpPushSchema = z
  .object({
    op: z.literal("push"),
    path: z.string().min(1).max(200),
    value: z.unknown().optional(),
  })
  .strict();

export const StatePatchOpUnsetSchema = z
  .object({
    op: z.literal("unset"),
    path: z.string().min(1).max(200),
  })
  .strict();

export const StatePatchOpSchema = z.discriminatedUnion("op", [
  StatePatchOpSetSchema,
  StatePatchOpMergeSchema,
  StatePatchOpPushSchema,
  StatePatchOpUnsetSchema,
]);

export type StatePatchOp = z.infer<typeof StatePatchOpSchema>;

// ─── Toast ──────────────────────────────────────────────────────────────────

export const ToastSchema = z
  .object({
    severity: z.enum(["info", "success", "warn", "error"]).default("info"),
    message: z.string().max(400),
    duration_ms: z.number().int().min(1000).max(30_000).default(4000),
    title: z.string().max(120).optional(),
  })
  .strict();

export type Toast = z.infer<typeof ToastSchema>;

// ─── Request (Renowide → dev) ──────────────────────────────────────────────

export const ActionInvokeRequestSchema = z
  .object({
    ui_kit_version: z.string(),
    agent_slug: z.string(),
    hire_id: z.string().nullable().optional(),
    buyer_id: z.string(),
    block_id: z.string(),
    action: z.string(),
    payload: z.record(z.string(), z.unknown()).nullable().optional(),
    state: z.record(z.string(), z.unknown()),
    idempotency_key: z.string(),
    invoked_at: z.string(),
  })
  .strict();

export type ActionInvokeRequest = z.infer<typeof ActionInvokeRequestSchema>;

// ─── Response (dev → Renowide) ─────────────────────────────────────────────

export const ActionInvokeResponseSchema = z
  .object({
    ok: z.boolean().default(true),
    patch: z.array(StatePatchOpSchema).max(50).optional(),
    toast: ToastSchema.optional(),
    redirect_url: z.string().max(2000).optional(),
    error_message: z.string().max(400).optional(),
  })
  .strict();

export type ActionInvokeResponse = z.infer<typeof ActionInvokeResponseSchema>;

// ─── Canvas fetch (GET) request headers ────────────────────────────────────

export interface CanvasFetchHeaders {
  "User-Agent": string;
  Accept: "application/json";
  "X-Renowide-Agent-Slug": string;
  "X-Renowide-Surface": "hire_flow" | "post_hire";
  "X-Renowide-Request-Id": string;
  "X-Renowide-Timestamp": string;
  "Renowide-Signature": `v1=${string}`;
  "X-Renowide-Buyer-Id"?: string;
  "X-Renowide-Hire-Id"?: string;
}

export interface ActionInvokeHeaders {
  "Content-Type": "application/json";
  "User-Agent": string;
  "X-Renowide-Timestamp": string;
  "X-Renowide-Idempotency-Key": string;
  "Renowide-Signature": `v1=${string}`;
}
