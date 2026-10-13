///|
fn snapshot() -> @moonguard.Snapshot {
  { files: [{ path: "a.md", content: "original", }], folders: [], blocked: [], }
}

///|
fn write_plan() -> @moonguard.Plan {
  @moonguard.plan(snapshot(), [
    { kind: "write", path: "a.md", to: None, content: Some("updated"), },
  ])
}

///|
test "preview is pure and commit checks accept the original" {
  let source = snapshot()
  let p = @moonguard.plan(source, [
    { kind: "write", path: "a.md", to: None, content: Some("updated"), },
  ])
  assert_true(p.ready())
  assert_eq(source.files[0].content, "original")
  assert_eq(p.result.files[0].content, "updated")
  assert_eq(@moonguard.check_apply(p, source).length(), 0)
}

///|
test "create and move preserve content" {
  let p = @moonguard.plan(snapshot(), [
    { kind: "create", path: "b.txt", to: None, content: Some("new"), },
    { kind: "move", path: "a.md", to: Some("docs/a.md"), content: None, },
  ])
  assert_true(p.ready())
  assert_eq(p.result.files.length(), 2)
  assert_eq(p.result.files[1].path, "docs/a.md")
  assert_eq(p.result.files[1].content, "original")
}

///|
test "one bad operation invalidates the entire plan" {
  let source = snapshot()
  let p = @moonguard.plan(source, [
    { kind: "write", path: "a.md", to: None, content: Some("updated"), },
    { kind: "move", path: "missing.md", to: Some("b.md"), content: None, },
  ])
  assert_false(p.ready())
  assert_eq(p.changes.length(), 0)
  assert_true(p.result == source)
}

///|
test "portable paths reject escape hidden and reserved names" {
  for
    path in [
      "../a.md", "/a.md", "C:/a.md", "a\\b.md", "a//b.md", "./a.md", ".git/config.md",
      "NUL.txt", "com1.md", "folder./a.md", "file .md/../b.md", "a.md:", "a\n.md",
    ] {
    assert_false(@moonguard.valid_path(path))
  }
  assert_true(@moonguard.valid_path("资料/设计😀.md"))
}

///|
test "create collision is case insensitive" {
  let p = @moonguard.plan(snapshot(), [
    { kind: "create", path: "A.md", to: None, content: Some("bad"), },
  ])
  assert_eq(p.issues[0].code, "collision")
}

///|
test "move cannot overwrite existing destination" {
  let source : @moonguard.Snapshot = {
    files: [{ path: "a.md", content: "a", }, { path: "b.md", content: "b", }],
    folders: [],
    blocked: [],
  }
  let p = @moonguard.plan(source, [
    { kind: "move", path: "a.md", to: Some("b.md"), content: None, },
  ])
  assert_eq(p.issues[0].code, "collision")
  assert_true(p.result == source)
}

///|
test "file directory prefix conflicts are blocked" {
  let p = @moonguard.plan(snapshot(), [
    { kind: "create", path: "a.md/child.txt", to: None, content: Some("bad"), },
  ])
  assert_false(p.ready())
}

///|
test "opaque and symlink paths cannot be traversed" {
  let source : @moonguard.Snapshot = {
    files: [],
    folders: [],
    blocked: ["outside"],
  }
  let p = @moonguard.plan(source, [
    {
      kind: "create",
      path: "outside/secret.txt",
      to: None,
      content: Some("bad"),
    },
  ])
  assert_eq(p.issues[0].code, "collision")
}

///|
test "directory itself cannot be overwritten" {
  let source : @moonguard.Snapshot = {
    files: [],
    folders: ["notes.md"],
    blocked: [],
  }
  let p = @moonguard.plan(source, [
    { kind: "create", path: "notes.md", to: None, content: Some("bad"), },
  ])
  assert_eq(p.issues[0].code, "collision")
}

///|
test "stale content blocks apply" {
  let current : @moonguard.Snapshot = {
    ..snapshot(),
    files: [{ path: "a.md", content: "human edit", }],
  }
  let issues = @moonguard.check_apply(write_plan(), current)
  assert_eq(issues[0].code, "stale")
  assert_eq(issues[0].path, "a.md")
}

///|
test "added and removed files invalidate read snapshot" {
  let current : @moonguard.Snapshot = {
    ..snapshot(),
    files: [
      { path: "a.md", content: "original", },
      { path: "new.txt", content: "new", },
    ],
  }
  assert_eq(@moonguard.check_apply(write_plan(), current)[0].code, "stale")
  assert_eq(
    @moonguard.check_apply(write_plan(), @moonguard.empty_snapshot())[0].code,
    "stale",
  )
}

///|
test "directory changes invalidate preview" {
  let current : @moonguard.Snapshot = { ..snapshot(), folders: ["new-dir"], }
  assert_eq(
    @moonguard.check_apply(write_plan(), current)[0].code,
    "stale_structure",
  )
}

///|
test "tampered plan is rejected" {
  let p = write_plan()
  let tampered : @moonguard.Plan = { ..p, changes: [], }
  assert_eq(
    @moonguard.check_apply(tampered, snapshot())[0].code,
    "invalid_plan",
  )
}

///|
test "restore returns original file bytes" {
  let p = write_plan()
  let undo = @moonguard.restore_plan(p, p.result)
  assert_true(undo.ready())
  assert_true(undo.result.files == p.baseline.files)
}

///|
test "restore preserves unrelated new files" {
  let p = write_plan()
  let current : @moonguard.Snapshot = {
    ..p.result,
    files: [
      { path: "a.md", content: "updated", },
      { path: "user.txt", content: "keep", },
    ],
  }
  let undo = @moonguard.restore_plan(p, current)
  assert_true(undo.ready())
  assert_eq(undo.result.files.length(), 2)
  assert_eq(undo.result.files[1].content, "keep")
}

///|
test "restore refuses to overwrite human changes" {
  let p = write_plan()
  let current : @moonguard.Snapshot = {
    ..p.result,
    files: [{ path: "a.md", content: "human edit", }],
  }
  let undo = @moonguard.restore_plan(p, current)
  assert_false(undo.ready())
  assert_eq(undo.issues[0].code, "restore_conflict")
  assert_eq(undo.result.files[0].content, "human edit")
}

///|
test "trash can be recovered" {
  let p = @moonguard.plan(snapshot(), [
    { kind: "trash", path: "a.md", to: None, content: None, },
  ])
  assert_true(p.result.files.is_empty())
  let undo = @moonguard.restore_plan(p, p.result)
  assert_eq(undo.result.files[0].content, "original")
}

///|
test "recovery accepts a partially applied state" {
  let p = @moonguard.plan(snapshot(), [
    { kind: "write", path: "a.md", to: None, content: Some("updated"), },
    { kind: "create", path: "b.txt", to: None, content: Some("new"), },
  ])
  let partial : @moonguard.Snapshot = {
    ..snapshot(),
    files: [{ path: "a.md", content: "updated", }],
  }
  let undo = @moonguard.restore_plan(p, partial, recovery=true)
  assert_true(undo.ready())
  assert_true(undo.result.files == snapshot().files)
}

///|
test "recovery never replaces a third value" {
  let p = write_plan()
  let current : @moonguard.Snapshot = {
    ..snapshot(),
    files: [{ path: "a.md", content: "third", }],
  }
  assert_eq(
    @moonguard.restore_plan(p, current, recovery=true).issues[0].code,
    "restore_conflict",
  )
}

///|
test "recovery is idempotent" {
  let p = write_plan()
  let undo = @moonguard.restore_plan(p, p.baseline, recovery=true)
  assert_true(undo.issues.is_empty())
  assert_true(undo.changes.is_empty())
}

///|
test "no-op plan cannot be applied" {
  let p = @moonguard.plan(snapshot(), [
    { kind: "write", path: "a.md", to: None, content: Some("original"), },
  ])
  assert_false(p.ready())
  assert_eq(@moonguard.check_apply(p, snapshot())[0].code, "not_ready")
}

///|
test "unknown operations and missing payloads fail" {
  let operations : Array[@moonguard.Operation] = [
    { kind: "shell", path: "a.md", to: None, content: None, },
    { kind: "write", path: "a.md", to: None, content: None, },
    { kind: "move", path: "a.md", to: None, content: None, },
    { kind: "trash", path: "a.md", to: None, content: Some("extra"), },
  ]
  for op in operations {
    assert_false(@moonguard.plan(snapshot(), [op]).ready())
  }
}

///|
test "empty content is distinct from absent file" {
  let p = @moonguard.plan(@moonguard.empty_snapshot(), [
    { kind: "create", path: "empty.txt", to: None, content: Some(""), },
  ])
  assert_true(p.ready())
  assert_true(p.changes[0].before == None)
  assert_true(p.changes[0].after == Some(""))
}

///|
test "snapshot array mutation does not mutate the plan" {
  let source = snapshot()
  let p = @moonguard.plan(source, [
    { kind: "write", path: "a.md", to: None, content: Some("updated"), },
  ])
  source.files[0] = { path: "changed.md", content: "bad", }
  assert_eq(p.baseline.files[0].path, "a.md")
}

///|
test "duplicate input paths are rejected" {
  let source : @moonguard.Snapshot = {
    files: [{ path: "a.md", content: "a", }, { path: "A.md", content: "b", }],
    folders: [],
    blocked: [],
  }
  assert_eq(@moonguard.validate_snapshot(source)[0].code, "collision")
}
