/**
 * `@renowide/ui-kit/authoring` — TSX components + renderToJson compiler.
 *
 * Usage:
 *
 *     import {
 *       Canvas, Header, Markdown, Checkbox, ActionButton, renderToJson,
 *     } from "@renowide/ui-kit/authoring";
 *
 *     const tree = (
 *       <Canvas surface="hire_flow">
 *         <Header id="h" text="Hire this agent" />
 *         <Markdown id="desc" source="Review the terms below." />
 *         <Checkbox id="agree" label="I agree to the terms" />
 *         <ActionButton
 *           id="submit"
 *           label="Hire now"
 *           action="__submit_hire__"
 *           disabled_when="!form.agree"
 *         />
 *       </Canvas>
 *     );
 *
 *     const json = renderToJson(tree);
 *     await fs.writeFile("hire_flow.json", JSON.stringify(json));
 *
 * The returned JSON is pre-validated against `CanvasResponseSchema` and
 * `validateCanvasStructure` from `@renowide/types`, so if `renderToJson`
 * returns without throwing, the Renowide backend will accept it.
 */

export * from "./components.js";
export * from "./renderToJson.js";
