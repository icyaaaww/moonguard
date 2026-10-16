# MoonGuard

Preview, validate and recover bounded file-operation plans with a pure MoonBit core.
The core performs no I/O. Hosts supply accurate snapshots, check filesystem types,
serialize writers, persist a journal before writing, and apply only validated changes.

Core module: `icyaaaww/moonguard@0.1.1`. The local application remains version
`1.1.0`; library and application versions are independent. The current publishing
tool requires a `0.x.y` library version.

## Install

In a MoonBit project:

```sh
moon add icyaaaww/moonguard
```

Import the root package in `moon.pkg`:

```moonbit nocheck
///|
import {
  "icyaaaww/moonguard",
}
```

The following API example is checked by the library tests:

```mbt check
///|
test {
  let before : @moonguard.Snapshot = {
    files: [{ path: "note.md", content: "draft\n", }],
    folders: [],
    blocked: [],
  }
  let planned = @moonguard.plan(before, [
    { kind: "write", path: "note.md", to: None, content: Some("reviewed\n"), },
  ])
  assert_true(planned.ready())
  assert_true(@moonguard.check_apply(planned, before).is_empty())
  let recovery = @moonguard.restore_plan(planned, planned.result)
  assert_true(recovery.ready())
  assert_eq(recovery.result.files, before.files)
}
```

`plan(snapshot, operations)` computes sorted net changes. Invalid operations invalidate
the entire plan. `check_apply(plan, current)` rebuilds the plan and rejects stale input.
`restore_plan(plan, current)` rejects subsequent edits to affected paths; unrelated new
files survive. Use `recovery=true` only for an interrupted commit/restore, where affected
paths may have either their before or after contents.

`organize(snapshot)` is a deterministic Markdown demonstration planner. The local Node
adapter and browser demo are available in the GitHub repository. No LLM is bundled.
This package is not an operating-system sandbox or a general transaction engine.

## Package contents and verification

The registry archive contains the reusable core, JSON bridge, tests, a runnable
`cmd/main` example, architecture notes and Apache-2.0 license. The Node filesystem
executor, browser UI and MCP adapter are separate hosts in the GitHub repository;
installing the library does not install or run them.

```sh
moon check --target all
moon test --target js
moon test --target wasm-gc
moon run cmd/main --target js
```

See `docs/architecture.md` for limits and the filesystem obligations of a host.
Do not treat a ready plan as authorization to mutate files without rechecking the
current snapshot and protecting against concurrent writers and unsafe file types.
