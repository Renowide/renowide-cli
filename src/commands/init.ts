/**
 * `renowide init` — scaffold an agent project or add renowide.yaml in place.
 *
 * Strategy:
 *   - If `--in-place`, only drop a `renowide.yaml` at the project root.
 *   - Otherwise, clone the latest starter kit (node or python) into `dir`.
 *
 * We avoid shelling out to `git clone` — the CLI should work in
 * environments without git (Docker images, Nix shells, etc.).
 * We use the tarball URL GitHub exposes for the main branch.
 */

import fs from "node:fs";
import path from "node:path";
import prompts from "prompts";
import pc from "picocolors";

const STARTER_TARBALL =
  "https://codeload.github.com/Renowide/renowide-agent-starter/tar.gz/refs/heads/main";

export async function cmdInit(opts: { dir?: string; lang?: string; inPlace?: boolean }) {
  if (opts.inPlace) {
    return await writeManifestInPlace();
  }

  const dir = opts.dir ?? (await askDir());
  const lang = (opts.lang ?? "node").toLowerCase();
  if (lang !== "node" && lang !== "python") {
    throw new Error('--lang must be "node" or "python"');
  }

  const target = path.resolve(process.cwd(), dir);
  if (fs.existsSync(target) && fs.readdirSync(target).length > 0) {
    throw new Error(`Target directory ${dir} already exists and is not empty.`);
  }

  console.log(pc.gray(`→ downloading starter kit to ${target}`));
  await downloadAndExtract(STARTER_TARBALL, target);

  console.log(pc.green(`✓ scaffolded ${dir}`));
  console.log("");
  console.log("  next steps:");
  console.log(pc.cyan(`    cd ${dir}`));
  if (lang === "node") {
    console.log(pc.cyan(`    cd node && npm install`));
    console.log(pc.cyan(`    npm run dev              # run your MCP server`));
  } else {
    console.log(pc.cyan(`    cd python && pip install -r requirements.txt`));
    console.log(pc.cyan(`    uvicorn agent.server:app --reload --port 8787`));
  }
  console.log(pc.cyan(`    renowide login`));
  console.log(pc.cyan(`    renowide publish`));
}

async function askDir(): Promise<string> {
  const res = await prompts({
    type: "text",
    name: "dir",
    message: "Project directory name",
    initial: "my-agent",
  });
  if (!res.dir) throw new Error("cancelled");
  return res.dir;
}

async function writeManifestInPlace() {
  const target = path.resolve(process.cwd(), "renowide.yaml");
  if (fs.existsSync(target)) {
    throw new Error("renowide.yaml already exists. Edit it, or delete it first.");
  }

  const answers = await prompts([
    { type: "text", name: "name", message: "Agent display name", initial: "My Agent" },
    { type: "text", name: "slug", message: "Agent slug (lowercase-kebab)", initial: "my-agent" },
    { type: "text", name: "tagline", message: "One-sentence tagline" },
    {
      type: "select",
      name: "guild",
      message: "Guild",
      choices: [
        { title: "finance", value: "finance" },
        { title: "marketing", value: "marketing" },
        { title: "construction", value: "construction" },
        { title: "service_business", value: "service_business" },
        { title: "sales", value: "sales" },
        { title: "legal", value: "legal" },
        { title: "healthcare", value: "healthcare" },
        { title: "general", value: "general" },
      ],
    },
    {
      type: "select",
      name: "protocol",
      message: "How does Renowide reach your agent?",
      choices: [
        { title: "mcp — standard MCP server", value: "mcp" },
        { title: "webhook", value: "webhook" },
        { title: "native (built on Renowide)", value: "native" },
      ],
    },
    { type: "text", name: "endpoint", message: "Endpoint URL", initial: "https://your-agent.example.com/mcp" },
    { type: "number", name: "price_credits", message: "Credits per run", initial: 20 },
  ]);
  if (!answers.name) throw new Error("cancelled");

  const yaml =
`name: "${answers.name}"
slug: "${answers.slug}"
tagline: "${answers.tagline ?? ""}"
guild: "${answers.guild}"
layer: 2
protocol: "${answers.protocol}"
endpoint: "${answers.endpoint}"

pricing:
  model: "per_run"
  price_credits: ${answers.price_credits}
  free_runs: 3

compliance:
  data_residency: ["EU"]
  jurisdiction: []
  tags: []

capabilities:
  - id: "main"
    description: "Primary capability of this agent."

governance:
  auto_run: ["main"]

models_used: []
`;
  fs.writeFileSync(target, yaml);
  console.log(pc.green(`✓ wrote renowide.yaml`));
}

async function downloadAndExtract(url: string, target: string) {
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`failed to download starter: HTTP ${res.status}`);
  }
  fs.mkdirSync(target, { recursive: true });

  const { Readable } = await import("node:stream");
  const { pipeline } = await import("node:stream/promises");
  const { spawn } = await import("node:child_process");

  const tarProc = spawn("tar", ["-xz", "--strip-components=1", "-C", target]);
  tarProc.on("error", (e) => {
    throw new Error(`\`tar\` unavailable: ${e.message}. Install tar or download the starter manually.`);
  });

  const nodeReadable = Readable.fromWeb(res.body as any);
  await pipeline(nodeReadable, tarProc.stdin);
  await new Promise<void>((resolve, reject) =>
    tarProc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`tar exited with code ${code}`)),
    ),
  );
}
