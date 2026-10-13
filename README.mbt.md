# MoonGuard

Preview, validate and recover bounded file-operation plans with a pure MoonBit core.
The core performs no I/O. Hosts supply accurate snapshots, check filesystem types,
serialize writers, persist a journal before writing, and apply only validated changes.

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
adapter and browser demo are documented in README.md. No LLM is bundled. This package
is an early preview, not an operating-system sandbox or a general transaction engine.

The namespace is a local placeholder pending registration and publication.
