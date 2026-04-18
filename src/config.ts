/**
 * Config and credential storage for the CLI.
 *
 * Credentials live in ~/.renowide/credentials as JSON. We never write
 * secrets elsewhere — no env files touched, no keychain access
 * (keeps the CLI portable and containerisable).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CONFIG_DIR = path.join(os.homedir(), ".renowide");
const CREDENTIALS_FILE = path.join(CONFIG_DIR, "credentials");

export interface Credentials {
  apiBase: string;
  token: string;
  creatorId: string;
  creatorEmail: string;
  expiresAt?: string;
}

export interface Config {
  apiBase: string;
}

export function loadConfig(): Config {
  return {
    apiBase:
      process.env.RENOWIDE_API_BASE ??
      process.env.RENOWIDE_API ??
      "https://renowide.com",
  };
}

export function loadCredentials(): Credentials | null {
  try {
    const raw = fs.readFileSync(CREDENTIALS_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveCredentials(creds: Credentials): void {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

export function clearCredentials(): void {
  try {
    fs.unlinkSync(CREDENTIALS_FILE);
  } catch {
    // ignore
  }
}

export function requireCredentials(): Credentials {
  const c = loadCredentials();
  if (!c) {
    throw new Error(
      "Not logged in. Run `renowide login` to authenticate with the Renowide API.",
    );
  }
  return c;
}
