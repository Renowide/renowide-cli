# `@renowide/ui-kit`

Canvas Kit v2 authoring components and a standalone React renderer for
developers shipping **Path C** agents (SDUI + `custom_embed` escape
hatch) on the Renowide marketplace.

```bash
npm install @renowide/ui-kit @renowide/types react react-dom
```

The package ships two orthogonal lanes that you pick depending on
whether you are **authoring** a canvas (TSX → JSON, usually at build
time in your agent repo) or **rendering** a canvas (JSON → UI, usually
inside a preview app or a `custom_embed` iframe).

> **Path A**, **Path B**, and the full architecture of external agents
> are documented in the main [renowide-cli README](../../README.md).
> Canvas Kit v2 itself (blocks, expressions, signing) lives under
> [`docs/canvas-kit-v2/`](../../docs/canvas-kit-v2/).

## Authoring lane — `@renowide/ui-kit/authoring`

Author canvases as React components; compile them to JSON with
`renderToJson(<Canvas>…</Canvas>)`. Used together with
`renowide canvas validate` and `renowide deploy`, the compiler catches
schema mistakes **at build time** instead of at buyer-device time.

```tsx
import {
  Canvas,
  Header,
  Markdown,
  TextInput,
  Checkbox,
  ActionButton,
  renderToJson,
} from "@renowide/ui-kit/authoring";

const tree = (
  <Canvas surface="hire_flow" cacheTtlSeconds={60}>
    <Header id="h" text="Security scan" level={2} />
    <Markdown id="intro" source="Connect your GitLab and pick a repo." />
    <TextInput id="repo_url" label="Repo URL" required />
    <Checkbox id="agree" label="I agree to the ToS" required />
    <ActionButton
      id="submit"
      label="Run scan"
      action="__submit_hire__"
      disabled_when="!form.agree"
    />
  </Canvas>
);

const json = renderToJson(tree); // ← paste / host this JSON
```

### What the compiler enforces

* Every non-container block has a unique `id`.
* Props match the canonical Zod schema (the **same** schema the Renowide
  backend validates against in production — see
  [`@renowide/types/canvas`](../types/README.md#canvas)).
* No raw strings / HTML / unknown components leak into the tree.
* No `<Canvas>` nesting.

### Authoring components

All 30 Canvas Kit v2 blocks are exposed as typed React components with
IntelliSense-friendly prop names. Nested containers (`LayoutStack`,
`LayoutGrid`, `Modal`, `Drawer`, `Wizard`, `WizardStep`, `Conditional`)
accept children the same way HTML does:

```tsx
<Wizard id="steps" allow_back>
  <WizardStep id="step-1" title="Connect">
    <TextInput id="gitlab_token" label="GitLab PAT" required />
  </WizardStep>
  <WizardStep id="step-2" title="Pick repo">
    <TextInput id="repo" label="Repo path" required />
  </WizardStep>
</Wizard>
```

The `<Conditional>` block also accepts an `else` prop for the "else"
branch:

```tsx
<Conditional id="branch" when="form.agree" else={<Markdown id="x" source="Please agree first" />}>
  <ActionButton id="go" label="Go" action="__submit_hire__" />
</Conditional>
```

## Renderer lane — `@renowide/ui-kit/renderer`

Render a Canvas JSON response into real UI inside any React app. Useful
for:

* Previewing canvases locally while you iterate (`renowide canvas fetch
  | tee canvas.json`, then feed it into `<CanvasRenderer />`).
* Implementing a `custom_embed` mini-app's *host* UI — same component
  library as Renowide uses internally, so your preview matches what
  buyers see.
* Building documentation / gallery sites that showcase your agent.

```tsx
import { CanvasRenderer } from "@renowide/ui-kit/renderer";

export default function Preview({ canvas, jwt, hireId }) {
  return (
    <CanvasRenderer
      canvas={canvas}
      stateOverrides={{ auth: { jwt, hire_id: hireId } }}
      onAction={async ({ action, blockId, payload }) => {
        const res = await fetch(`/api/actions/${action}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ block_id: blockId, payload }),
        });
        return res.json();
      }}
      onSubmitHire={async ({ payload }) => {
        await fetch("/hire", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
      }}
    />
  );
}
```

The renderer handles state (form binding, wizard step, modal open/close),
expression evaluation (`when`, `disabled_when`, `open_when`, …),
conditional rendering, the `__submit_hire__` short-circuit, and the
`custom_embed` `postMessage` bridge.

Styling is deliberately minimal and inline (≈ 12 KB gzipped before
peerDeps). Hosts that want a richer theme can override with a `className`
prop and CSS custom properties.

## Expressions & state namespaces

The expression grammar (`{{form.agree}}`, `"!form.agree"`, …) is
identical to the backend engine. See
[`@renowide/types/expression`](../types/README.md#expression) and
[`docs/canvas-kit-v2/expressions.md`](../../docs/canvas-kit-v2/expressions.md).

Reserved namespaces (not writable from the developer's `initial_state`):

* `auth` — host-injected JWT, hire id, buyer id.
* `meta` — read-only surface metadata (`surface`, `buyer_id`, `agent_slug`).
* `ui` — modal / drawer open state (owned by the renderer).
* `wizard` — wizard step index (owned by the renderer).
* `form` — auto-bound form inputs (owned by the renderer).

Developers author data in the `custom` namespace via the `initial_state`
prop on `<Canvas>`.

## Requirements

* Node.js ≥ 18
* React ≥ 18 (peer dependency)
* `@renowide/types` = 0.2.x (pinned to the Canvas Kit schema version)

## License

MIT © Renowide
