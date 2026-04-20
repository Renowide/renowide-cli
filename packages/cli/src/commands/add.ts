/**
 * `renowide add <kind> <name>` — scaffold v0.6 entities into renowide.yaml.
 *
 * Supports three kinds:
 *   block   — append a Canvas Kit block stub to chat.canvas (or --surface=post_hire)
 *   tool    — append a declarative tool definition to tools[]
 *   variant — append an A/B variant stub to chat.variants (or --surface=post_hire)
 *
 * Writes YAML as a plain text append with preserved comments. Avoids
 * re-serialising the whole file (which would strip comments and reorder
 * keys) by appending under a matching top-level key. If the key doesn't
 * exist yet we inject it.
 *
 * Safe: every append is followed by a schema validation; on failure we
 * restore the original file.
 */

import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import pc from "picocolors";
import { ManifestSchema } from "../manifest.js";

interface AddOpts {
  manifest: string;
  surface?: string;
}

type Kind = "block" | "tool" | "variant";

const BLOCK_TEMPLATES: Record<string, string> = {
  header: `    - type: "header"
      text: "Section heading"`,
  section: `    - type: "section"
      text: "Multi-line description…"`,
  markdown: `    - type: "markdown"
      source: |
        **Welcome.** Replace with any markdown — bold, _italic_,
        [links](https://renowide.com), and \`inline code\` all render.`,
  info_callout: `    - type: "info_callout"
      variant: "info"      # info | warn | success
      text: "Heads up — something the employer needs to know."`,
  divider: `    - type: "divider"`,
  cta: `    - type: "cta"
      text: "Do the thing"
      action: "run:summarise"
      style: "primary"`,
  link_button: `    - type: "link_button"
      text: "Open docs"
      url: "https://renowide.com/docs"`,
  quick_reply: `    - type: "quick_reply"
      prompts:
        - "Start a fresh summary"
        - "Show last 5 runs"`,
  text_input: `    - type: "text_input"
      id: "company_name"
      label: "Company name"
      required: true`,
  checkbox: `    - type: "checkbox"
      id: "opt_in"
      text: "I agree to the automated summaries policy"
      required: true`,
  api_key_input: `    - type: "api_key_input"
      id: "openai_key"
      label: "OpenAI API key"
      help_url: "https://platform.openai.com/api-keys"
      required: true`,
  oauth_button: `    - type: "oauth_button"
      provider: "google"
      label: "Sign in with Google"
      scopes: ["email", "profile"]`,
  integration_button: `    - type: "integration_button"
      provider: "slack"
      label: "Connect Slack"
      scopes: ["channels:read", "chat:write"]
      required: false`,
  image: `    - type: "image"
      url: "https://cdn.renowide.com/agents/placeholder.png"
      alt: "Screenshot of dashboard"
      caption: "Daily summary delivered to your inbox."`,
  kpi: `    - type: "kpi"
      label: "Summaries this week"
      value: "42"
      trend: "+12% vs last week"`,
  table: `    - type: "table"
      columns: ["Day", "Summaries", "Avg tokens"]
      rows:
        - ["Mon", 5, 140]
        - ["Tue", 8, 155]
        - ["Wed", 3, 128]`,
  date_picker: `    - type: "date_picker"
      id: "start_date"
      label: "When should I start?"
      mode: "date"           # date | datetime`,
  file_upload: `    - type: "file_upload"
      id: "company_logo"
      label: "Upload your company logo"
      accept: ["image/png", "image/jpeg", "image/svg+xml"]
      max_mb: 5`,
  code_block: `    - type: "code_block"
      language: "json"       # json | yaml | python | typescript | bash | sql | …
      source: '{"status": "ready"}'`,
  chart: `    - type: "chart"
      chart_type: "bar"      # bar | line | pie | area
      title: "Summaries — last 7 days"
      labels: ["M", "T", "W", "T", "F", "S", "S"]
      series:
        - label: "completed"
          data: [3, 5, 8, 4, 9, 0, 1]`,
};

export async function cmdAdd(
  kind: string | undefined,
  name: string | undefined,
  opts: AddOpts,
) {
  if (!kind || !name) {
    printHelp();
    throw new Error("missing arguments — see `renowide add --help`");
  }
  const k = kind.toLowerCase() as Kind;
  if (k !== "block" && k !== "tool" && k !== "variant") {
    throw new Error(`unknown kind "${kind}". Use: block | tool | variant`);
  }

  const manifestPath = path.resolve(process.cwd(), opts.manifest || "renowide.yaml");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `renowide.yaml not found at ${opts.manifest}. Run \`renowide init --in-place\` first.`,
    );
  }

  const before = fs.readFileSync(manifestPath, "utf8");
  const surface = (opts.surface ?? "chat").toLowerCase();
  if (surface !== "chat" && surface !== "post_hire") {
    throw new Error(`--surface must be "chat" or "post_hire" (got "${surface}")`);
  }

  let patch: string;
  let topKey: string;
  let targetKey: string;

  if (k === "block") {
    const template = BLOCK_TEMPLATES[name];
    if (!template) {
      const available = Object.keys(BLOCK_TEMPLATES).sort().join(", ");
      throw new Error(`unknown block "${name}".\nAvailable: ${available}`);
    }
    topKey = surface;
    targetKey = surface === "chat" ? "canvas" : "welcome_canvas";
    patch = template;
  } else if (k === "tool") {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(name)) {
      throw new Error(`tool name must match /^[a-z][a-z0-9_]{0,63}$/ (got "${name}")`);
    }
    topKey = "tools";
    targetKey = "";
    patch = `  - name: "${name}"
    description: "TODO — what does ${name} do?"
    category: "act"          # read | write | communicate | analyse | act
    requires_approval: true
    inputs:
      - name: "target"
        type: "string"
        required: true`;
  } else {
    if (!/^[a-z0-9_-]{1,40}$/.test(name)) {
      throw new Error(`variant id must match /^[a-z0-9_-]{1,40}$/ (got "${name}")`);
    }
    topKey = surface;
    targetKey = "variants";
    patch = `    - id: "${name}"
      weight: 1
      blocks:
        - type: "header"
          text: "Variant: ${name}"`;
  }

  const next = injectYaml(before, topKey, targetKey, patch);
  fs.writeFileSync(manifestPath, next);

  // Validate — if the append broke the schema, roll back.
  try {
    const parsed = YAML.parse(next);
    const result = ManifestSchema.safeParse(parsed);
    if (!result.success) {
      fs.writeFileSync(manifestPath, before);
      const issues = result.error.issues
        .map((i) => `  • ${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("\n");
      throw new Error(
        `append broke schema — rolled back.\n${issues}\n\nThis usually means a required field is still a placeholder. Edit renowide.yaml and fill in the TODO.`,
      );
    }
  } catch (err: any) {
    fs.writeFileSync(manifestPath, before);
    throw err;
  }

  console.log(pc.green(`✓ added ${k} "${name}"`));
  const where =
    k === "tool"
      ? "tools[]"
      : k === "variant"
        ? `${surface}.variants[]`
        : `${surface}.${targetKey}[]`;
  console.log(pc.gray(`  location: ${where}`));
  console.log("");
  console.log(pc.cyan(`  renowide preview             # see it rendered`));
  console.log(pc.cyan(`  renowide publish --dry-run   # validate`));
}

function printHelp() {
  console.log(`Usage:
  renowide add block <type>            # append a Canvas Kit block
  renowide add tool  <name>            # declare a tool
  renowide add variant <id>            # add an A/B variant

Options:
  --surface <chat|post_hire>           # target surface (default: chat)
  --manifest <path>                    # path to renowide.yaml

Block types:
  ${Object.keys(BLOCK_TEMPLATES).sort().join(", ")}`);
}

// ─── YAML patcher — append without disturbing existing comments ─────────────
//
// Strategy: find the top-level key (e.g. `chat:` at column 0). If it
// doesn't exist, append the whole stanza. If it exists, find the nested
// target key (e.g. `canvas:` two spaces in). Append the patch to the end
// of that list. When the list is inline (`canvas: []`) or missing, we
// rewrite it as a list header.

function injectYaml(source: string, topKey: string, targetKey: string, patch: string): string {
  const lines = source.split("\n");
  const topIdx = findKeyLine(lines, topKey, 0);

  // Case A: top-level key missing → append whole stanza at end.
  if (topIdx === -1) {
    const stanza = buildStanza(topKey, targetKey, patch);
    return ensureTrailingNewline(source) + stanza + "\n";
  }

  // Case A': targetKey === "" means append directly under the top-level list
  // (used for tools: where patch is already `  - name: …`).
  if (!targetKey) {
    return appendUnderTopKey(lines, topIdx, patch);
  }

  // Case B: find nested key within the top-level block.
  const targetIdx = findNestedKey(lines, topIdx, targetKey);
  if (targetIdx === -1) {
    return insertNestedKey(lines, topIdx, targetKey, patch);
  }

  return appendUnderNestedKey(lines, targetIdx, patch);
}

function findKeyLine(lines: string[], key: string, startIndent: number): number {
  const prefix = " ".repeat(startIndent) + key + ":";
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith(prefix)) return i;
  }
  return -1;
}

function indentOf(line: string): number {
  const m = /^ */.exec(line);
  return m ? m[0].length : 0;
}

function findNestedKey(lines: string[], parentIdx: number, key: string): number {
  const parentIndent = indentOf(lines[parentIdx]);
  const childPrefix = " ".repeat(parentIndent + 2) + key + ":";
  for (let i = parentIdx + 1; i < lines.length; i++) {
    const ind = indentOf(lines[i]);
    if (lines[i].trim() === "") continue;
    if (ind <= parentIndent) break;
    if (lines[i].startsWith(childPrefix)) return i;
  }
  return -1;
}

function appendUnderTopKey(lines: string[], topIdx: number, patch: string): string {
  // Find the end of the top-level key's block (next line at ≤ topIdx indent).
  const topIndent = indentOf(lines[topIdx]);
  let end = lines.length;
  for (let i = topIdx + 1; i < lines.length; i++) {
    if (lines[i].trim() === "") continue;
    if (indentOf(lines[i]) <= topIndent) {
      end = i;
      break;
    }
  }
  // If the key was `tools: []`, overwrite that inline list.
  const keyLine = lines[topIdx];
  if (/:\s*\[\s*\]\s*$/.test(keyLine) || /:\s*$/.test(keyLine)) {
    const keyName = keyLine.split(":")[0];
    lines[topIdx] = `${keyName}:`;
  }
  const out = [...lines.slice(0, end), patch, ...lines.slice(end)];
  return out.join("\n");
}

function appendUnderNestedKey(lines: string[], nestedIdx: number, patch: string): string {
  const nestedIndent = indentOf(lines[nestedIdx]);
  const keyLine = lines[nestedIdx];
  // Inline empty list → rewrite.
  if (/:\s*\[\s*\]\s*$/.test(keyLine)) {
    const keyName = keyLine.replace(/:\s*\[\s*\]\s*$/, "");
    lines[nestedIdx] = `${keyName}:`;
  }
  let end = lines.length;
  for (let i = nestedIdx + 1; i < lines.length; i++) {
    if (lines[i].trim() === "") continue;
    if (indentOf(lines[i]) <= nestedIndent) {
      end = i;
      break;
    }
  }
  const out = [...lines.slice(0, end), patch, ...lines.slice(end)];
  return out.join("\n");
}

function insertNestedKey(
  lines: string[],
  parentIdx: number,
  targetKey: string,
  patch: string,
): string {
  // Insert `  targetKey:` right after the parent key line, then append patch.
  const parentIndent = indentOf(lines[parentIdx]);
  const childIndent = " ".repeat(parentIndent + 2);
  const inject = [`${childIndent}${targetKey}:`, patch];
  const out = [...lines.slice(0, parentIdx + 1), ...inject, ...lines.slice(parentIdx + 1)];
  return out.join("\n");
}

function buildStanza(topKey: string, targetKey: string, patch: string): string {
  if (!targetKey) {
    return `\n${topKey}:\n${patch}`;
  }
  return `\n${topKey}:\n  ${targetKey}:\n${patch}`;
}

function ensureTrailingNewline(s: string): string {
  return s.endsWith("\n") ? s : s + "\n";
}
