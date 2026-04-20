/**
 * Manifest-side schema for the `canvas` block that lives inside
 * `renowide.json` (Persona A) or `renowide.yaml` (Persona B).
 *
 * Mirrors `ManifestCanvasBlock` in `backend/app/schemas/canvas.py`. When
 * a developer runs `renowide deploy`, the CLI serialises this structure
 * up to Renowide's publish service, which populates
 * `agent_profiles.hire_flow_canvas_url`, `post_hire_canvas_url`,
 * `action_webhook_url`, and the custom-embed allowlist from it.
 */

import { z } from "zod";
import { SemverSchema, CANVAS_KIT_VERSION } from "./canvas.js";

export const ManifestCanvasHireFlowSchema = z
  .object({
    canvas_url: z.string().url(),
    max_duration_seconds: z.number().int().min(30).max(3600).default(600),
    requires_auth: z.boolean().default(false),
  })
  .strict();

export type ManifestCanvasHireFlow = z.infer<typeof ManifestCanvasHireFlowSchema>;

export const ManifestCanvasPostHireSchema = z
  .object({
    canvas_url: z.string().max(2000),
    state_stream_url: z.string().max(2000).optional(),
    cache_ttl_seconds: z.number().int().min(0).max(86_400).default(0),
  })
  .strict();

export type ManifestCanvasPostHire = z.infer<typeof ManifestCanvasPostHireSchema>;

export const ManifestCanvasCustomEmbedSchema = z
  .object({
    allowed_origins: z.array(z.string().url()).max(10).default([]),
    verification_file: z.string().default("/.well-known/renowide-embed.txt"),
  })
  .strict();

export type ManifestCanvasCustomEmbed = z.infer<typeof ManifestCanvasCustomEmbedSchema>;

export const ManifestCanvasAnalyticsSchema = z
  .object({
    events: z
      .array(
        z.enum([
          "canvas_viewed",
          "block_interacted",
          "wizard_step_completed",
          "action_triggered",
          "custom_embed_loaded",
          "canvas_error",
        ]),
      )
      .default([]),
    webhook_url: z.string().url().optional(),
  })
  .strict();

export type ManifestCanvasAnalytics = z.infer<typeof ManifestCanvasAnalyticsSchema>;

export const ManifestCanvasBlockSchema = z
  .object({
    ui_kit_version: SemverSchema.default(CANVAS_KIT_VERSION),
    hire_flow: ManifestCanvasHireFlowSchema.optional(),
    post_hire: ManifestCanvasPostHireSchema.optional(),
    custom_embed: ManifestCanvasCustomEmbedSchema.optional(),
    analytics: ManifestCanvasAnalyticsSchema.optional(),
  })
  .strict();

export type ManifestCanvasBlock = z.infer<typeof ManifestCanvasBlockSchema>;
