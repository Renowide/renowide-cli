/**
 * Smoke tests for the authoring lane (TSX → JSON).
 *
 * We only cover the happy path plus the four most common developer
 * mistakes here; the full block matrix is exercised by the backend
 * canvas schema test-suite and by `renowide canvas validate` in CI.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";

import {
  ActionButton,
  Canvas,
  Checkbox,
  CustomEmbed,
  Header,
  InfoCallout,
  Markdown,
  TextInput,
  renderToJson,
  RenderToJsonError,
} from "../src/authoring/index.js";

test("authoring: Canvas root renders a valid CanvasResponse", () => {
  const tree = (
    <Canvas surface="hire_flow" cacheTtlSeconds={60}>
      <Header id="h1" text="Pick a repo" level={2} />
      <Markdown id="md1" source="## welcome" />
      <TextInput id="repo_url" label="Repo URL" required />
      <Checkbox id="agree" label="I agree" required />
      <ActionButton
        id="submit"
        label="Scan"
        action="__submit_hire__"
        disabled_when="!form.agree"
      />
    </Canvas>
  );

  const json = renderToJson(tree);
  assert.match(json.ui_kit_version, /^\d+\.\d+\.\d+$/);
  assert.equal(json.surface, "hire_flow");
  assert.equal(json.blocks.length, 5);
  assert.equal(json.blocks[0]?.type, "header");
  assert.equal(json.blocks[4]?.type, "action_button");
});

test("authoring: CustomEmbed wires postMessage event list", () => {
  const tree = (
    <Canvas surface="post_hire">
      <CustomEmbed
        id="vibescan"
        src="https://vibescan.miniapps.renowide.com/embed"
        height="900px"
        allow_postmessage_events={["ready", "resize", "toast", "action"]}
        resize="auto"
      />
    </Canvas>
  );

  const json = renderToJson(tree);
  const block = json.blocks[0];
  assert.equal(block?.type, "custom_embed");
  if (block?.type === "custom_embed") {
    assert.deepEqual(block.props.allow_postmessage_events, [
      "ready",
      "resize",
      "toast",
      "action",
    ]);
  }
});

test("authoring: raw strings in children are rejected", () => {
  assert.throws(
    () =>
      renderToJson(
        <Canvas surface="hire_flow">
          {/* @ts-expect-error invalid child for the test */}
          plain text
        </Canvas>,
      ),
    (err: unknown) => err instanceof RenderToJsonError,
  );
});

test("authoring: info_callout accepts severity levels", () => {
  const tree = (
    <Canvas surface="post_hire">
      <InfoCallout id="cta" severity="success" text="Scan complete" />
    </Canvas>
  );
  const json = renderToJson(tree);
  const block = json.blocks[0];
  assert.equal(block?.type, "info_callout");
});
