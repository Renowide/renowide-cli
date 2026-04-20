/**
 * `renowide login` — two authentication modes.
 *
 * ## Mode 1 — device-code (interactive, default)
 * 1. CLI calls POST /api/v1/creator/cli/device-code and receives
 *    { device_code, user_code, verification_url, interval, expires_in }.
 * 2. CLI opens the browser (or prints the URL) and polls
 *    POST /api/v1/creator/cli/device-code/poll until the user approves.
 * 3. On approval the server mints a fresh `rw_key_*` (stored in
 *    evaai.api_keys) and returns it here. The CLI persists it as its
 *    single Bearer credential.
 *
 * ## Mode 2 — direct API key (`--key rw_key_…`)
 * For CI/CD and scripted flows. The user pastes a key they minted from
 * Creator → API Keys (or via `curl POST /api/v1/api-keys` on the EV
 * backend). The CLI validates it by calling `GET /api/v1/creator/me` on
 * the main backend; on 200, the key is persisted to
 * ~/.renowide/credentials exactly like the device-code path. On 401 we
 * never write the file — the user gets a clear "invalid key" error.
 *
 * Why a shared credential store: a developer using `--key` today can
 * `renowide logout` tomorrow with the same UX, and every downstream
 * command (publish, deploy, hire show) reads from the same file without
 * caring how the token was minted.
 *
 * Why rw_key_ and not a JWT:
 *   - The same token authenticates the CLI against /creator/* AND
 *     works as the apiKey in Claude Desktop / Cursor MCP configs
 *     against the EV MCP server. One token, one lifecycle.
 *   - The creator can revoke it at any time from
 *     https://renowide.com/creator/api-keys.
 *
 * 4. CLI stores { token, creator_id, creator_email } in
 *    ~/.renowide/credentials with 0600 permissions.
 */

import { spawn } from "node:child_process";
import pc from "picocolors";
import { RenowideAPI } from "../api.js";
import { loadConfig, saveCredentials } from "../config.js";
import { DEVICE_CODE_CLIENT } from "../version.js";

interface DeviceCodeResp {
  device_code: string;
  user_code: string;
  verification_url: string;
  interval: number;
  expires_in: number;
}

interface PollResp {
  status: "pending" | "approved" | "denied" | "expired";
  token?: string;
  creator_id?: string;
  creator_email?: string;
}

export async function cmdLogin(opts: { api?: string; key?: string }) {
  const apiBase = opts.api ?? loadConfig().apiBase;

  // --- Mode 2: direct API key ---------------------------------------------
  // When the user supplies `--key rw_key_…` (typically from CI/CD or after
  // minting a key in the dashboard) we skip the device-code flow entirely.
  // The token is validated by calling /creator/me so we never persist a
  // credential the server would subsequently reject on every command.
  if (opts.key) {
    return loginWithKey(apiBase, opts.key);
  }

  const api = new RenowideAPI(apiBase);

  console.log(pc.gray(`→ ${apiBase}`));
  const deviceCode = await api.post<DeviceCodeResp>("/api/v1/creator/cli/device-code", {
    client: DEVICE_CODE_CLIENT,
  });

  console.log("");
  console.log(`  Visit ${pc.underline(deviceCode.verification_url)}`);
  console.log(`  and enter code: ${pc.bold(deviceCode.user_code)}`);
  console.log("");
  console.log(pc.gray("  waiting for approval (Ctrl+C to cancel)…"));

  tryOpenBrowser(deviceCode.verification_url);

  const deadline = Date.now() + deviceCode.expires_in * 1000;
  const intervalMs = Math.max(2, deviceCode.interval) * 1000;

  while (Date.now() < deadline) {
    await sleep(intervalMs);
    const poll = await api.post<PollResp>("/api/v1/creator/cli/device-code/poll", {
      device_code: deviceCode.device_code,
    });
    if (poll.status === "approved" && poll.token && poll.creator_id) {
      saveCredentials({
        apiBase,
        token: poll.token,
        creatorId: poll.creator_id,
        creatorEmail: poll.creator_email ?? "",
      });
      console.log(pc.green(`✓ logged in as ${poll.creator_email ?? poll.creator_id}`));
      if (poll.token.startsWith("rw_key_")) {
        console.log(
          pc.gray(
            `  Token: ${poll.token.slice(0, 16)}… (manage at ${apiBase.replace(/\/$/, "")}/creator/api-keys)`,
          ),
        );
      }
      return;
    }
    if (poll.status === "denied") throw new Error("authorisation denied");
    if (poll.status === "expired") throw new Error("device code expired");
  }
  throw new Error("device code expired");
}

/**
 * Validate a user-supplied rw_key_ token and persist it if valid.
 *
 * We deliberately hit the main backend's `/api/v1/creator/me` (not the EV
 * backend's `/api/v1/api-keys`) because:
 *   - `/creator/me` already lives at the host the CLI defaults to
 *     (renowide.com), so one origin → one TLS handshake.
 *   - It returns `{ id, email }` which is exactly the shape we want to
 *     show back to the user on success; no second whoami call needed.
 *
 * If the key is an `rw_key_test_…` the server's auth middleware attaches
 * `request.state.rw_key_mode = "test"` automatically — we don't need to
 * do anything CLI-side for sandbox flagging on subsequent `deploy` calls.
 */
async function loginWithKey(apiBase: string, rawKey: string): Promise<void> {
  const key = rawKey.trim();
  if (!key.startsWith("rw_key_")) {
    throw new Error(
      "Invalid key format. Renowide API keys start with `rw_key_` " +
        "(production) or `rw_key_test_` (sandbox). " +
        "Mint one at " +
        apiBase.replace(/\/$/, "") +
        "/creator?section=api-keys",
    );
  }

  const isTest = key.startsWith("rw_key_test_");
  console.log(pc.gray(`→ ${apiBase}`));
  console.log(pc.gray(`  validating key ${key.slice(0, 16)}…`));

  const api = new RenowideAPI(apiBase, key);
  let me: { id: string; email: string };
  try {
    me = await api.get<{ id: string; email: string }>("/api/v1/creator/me");
  } catch (err: any) {
    // 401 is the common case (wrong/revoked key); 403 means the key is
    // valid but lacks the required scope; anything else is surfaced raw
    // so a transient 503 doesn't look like "your key is bad".
    if (err?.status === 401) {
      throw new Error(
        "Key rejected by server (401). Make sure the key is active and " +
          "has the `creator:read` scope. Manage keys at " +
          apiBase.replace(/\/$/, "") +
          "/creator?section=api-keys",
      );
    }
    if (err?.status === 403) {
      throw new Error(
        "Key is valid but missing required scope (`creator:read`). " +
          "Re-mint with the correct scope from the API Keys page.",
      );
    }
    throw err;
  }

  saveCredentials({
    apiBase,
    token: key,
    creatorId: me.id,
    creatorEmail: me.email,
  });

  console.log(pc.green(`✓ logged in as ${me.email}`));
  console.log(
    pc.gray(
      `  Mode:    ${isTest ? pc.yellow("sandbox (test)") : "live"}`,
    ),
  );
  console.log(
    pc.gray(
      `  Token:   ${key.slice(0, 16)}… (stored in ~/.renowide/credentials, chmod 0600)`,
    ),
  );
  console.log(
    pc.gray(
      `  Manage:  ${apiBase.replace(/\/$/, "")}/creator?section=api-keys`,
    ),
  );
  if (isTest) {
    console.log("");
    console.log(
      pc.yellow(
        "  ⚠ Test keys auto-flag every hire as sandbox:true. Use a production " +
          "rw_key_ before going live.",
      ),
    );
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function tryOpenBrowser(url: string) {
  // Static ESM import of `spawn` at the top of the file. The previous
  // `const { spawn } = require("node:child_process")` call crashed every
  // interactive `renowide login` because this package is `"type": "module"`.
  try {
    if (process.platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    } else if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    }
  } catch {
    // non-fatal — the user can click the URL
  }
}
