# Changelog

## 1.1.0 / Mooncakes core 0.1.1 — 2026-10-16

- Added recovery previews with per-file content inspection, cancellation, conflict reporting and confirmation bound to the reviewed snapshot.
- Added CLI `check`, `restore-preview` and safe UTF-8 `preview --output`; reject malformed operation input and report meaningful exit codes.
- Fixed document classification for unclosed/duplicate frontmatter, with BOM, CRLF and simple quoted-category support.
- Preserve examples inside longer Markdown fences and indented code.
- Reject inconsistent path-component casing, case-only replacement plans and Windows superscript device names before writing files.
- Public MoonBit API and journal schema remain unchanged. Versioned installation and package checks are recorded in `docs/mooncakes-release.md`.

## Mooncakes core 0.1.0 — 2026-10-15

- Published `icyaaaww/moonguard@0.1.0` under the author's registered namespace; application version remains 1.0.0.
- Updated internal imports and regenerated interfaces/JavaScript bridge for the namespace change.
- Added an explicit package allowlist and CI packaging check; registry artifacts exclude filesystem hosts, npm dependencies, recovery journals and private data.
- Extracted archive passes all-target checks and 35 tests on each of JS/Wasm GC; rebuilt host/MCP/DOM suites pass 26/3/1 tests.
- A fresh consumer installs from the registry and passes four tests on each target for plan/restore, stale snapshots, restore conflicts and path traversal; runnable consumer example succeeds.
- Publication evidence and archive integrity checks are recorded in docs/mooncakes-release.md. Real-user adoption remains unverified.

## 1.0.0 — 2026-10-15

- Public local distribution with Windows and shell launchers, automatic ports and startup help.
- Open a document directory from the workbench; switching invalidates old plans and preserves journals.
- Compose file operations with forms and inspect excluded workspace items.
- Keep MCP workspace scope fixed and block workspace switching until interrupted work is recovered.
- Add user guide, release notes and issue reporting template; keep study participation optional.
- Preserve original study record versions when importing historical records.
- New UI has DOM integration coverage; native browser visual acceptance and real-user validation remain pending.

## 0.2.0 — 2026-10-14

- Added optional official-SDK MCP stdio adapter and a separate runnable consumer.
- Connected external proposals to local review, execution/decline and status queries.
- Added four guided document-maintainer tasks, opt-in anonymous records and local summary.
- Excluded practice records from participant summaries; kept self-report and action evidence separate.
- Added protocol and study regression tests and CI coverage. Actual participant collection is pending.

## 0.1.0 — 2026-10-13

- Added pure MoonBit file planning, stale checks and conflict-aware restore planning.
- Added bounded local Node filesystem adapter, write-ahead recovery journals and CLI.
- Added browser review workbench, JSON import and reproducible demonstration scenarios.
- Added core, filesystem and HTTP tests, plus build and CI configuration.
- Initial preview only; package namespace and public distribution are pending.
