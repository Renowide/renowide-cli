# Changelog

## 0.4.0 — 2026-04-20

### Changed
- **Moved into the `renowide-cli` monorepo.** Canonical source now at
  `github.com/Renowide/renowide-cli` under
  `python/renowide-agent-sdk/`.
- Build backend switched from `setuptools` to `hatchling`.
- Package layout moved to `src/renowide_agent_sdk/` (no API change for
  consumers — `import renowide_agent_sdk` works as before).

### Added
- Optional extra `renowide-agent-sdk[canvas-v2]` that pulls in
  `renowide-canvas` for the Path C protocol (dynamic JSON canvases with
  HMAC signing). The existing `canvas_kit` module stays for Persona B.
- Clearer module docstring in `canvas_kit.py` noting that those
  TypedDicts are **Persona B only**; Path C lives in `renowide_canvas`.

### Unchanged
- All existing Persona B TypedDicts, `@define_agent` decorator, MCP
  FastAPI router, error classes, audit logger. No runtime breaking
  changes.

## 0.2.0 — previous

Last release from `github.com/Renowide/renowide-agent-sdk` (now
redirects here). A `0.3.0` existed only in-repo and was never
published to PyPI; `0.4.0` is the first release from the new location.
