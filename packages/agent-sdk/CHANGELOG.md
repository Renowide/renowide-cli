# Changelog

## 0.4.0 — 2026-04-20

### Changed
- **Moved into the `renowide-cli` monorepo.** The canonical source now
  lives at `github.com/Renowide/renowide-cli` under
  `packages/agent-sdk/`. The `repository.url` in `package.json` and
  `homepage` have been updated.
- Package is now ESM-only (`"type": "module"`). If you were importing
  from a CommonJS project, run via Node ≥20 and either use dynamic
  `import()` or convert your project to ESM.
- `package.json` now declares explicit `exports` entries so the three
  public surfaces are split:
  - `@renowide/agent-sdk` — runtime (tools, MCP server, errors)
  - `@renowide/agent-sdk/canvas-kit` — Persona B hosted blocks (unchanged)
  - `@renowide/agent-sdk/canvas-kit-v2` — **new**, re-exports
    `@renowide/types` for convenience.

### Added
- `./canvas-kit-v2` subpath re-export of Canvas Kit v2 types
  (`CanvasResponse`, `Block`, `Expression`, signing helpers, …) from
  `@renowide/types`. Lets agent authors pick up the dynamic Path C
  schemas without installing a second package.
- Peer-level compatibility note in the docstrings of `canvas-kit.ts`
  making clear that those blocks are **Persona B hosted canvas only**,
  not the Path C protocol.

### Unchanged
- All Persona B block types in `canvas-kit.ts` (`BlockHeader`,
  `BlockInfoCallout`, `BlockCTA`, …).
- MCP server behaviour, tool definition shape, audit logger, error
  classes. No runtime breaking changes.

## 0.3.0 — previous

Released from `github.com/Renowide/renowide-agent-sdk` (now redirects
here).
