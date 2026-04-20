/**
 * Minimal MCP-compatible HTTP server for a Renowide agent.
 *
 * This is intentionally dependency-light — a thin wrapper over Node's
 * built-in http module so the starter kit can run anywhere (Fly,
 * Render, Vercel, a Raspberry Pi). If you want richer transport
 * (streaming, websockets, etc.) you can call the raw handler fn
 * yourself; see `defineAgent().dispatch`.
 */

import { createServer, IncomingMessage, ServerResponse } from "node:http";
import type { AgentContext, AgentDefinition, Tool, AuditLogger } from "./types.js";
import { AgentSDKError } from "./errors.js";

interface RuntimeDefinition extends AgentDefinition {
  dispatch: (toolName: string, input: unknown, ctx: AgentContext) => Promise<unknown>;
}

export function defineAgent(def: AgentDefinition): RuntimeDefinition {
  const byName = new Map<string, Tool<any, any>>();
  for (const tool of def.tools) {
    if (byName.has(tool.name)) {
      throw new Error(`Duplicate tool name in agent "${def.slug}": ${tool.name}`);
    }
    byName.set(tool.name, tool);
  }

  const dispatch = async (toolName: string, input: unknown, ctx: AgentContext) => {
    const tool = byName.get(toolName);
    if (!tool) {
      throw new AgentSDKError("unknown_tool", `No tool "${toolName}" on agent "${def.slug}"`);
    }
    return await tool.handler(input, ctx);
  };

  return { ...def, dispatch };
}

interface StartMCPServerOptions {
  port?: number;
  /**
   * Optional shared secret. Renowide will send the agent's
   * webhook_secret as `Authorization: Bearer <secret>`. In dev you can
   * leave this empty; in prod always set it to `process.env.RENOWIDE_WEBHOOK_SECRET`.
   */
  sharedSecret?: string;
  /**
   * Called when the agent receives a request but the request isn't
   * from Renowide (e.g. direct MCP client). Use this for local tests.
   */
  anonymousContext?: (toolName: string) => AgentContext;
}

export function startMCPServer(
  agent: RuntimeDefinition,
  options: StartMCPServerOptions = {},
): { close: () => Promise<void> } {
  const port = options.port ?? Number(process.env.PORT ?? 8787);

  const server = createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      return json(res, 200, { ok: true, agent: agent.slug });
    }
    if (req.method !== "POST" || !req.url?.startsWith("/mcp")) {
      return json(res, 404, { error: "not_found" });
    }

    if (options.sharedSecret) {
      const auth = req.headers["authorization"] ?? "";
      if (auth !== `Bearer ${options.sharedSecret}`) {
        return json(res, 401, { error: "unauthorised" });
      }
    }

    let raw = "";
    for await (const chunk of req) raw += chunk;
    let payload: any;
    try {
      payload = JSON.parse(raw);
    } catch {
      return json(res, 400, { error: "invalid_json" });
    }

    const toolName = String(payload?.tool ?? "");
    const input = payload?.input ?? {};
    const hire = payload?.hire;
    const compliance = payload?.compliance;
    const traceId = String(payload?.traceId ?? cryptoRandomId());

    const ctx: AgentContext =
      hire && compliance
        ? {
            hire,
            compliance,
            audit: buildAuditLogger(traceId),
            signal: new AbortController().signal,
            traceId,
          }
        : options.anonymousContext?.(toolName) ?? buildAnonymousContext(traceId);

    try {
      const result = await agent.dispatch(toolName, input, ctx);
      return json(res, 200, { ok: true, result, traceId });
    } catch (err: any) {
      const kind = err?.kind ?? "internal_error";
      const message = err?.message ?? "unknown error";
      const status = kind === "validation" ? 400 : kind === "budget_exceeded" ? 402 : 500;
      return json(res, status, { ok: false, error: { kind, message }, traceId });
    }
  });

  server.listen(port, () => {
    console.log(`[renowide] ${agent.slug} listening on :${port}`);
  });

  return {
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function cryptoRandomId(): string {
  return `tr_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function buildAuditLogger(traceId: string): AuditLogger {
  const emit = (level: string, eventType: string, payload: Record<string, unknown>) => {
    const entry = { ts: new Date().toISOString(), level, traceId, eventType, ...payload };
    // The Renowide runtime intercepts stdout and forwards to the audit
    // store. Emitting as one-line JSON keeps it pipe-safe.
    process.stdout.write(JSON.stringify(entry) + "\n");
  };
  return {
    log: (t, p) => emit("info", t, p),
    warn: (t, p) => emit("warn", t, p),
    error: (t, p) => emit("error", t, p),
  };
}

function buildAnonymousContext(traceId: string): AgentContext {
  return {
    hire: {
      hireId: "anonymous",
      workspaceId: "local",
      workspaceJurisdiction: null,
      billingModel: "per_run",
      remainingCredits: Number.MAX_SAFE_INTEGER,
      creditBudget: Number.MAX_SAFE_INTEGER,
    },
    compliance: {
      allowedResidency: ["EU", "US", "ANY"],
      tags: [],
      jurisdiction: [],
    },
    audit: buildAuditLogger(traceId),
    signal: new AbortController().signal,
    traceId,
  };
}
