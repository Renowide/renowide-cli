/**
 * renowide.yaml parser + validator — v0.5.
 *
 * The shape here MUST stay in lockstep with the backend's pydantic
 * models in ``app/schemas/agent_manifest.py``. Add new fields on both
 * sides in the same commit.
 *
 * v0.1 manifests validate unchanged because every new field is
 * optional.
 */

import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";

// ─── Pricing ─────────────────────────────────────────────────────────────────

export const PricingBaseSchema = z.object({
  model: z
    .enum(["per_run", "per_hour", "per_day", "per_token", "subscription"])
    .default("per_run"),
  price_credits: z.number().int().nonnegative().optional(),
  monthly_subscription_credits: z.number().int().nonnegative().optional(),
  per_token_credits: z.number().nonnegative().optional(),
  free_runs: z.number().int().nonnegative().optional().default(0),
});

export const PricingSchema = z
  .object({
    default: PricingBaseSchema.optional(),
    capabilities: z.record(z.string(), PricingBaseSchema).optional().default({}),
    // v0.1 flat shape
    model: z
      .enum(["per_run", "per_hour", "per_day", "per_token", "subscription"])
      .optional(),
    price_credits: z.number().int().nonnegative().optional(),
    monthly_subscription_credits: z.number().int().nonnegative().optional(),
    per_token_credits: z.number().nonnegative().optional(),
    free_runs: z.number().int().nonnegative().optional(),
  })
  .refine(
    (p) => Boolean(p.default) || Boolean(p.model),
    "pricing must specify either `default: {…}` (v0.5) or `model:` (v0.1)",
  );

// ─── Capabilities ────────────────────────────────────────────────────────────

export const CapabilitySchema = z.object({
  id: z.string().min(1),
  description: z.string().optional(),
  input_schema: z.string().optional(),
  output_schema: z.string().optional(),
  governance: z.enum(["auto_run", "requires_approval", "notify_only"]).optional(),
  rate_limit: z.string().regex(/^\d+\/(second|minute|hour|day)$/).optional(),
  confirmation_prompt: z.string().optional(),
});

// ─── Compliance / governance / models ────────────────────────────────────────

export const ComplianceSchema = z.object({
  data_residency: z.array(z.string()).optional().default([]),
  jurisdiction: z.array(z.string()).optional().default([]),
  tags: z.array(z.string()).optional().default([]),
  supported_languages: z.array(z.string()).optional().default(["en"]),
});

export const GovernanceSchema = z.object({
  auto_run: z.array(z.string()).optional().default([]),
  requires_approval: z.array(z.string()).optional().default([]),
});

export const ModelUsedSchema = z.object({
  provider: z.string(),
  model: z.string(),
});

// ─── Assets ──────────────────────────────────────────────────────────────────

const httpUrl = z.string().url().refine((u) => /^https?:\/\//.test(u), "must be http(s)");

export const AssetsSchema = z.object({
  logo: httpUrl.optional(),
  avatar: httpUrl.optional(),
  hero: httpUrl.optional(),
  screenshots: z.array(httpUrl).max(6).optional().default([]),
  demo_video: httpUrl.optional(),
});

// ─── Hire page ───────────────────────────────────────────────────────────────

export const ProofSchema = z.object({
  label: z.string(),
  verified_at: z.string().optional(),
  verifier: z.enum(["self", "renowide", "third_party"]).default("self"),
  evidence_url: httpUrl.optional(),
});

export const TeamBehindSchema = z.object({
  website: httpUrl.optional(),
  company: z.string().optional(),
  country: z.string().optional(),
});

export const HirePageSchema = z.object({
  what_it_does: z.array(z.string()).max(8).optional().default([]),
  proof: z.array(ProofSchema).max(5).optional().default([]),
  team_behind: TeamBehindSchema.optional(),
});

// ─── Integrations ────────────────────────────────────────────────────────────

export const EmployerIntegrationSchema = z.object({
  provider: z.string(),
  label: z.string().optional(),
  connection_type: z.enum(["oauth2", "api_key", "webhook"]).default("oauth2"),
  scopes: z.array(z.string()).optional().default([]),
  instructions: z.string().optional(),
  required: z.boolean().optional().default(false),
});

export const PlatformIntegrationSchema = z.object({
  provider: z.string(),
  label: z.string().optional(),
  icon: z.string().optional(),
  description: z.string().optional(),
  api_key_required: z.boolean().optional().default(false),
  env_var: z.string().optional(),
});

export const IntegrationsSchema = z.object({
  platform: z.array(PlatformIntegrationSchema).optional().default([]),
  employer: z.array(EmployerIntegrationSchema).optional().default([]),
});

// ─── Schedule ────────────────────────────────────────────────────────────────

export const EventTriggerSchema = z.object({
  provider: z.string(),
  event: z.string(),
  description: z.string().optional(),
});

export const ScheduleSchema = z.object({
  run: z.enum(["daily_6am", "every_6h", "every_hour", "weekly_mon", "on_demand"]).optional(),
  events: z.array(EventTriggerSchema).optional().default([]),
});

// ─── Canvas Kit blocks ───────────────────────────────────────────────────────

const whenExpr = z.string().max(200).optional();
const blockBase = { when: whenExpr };

export const BlockHeaderSchema = z.object({
  ...blockBase,
  type: z.literal("header"),
  text: z.string().max(200),
});
export const BlockSectionSchema = z.object({
  ...blockBase,
  type: z.literal("section"),
  text: z.string().max(4000),
});
export const BlockDividerSchema = z.object({ ...blockBase, type: z.literal("divider") });
export const BlockInfoCalloutSchema = z.object({
  ...blockBase,
  type: z.literal("info_callout"),
  variant: z.enum(["info", "warn", "success"]).default("info"),
  text: z.string().max(1000),
});
export const BlockImageSchema = z.object({
  ...blockBase,
  type: z.literal("image"),
  url: httpUrl,
  alt: z.string().max(200),
  caption: z.string().max(200).optional(),
});
export const BlockIntegrationButtonSchema = z.object({
  ...blockBase,
  type: z.literal("integration_button"),
  provider: z.string(),
  scopes: z.array(z.string()).optional().default([]),
  required: z.boolean().optional().default(false),
  label: z.string().optional(),
});
export const BlockApiKeyInputSchema = z.object({
  ...blockBase,
  type: z.literal("api_key_input"),
  id: z.string(),
  label: z.string(),
  placeholder: z.string().optional(),
  help_url: httpUrl.optional(),
  required: z.boolean().optional().default(false),
});
export const BlockOAuthButtonSchema = z.object({
  ...blockBase,
  type: z.literal("oauth_button"),
  provider: z.string(),
  label: z.string().optional(),
  scopes: z.array(z.string()).optional().default([]),
});
export const BlockCheckboxSchema = z.object({
  ...blockBase,
  type: z.literal("checkbox"),
  id: z.string(),
  text: z.string().max(500),
  required: z.boolean().optional().default(false),
  default: z.boolean().optional().default(false),
});
export const BlockTextInputSchema = z.object({
  ...blockBase,
  type: z.literal("text_input"),
  id: z.string(),
  label: z.string(),
  placeholder: z.string().optional(),
  required: z.boolean().optional().default(false),
  pattern: z.string().optional(),
});
export const BlockCTASchema = z.object({
  ...blockBase,
  type: z.literal("cta"),
  text: z.string().max(80),
  action: z.string().max(120),
  style: z.enum(["primary", "secondary"]).default("primary"),
});
export const BlockLinkButtonSchema = z.object({
  ...blockBase,
  type: z.literal("link_button"),
  text: z.string().max(80),
  url: httpUrl,
});
export const BlockQuickReplySchema = z.object({
  ...blockBase,
  type: z.literal("quick_reply"),
  prompts: z.array(z.string()).min(1).max(4),
});
export const BlockKPISchema = z.object({
  ...blockBase,
  type: z.literal("kpi"),
  label: z.string().max(80),
  value: z.string().max(80),
  trend: z.string().max(40).optional(),
});
export const BlockTableSchema = z.object({
  ...blockBase,
  type: z.literal("table"),
  columns: z.array(z.string()).min(1).max(6),
  rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))).max(10),
});

export const CanvasBlockSchema = z.discriminatedUnion("type", [
  BlockHeaderSchema,
  BlockSectionSchema,
  BlockDividerSchema,
  BlockInfoCalloutSchema,
  BlockImageSchema,
  BlockIntegrationButtonSchema,
  BlockApiKeyInputSchema,
  BlockOAuthButtonSchema,
  BlockCheckboxSchema,
  BlockTextInputSchema,
  BlockCTASchema,
  BlockLinkButtonSchema,
  BlockQuickReplySchema,
  BlockKPISchema,
  BlockTableSchema,
]);

// ─── Chat / post_hire / dashboard ────────────────────────────────────────────

export const ChatSchema = z.object({
  primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  avatar: httpUrl.optional(),
  greeting: z.string().max(400).optional(),
  starter_prompts: z.array(z.string()).max(4).optional().default([]),
  canvas: z.array(CanvasBlockSchema).optional().default([]),
});

export const PostHireSchema = z.object({
  welcome_message: z.string().max(500).optional(),
  welcome_canvas: z.array(CanvasBlockSchema).optional().default([]),
});

export const TileSourceSchema = z.object({
  type: z.enum(["tool_call", "static"]).default("tool_call"),
  tool: z.string().optional(),
  data: z.record(z.string(), z.any()).optional(),
});

export const DashboardTileSchema = z.object({
  id: z.string(),
  title: z.string().max(100),
  size: z.enum(["small", "medium", "large"]).default("small"),
  source: TileSourceSchema.optional(),
  render: z.array(CanvasBlockSchema).optional().default([]),
});

export const DashboardSchema = z.object({
  tiles: z.array(DashboardTileSchema).max(12).optional().default([]),
});

// ─── Root ────────────────────────────────────────────────────────────────────

export const ManifestSchema = z.object({
  name: z.string().min(3).max(150),
  slug: z.string().regex(/^[a-z0-9-]+$/, "slug must be lowercase-kebab-case"),
  tagline: z.string().max(255).optional().default(""),
  description: z.string().max(8000).optional().default(""),
  guild: z.string(),
  layer: z.number().int().min(1).max(3).optional().default(2),
  team_only: z.boolean().optional().default(false),
  protocol: z.enum(["mcp", "webhook", "native", "gitlab_repo"]).default("mcp"),
  endpoint: z.string().url().optional(),
  pricing: PricingSchema,
  compliance: ComplianceSchema.optional().default({
    data_residency: [],
    jurisdiction: [],
    tags: [],
    supported_languages: ["en"],
  }),
  capabilities: z.array(CapabilitySchema).min(1),
  governance: GovernanceSchema.optional().default({ auto_run: [], requires_approval: [] }),
  models_used: z.array(ModelUsedSchema).optional().default([]),
  assets: AssetsSchema.optional().default({
    screenshots: [],
  }),
  hire_page: HirePageSchema.optional().default({
    what_it_does: [],
    proof: [],
  }),
  integrations: IntegrationsSchema.optional().default({ platform: [], employer: [] }),
  schedule: ScheduleSchema.optional().default({ events: [] }),
  chat: ChatSchema.optional().default({ starter_prompts: [], canvas: [] }),
  post_hire: PostHireSchema.optional().default({ welcome_canvas: [] }),
  dashboard: DashboardSchema.optional().default({ tiles: [] }),
  i18n: z.record(z.string(), z.record(z.string(), z.string())).optional().default({}),
  is_public: z.boolean().optional().default(true),
});

export type Manifest = z.infer<typeof ManifestSchema>;
export type CanvasBlock = z.infer<typeof CanvasBlockSchema>;

// ─── Loader ──────────────────────────────────────────────────────────────────

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
  validateWhenExpressions(result.data);
  return result.data;
}

// ─── `when:` validator (bounded grammar, matches backend) ────────────────────

const WHEN_TOKEN_RE =
  /\s*(?:(\|\||&&|==|!=|<=|>=|<|>|!|\(|\))|(\d+(?:\.\d+)?)|("(?:\\.|[^"\\])*")|(true|false)|([a-zA-Z_][a-zA-Z0-9_.]*))/y;

function tokenise(expr: string): string[] {
  if (expr.length > 200) throw new Error(`\`when\` exceeds 200 chars: ${expr}`);
  const out: string[] = [];
  WHEN_TOKEN_RE.lastIndex = 0;
  let pos = 0;
  while (pos < expr.length) {
    WHEN_TOKEN_RE.lastIndex = pos;
    const m = WHEN_TOKEN_RE.exec(expr);
    if (!m || m.index !== pos) {
      throw new Error(`unexpected character at ${pos}: ${JSON.stringify(expr.slice(pos, pos + 8))}`);
    }
    pos = WHEN_TOKEN_RE.lastIndex;
    out.push(m[0].trim());
  }
  return out.filter(Boolean);
}

export function validateWhen(expr: string): void {
  tokenise(expr); // throws on bad chars; full parse is done server-side
}

function walkCanvases(m: Manifest): CanvasBlock[] {
  const all: CanvasBlock[] = [];
  all.push(...m.chat.canvas);
  all.push(...m.post_hire.welcome_canvas);
  for (const t of m.dashboard.tiles) all.push(...t.render);
  return all;
}

export function validateWhenExpressions(m: Manifest): void {
  for (const b of walkCanvases(m)) {
    if ((b as any).when) {
      try {
        validateWhen((b as any).when);
      } catch (err: any) {
        throw new Error(`Invalid \`when\` on ${(b as any).type} block: ${err.message}`);
      }
    }
  }
}

// ─── Backward-compat export (still used by publish.ts if invoked) ────────────

export function manifestToRegistrationPayload(m: Manifest) {
  // The backend now parses the full manifest shape directly via
  // ``app.schemas.agent_manifest.AgentManifest``. We just pass the
  // validated manifest through as-is.
  return m;
}
