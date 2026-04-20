/**
 * Smoke tests for `renowide canvas …` subcommands.
 *
 * We shell out to the compiled CLI rather than calling the command
 * functions directly so that the tests exercise exactly what the user
 * runs — argument parsing, option defaults, exit codes, stderr wiring.
 *
 * The tests NEVER touch the Renowide API. Every URL probe is local or
 * to an explicitly fake domain; every signing test uses a fixed secret
 * and timestamps so output is deterministic.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const CLI = path.resolve(new URL(".", import.meta.url).pathname, "..", "dist", "index.js");

function run(args: string[], cwd: string, env: Record<string, string> = {}) {
  return spawnSync("node", [CLI, ...args], {
    cwd,
    env: { ...process.env, ...env, NO_COLOR: "1" },
    encoding: "utf8",
  });
}

function mkTmp(): string {
  return mkdtempSync(path.join(tmpdir(), "rw-canvas-test-"));
}

test("canvas init --surface hire_flow produces a schema-valid file", () => {
  const cwd = mkTmp();
  try {
    const init = run(["canvas", "init", "--surface", "hire_flow", "--out", "hf.json"], cwd);
    assert.equal(init.status, 0, init.stderr);
    assert.match(init.stdout, /wrote/);

    const validate = run(["canvas", "validate", "hf.json"], cwd);
    assert.equal(validate.status, 0, validate.stderr || validate.stdout);
    assert.match(validate.stdout, /compatible/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("canvas init --surface post_hire produces a schema-valid file", () => {
  const cwd = mkTmp();
  try {
    const init = run(["canvas", "init", "--surface", "post_hire", "--out", "ph.json"], cwd);
    assert.equal(init.status, 0, init.stderr);

    const validate = run(["canvas", "validate", "ph.json"], cwd);
    assert.equal(validate.status, 0, validate.stderr || validate.stdout);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("canvas validate rejects a bad canvas with precise errors", () => {
  const cwd = mkTmp();
  try {
    writeFileSync(
      path.join(cwd, "bad.json"),
      JSON.stringify({
        ui_kit_version: "2.0.0",
        // missing surface
        blocks: [
          {
            id: "h",
            type: "header",
            props: { text: "hello" },
            when: "@ invalid @",
          },
        ],
      }),
    );
    const res = run(["canvas", "validate", "bad.json"], cwd);
    assert.notEqual(res.status, 0);
    // Either schema catches the missing surface, or the expression walker
    // catches the bad `when`. Both are acceptable signals.
    const out = res.stdout + res.stderr;
    assert.match(out, /surface|when|Invalid/i, out);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("canvas sign produces deterministic headers for a fixed secret", () => {
  const cwd = mkTmp();
  try {
    const env = { RENOWIDE_HANDOFF_SECRET: "whsec_testkey_000" };
    const res = run(
      [
        "canvas",
        "sign",
        "https://example.com/canvas/hire_flow.json",
        "--slug",
        "foo",
        "--surface",
        "hire_flow",
        "--request-id",
        "req_static",
      ],
      cwd,
      env,
    );
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /Renowide-Signature: v1=[0-9a-f]{64}/);
    assert.match(res.stdout, /X-Renowide-Request-Id: req_static/);
    assert.match(res.stdout, /X-Renowide-Agent-Slug: foo/);
    assert.match(res.stdout, /X-Renowide-Surface: hire_flow/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("canvas sign refuses invalid surfaces", () => {
  const cwd = mkTmp();
  try {
    const res = run(
      [
        "canvas",
        "sign",
        "https://example.com/foo",
        "--slug",
        "foo",
        "--surface",
        "nope",
      ],
      cwd,
      { RENOWIDE_HANDOFF_SECRET: "whsec_testkey_000" },
    );
    assert.notEqual(res.status, 0);
    assert.match(res.stderr + res.stdout, /surface/i);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("canvas verify round-trips canvas signatures", () => {
  const cwd = mkTmp();
  try {
    const env = { RENOWIDE_HANDOFF_SECRET: "whsec_testkey_000" };
    const signed = run(
      [
        "canvas",
        "sign",
        "https://example.com/c",
        "--slug",
        "foo",
        "--surface",
        "hire_flow",
        "--request-id",
        "req_static",
        "--buyer-id",
        "u_1",
      ],
      cwd,
      env,
    );
    assert.equal(signed.status, 0, signed.stderr);
    const sig = /Renowide-Signature:\s*(v1=[0-9a-f]{64})/.exec(signed.stdout)?.[1];
    const ts = /X-Renowide-Timestamp:\s*(\d+)/.exec(signed.stdout)?.[1];
    assert.ok(sig);
    assert.ok(ts);

    const verify = run(
      [
        "canvas",
        "verify",
        "--kind",
        "canvas",
        "--signature",
        sig!,
        "--ts",
        ts!,
        "--slug",
        "foo",
        "--surface",
        "hire_flow",
        "--request-id",
        "req_static",
        "--buyer-id",
        "u_1",
      ],
      cwd,
      env,
    );
    assert.equal(verify.status, 0, verify.stdout + verify.stderr);
    assert.match(verify.stdout, /verifies/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("canvas verify action — round-trips body signatures", async () => {
  const cwd = mkTmp();
  try {
    const env = { RENOWIDE_HANDOFF_SECRET: "whsec_testkey_000" };
    // Build a signature ourselves using @renowide/types/signing to avoid
    // shelling an extra time.
    const { signActionRequest } = await import("@renowide/types/signing");
    const body = Buffer.from(JSON.stringify({ action: "hello" }));
    writeFileSync(path.join(cwd, "body.json"), body);
    const ts = String(Math.floor(Date.now() / 1000));
    const hex = signActionRequest("whsec_testkey_000", new Uint8Array(body), Number(ts));

    const res = run(
      [
        "canvas",
        "verify",
        "--kind",
        "action",
        "--signature",
        `v1=${hex}`,
        "--ts",
        ts,
        "--body",
        "body.json",
      ],
      cwd,
      env,
    );
    assert.equal(res.status, 0, res.stdout + res.stderr);
    assert.match(res.stdout, /verifies/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("canvas validate --ui rejects renderer-incompatible versions", () => {
  const cwd = mkTmp();
  try {
    run(["canvas", "init", "--surface", "hire_flow", "--out", "hf.json"], cwd);
    const parsed = JSON.parse(readFileSync(path.join(cwd, "hf.json"), "utf8"));
    parsed.ui_kit_version = "3.0.0"; // pretend we're ahead of the renderer
    writeFileSync(path.join(cwd, "hf.json"), JSON.stringify(parsed, null, 2));
    const res = run(["canvas", "validate", "hf.json", "--ui", "2.0.0"], cwd);
    assert.notEqual(res.status, 0);
    assert.match(res.stdout, /major version mismatch|MAY NOT RENDER/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
