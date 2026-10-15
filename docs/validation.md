# Validation record

## 1.0 public distribution — 2026-10-15

Local Windows checks passed: 35 MoonBit tests on each of JS and Wasm GC, all-target
checking, `moon info`, `moon fmt`, rebuild, 26 host tests and 3 MCP process tests.
The new host cases exercise directory switching, invalid paths, invalidated old
plan IDs, preserved journals, pending recovery, fixed MCP scope and launcher parsing.

One additional jsdom integration test loads the real page and application module,
opens a temporary directory through the form, composes all four operation types,
previews, applies and restores through the HTTP server, and checks exact disk bytes.
It also checks excluded files and served assets. jsdom is an optional test-only
dependency with its own lockfile; normal use still requires no npm dependencies.
Run `npm ci --prefix integrations/ui --ignore-scripts` then `npm run test:ui`.
The test runtime uses Node 24 (jsdom itself needs a recent Node 22/24 patch version).

Native browser visual acceptance of the new 1.0 screens was not completed: automatic
approval review blocked the background browser launch command without a more specific
reason. DOM testing does not verify layout, focus behavior or OS browser launch.
macOS execution and real-user collection remain unverified. Existing 0.2 browser
records below do not establish visual acceptance of the new screens.

Release packages are made from the Git commit with `git archive`, excluding ignored
workspaces, personal study records and node_modules, and have a SHA-256 checksum.
The package includes the compiled core; Node.js 22+ is an external prerequisite.

## 0.2 additions — 2026-10-14

Local Windows checks: 22 root Node tests and 3 real-process official MCP SDK integration
tests pass. The protocol tests exercise initialize/listTools/callTool, read-only inventory,
scoped file reads, proposals without writes, HTTP approval, restore status, decline,
superseded IDs, stale checks and invalid input. These are protocol tests, not an actual
OpenSeek or LLM session.

The optional adapter pins `@modelcontextprotocol/sdk 1.32.1` and `zod 4.6.7`, with an
independent npm lockfile. Clean install from the official npm registry succeeded.
`npm audit --omit=dev --registry=https://registry.npmjs.org` reported 0 vulnerabilities
on this date (a point-in-time dependency report, not a product security guarantee).

The browser completed all four study tasks in **practice** mode and exported a JSON
record. The local report correctly returned `participantRecords: 0, practiceExcluded: 1`.
Task events were checked in order, with workspace resets breaking evidence chains.
There are no actual participants or real-user ratings in this validation.

The browser also declined a proposal from the separate SDK example client. The UI
reported that files were unchanged, and the client observed `state: declined`.
MoonBit checks, interface generation, formatting, build, and the 35-test suite on
each of the JS and Wasm GC targets passed again for 0.2.

The 0.1 baseline below remains the historical record; new CI runs test both platforms
including the MCP adapter. User-study recruitment and OpenSeek client execution remain
unperformed.

Executed locally on Windows, 2026-10-13. These are measured results, not projected CI
results. Node `v24.19.0`; moon `0.1.20261012 (748b63c 2026-10-12)`; compiler/core
`v0.10.15+943464bfa`.

| Check | Result |
| --- | --- |
| `moon check --target all` | Passed |
| `moon info`, `moon fmt` | Completed; public interface generated |
| `moon test --target js` | 35 passed, 0 failed |
| `moon test --target wasm-gc` | 35 passed, 0 failed |
| `npm run build` | Completed; generated JS copied to `web/core.mjs` |
| `npm test` | 17 passed, 0 failed; real filesystem + HTTP |
| Browser walkthrough | Preview, stale-plan rejection, apply, restore, fault recovery, history, JSON import |
| Responsive check | 390 × 844 viewport; no document-level horizontal overflow; desktop viewport restored |
| Browser console | No error or warning entries at final check |

The MoonBit total includes the executable README example. It is the same test suite on
two targets, not 70 distinct tests. The host tests include one case iterating through
all interruption positions of the sample transaction; it remains one reported test.

Build-only dependency `moonbitlang/async 0.22.4` reports a duplicate internal c_buffer
import warning under this toolchain; compilation and execution succeed. The root core
package itself passes without that dependency. Script dependencies and compiler are
not yet fully pinned.

## Regression coverage

Pure core cases cover path traversal, collisions, stale snapshots, unsupported
operations, invalid plans, restore conflict decisions, link adjustment and JSON codecs.
Real-file tests cover exact text round trips (BOM, CRLF, Unicode), unrelated file
preservation, symlink and hardlink rejection, overlapping writes, and injected failures.
HTTP tests cover token, Origin, Host, stale plan identifiers, malformed input, recovery,
and real-workspace restrictions on demo endpoints.

Imported lone surrogate strings are rejected by the MoonBit JSON parser before
planning; NUL text is rejected by the core content validator. This prevents writing
contents that cannot be round-tripped through the UTF-8 host adapter.

Browser checks use synthetic, isolated local files only. Fault injection throws an
exception at a controlled point; it does not emulate sudden power loss. No production
user files, real API keys or model-provider connections were involved.

## Not yet established

- Remote CI results are recorded in the repository's GitHub Actions runs. The local
  results above are independent of the remote run; Linux core/host checks and Windows
  host checks are configured.
- Native backend execution, macOS, network filesystems and adversarial filesystem races
  have not been tested. All-target type checking is not native runtime testing.
- No performance benchmark, coverage percentage, real-user outcome or comparative
  competitor result is claimed.
- Mooncakes core `icyaaaww/moonguard@0.1.0` has been published and installed in a fresh consumer project; see `mooncakes-release.md`. Actual OpenSeek/LLM client sessions remain pending;
  the optional official-SDK MCP adapter is covered by the 0.2 checks above.
