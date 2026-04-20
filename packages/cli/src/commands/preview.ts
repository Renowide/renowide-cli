/**
 * `renowide preview` — spin up a local HTML view of the manifest.
 *
 * Runs a small HTTP server (default :4400) and serves a self-contained
 * HTML page that renders the manifest's post_hire, chat, and dashboard
 * canvases using the same Canvas Kit block set as production. No
 * Renowide backend is contacted — everything is resolved from the file
 * system and served statically.
 *
 * Useful for:
 *   • checking layout before publishing
 *   • demoing a new agent before it has buyers
 *   • inspecting a brand palette's effect on the canvas
 *
 * Limitations:
 *   • `when:` conditionals are NOT evaluated (all blocks shown, flagged).
 *   • tool calls in dashboard tiles return no data (fallback content).
 *   • i18n is rendered in `en` by default; pass `?lang=de` to switch.
 */

import http from "node:http";
import { URL } from "node:url";
import pc from "picocolors";
import { readManifest, type Manifest } from "../manifest.js";

interface PreviewOpts {
  manifest: string;
  port?: string;
  host?: string;
}

export async function cmdPreview(opts: PreviewOpts) {
  const manifestPath = opts.manifest || "renowide.yaml";
  const port = Number(opts.port ?? 4400);
  const host = opts.host ?? "127.0.0.1";

  // Warm load — fail fast if the manifest is invalid.
  const initial = readManifest(manifestPath);
  console.log(pc.cyan(`\n▶ renowide preview — ${initial.slug}\n`));

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${host}:${port}`);
    try {
      // Re-read on every request so edits to renowide.yaml show up on refresh.
      const manifest = readManifest(manifestPath);

      if (url.pathname === "/manifest.json") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(manifest, null, 2));
        return;
      }
      if (url.pathname === "/health") {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end("ok");
        return;
      }

      const lang = url.searchParams.get("lang") ?? "en";
      const surface = (url.searchParams.get("surface") ?? "all").toLowerCase();
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(renderHtml(manifest, { lang, surface }));
    } catch (err: any) {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end(`preview error: ${err?.message ?? err}`);
    }
  });

  server.listen(port, host, () => {
    console.log(
      `  ${pc.bold("open:")} ${pc.green(`http://${host}:${port}`)}\n` +
        `  ${pc.bold("live reload:")} edit ${pc.bold(manifestPath)} and refresh the browser\n` +
        `  ${pc.bold("stop:")} ctrl-c\n`,
    );
    console.log(
      pc.dim(
        "Query params:\n" +
          "  ?lang=en|de|fr|…       resolve i18n:<key> strings in that language\n" +
          "  ?surface=all|chat|post_hire|dashboard   isolate one surface\n",
      ),
    );
  });
}

// ─── Rendering ───────────────────────────────────────────────────────────────

interface PreviewState {
  lang: string;
  surface: string;
}

function renderHtml(manifest: Manifest, state: PreviewState): string {
  const i18nLookup = (s: unknown) => resolveI18n(s, manifest.i18n ?? {}, state.lang);
  const brand = manifest.brand ?? {};
  const fontFamily = brand.font_family
    ? fontStackFor(brand.font_family)
    : fontStackFor("inter");
  const primary = brand.primary_color ?? "#2563EB";
  const accent = brand.accent_color ?? "#1D4ED8";
  const text = brand.text_color ?? "#111827";
  const surface = brand.surface_color ?? "#FFFFFF";
  const radius = radiusFor(brand.border_radius ?? "medium");

  const show = (name: string) =>
    state.surface === "all" || state.surface === name;

  return `<!doctype html>
<html lang="${escape(state.lang)}">
  <head>
    <meta charset="utf-8" />
    <title>${escape(i18nLookup(manifest.name))} · preview</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        --rw-brand-primary: ${primary};
        --rw-brand-accent: ${accent};
        --rw-brand-text: ${text};
        --rw-brand-surface: ${surface};
        --rw-brand-radius: ${radius};
      }
      html, body { margin: 0; padding: 0; background: #F3F4F6; }
      body {
        font-family: ${fontFamily};
        color: var(--rw-brand-text);
      }
      .shell { max-width: 980px; margin: 0 auto; padding: 24px 18px 64px; }
      .banner {
        background: linear-gradient(90deg, var(--rw-brand-primary), var(--rw-brand-accent));
        color: white; padding: 16px 20px; border-radius: var(--rw-brand-radius);
        margin-bottom: 18px; display: flex; align-items: center; justify-content: space-between;
      }
      .banner small { opacity: .85; }
      .card {
        background: var(--rw-brand-surface);
        border: 1px solid #E5E7EB;
        border-radius: var(--rw-brand-radius);
        padding: 18px;
        margin-bottom: 18px;
      }
      .card h2 { margin: 0 0 14px; font-size: 15px; color: #6B7280; text-transform: uppercase; letter-spacing: .5px; font-weight: 600; }
      .blocks { display: flex; flex-direction: column; gap: 12px; }
      h3.header { margin: 0; font-size: 18px; font-weight: 600; }
      p.section { margin: 0; line-height: 1.6; color: #374151; white-space: pre-wrap; }
      .callout { padding: 10px 12px; border-radius: 8px; font-size: 14px; }
      .callout.info { background:#EFF6FF; border:1px solid #BFDBFE; color:#1E40AF; }
      .callout.warn { background:#FEF3C7; border:1px solid #FDE68A; color:#92400E; }
      .callout.success { background:#ECFDF5; border:1px solid #A7F3D0; color:#065F46; }
      .cta {
        align-self: flex-start; padding: 10px 16px; border: 0; border-radius: 10px;
        background: var(--rw-brand-primary); color: white; font-weight: 600; cursor: pointer;
      }
      .cta.secondary { background: white; color: var(--rw-brand-text); border: 1px solid #E5E7EB; }
      .btn { display:inline-block; padding: 8px 14px; border-radius: 8px; border: 1px solid #E5E7EB; text-decoration:none; color: var(--rw-brand-primary); font-weight: 500; }
      label.inp { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color:#374151; }
      label.inp input, label.inp textarea { border: 1px solid #D1D5DB; border-radius: 8px; padding: 8px 10px; font-size: 14px; font-family: inherit; }
      .kpi { background:#F9FAFB; border:1px solid #E5E7EB; border-radius: 12px; padding:12px 14px; }
      .kpi .label { font-size: 12px; color:#6B7280; text-transform: uppercase; letter-spacing: .5px; }
      .kpi .value { font-size: 22px; font-weight: 700; color: var(--rw-brand-text); }
      table.rw { width:100%; border-collapse: collapse; font-size: 13px; }
      table.rw th, table.rw td { padding: 6px 8px; text-align:left; border-bottom: 1px solid #F3F4F6; }
      table.rw th { color:#6B7280; font-weight:500; }
      figure { margin: 0; }
      figure img { max-width: 100%; border-radius: 8px; display: block; }
      .pill { display:inline-block; padding: 4px 10px; border-radius: 999px; background:#F3F4F6; font-size: 12px; color:#374151; margin-right:4px; }
      .tool { border: 1px solid #E5E7EB; border-radius: 10px; padding: 10px 12px; }
      .tool .t-name { font-weight:600; }
      .tool .t-desc { color:#4B5563; font-size:13px; margin-top: 4px; }
      .markdown h1, .markdown h2, .markdown h3 { margin: 8px 0; }
      pre.code { background:#0B1020; color:#E5E7EB; padding:12px 14px; border-radius:10px; overflow-x: auto; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; }
      .chart { border: 1px dashed #CBD5E1; border-radius: 10px; padding: 16px; color:#475569; font-size: 13px; }
      .chart .bar { display: inline-block; margin-right: 4px; background: var(--rw-brand-primary); border-radius: 3px; opacity: .85; }
      .note { background:#FEF3C7; border:1px solid #FDE68A; color:#92400E; padding: 8px 12px; border-radius: 6px; font-size: 12px; }
      .variant-block { border: 1px dashed #CBD5E1; border-radius: 10px; padding: 12px 14px; display:flex; flex-direction:column; gap: 12px; }
      .variant-tag { font-size: 11px; color:#6B7280; text-transform: uppercase; letter-spacing: .6px; font-weight:600; }
      .variant-tag code { background:#F3F4F6; padding: 1px 6px; border-radius: 4px; font-weight: 500; text-transform: none; }
      .markdown strong { color: var(--rw-brand-text); }
      .markdown a { color: var(--rw-brand-primary); text-decoration: underline; }
      .markdown code { background:#F3F4F6; padding: 1px 6px; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 92%; }
      .markdown ul, .markdown ol { margin: 4px 0; padding-left: 22px; }
    </style>
  </head>
  <body>
    <div class="shell">
      <div class="banner">
        <div>
          <strong>${escape(i18nLookup(manifest.name))}</strong>
          <div><small>${escape(i18nLookup(manifest.tagline || ""))}</small></div>
        </div>
        <small>preview · lang=${escape(state.lang)} · surface=${escape(state.surface)}</small>
      </div>
      <div class="note">⚠ This is a local preview — <code>when:</code> is not evaluated and tool calls return no data.</div>

      ${show("post_hire") ? renderSurfaceWithVariants("Post-hire", manifest.post_hire.welcome_canvas, manifest.post_hire.variants ?? [], i18nLookup) : ""}
      ${show("chat") ? renderSurfaceWithVariants("Chat", manifest.chat.canvas, manifest.chat.variants ?? [], i18nLookup) : ""}
      ${show("dashboard") ? renderDashboard(manifest, i18nLookup) : ""}
      ${manifest.tools?.length ? renderTools(manifest.tools, i18nLookup) : ""}
    </div>
  </body>
</html>`;
}

function renderSurface(title: string, inner: string): string {
  if (!inner.trim()) return "";
  return `<div class="card"><h2>${escape(title)}</h2><div class="blocks">${inner}</div></div>`;
}

// Render a surface (Chat / Post-hire) with its flat canvas AND each of its
// A/B variants as clearly-labelled sub-sections, so devs can eyeball what
// their experiment arms will look like side-by-side without needing a live
// hire_id to trigger hashing.
function renderSurfaceWithVariants(
  title: string,
  flat: any[],
  variants: Array<{ id: string; weight?: number; blocks?: any[] }>,
  t: (s: unknown) => any,
): string {
  const parts: string[] = [];
  if (flat.length) {
    parts.push(
      `<div class="variant-block"><div class="variant-tag">main canvas</div>${renderCanvas(flat, t)}</div>`,
    );
  }
  for (const v of variants) {
    if (!v.blocks?.length) continue;
    const weight = v.weight ?? 1;
    parts.push(
      `<div class="variant-block"><div class="variant-tag">variant <code>${escape(v.id)}</code> · weight ${weight}</div>${renderCanvas(v.blocks, t)}</div>`,
    );
  }
  if (!parts.length) return "";
  return `<div class="card"><h2>${escape(title)}</h2><div class="blocks">${parts.join("")}</div></div>`;
}

function renderDashboard(m: Manifest, t: (s: unknown) => any): string {
  if (!m.dashboard.tiles.length) return "";
  const tiles = m.dashboard.tiles
    .map(
      (tile) => `<div class="card">
        <h2>${escape(t(tile.title))} <span class="pill">${escape(tile.size || "small")}</span></h2>
        <div class="blocks">${renderCanvas(tile.render ?? [], t)}</div>
      </div>`,
    )
    .join("");
  return `<div>${tiles}</div>`;
}

function renderTools(tools: Manifest["tools"], t: (s: unknown) => any): string {
  if (!tools?.length) return "";
  const items = tools
    .map(
      (tl) => `<div class="tool">
        <div class="t-name">${escape(t(tl.display_name ?? tl.name))} <span class="pill">${escape(tl.category)}</span>${tl.requires_approval ? '<span class="pill">approval</span>' : ""}</div>
        <div class="t-desc">${escape(t(tl.description))}</div>
        <div class="t-desc">${tl.inputs.map((i) => `<span class="pill">${escape(i.name)}:${escape(i.type)}${i.required ? "*" : ""}</span>`).join("")}</div>
      </div>`,
    )
    .join("");
  return `<div class="card"><h2>Tools</h2><div class="blocks">${items}</div></div>`;
}

function renderCanvas(blocks: any[], t: (s: unknown) => any): string {
  return blocks
    .map((b) => {
      const when = b.when ? `<span class="pill">when: ${escape(b.when)}</span>` : "";
      switch (b.type) {
        case "header":
          return `<h3 class="header">${escape(t(b.text))} ${when}</h3>`;
        case "section":
          return `<p class="section">${escape(t(b.text))}</p>`;
        case "divider":
          return `<hr />`;
        case "info_callout":
          return `<div class="callout ${escape(b.variant || "info")}">${escape(t(b.text))}</div>`;
        case "image":
          return `<figure><img src="${escape(b.url)}" alt="${escape(b.alt)}" />${b.caption ? `<figcaption>${escape(t(b.caption))}</figcaption>` : ""}</figure>`;
        case "integration_button":
          return `<button class="cta secondary">${escape(t(b.label || `Connect ${b.provider}`))}</button>`;
        case "api_key_input":
          return `<label class="inp"><span>${escape(t(b.label))}${b.required ? " *" : ""}</span><input type="password" placeholder="${escape(b.placeholder || "")}" /></label>`;
        case "oauth_button":
          return `<button class="cta secondary">${escape(t(b.label || `Sign in with ${b.provider}`))}</button>`;
        case "checkbox":
          return `<label class="inp"><span><input type="checkbox" /> ${escape(t(b.text))}${b.required ? " *" : ""}</span></label>`;
        case "text_input":
          return `<label class="inp"><span>${escape(t(b.label))}${b.required ? " *" : ""}</span><input type="text" placeholder="${escape(b.placeholder || "")}" /></label>`;
        case "cta":
          return `<button class="cta ${b.style === "secondary" ? "secondary" : ""}">${escape(t(b.text))}</button>`;
        case "link_button":
          return `<a class="btn" href="${escape(b.url)}" target="_blank" rel="noreferrer">${escape(t(b.text))} ↗</a>`;
        case "quick_reply":
          return `<div>${b.prompts.map((p: string) => `<span class="pill">${escape(t(p))}</span>`).join("")}</div>`;
        case "kpi":
          return `<div class="kpi"><div class="label">${escape(t(b.label))}</div><div class="value">${escape(t(b.value))}</div>${b.trend ? `<div>${escape(t(b.trend))}</div>` : ""}</div>`;
        case "table":
          return renderTable(b, t);
        case "file_upload":
          return `<label class="inp"><span>${escape(t(b.label))}${b.required ? " *" : ""}</span><input type="file" /></label>`;
        case "date_picker":
          return `<label class="inp"><span>${escape(t(b.label))}${b.required ? " *" : ""}</span><input type="${b.mode === "datetime" ? "datetime-local" : "date"}" /></label>`;
        case "markdown":
          return `<div class="markdown">${renderMarkdown(String(t(b.source) ?? ""))}</div>`;
        case "code_block":
          return `<pre class="code"><code>${escape(b.source)}</code></pre>`;
        case "chart":
          return renderChartPreview(b, t);
        default:
          return `<div class="note">Unknown block: ${escape(String(b.type))}</div>`;
      }
    })
    .join("");
}

function renderTable(b: any, t: (s: unknown) => any): string {
  const headers = b.columns.map((c: string) => `<th>${escape(t(c))}</th>`).join("");
  const rows = b.rows
    .map(
      (row: any[]) =>
        `<tr>${row
          .map((c) => `<td>${c === null || c === undefined ? "—" : escape(t(String(c)))}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  return `<table class="rw"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
}

function renderChartPreview(b: any, t: (s: unknown) => any): string {
  const flat = (b.series ?? []).flatMap((s: any) => s.data ?? []);
  const max = Math.max(1, ...flat);
  const bars = flat
    .map((v: number) => {
      const h = Math.round((v / max) * 50) + 6;
      return `<div class="bar" style="width:10px;height:${h}px;vertical-align:bottom"></div>`;
    })
    .join("");
  return `<div class="chart"><strong>${escape(t(b.title || "Chart"))}</strong><br/><small>${escape(b.chart_type)} · ${b.labels.length} points · ${b.series.length} series</small><div style="margin-top:8px">${bars}</div></div>`;
}

function renderMarkdown(src: string): string {
  // Safe subset: headings, bold, italic, inline code, links, lists, hr.
  // Matches what the frontend CanvasRenderer accepts so preview ≈ prod.
  const paras = src.split(/\n{2,}/);
  const out: string[] = [];

  for (const block of paras) {
    const trimmed = block.replace(/\s+$/g, "");
    if (!trimmed) continue;

    // Horizontal rule.
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      out.push("<hr/>");
      continue;
    }

    // Heading — level 1..3.
    const headMatch = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (headMatch && !trimmed.includes("\n")) {
      const level = headMatch[1].length;
      out.push(`<h${level}>${renderInline(headMatch[2])}</h${level}>`);
      continue;
    }

    // Unordered / ordered lists.
    const lines = trimmed.split("\n");
    if (lines.every((l) => /^[-*]\s+/.test(l))) {
      const items = lines.map((l) => `<li>${renderInline(l.replace(/^[-*]\s+/, ""))}</li>`).join("");
      out.push(`<ul>${items}</ul>`);
      continue;
    }
    if (lines.every((l) => /^\d+\.\s+/.test(l))) {
      const items = lines.map((l) => `<li>${renderInline(l.replace(/^\d+\.\s+/, ""))}</li>`).join("");
      out.push(`<ol>${items}</ol>`);
      continue;
    }

    // Default: paragraph with <br/> for single newlines.
    const rendered = lines.map(renderInline).join("<br/>");
    out.push(`<p>${rendered}</p>`);
  }
  return out.join("");
}

// Inline markdown: escape first, then swap markers for tags. Order matters
// (links before emphasis before code) so we don't double-process tokens.
function renderInline(raw: string): string {
  let s = escape(raw);
  // Inline code — single backtick. Use placeholders so bold/italic
  // don't mangle characters inside the code.
  const codes: string[] = [];
  s = s.replace(/`([^`\n]+)`/g, (_m, code) => {
    codes.push(code);
    return `\u0000CODE${codes.length - 1}\u0000`;
  });
  // Links — [text](https://…).
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, text, url) =>
    `<a href="${url}" target="_blank" rel="noreferrer">${text}</a>`,
  );
  // Bold — **text** / __text__.
  s = s.replace(/(\*\*|__)([^*_\n]+?)\1/g, "<strong>$2</strong>");
  // Italic — *text* / _text_ (single-char, no nesting into words).
  s = s.replace(/(^|[\s(])\*([^*\n]+?)\*(?=$|[\s.,!?;:)])/g, "$1<em>$2</em>");
  s = s.replace(/(^|[\s(])_([^_\n]+?)_(?=$|[\s.,!?;:)])/g, "$1<em>$2</em>");
  // Restore inline code.
  s = s.replace(/\u0000CODE(\d+)\u0000/g, (_m, i) => `<code>${codes[Number(i)]}</code>`);
  return s;
}

function fontStackFor(font: string): string {
  const map: Record<string, string> = {
    inter: "'Inter', system-ui, sans-serif",
    ibm_plex_sans: "'IBM Plex Sans', system-ui, sans-serif",
    roboto: "'Roboto', system-ui, sans-serif",
    space_grotesk: "'Space Grotesk', system-ui, sans-serif",
    source_serif_pro: "'Source Serif Pro', Georgia, serif",
    jetbrains_mono: "'JetBrains Mono', ui-monospace, monospace",
    system: "system-ui, -apple-system, Segoe UI, sans-serif",
  };
  return map[font] ?? map.inter;
}

function radiusFor(v: string): string {
  const map: Record<string, string> = {
    none: "0px",
    small: "4px",
    medium: "10px",
    large: "18px",
  };
  return map[v] ?? "10px";
}

function resolveI18n(value: unknown, i18n: Record<string, Record<string, string>>, lang: string): any {
  if (typeof value === "string") {
    if (value.startsWith("i18n:") && value.length > 5) {
      const key = value.slice(5);
      return i18n[lang]?.[key] ?? i18n.en?.[key] ?? key;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => resolveI18n(v, i18n, lang));
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = resolveI18n(v, i18n, lang);
    }
    return out;
  }
  return value;
}

function escape(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
