/**
 * Smoke tests for the standalone React renderer.
 *
 * We render into a JSDOM-free environment with `react-dom/server` and
 * assert on the emitted HTML. Full interactive behaviour (clicks,
 * wizards, postMessage) is verified in the host-app e2e suite — these
 * tests only prove that each block renders without throwing and that
 * expression-driven conditionals work.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CanvasRenderer } from "../src/renderer/index.js";
import type { CanvasResponse } from "@renowide/types/canvas";

const SAMPLE: CanvasResponse = {
  ui_kit_version: "2.0.0",
  surface: "hire_flow",
  cache_ttl_seconds: 60,
  blocks: [
    { id: "h1", type: "header", props: { text: "Welcome", level: 2 } },
    { id: "md1", type: "markdown", props: { source: "hello **world**" } },
    {
      id: "repo",
      type: "text_input",
      props: { label: "Repo URL", required: true },
    },
    { id: "agree", type: "checkbox", props: { label: "I agree" } },
    {
      id: "only_if_agreed",
      type: "markdown",
      when: "form.agree",
      props: { source: "you agreed" },
    },
    {
      id: "submit",
      type: "action_button",
      props: {
        label: "Scan",
        action: "__submit_hire__",
        disabled_when: "!form.agree",
      },
    },
  ],
};

test("renderer: renders a minimal hire_flow canvas without throwing", () => {
  const html = renderToStaticMarkup(
    React.createElement(CanvasRenderer, { canvas: SAMPLE }),
  );
  assert.match(html, /Welcome/);
  assert.match(html, /<strong>world<\/strong>/);
  assert.match(html, /Repo URL/);
});

test("renderer: conditional block is hidden when expression is false", () => {
  const html = renderToStaticMarkup(
    React.createElement(CanvasRenderer, { canvas: SAMPLE }),
  );
  assert.doesNotMatch(html, /you agreed/);
});

test("renderer: stateOverrides flip conditional visibility", () => {
  const html = renderToStaticMarkup(
    React.createElement(CanvasRenderer, {
      canvas: SAMPLE,
      stateOverrides: { form: { agree: true } },
    }),
  );
  assert.match(html, /you agreed/);
});

test("renderer: action button reflects disabled_when expression", () => {
  const html = renderToStaticMarkup(
    React.createElement(CanvasRenderer, {
      canvas: SAMPLE,
      stateOverrides: { form: { agree: false } },
    }),
  );
  // React serialises `disabled` as a boolean attribute on submit button.
  assert.match(html, /disabled=""/);
});
