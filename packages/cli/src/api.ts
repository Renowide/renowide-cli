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
 *
 * Resilience:
 *   - Every request is wrapped in a 30 s AbortSignal so a hung backend
 *     does not hang the CLI forever.
 *   - Transient 5xx and network errors are retried once with a 500 ms
 *     jittered backoff. Device-code POLL is excluded (the caller owns
 *     its own polling cadence) — pass `retry: false` to opt out.
 */

import { USER_AGENT } from "./version.js";

export interface APIError {
  status: number;
  body: any;
  message: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);

export interface RequestOptions {
  /** Override the per-request timeout (default 30 s). */
  timeoutMs?: number;
  /** Disable the single transient-5xx retry. Default true. */
  retry?: boolean;
}

export class RenowideAPI {
  constructor(
    private readonly base: string,
    private readonly token?: string,
  ) {}

  async post<T>(pathname: string, body: unknown, opts?: RequestOptions): Promise<T> {
    return this.request<T>("POST", pathname, body, opts);
  }

  async get<T>(pathname: string, opts?: RequestOptions): Promise<T> {
    return this.request<T>("GET", pathname, undefined, opts);
  }

  async del<T>(pathname: string, opts?: RequestOptions): Promise<T> {
    return this.request<T>("DELETE", pathname, undefined, opts);
  }

  /**
   * Exposed as `public` so commands that need verbs beyond GET/POST/DELETE
   * (or want to pass a typed body to a DELETE, etc.) can drive the client
   * directly. Most callers should use the higher-level helpers above.
   */
  async request<T>(
    method: "GET" | "POST" | "DELETE" | "PUT" | "PATCH",
    pathname: string,
    body?: unknown,
    opts?: RequestOptions,
  ): Promise<T> {
    const url = `${this.base.replace(/\/$/, "")}${pathname}`;
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "user-agent": USER_AGENT,
    };
    if (this.token) headers["authorization"] = `Bearer ${this.token}`;

    const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const retryEnabled = opts?.retry !== false;

    const attempt = async (): Promise<Response> => {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        return await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: ctl.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    };

    let res: Response;
    try {
      res = await attempt();
      if (retryEnabled && RETRYABLE_STATUSES.has(res.status)) {
        // Consume the body of the failed response so the socket can be
        // released, then retry once with a short jittered backoff.
        await res.text().catch(() => undefined);
        await sleep(300 + Math.floor(Math.random() * 400));
        res = await attempt();
      }
    } catch (err: any) {
      if (!retryEnabled || err?.name === "AbortError") throw err;
      // Network-level error (DNS, TCP reset, TLS). One retry.
      await sleep(300 + Math.floor(Math.random() * 400));
      res = await attempt();
    }

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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
