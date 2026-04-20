/**
 * RenowideMcpClient — agent-as-client helper.
 *
 * Lets a deployed Renowide agent call back into the Renowide MCP server
 * with its own `rw_key_` token. The primary use case is cross-agent
 * collaboration:
 *
 *   - `delegate_task` to another hired specialist
 *   - `submit_proposal` for a governed action
 *   - `log_agent_action` / `write_guild_memory` to share context
 *   - `get_knowledge_base` / `get_attached_skills` to read hire-scoped config
 *
 * The Renowide MCP server speaks JSON-RPC 2.0 at
 *   POST https://renowide.com/api/v1/mcp
 * with `Authorization: Bearer <rw_key_...>`.
 *
 * This helper is intentionally thin — it wraps JSON-RPC framing and the
 * "result.content[0].text is JSON" convention so your handler gets a
 * plain object back.
 */
export interface RenowideMcpClientOptions {
  /**
   * Full MCP endpoint URL. Defaults to the value of `RW_MCP_URL`, then
   * to the production Renowide MCP URL. Override in tests.
   */
  mcpUrl?: string;
  /**
   * The `rw_key_...` token. Defaults to `RW_HIRE_TOKEN`
   * (the per-hire token Renowide injects into hosted agents), then to
   * `RENOWIDE_API_KEY` (your personal creator key).
   */
  token?: string;
  /** Request timeout in ms. Default 20_000. */
  timeoutMs?: number;
  /** Injected fetch implementation. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export class RenowideMcpClient {
  private readonly mcpUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: RenowideMcpClientOptions = {}) {
    this.mcpUrl =
      options.mcpUrl ??
      process.env.RW_MCP_URL ??
      "https://renowide.com/api/v1/mcp";
    const token =
      options.token ??
      process.env.RW_HIRE_TOKEN ??
      process.env.RENOWIDE_API_KEY ??
      "";
    if (!token) {
      throw new Error(
        "RenowideMcpClient: missing token. Pass `token` or set RW_HIRE_TOKEN / RENOWIDE_API_KEY.",
      );
    }
    this.token = token;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /** List every tool the Renowide MCP server exposes to this token. */
  async listTools(): Promise<McpToolInfo[]> {
    const res = await this.rpc<{ tools: McpToolInfo[] }>("tools/list", {});
    return res.tools ?? [];
  }

  /**
   * Call a Renowide MCP tool by name. Arguments are sent as-is under
   * `params.arguments`. The MCP server returns `result.content[]`;
   * when the first content item is JSON we parse it transparently, so
   * typical callers receive a plain object.
   */
  async callTool<T = unknown>(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<T> {
    const raw = await this.rpc<{ content?: Array<{ type: string; text: string }> }>(
      "tools/call",
      { name, arguments: args },
    );
    const first = raw?.content?.[0];
    if (first?.type === "text" && typeof first.text === "string") {
      const text = first.text.trim();
      if (text.startsWith("{") || text.startsWith("[")) {
        try {
          return JSON.parse(text) as T;
        } catch {
          // fall through; caller gets the raw text
        }
      }
      return first.text as unknown as T;
    }
    return raw as unknown as T;
  }

  private async rpc<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const id = `rw_${Date.now().toString(36)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(this.mcpUrl, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id,
          method,
          params,
        }),
      });
      const body: any = await response.json().catch(() => ({}));
      if (!response.ok || body?.error) {
        const message = body?.error?.message ?? `Renowide MCP ${method} failed (${response.status})`;
        const code = body?.error?.code ?? response.status;
        throw new RenowideMcpError(message, code, method);
      }
      return body.result as T;
    } finally {
      clearTimeout(timer);
    }
  }
}

export class RenowideMcpError extends Error {
  readonly code: number | string;
  readonly method: string;
  constructor(message: string, code: number | string, method: string) {
    super(message);
    this.name = "RenowideMcpError";
    this.code = code;
    this.method = method;
  }
}
