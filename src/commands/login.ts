/**
 * `renowide login` — device-code authentication flow.
 *
 * 1. CLI calls POST /api/v1/creator/cli/device-code and receives
 *    { device_code, user_code, verification_url, interval, expires_in }.
 * 2. CLI opens the browser (or prints the URL) and polls
 *    POST /api/v1/creator/cli/device-code/poll until the user approves.
 * 3. On approval the server mints a fresh `rw_key_*` (stored in
 *    evaai.api_keys) and returns it here. The CLI persists it as its
 *    single Bearer credential.
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

import pc from "picocolors";
import { RenowideAPI } from "../api";
import { loadConfig, saveCredentials } from "../config";

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

export async function cmdLogin(opts: { api?: string }) {
  const apiBase = opts.api ?? loadConfig().apiBase;
  const api = new RenowideAPI(apiBase);

  console.log(pc.gray(`→ ${apiBase}`));
  const deviceCode = await api.post<DeviceCodeResp>("/api/v1/creator/cli/device-code", {
    client: "renowide-cli/0.1.0",
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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function tryOpenBrowser(url: string) {
  const { spawn } = require("node:child_process");
  const cmd =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : ["xdg-open", [url]];
  try {
    if (Array.isArray(cmd[1])) spawn(cmd[0] as string, cmd[1] as string[], { detached: true, stdio: "ignore" }).unref();
    else spawn(cmd[0] as string, [cmd[1] as string], { detached: true, stdio: "ignore" }).unref();
  } catch {
    // non-fatal — the user can click the URL
  }
}
