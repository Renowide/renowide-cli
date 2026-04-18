/**
 * Thin typed HTTP client for the Renowide API used by the CLI.
 *
 * Authentication: every authenticated call sends
 *   Authorization: Bearer rw_key_...
 * The `rw_key_` is minted on login (see ./commands/login.ts) and is the
 * same token a creator uses against Claude Desktop / Cursor / the EV
 * MCP server — one token, unified lifecycle.
 *
 * Endpoints the CLI touches:
 *   POST /api/v1/creator/cli/device-code             — start device-code flow
 *   POST /api/v1/creator/cli/device-code/poll        — poll for approval
 *   GET  /api/v1/creator/me                          — whoami
 *   POST /api/v1/creator/agents/manifest             — publish from YAML manifest
 *   POST /api/v1/creator/agents/sync-from-repo       — register from GitLab/GitHub
 *   GET  /api/v1/creator/agents                      — list creator's agents
 *   GET  /api/v1/creator/earnings                    — payout dashboard data
 *   POST /api/v1/creator/agents/{slug}/sandbox       — run platform-side sandbox
 */

export interface APIError {
  status: number;
  body: any;
  message: string;
}

export class RenowideAPI {
  constructor(
    private readonly base: string,
    private readonly token?: string,
  ) {}

  async post<T>(pathname: string, body: unknown): Promise<T> {
    return this.request<T>("POST", pathname, body);
  }

  async get<T>(pathname: string): Promise<T> {
    return this.request<T>("GET", pathname);
  }

  private async request<T>(
    method: "GET" | "POST",
    pathname: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.base.replace(/\/$/, "")}${pathname}`;
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "user-agent": `renowide-cli/0.1.0 (${process.platform})`,
    };
    if (this.token) headers["authorization"] = `Bearer ${this.token}`;

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    let parsed: any;
    const text = await res.text();
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }

    if (!res.ok) {
      const message =
        (parsed && (parsed.detail || parsed.message || parsed.error)) ||
        `HTTP ${res.status} at ${pathname}`;
      const err: APIError = { status: res.status, body: parsed, message };
      throw Object.assign(new Error(message), err);
    }
    return parsed as T;
  }
}
