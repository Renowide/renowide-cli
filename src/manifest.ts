/**
 * renowide.yaml parsing + validation.
 *
 * The shape here must stay in lockstep with the backend's manifest
 * endpoint. Any new field must be accepted by both sides.
 */

import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";

export const PricingSchema = z.object({
  model: z.enum(["per_run", "per_hour", "per_token", "subscription"]),
  price_credits: z.number().int().nonnegative().optional(),
  monthly_subscription_credits: z.number().int().nonnegative().optional(),
  per_token_credits: z.number().nonnegative().optional(),
  free_runs: z.number().int().nonnegative().optional().default(0),
});

export const CapabilitySchema = z.object({
  id: z.string().min(1),
  description: z.string().optional(),
  input_schema: z.string().optional(),
  output_schema: z.string().optional(),
});

export const ComplianceSchema = z.object({
  data_residency: z.array(z.string()).optional().default([]),
  jurisdiction: z.array(z.string()).optional().default([]),
  tags: z.array(z.string()).optional().default([]),
});

export const GovernanceSchema = z.object({
  auto_run: z.array(z.string()).optional().default([]),
  requires_approval: z.array(z.string()).optional().default([]),
});

export const ModelUsedSchema = z.object({
  provider: z.string(),
  model: z.string(),
});

export const ManifestSchema = z.object({
  name: z.string().min(3).max(150),
  slug: z.string().regex(/^[a-z0-9-]+$/, "slug must be lowercase-kebab-case"),
  tagline: z.string().max(255).optional().default(""),
  description: z.string().optional().default(""),
  guild: z.string(),
  layer: z.number().int().min(1).max(3).optional().default(2),
  protocol: z.enum(["mcp", "webhook", "native", "gitlab_repo"]).default("mcp"),
  endpoint: z.string().url().optional(),
  pricing: PricingSchema,
  compliance: ComplianceSchema.optional().default({ data_residency: [], jurisdiction: [], tags: [] }),
  capabilities: z.array(CapabilitySchema).min(1),
  governance: GovernanceSchema.optional().default({ auto_run: [], requires_approval: [] }),
  models_used: z.array(ModelUsedSchema).optional().default([]),
  is_public: z.boolean().optional().default(true),
});

export type Manifest = z.infer<typeof ManifestSchema>;

export function readManifest(manifestPath: string): Manifest {
  const absolute = path.resolve(process.cwd(), manifestPath);
  if (!fs.existsSync(absolute)) {
    throw new Error(
      `renowide.yaml not found at ${manifestPath}. Run \`renowide init --in-place\` to create one.`,
    );
  }
  const raw = fs.readFileSync(absolute, "utf8");
  let parsed: unknown;
  try {
    parsed = YAML.parse(raw);
  } catch (err: any) {
    throw new Error(`Invalid YAML in ${manifestPath}: ${err?.message ?? err}`);
  }
  const result = ManifestSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Manifest validation failed:\n${issues}`);
  }
  return result.data;
}

/**
 * Map the manifest to the existing backend AgentRegistrationPayload
 * shape — keeps one source of truth on the server.
 */
export function manifestToRegistrationPayload(m: Manifest) {
  const connectionType =
    m.protocol === "mcp"
      ? "mcp"
      : m.protocol === "webhook"
      ? "webhook"
      : m.protocol === "gitlab_repo"
      ? "gitlab_repo"
      : "native";

  const billingModel =
    m.pricing.model === "subscription" && m.pricing.monthly_subscription_credits
      ? "per_day"
      : m.pricing.model === "per_hour"
      ? "per_hour"
      : m.pricing.model === "per_token"
      ? "per_token"
      : "per_run";

  const baseCreditCost =
    m.pricing.price_credits ??
    m.pricing.monthly_subscription_credits ??
    Math.max(1, Math.round((m.pricing.per_token_credits ?? 0.5) * 1000));

  return {
    name: m.name,
    tagline: m.tagline,
    description: m.description,
    guild_id: m.guild,
    layer: m.layer,
    autonomy_default: m.governance.auto_run.length > 0 ? "semi_auto" : "proposal_only",
    base_credit_cost: baseCreditCost,
    billing_model: billingModel,
    skills: m.capabilities.map((c) => c.id),
    api_scopes: [],
    what_it_does: [m.tagline].filter(Boolean),
    connection_type: connectionType,
    repo_url: undefined as string | undefined,
    webhook_url: connectionType === "webhook" ? m.endpoint : undefined,
    is_public: m.is_public,
    slug: m.slug,
    compliance: m.compliance,
    governance: m.governance,
    models_used: m.models_used,
    capabilities: m.capabilities,
    pricing: m.pricing,
  };
}
