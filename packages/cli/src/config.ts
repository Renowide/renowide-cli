/**
 * Config and credential storage for the CLI.
 *
 * Credentials live in ~/.renowide/credentials as JSON. We never write
 * secrets elsewhere — no env files touched, no keychain access
 * (keeps the CLI portable and containerisable).
 *
 * Two defensive measures vs. the previous version:
 *   1. `saveCredentials` writes via unlink+create so existing files
 *      with looser permissions (e.g. inherited from a pre-0.3 CLI) get
 *      replaced with 0600 perms rather than keeping their old perms.
 *   2. `loadCredentials` runs the JSON through a Zod schema so a
 *      corrupted or partially-written credentials file surfaces a
 *      clear "corrupted credentials, run `renowide logout`" error
 *      instead of cryptic `creds.apiBase is undefined` later.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

const CONFIG_DIR = path.join(os.homedir(), ".renowide");
const CREDENTIALS_FILE = path.join(CONFIG_DIR, "credentials");

const CredentialsSchema = z.object({
  apiBase: z.string().url(),
  token: z.string().min(1),
  creatorId: z.string().min(1),
  creatorEmail: z.string(),
  expiresAt: z.string().optional(),
});

export type Credentials = z.infer<typeof CredentialsSchema>;

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

export class CorruptedCredentialsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CorruptedCredentialsError";
  }
}

export function loadCredentials(): Credentials | null {
  let raw: string;
  try {
    raw = fs.readFileSync(CREDENTIALS_FILE, "utf8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CorruptedCredentialsError(
      `~/.renowide/credentials is not valid JSON. Run \`renowide logout\` and \`renowide login\` to recreate it.`,
    );
  }
  const result = CredentialsSchema.safeParse(parsed);
  if (!result.success) {
    throw new CorruptedCredentialsError(
      `~/.renowide/credentials is missing required fields (${result.error.issues
        .map((i) => i.path.join("."))
        .join(", ")}). Run \`renowide logout\` and \`renowide login\` again.`,
    );
  }
  return result.data;
}

export function saveCredentials(creds: Credentials): void {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  // Write to a sibling temp file, fsync, chmod, rename — atomic on the
  // same filesystem. This also guarantees 0600 even if an existing file
  // was created by a pre-0.3 CLI with 0644.
  const tmp = `${CREDENTIALS_FILE}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, "w", 0o600);
  try {
    fs.writeSync(fd, JSON.stringify(creds, null, 2));
    try {
      fs.fsyncSync(fd);
    } catch {
      // fsync may be unsupported on some exotic filesystems — non-fatal.
    }
  } finally {
    fs.closeSync(fd);
  }
  // Belt-and-braces: ensure perms are correct even if the open() mode
  // was honoured loosely (e.g. by a restrictive umask that clamped
  // further, not looser — here we only tighten).
  try {
    fs.chmodSync(tmp, 0o600);
  } catch {
    // non-fatal
  }
  fs.renameSync(tmp, CREDENTIALS_FILE);
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
