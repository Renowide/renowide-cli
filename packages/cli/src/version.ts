/**
 * Single source of truth for the CLI's version string.
 *
 * Reads `version` from the CLI package's `package.json` at runtime so
 * every user-visible surface (User-Agent header, device-code client id,
 * `--version` flag, error messages) reports the installed version
 * without us having to hand-edit multiple files on each release.
 *
 * The path resolves via `import.meta.url`, which in compiled ESM is the
 * absolute URL of `dist/version.js`. `../package.json` from there is the
 * package root — present both in `npm pack` output (npm implicitly ships
 * package.json) and in the source tree during `npm run dev`.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PKG_URL = new URL("../package.json", import.meta.url);

function readVersion(): string {
  try {
    const raw = readFileSync(fileURLToPath(PKG_URL), "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version === "string" && parsed.version.length > 0) {
      return parsed.version;
    }
  } catch {
    // Fall through to the hard-coded fallback. This should only happen
    // if someone has shipped a broken tarball without package.json.
  }
  return "0.0.0+unknown";
}

export const VERSION: string = readVersion();
export const USER_AGENT: string = `renowide-cli/${VERSION} (${process.platform})`;
export const DEVICE_CODE_CLIENT: string = `renowide-cli/${VERSION}`;
