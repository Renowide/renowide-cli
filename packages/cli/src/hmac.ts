/**
 * HMAC helpers exposed by the CLI as a tiny shim over `@renowide/types/signing`.
 *
 * We keep a thin CLI-side wrapper (rather than forcing users to `import` the
 * types package transitively) so that:
 *   • `renowide canvas verify --body file.json` reads raw bytes and calls
 *     `verifyActionRequest` with the exact on-the-wire body,
 *   • future fixes to signing can be funnelled through one spot,
 *   • tests in `packages/cli/test/` don't pull zod in by accident.
 *
 * If you're writing a dev-side webhook handler, prefer importing from
 * `@renowide/types/signing` directly. This file is for CLI internals.
 */

export {
  SIGNATURE_SCHEME_VERSION,
  SIGNATURE_MAX_CLOCK_SKEW_SECONDS,
  signCanvasRequest,
  signActionRequest,
  verifyCanvasRequest,
  verifyActionRequest,
  SignatureVerificationError,
} from "@renowide/types/signing";
export type {
  SignCanvasRequestArgs,
  VerifyCanvasRequestArgs,
  VerifyActionRequestArgs,
} from "@renowide/types/signing";
