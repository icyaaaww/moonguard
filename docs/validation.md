# Validation record

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
- Mooncakes publication and third-party integration remain pending.
