# Good-first-issue seeds

Ten concrete, small-to-medium tasks a new contributor can pick up without
first needing to learn the whole codebase. Each one is real (we actually
want these), scoped so it's shippable in under a day, and has clear
acceptance criteria.

**To use this file:** open each section below → click "New issue" on
GitHub → paste title + body → add the labels listed. Takes about 10
minutes total.

Once you've filed all 10 you can delete this file — or keep it as a
reference when thinking up the next batch.

---

## 1. Add `--json` output to `renowide status`

**Labels:** `good first issue`, `json-output`, `enhancement`

**Body:**

```
`renowide status` prints a human-readable summary of the account and the
last few hires. Scripts and CI pipelines want the same data as JSON.

**Acceptance criteria**

- New flag `--json` on `renowide status` command.
- When `--json` is set, print a single JSON object to stdout with:
  - `creator`: { `email`, `id`, `scopes[]` }
  - `agents`: [ { `slug`, `name`, `status`, `hires_this_month`, `credits_this_month` } ]
  - `last_hires`: [ { `id`, `agent_slug`, `state`, `created_at` } ]
- JSON output must NOT include any color codes or prompts.
- Add a test in `tests/commands/status.test.ts` that asserts the JSON
  parses and includes the required top-level keys.
- Update `README.md` in the "CI — publishing without a browser" section
  to mention `renowide status --json`.

**Out of scope**

- Don't add `--json` to other commands in the same PR. One at a time.
- Don't version the JSON schema yet — we'll add `--json-version` later
  if we need to.

**Where to look**

- `src/commands/status.ts` is the current human-readable implementation.
- `src/utils/output.ts` has a pattern for dual human/JSON output that
  `renowide hire show` already uses.
```

---

## 2. Bash + Zsh shell completion

**Labels:** `good first issue`, `completions`, `enhancement`

**Body:**

```
Add a `renowide completion <shell>` subcommand that prints a shell
completion script to stdout. Users install it by sourcing the output.

**Acceptance criteria**

- New subcommand `renowide completion <shell>` where `<shell>` is one
  of `bash`, `zsh`.
- Script must complete:
  - Top-level subcommand names (`init`, `login`, `publish`, `deploy`,
    `hire`, `status`, etc.)
  - Flag names on each subcommand (e.g. `--dry-run` on `deploy`)
- Document installation in `README.md` under a "Shell completions"
  heading:
    bash: `source <(renowide completion bash)`
    zsh:  `source <(renowide completion zsh)`
- Add a test that asserts the output is non-empty valid shell.

**Out of scope**

- Fish and PowerShell are fine-follow-ups, separate PRs.
- Don't auto-install — leave it as a manual `source` step.

**Where to look**

- We use `commander` under the hood. `commander` has a built-in
  completion story (`commander-completion`) but it's unmaintained —
  hand-roll it, we're fine with ~100 LOC of static script.
- `kubectl` and `gh` both have clean examples of this pattern.
```

---

## 3. Better error when `renowide.json` is missing

**Labels:** `good first issue`, `dx-errors`

**Body:**

```
When `renowide deploy` runs in a directory without a `renowide.json`,
the current error is:

    Error: ENOENT: no such file or directory, open 'renowide.json'

That's Node-level noise. A first-time user has no idea what to do.

**Acceptance criteria**

- Detect ENOENT on the config file specifically.
- Print:

    error: no renowide.json found in <cwd>

    To create one, run:
      renowide init

    Or if your config lives elsewhere:
      renowide deploy --config path/to/renowide.json

- Exit code stays 1.
- Existing test for this path must be updated.

**Out of scope**

- Don't auto-create a config file. That's opinionated.
- Don't search parent directories for `renowide.json`. Scope this PR
  to just the error message.

**Where to look**

- `src/commands/deploy.ts` line ~290 (the `fs.readFileSync` call).
- `src/commands/publish.ts` probably has the same bug — fix both or
  note it in the PR description.
```

---

## 4. FastAPI (Python) starter template

**Labels:** `good first issue`, `starter-template`, `help wanted`

**Body:**

```
We have a TypeScript/Express starter for Persona A link-out agents at
github.com/Renowide/example-agents/tree/main/01-webhook-link-out.
We need a FastAPI equivalent.

**Acceptance criteria**

- New folder `example-agents/04-fastapi-webhook/` in the
  Renowide/example-agents repo (NOT this repo — this issue tracks the
  starter request, the actual PR goes there).
- Minimum contents:
  - `README.md` — 2-minute quickstart, runs on `python -m uvicorn ...`
  - `renowide.json` — Persona A manifest pointing at the local endpoint
  - `main.py` — FastAPI app with:
    - `GET /` for the buyer-facing hire page
    - `POST /webhook` that verifies the `Renowide-Signature` HMAC and
      parses the `rw_hire` JWT
    - `POST /complete/{hire_id}` that calls Renowide's completion endpoint
  - `requirements.txt`
  - `.env.example` with `RENOWIDE_HANDOFF_SECRET=...`
- End-to-end tested locally against a real dry-run hire event.

**Out of scope**

- Don't add a frontend framework on top — FastAPI's default HTML is fine.
- Don't bundle an LLM client. Keep the starter dependency-free beyond
  FastAPI.

**Where to look**

- Signature verification reference in the TypeScript starter:
  example-agents/01-webhook-link-out/server/index.js (function
  `verifyRenowideSignature`)
- JWT verification uses HS256 with the handoff secret.
```

---

## 5. `renowide doctor` diagnostic command

**Labels:** `good first issue`, `debugging`, `enhancement`

**Body:**

```
Brew and Yarn both have `doctor` subcommands that check the environment
for common issues. We want `renowide doctor`.

**Acceptance criteria**

- New subcommand `renowide doctor` that checks and prints pass/fail for:
  - Node version ≥ 18
  - Network reachability to `https://renowide.com/api/v1/health`
  - `~/.renowide/credentials` permissions (must be 0600 if present)
  - Current dir has a valid `renowide.json` OR `renowide.yaml` (or warn)
  - `npm --version` ≥ 10 (needed for OIDC in CI)
- Exit 0 if all pass, exit 1 if any fail.
- Output is human-readable by default; `--json` supported.

**Out of scope**

- Don't auto-fix anything — just diagnose.
- Don't check for optional tools like `ngrok` unless they're strictly
  needed for a command.

**Where to look**

- `brew doctor` source for inspiration — https://github.com/Homebrew/brew/blob/master/Library/Homebrew/diagnostic.rb
```

---

## 6. Retry transient network errors in publish/deploy

**Labels:** `good first issue`, `enhancement`

**Body:**

```
`renowide publish` and `renowide deploy` currently fail immediately on
any network error, including transient 502s from CloudFlare during a
deploy. This is annoying.

**Acceptance criteria**

- Wrap all outbound API calls in a retry with exponential backoff:
  - 3 attempts max
  - 500ms / 2s / 6s between retries
  - ONLY retry on 5xx, 429, and network errors (ECONNRESET, ETIMEDOUT)
  - NEVER retry on 4xx auth errors
- Print a gray "retrying..." line between attempts so users see progress.
- Add a `--no-retry` flag to disable it for debugging.

**Out of scope**

- Don't add exponential jitter — fixed backoffs are fine at this scale.
- Don't retry file-system operations (that masks real bugs).

**Where to look**

- `src/utils/api.ts` is where `fetch()` calls happen today.
- There's a commented-out retry stub in that file from a previous
  attempt — feel free to reuse or rewrite.
```

---

## 7. Redact `rw_key_*` from error stack traces

**Labels:** `good first issue`, `security-hardening`

**Body:**

```
If the CLI crashes and the error includes a request body or Authorization
header, the `rw_key_*` token can leak into stderr and end up in terminal
scrollback or CI logs.

**Acceptance criteria**

- Add a global error handler in `src/index.ts` that redacts anything
  matching `/rw_key_[A-Za-z0-9_-]+/g` with `rw_key_***REDACTED***`
  before the error message is printed.
- Apply the same redaction in `--verbose` HTTP logging.
- Add a test that throws a fake error containing a token and asserts
  the stderr output does NOT contain the token.

**Out of scope**

- Don't try to redact other secrets (handoff_secret, etc.) in this PR.
  Scope to rw_key_* only.
- Don't redact in log files — CLI doesn't write logs.

**Where to look**

- `src/index.ts` has the top-level `.catch()`.
- Example of redaction pattern: https://github.com/winstonjs/winston/blob/master/docs/transports.md#customizing-log-format
```

---

## 8. Progress spinner for long-running publish/deploy

**Labels:** `good first issue`, `enhancement`

**Body:**

```
`renowide publish` can take 5-15 seconds because the server validates
the manifest, fetches assets, and registers the agent. Today we print a
single line and then silence. Users assume it hung.

**Acceptance criteria**

- Add a spinner (using `ora` or similar — we're already using `picocolors`,
  adding one lightweight dep is fine) that shows the current operation:
    - "Validating manifest..."
    - "Uploading assets..."
    - "Registering agent..."
- Server sends progress updates via newline-delimited JSON on the
  response stream; if not available yet, cycle through the three
  labels on a timer.
- Spinner is suppressed when `process.stdout` is not a TTY (i.e. in CI).
- Spinner is replaced by final success/failure line when done.

**Out of scope**

- Don't add spinners to every command. Only the long-running ones
  (`publish`, `deploy`).
- Don't change the server API in this PR. If NDJSON isn't supported
  yet, use the timer fallback — note it in the PR description.

**Where to look**

- `src/commands/publish.ts` — the `await postPublish()` line.
- `ora` npm package — https://www.npmjs.com/package/ora
```

---

## 9. Windows line-ending handling in YAML manifests

**Labels:** `good first issue`, `platform-compat`, `bug`

**Body:**

```
Report from a Windows user (Discord): `renowide publish` fails with
"Invalid YAML" on a valid `renowide.yaml` that was generated with
CRLF line endings.

Likely cause: our YAML parser is strict about line endings, or we
hand-parse a section that expects LF.

**Acceptance criteria**

- `renowide.yaml` with CRLF line endings parses identically to LF.
- Add a test that writes a fixture with CRLF endings and asserts
  `publish --dry-run` succeeds.
- If this is a bug in a dependency (js-yaml), file upstream and add a
  workaround here.

**Out of scope**

- Don't force LF on output files we write — just accept CRLF on input.
- Don't add a `--line-endings=auto` flag. Silent handling is fine.

**Where to look**

- `src/utils/manifest.ts` loads the YAML.
- Windows testers: `git config core.autocrlf true` reproduces the
  condition on macOS/Linux too.
```

---

## 10. Better zod error messages with "did you mean..."

**Labels:** `good first issue`, `schema`, `dx-errors`

**Body:**

```
When a user has a typo in `renowide.json`, e.g. `webhookUrl` instead of
`webhook_url`, zod currently prints:

    error: Unknown key 'webhookUrl'

That's accurate but doesn't help the user find the fix.

**Acceptance criteria**

- On any `unrecognized_keys` zod error, compute the Levenshtein
  distance between the bad key and all valid keys on the same object.
- If the closest valid key is within distance 3, suggest it:

    error: Unknown key 'webhookUrl'
           did you mean 'webhook_url'?

- If no close match, keep the original error.
- Add unit tests for three cases: close match, no match, multiple keys.

**Out of scope**

- Don't propagate this to value-level errors (e.g. typo'd enum variants)
  in this PR. That's a follow-up.
- Don't change any schema definitions. Pure error-formatting fix.

**Where to look**

- `src/utils/schema.ts` wraps `z.parse` with our pretty-printer.
- `fastest-levenshtein` is a tiny, dependency-free Levenshtein lib.
```

---

## Cleanup note

There's a probe issue #1 sitting open on the repo titled "probe" (or
"[deleted probe]") from my earlier token capability checks. Please
close it from the GitHub UI — the token I had couldn't close its own
test issues.
