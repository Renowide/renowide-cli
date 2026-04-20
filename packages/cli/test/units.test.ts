/**
 * Focused unit tests for the small pure helpers that back user-facing
 * commands. We test these directly (rather than through `spawnSync`) so
 * regressions are caught with clear diffs.
 *
 *   • padVisible — status table alignment vs ANSI escape codes
 *   • parseRuns — `renowide sandbox --runs <n>` input validation
 *
 * Credential-file perm regression (fix #7) is exercised indirectly by
 * the login smoke test in canvas.test.ts; exercising it here would
 * require refactoring config.ts to parameterise CONFIG_DIR, which we
 * defer until there's a second consumer that needs it.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { padVisible } from "../src/commands/status.ts";
import { parseRuns } from "../src/commands/sandbox.ts";

test("padVisible: no ANSI — identical to padEnd", () => {
  assert.equal(padVisible("abc", 6), "abc   ");
  // Strings >= width are returned unchanged.
  assert.equal(padVisible("exactly-six", 6), "exactly-six");
});

test("padVisible: ANSI colour codes are not counted toward width", () => {
  // `\u001b[32m` (green) + "ok" + `\u001b[0m` (reset) has visible width 2.
  // A plain `padEnd(10)` would count the escapes and under-pad by 9 chars,
  // which is what produced the mis-aligned `renowide status` tables the
  // review flagged.
  const green = "\u001b[32mok\u001b[0m";
  const padded = padVisible(green, 10);
  // eslint-disable-next-line no-control-regex
  const visible = padded.replace(/\x1b\[[0-9;]*m/g, "");
  assert.equal(visible.length, 10, `visible width wrong: ${JSON.stringify(visible)}`);
  assert.ok(padded.endsWith(" ".repeat(8)), "padding should trail at end");
});

test("parseRuns: undefined keeps the historical default", () => {
  // Matches the old implicit default used before the validator was added.
  assert.equal(parseRuns(undefined), 3);
});

test("parseRuns: accepts positive integers", () => {
  assert.equal(parseRuns("1"), 1);
  assert.equal(parseRuns("42"), 42);
});

test("parseRuns: rejects non-numeric, zero, negative, and float input", () => {
  // Before the fix, `Number(arg)` silently became `NaN` for "foo" and the
  // for-loop ran zero iterations — a confusing silent no-op. Floats and
  // negative numbers also fail the `^\d+$` charset check; `0` is accepted
  // as an integer but rejected by the explicit `>= 1` guard.
  assert.throws(() => parseRuns("foo"), /positive integer/);
  assert.throws(() => parseRuns("3.14"), /positive integer/);
  assert.throws(() => parseRuns("-5"), /positive integer/);
  assert.throws(() => parseRuns("0"), />= 1/);
});
