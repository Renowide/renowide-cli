/**
 * HMAC-SHA256 signing helpers for Canvas Kit v2.
 *
 * Renowide signs every outbound request to a developer's canvas host or
 * action webhook with HMAC-SHA256. The developer verifies the signature
 * with the same secret (`handoff_secret`, stored on Renowide as
 * `agent_profiles.webhook_secret`).
 *
 * Two canonical strings — DO NOT invent new ones. If you add a new
 * surface (e.g. state-stream SSE), we extend this file with a new
 * `sign<Surface>Request` function and a new version prefix.
 *
 *   GET  /canvas/<surface>[.json]                   ← `v1:<ts>:<slug>:<surface>:<buyer|->:<hire|->:<rid>`
 *   POST /action                                    ← `v1:<ts>:<raw-body-bytes>`
 *
 * Wire format: `Renowide-Signature: v1=<hex>` (lowercase hex). The
 * developer rejects any request where the signature doesn't match or
 * where |now - ts| > 300 seconds.
 *
 * All helpers here are environment-agnostic: they accept `createHmac` from
 * `node:crypto` by default, but you can inject a web-crypto polyfill if
 * you're running in a worker / edge runtime.
 */

import { createHmac, timingSafeEqual as nodeTimingSafeEqual } from "node:crypto";

export const SIGNATURE_SCHEME_VERSION = "v1" as const;
export const SIGNATURE_MAX_CLOCK_SKEW_SECONDS = 300;

export interface SignCanvasRequestArgs {
  handoffSecret: string;
  agentSlug: string;
  surface: "hire_flow" | "post_hire";
  buyerId: string | null | undefined;
  hireId: string | null | undefined;
  requestId: string;
  timestamp: number;
}

/**
 * Sign a canvas-fetch GET request. The canonical string is:
 *
 *     v1:<timestamp>:<agent_slug>:<surface>:<buyer_id|->:<hire_id|->:<request_id>
 *
 * Missing buyer/hire ids are rendered as `-`.
 *
 * Returns the 64-char lowercase-hex HMAC digest. Wire it into the
 * `Renowide-Signature: v1=<hex>` header on the request.
 */
export function signCanvasRequest(args: SignCanvasRequestArgs): string {
  const canonical =
    `${SIGNATURE_SCHEME_VERSION}:${args.timestamp}:${args.agentSlug}:${args.surface}:` +
    `${args.buyerId ?? "-"}:${args.hireId ?? "-"}:${args.requestId}`;
  const mac = createHmac("sha256", args.handoffSecret);
  mac.update(canonical);
  return mac.digest("hex");
}

/**
 * Sign a canvas-action POST request. The canonical string is:
 *
 *     v1:<timestamp>:<raw-body-bytes>
 *
 * `body` must be the **exact bytes** that go on the wire — never the
 * parsed JSON (re-serialising may reorder keys and break the signature).
 * Most HTTP middleware exposes the raw body via `req.rawBody`.
 */
export function signActionRequest(
  handoffSecret: string,
  body: Uint8Array,
  timestamp: number,
): string {
  const prefix = Buffer.from(`${SIGNATURE_SCHEME_VERSION}:${timestamp}:`, "utf-8");
  const mac = createHmac("sha256", handoffSecret);
  mac.update(prefix);
  mac.update(body);
  return mac.digest("hex");
}

// ─── Verification helpers (for developer webhook handlers) ─────────────────

export class SignatureVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignatureVerificationError";
  }
}

export interface VerifyCanvasRequestArgs {
  handoffSecret: string;
  headers: Record<string, string | undefined>;
  agentSlug: string;
  surface: "hire_flow" | "post_hire";
  /** Usually `Date.now() / 1000` floored. Override in tests. */
  nowSeconds?: number;
  /** Optional skew override (default 300s). */
  maxClockSkewSeconds?: number;
}

/**
 * Verify an inbound canvas-fetch GET. Throws `SignatureVerificationError`
 * on failure. Call this from your `/canvas/hire_flow.json` + `/canvas/post_hire/...` handlers.
 */
export function verifyCanvasRequest(args: VerifyCanvasRequestArgs): void {
  const headers = lowercaseHeaders(args.headers);
  const scheme = parseSignatureHeader(headers["renowide-signature"]);
  const tsRaw = headers["x-renowide-timestamp"];
  const requestId = headers["x-renowide-request-id"];
  const buyerId = headers["x-renowide-buyer-id"];
  const hireId = headers["x-renowide-hire-id"];

  if (!tsRaw) throw new SignatureVerificationError("missing X-Renowide-Timestamp");
  if (!requestId) throw new SignatureVerificationError("missing X-Renowide-Request-Id");

  checkClockSkew(
    parseIntSafe(tsRaw),
    args.nowSeconds ?? Math.floor(Date.now() / 1000),
    args.maxClockSkewSeconds ?? SIGNATURE_MAX_CLOCK_SKEW_SECONDS,
  );

  const expected = signCanvasRequest({
    handoffSecret: args.handoffSecret,
    agentSlug: args.agentSlug,
    surface: args.surface,
    buyerId: buyerId ?? null,
    hireId: hireId ?? null,
    requestId,
    timestamp: parseIntSafe(tsRaw),
  });

  if (!constantTimeHexEqual(scheme.hex, expected)) {
    throw new SignatureVerificationError("signature mismatch");
  }
}

export interface VerifyActionRequestArgs {
  handoffSecret: string;
  headers: Record<string, string | undefined>;
  /** Raw request body bytes — NOT the parsed JSON. */
  body: Uint8Array;
  nowSeconds?: number;
  maxClockSkewSeconds?: number;
}

/**
 * Verify an inbound action POST. Throws `SignatureVerificationError` on
 * failure. Call this from your `action_webhook_url` handler before you
 * JSON.parse the body.
 */
export function verifyActionRequest(args: VerifyActionRequestArgs): void {
  const headers = lowercaseHeaders(args.headers);
  const scheme = parseSignatureHeader(headers["renowide-signature"]);
  const tsRaw = headers["x-renowide-timestamp"];
  if (!tsRaw) throw new SignatureVerificationError("missing X-Renowide-Timestamp");

  checkClockSkew(
    parseIntSafe(tsRaw),
    args.nowSeconds ?? Math.floor(Date.now() / 1000),
    args.maxClockSkewSeconds ?? SIGNATURE_MAX_CLOCK_SKEW_SECONDS,
  );

  const expected = signActionRequest(args.handoffSecret, args.body, parseIntSafe(tsRaw));
  if (!constantTimeHexEqual(scheme.hex, expected)) {
    throw new SignatureVerificationError("signature mismatch");
  }
}

// ─── Private helpers ───────────────────────────────────────────────────────

/**
 * Case-insensitive header lookup — mirrors
 * `renowide_canvas.signing._get_header` in the Python sibling. Any
 * duplicate header names (which shouldn't happen for signing headers
 * but we don't trust the caller) resolve to the *last* casing — same
 * semantics as iterating a case-insensitive `Mapping.items()` in
 * Starlette / Flask.
 */
function lowercaseHeaders(
  headers: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = Object.create(null);
  for (const [k, v] of Object.entries(headers)) {
    out[k.toLowerCase()] = v;
  }
  return out;
}

function parseSignatureHeader(raw: string | undefined): { version: string; hex: string } {
  if (!raw) throw new SignatureVerificationError("missing Renowide-Signature");
  // `split("=", 1)` in Python returns *at most 2* parts and puts the
  // remainder into the second — the opposite of JS's `split(sep, limit)`
  // which *truncates*. Mirror Python exactly by splitting on the FIRST
  // `=` only, so a tampered `v1=abcd=extra` header behaves the same way
  // on both verifiers (rejected by the hex-charset check below).
  const eq = raw.indexOf("=");
  const version = eq === -1 ? raw : raw.slice(0, eq);
  const hex = eq === -1 ? "" : raw.slice(eq + 1);
  if (!version || !hex || version !== SIGNATURE_SCHEME_VERSION) {
    throw new SignatureVerificationError(
      `unsupported signature scheme (expected ${SIGNATURE_SCHEME_VERSION}=<hex>, got ${raw})`,
    );
  }
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw new SignatureVerificationError("signature is not 64 hex chars");
  }
  return { version, hex };
}

/**
 * Strict integer parser — mirrors Python's `int(raw)`. Unlike
 * `Number.parseInt("1234abc", 10)` which accepts trailing garbage, this
 * helper rejects any non-digit (other than a single leading `-`). That
 * closes the cross-language divergence where a tampered
 * `X-Renowide-Timestamp: 1700000000abc` passes the TS verifier but is
 * rejected by the Python one.
 */
function parseIntSafe(v: string): number {
  if (!/^-?\d+$/.test(v.trim())) {
    throw new SignatureVerificationError(`bad integer header: ${v}`);
  }
  const n = Number.parseInt(v.trim(), 10);
  if (!Number.isFinite(n)) {
    throw new SignatureVerificationError(`bad integer header: ${v}`);
  }
  return n;
}

function checkClockSkew(requestTs: number, nowSeconds: number, max: number): void {
  if (Math.abs(nowSeconds - requestTs) > max) {
    throw new SignatureVerificationError(
      `clock skew too large (|${nowSeconds} - ${requestTs}| > ${max}s)`,
    );
  }
}

function constantTimeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) return false;
  return nodeTimingSafeEqual(bufA, bufB);
}
