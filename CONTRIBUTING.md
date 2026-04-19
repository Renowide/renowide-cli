# Contributing to `@renowide/cli`

Thanks for thinking about helping. This doc tells you the three things you
actually need to know: **what we'd love help with**, **what we won't
merge**, and **how to ship a PR** without either of us wasting time.

It's intentionally opinionated. Generic "please contribute" pages lead to
PRs that sit for months. We'd rather point you at something concrete.

---

## TL;DR

- Small fix? (< 50 LOC, obvious bug, typo) → **open a PR directly**, no ceremony.
- New feature, new dependency, or refactor? → **open an issue first**, let's align before you spend the weekend on it.
- Security issue? → `security@renowide.com`, not a GitHub issue. See [`SECURITY.md`](./SECURITY.md).
- Question? → open a [GitHub Issue](https://github.com/Renowide/renowide-cli/issues/new) and add the `question` label.
- Looking for something to work on? → [open issues](https://github.com/Renowide/renowide-cli/issues) (anything with the `good first issue` label once we've triaged a few).

---

## What we'd love help with

Concrete list, roughly ordered by how much pain it saves us:

### 1. Platform compatibility

The CLI is developed on macOS. Every release has probably broken something on Windows or Linux that we won't notice for weeks.

- **Windows path handling.** If `renowide init my-agent` misbehaves on
  PowerShell or Git Bash, we want a repro and a fix.
- **Line endings.** CRLF-vs-LF bugs in manifest parsing, especially
  `renowide.yaml`.
- **Terminal color detection.** Some CI environments (GitLab CI, AWS
  CodeBuild) strip ANSI; output should still be readable.
- **Homebrew formula / Scoop manifest / AUR package.** If you maintain
  one of these and want to add `renowide-cli`, tell us — we'll coordinate
  on release automation.

Label: [`platform-compat`](https://github.com/Renowide/renowide-cli/labels/platform-compat)

### 2. Starter templates for `renowide init`

`renowide init` currently scaffolds a TypeScript/Express webhook handler (Persona A link-out) and a YAML manifest (Persona B hosted). We want more:

- **Python / FastAPI** link-out starter
- **Python / Flask** link-out starter
- **Go / net/http** link-out starter
- **Rust / Axum** link-out starter
- **Next.js API route** link-out starter
- **MCP server** (stdio and HTTP transports) — bridges to Persona B

Each template should be **runnable in under 2 minutes** with `.env.example`, a 10-line webhook handler, and a README that explains the signature verification step. Look at the TypeScript starter for the shape we want.

Label: [`starter-template`](https://github.com/Renowide/renowide-cli/labels/starter-template)

### 3. Shell completions

Standard ask. Run `renowide <TAB>` and get subcommand completions. We'll take:

- `bash` completion script
- `zsh` completion script
- `fish` completion script
- PowerShell completion

Pattern: a new `renowide completion <shell>` subcommand that prints the script to stdout. Users source it from their rc file. Similar to how `docker`, `kubectl`, and `gh` do it.

Label: [`completions`](https://github.com/Renowide/renowide-cli/labels/completions)

### 4. Better `--json` / scripting output

People chain CLIs into pipelines. Every human-readable output should have a machine-readable counterpart via `--json`:

```
renowide status --json
renowide hire show <id> --json
renowide deploy --dry-run --json
```

JSON shape should be stable — we version it. Breaking changes bump a `--json-version` header. See `src/commands/status.ts` for the existing pattern.

Label: [`json-output`](https://github.com/Renowide/renowide-cli/labels/json-output)

### 5. Error message quality

Half the support load in Discord is people hitting errors they can't decode. If you hit a cryptic error and figure out what it actually meant, PR a better message.

Good example:

```diff
-  Error: EACCES
+  Error: cannot write to ~/.renowide/credentials
+  This usually means permissions on ~/.renowide are wrong.
+  Try: chmod 700 ~/.renowide && chmod 600 ~/.renowide/credentials
```

Label: [`dx-errors`](https://github.com/Renowide/renowide-cli/labels/dx-errors)

### 6. Documentation

- **Translations** of the README. English-first, but a Spanish/Portuguese/Arabic/Chinese README lives at `README.es.md` etc. We'll review the first PR per language; subsequent changes go through the same translator where possible.
- **Recipe cookbook** — `docs/recipes/` with single-purpose how-tos: "How to deploy to Renowide from GitLab CI", "How to test webhooks locally with ngrok", "How to upgrade from Persona A to B".
- **Video walkthroughs** on a personal YouTube/Loom. Link them and we'll add to the README.

Label: [`docs`](https://github.com/Renowide/renowide-cli/labels/docs)

### 7. Tests

- Unit test coverage for `src/commands/*` is patchy. Every public function in `src/utils/` should have at least a happy-path and one error-path test.
- Snapshot tests of CLI output (`renowide deploy --dry-run` currently has no test coverage).
- Integration tests that mock the Renowide API with MSW or nock. Run them in `npm test:integration`.

Label: [`tests`](https://github.com/Renowide/renowide-cli/labels/tests)

### 8. Manifest schema improvements

- Better Zod error messages (e.g. "did you mean `webhook_url`?" on `webhookUrl`).
- JSON Schema export — `renowide schema --format=json` prints the schema so editors (VS Code, IntelliJ) can provide autocomplete in `renowide.json` / `renowide.yaml`.
- YAML anchors/aliases support (currently parsed but not fully validated).

Label: [`schema`](https://github.com/Renowide/renowide-cli/labels/schema)

### 9. Observability / debugging

- `--verbose` / `DEBUG=renowide:*` should print every HTTP request with headers (redacting the token).
- `renowide doctor` command that dumps Node version, OS, network reachability to `renowide.com`, credentials file permissions, and common misconfigurations. Like `brew doctor`.

Label: [`debugging`](https://github.com/Renowide/renowide-cli/labels/debugging)

### 10. Security hardening

- Move credentials storage to OS keyring where available (`keytar` on macOS/Windows, `libsecret` on Linux). Fall back to the current `~/.renowide/credentials` file with `0600`.
- Redact `rw_key_*` tokens from error stack traces automatically.
- Vendor a minimal signature-verification helper (`renowide verify-webhook`) so users don't implement HMAC by hand.

Label: [`security-hardening`](https://github.com/Renowide/renowide-cli/labels/security-hardening)

---

## What we won't merge

Saying "no" to a good-faith PR is the worst part of this job. Saying "no" ahead of time is kinder:

### Code-level

- **Rewrites in a different language.** The CLI is TypeScript. We're not porting to Deno/Bun/Rust. Separate _language SDK_ projects (Python client, Go client) are welcome — but as separate repos under the Renowide org, not as replacements for this one.
- **New runtime dependencies without prior discussion.** Every `npm install` is a supply-chain risk. We prefer `node:*` built-ins over npm packages for anything under 100 LOC.
- **Refactors for their own sake.** "Convert all `const foo = ()  =>` to `function foo()`" PRs get closed. Refactors tied to a concrete feature or bug fix are fine.
- **AI-slop PRs.** We can tell. Please read the code and PR description before opening. One symptom: every function acquires a 10-line JSDoc comment that paraphrases its name. Another: the PR description is longer than the diff.
- **Breaking API changes** to `renowide.json` / `renowide.yaml` without a versioning plan. Server-side compat matters.
- **New subcommands that duplicate existing ones.** If `renowide hire list` exists, don't add `renowide hires`.

### Behaviour-level

- **Telemetry.** We don't collect usage stats, ever. PRs adding analytics, crash reporting, or "help us improve" pings will be closed without discussion.
- **Auto-update machinery.** Users install via `npm`. `npm` handles updates. We won't add a self-updater that downloads binaries out-of-band.
- **Commit signing requirements on contributors.** Unnecessary friction for a small project. We may add this when we hit 100+ contributors.
- **Commands that encourage committing secrets.** `renowide set-secret`, `renowide login --token rw_key_...` as a flag — no. Secrets stay in stdin or env vars.

### Philosophy

- **Anything that makes the first-time experience worse.** A new user hitting `npx @renowide/cli init my-agent` and seeing their agent live within 10 minutes is the single most important metric. PRs that add friction (more prompts, more flags, more error-reporting nags) need to justify it 10x.

If you're unsure whether a thing is wanted, **open an issue first**. One
well-reasoned issue saves both of us a weekend.

---

## How to ship a PR

### Setup

```bash
git clone git@github.com:<your-fork>/renowide-cli.git
cd renowide-cli
npm install
npm run build

# Link for local testing:
npm link
# Now `renowide --version` uses your local build.
```

Node 20+ required (the published package builds against Node 20 LTS but we target 18+ runtime-compatibility.)

### Before committing

```bash
npm run typecheck   # TypeScript must pass
npm test            # Existing tests must pass
npm run build       # Build must succeed
```

If your change affects behaviour, **add a test**. No test = no merge, except for pure docs/typo fixes.

### Commit messages

We use imperative mood, lowercase scope, no emoji prefix:

```
feat(deploy): forecast public url in --dry-run output
fix(login): handle expired rw_key_ tokens without 500
docs(readme): add windows-specific install note
ci(publish): pin actions/checkout to v4
```

One logical change per commit. Squash your WIP commits before opening the PR (or mark "allow maintainers to squash").

### Opening the PR

1. Target `main`. We don't use feature branches on the `Renowide/renowide-cli` side.
2. Fill in the PR template (it'll be prefilled when you open).
3. **Link the issue** you're closing (`Closes #42`).
4. Wait for CI. All three of `typecheck`, `test`, `build` must be green. If CI fails on your machine but passes here, tell us — it's a platform bug worth fixing.
5. Address review comments with follow-up commits; we squash-merge at the end.

Typical review turnaround: 48h during weekdays, longer on weekends. Ping `@Renowide` on the PR if you haven't heard back in 5 business days.

---

## Licensing

This project is MIT-licensed (see [`LICENSE`](./LICENSE)). By opening a PR, you agree that:

- Your contribution is your own work (or you have permission to contribute it).
- It's licensed under the same MIT terms.
- We can include it in `@renowide/cli` indefinitely without further consent.

No CLA to sign for now. If we grow past ~100 contributors we'll revisit. In the meantime, please sign your commits with DCO if you want an audit trail:

```
git commit -s -m "fix(foo): bar"
```

(The `-s` flag adds `Signed-off-by: You <you@example.com>`.)

---

## Getting in touch

| Channel | When to use |
|---|---|
| [GitHub Issues](https://github.com/Renowide/renowide-cli/issues) | Bugs, feature proposals, tracking. Use the `question` label for "is this a bug or am I holding it wrong" |
| `security@renowide.com` | Vulnerabilities only |

Mentioning `@Renowide` on a PR pings the whole org account, so we see it. Please don't email the founder directly for CLI stuff — it gets lost.

---

## Recognition

Every PR that ships gets:

- Your name on the commit, linked to your GitHub profile.
- A mention in the [`CHANGELOG.md`](./CHANGELOG.md) under the release that includes your change.
- If it's a substantive feature (new command, new platform support, starter template), we'll credit you in the release's npm description and the release blog post.

We're not going to pretend that being one of 50 contributors to a small CLI is a life-changing credential. But it's a real, verifiable commit you can link to in a job application, and we'll write a LinkedIn recommendation for anyone who's shipped three or more substantive PRs and asks for one.

---

**Thank you for reading this far.** 99% of PRs go smoothly. The ones that don't usually come down to skipping this doc. Now go break something useful.
