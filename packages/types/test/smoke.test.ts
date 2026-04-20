/**
 * Smoke test for @renowide/types. Run with:
 *   node --test --experimental-strip-types test/smoke.test.ts
 *
 * The full expression-parity suite that pins byte-for-byte equivalence
 * with the Python mirror lives at `test/expression-parity.test.ts` and
 * is generated from a shared fixture file.
 */

import { strict as assert } from "node:assert";
import test from "node:test";

import {
  CanvasResponseSchema,
  validateCanvasStructure,
  canRender,
  CANVAS_KIT_VERSION,
} from "../src/canvas.ts";
import { evalBoolean, interpolate, validateExpression } from "../src/expression.ts";
import {
  signCanvasRequest,
  signActionRequest,
  verifyCanvasRequest,
  verifyActionRequest,
  SignatureVerificationError,
} from "../src/signing.ts";
import { ActionInvokeResponseSchema } from "../src/canvas-events.ts";
import { ManifestCanvasBlockSchema } from "../src/manifest.ts";

test("CANVAS_KIT_VERSION is 2.0.0", () => {
  assert.equal(CANVAS_KIT_VERSION, "2.0.0");
});

test("canvas: valid hire_flow parses + structurally validates", () => {
  const canvas = CanvasResponseSchema.parse({
    ui_kit_version: "2.0.0",
    surface: "hire_flow",
    cache_ttl_seconds: 60,
    blocks: [
      { id: "h", type: "header", props: { text: "Hello", level: 1 } },
      {
        id: "chk",
        type: "checkbox",
        props: { label: "I agree", required: true, default: false },
      },
      {
        id: "go",
        type: "action_button",
        props: {
          label: "Hire me",
          action: "__submit_hire__",
          variant: "primary",
          disabled_when: "!form.chk",
        },
      },
    ],
  });
  validateCanvasStructure(canvas);
});

test("canvas: hire_flow without submit trigger is rejected", () => {
  const canvas = CanvasResponseSchema.parse({
    ui_kit_version: "2.0.0",
    surface: "hire_flow",
    blocks: [{ id: "h", type: "header", props: { text: "Hi" } }],
  });
  assert.throws(() => validateCanvasStructure(canvas), /submit trigger/);
});

test("canvas: duplicate block ids rejected", () => {
  const canvas = CanvasResponseSchema.parse({
    ui_kit_version: "2.0.0",
    surface: "hire_flow",
    blocks: [
      { id: "same", type: "header", props: { text: "A" } },
      { id: "same", type: "action_button", props: { label: "Go", action: "__submit_hire__" } },
    ],
  });
  assert.throws(() => validateCanvasStructure(canvas), /duplicate block id/);
});

test("canvas: strict() rejects unknown props", () => {
  const r = CanvasResponseSchema.safeParse({
    ui_kit_version: "2.0.0",
    surface: "hire_flow",
    blocks: [
      {
        id: "h",
        type: "header",
        props: { text: "X", unknown_field: true }, // extra
      },
    ],
  });
  assert.equal(r.success, false);
});

test("canvas: initial_state cannot write reserved namespaces", () => {
  const r = CanvasResponseSchema.safeParse({
    ui_kit_version: "2.0.0",
    surface: "hire_flow",
    initial_state: { form: { x: 1 } }, // reserved
    blocks: [
      { id: "h", type: "header", props: { text: "X" } },
      { id: "g", type: "action_button", props: { label: "Go", action: "__submit_hire__" } },
    ],
  });
  assert.equal(r.success, false);
});

test("canvas: post_hire rejects __submit_hire__", () => {
  const canvas = CanvasResponseSchema.parse({
    ui_kit_version: "2.0.0",
    surface: "post_hire",
    blocks: [
      {
        id: "b",
        type: "action_button",
        props: { label: "Submit", action: "__submit_hire__" },
      },
    ],
  });
  assert.throws(() => validateCanvasStructure(canvas), /__submit_hire__/);
});

test("canRender: happy path", () => {
  assert.deepEqual(
    canRender({ response: "2.0.0", manifest: "2.0.0", renderer: "2.0.0" }),
    { ok: true },
  );
});

test("canRender: response exceeds manifest", () => {
  const r = canRender({ response: "2.0.1", manifest: "2.0.0", renderer: "2.0.1" });
  assert.equal(r.ok, false);
});

test("canRender: major mismatch", () => {
  const r = canRender({ response: "3.0.0", manifest: "2.0.0", renderer: "2.0.0" });
  assert.equal(r.ok, false);
});

test("expression: evalBoolean basics", () => {
  const state = { form: { agree: true, n: 3 }, custom: { tag: "vip" } };
  assert.equal(evalBoolean("form.agree && form.n > 0", state), true);
  assert.equal(evalBoolean('custom.tag === "vip"', state), true);
  assert.equal(evalBoolean("!form.agree", state), false);
  assert.equal(evalBoolean("form.missing || form.agree", state), true);
});

test("expression: interpolate + whitelist methods", () => {
  const state = { form: { name: "Tim" }, tags: ["a", "b"] };
  assert.equal(interpolate("Hi {{ form.name }}", state), "Hi Tim");
  assert.equal(interpolate('{{ tags.join(",") }}', state), "a,b");
  assert.equal(interpolate("{{ form.name.toUpperCase() }}", state), "TIM");
});

test("expression: validateExpression rejects non-whitelisted methods", () => {
  assert.throws(() => validateExpression("form.name.eval()"));
  assert.throws(() => validateExpression("form.name.repeat(10)"));
});

test("signing: round-trip canvas GET", () => {
  const ts = 1_700_000_000;
  const sig = signCanvasRequest({
    handoffSecret: "secret",
    agentSlug: "vibescan",
    surface: "hire_flow",
    buyerId: "b1",
    hireId: null,
    requestId: "r1",
    timestamp: ts,
  });
  verifyCanvasRequest({
    handoffSecret: "secret",
    headers: {
      "renowide-signature": `v1=${sig}`,
      "x-renowide-timestamp": String(ts),
      "x-renowide-request-id": "r1",
      "x-renowide-buyer-id": "b1",
    },
    agentSlug: "vibescan",
    surface: "hire_flow",
    nowSeconds: ts,
  });
});

test("signing: tampered signature rejected", () => {
  const ts = 1_700_000_000;
  assert.throws(() => {
    verifyCanvasRequest({
      handoffSecret: "secret",
      headers: {
        "renowide-signature": "v1=" + "0".repeat(64),
        "x-renowide-timestamp": String(ts),
        "x-renowide-request-id": "r1",
      },
      agentSlug: "vibescan",
      surface: "hire_flow",
      nowSeconds: ts,
    });
  }, SignatureVerificationError);
});

test("signing: clock skew > 300s rejected", () => {
  const ts = 1_700_000_000;
  const sig = signCanvasRequest({
    handoffSecret: "secret",
    agentSlug: "vibescan",
    surface: "hire_flow",
    buyerId: null,
    hireId: null,
    requestId: "r1",
    timestamp: ts,
  });
  assert.throws(() => {
    verifyCanvasRequest({
      handoffSecret: "secret",
      headers: {
        "renowide-signature": `v1=${sig}`,
        "x-renowide-timestamp": String(ts),
        "x-renowide-request-id": "r1",
      },
      agentSlug: "vibescan",
      surface: "hire_flow",
      nowSeconds: ts + 301,
    });
  }, /clock skew/);
});

test("signing: round-trip action POST", () => {
  const ts = 1_700_000_000;
  const body = Buffer.from(JSON.stringify({ hello: "world" }), "utf-8");
  const sig = signActionRequest("secret", body, ts);
  verifyActionRequest({
    handoffSecret: "secret",
    headers: {
      "renowide-signature": `v1=${sig}`,
      "x-renowide-timestamp": String(ts),
    },
    body,
    nowSeconds: ts,
  });
});

test("ActionInvokeResponse: valid patch accepted", () => {
  ActionInvokeResponseSchema.parse({
    ok: true,
    patch: [
      { op: "set", path: "state.custom.x", value: 1 },
      { op: "merge", path: "state.custom", value: { y: 2 } },
    ],
  });
});

test("signing: known-answer canvas canonical string (parity with renowide-canvas Python)", () => {
  // DO NOT change this value without also updating the Python sibling
  // in python/renowide-canvas/tests/test_signing.py. The two packages
  // must produce bit-identical hex digests for the same canonical input.
  const sig = signCanvasRequest({
    handoffSecret: "test-secret",
    agentSlug: "demo-agent",
    surface: "hire_flow",
    buyerId: "buyer_01HX",
    hireId: null,
    requestId: "req_01HX",
    timestamp: 1_700_000_000,
  });
  assert.equal(
    sig,
    "daebca8b7aaa8a3e8f4d0b70278ac0eab1806ca5774b75d4040393641a94cf4a",
  );
});

test("signing: case-insensitive header lookup matches Python", () => {
  // Python uses `starlette.datastructures.Headers` which is case-insensitive.
  // Our TS verifier must match — uppercase / mixed-case headers should work
  // interchangeably with the lowercase canonical form.
  const ts = 1_700_000_000;
  const sig = signCanvasRequest({
    handoffSecret: "secret",
    agentSlug: "vibescan",
    surface: "hire_flow",
    buyerId: null,
    hireId: null,
    requestId: "r1",
    timestamp: ts,
  });
  verifyCanvasRequest({
    handoffSecret: "secret",
    headers: {
      "Renowide-Signature": `v1=${sig}`,
      "X-Renowide-Timestamp": String(ts),
      "X-RENOWIDE-REQUEST-ID": "r1",
    },
    agentSlug: "vibescan",
    surface: "hire_flow",
    nowSeconds: ts,
  });
});

test("signing: tampered timestamp with trailing garbage rejected (Python parity)", () => {
  // `Number.parseInt("1700000000abc", 10)` returns 1700000000 silently —
  // this used to slip past the TS verifier while the Python sibling
  // correctly rejected it. After the fix both verifiers reject.
  const ts = 1_700_000_000;
  const sig = signCanvasRequest({
    handoffSecret: "secret",
    agentSlug: "vibescan",
    surface: "hire_flow",
    buyerId: null,
    hireId: null,
    requestId: "r1",
    timestamp: ts,
  });
  assert.throws(
    () =>
      verifyCanvasRequest({
        handoffSecret: "secret",
        headers: {
          "renowide-signature": `v1=${sig}`,
          "x-renowide-timestamp": `${ts}abc`,
          "x-renowide-request-id": "r1",
        },
        agentSlug: "vibescan",
        surface: "hire_flow",
        nowSeconds: ts,
      }),
    /bad integer header/,
  );
});

test("signing: multi-equals signature header rejected (Python parity)", () => {
  // Python's `split("=", 1)` takes only the FIRST `=` and puts the rest
  // in the hex half — which then fails the 64-hex-char regex. Our TS
  // verifier used to use `String.split("=", 2)` which silently truncated
  // — letting `v1=abcd=extra` through as `{version: "v1", hex: "abcd"}`
  // before the length check. Both verifiers must now reject.
  assert.throws(
    () =>
      verifyCanvasRequest({
        handoffSecret: "secret",
        headers: {
          "renowide-signature": `v1=${"0".repeat(64)}=extra`,
          "x-renowide-timestamp": "1700000000",
          "x-renowide-request-id": "r1",
        },
        agentSlug: "vibescan",
        surface: "hire_flow",
        nowSeconds: 1_700_000_000,
      }),
    SignatureVerificationError,
  );
});

test("ManifestCanvasBlock: defaults applied", () => {
  const m = ManifestCanvasBlockSchema.parse({
    hire_flow: { canvas_url: "https://example.com/canvas/hire_flow.json" },
  });
  assert.equal(m.ui_kit_version, "2.0.0");
  assert.equal(m.hire_flow!.max_duration_seconds, 600);
});
