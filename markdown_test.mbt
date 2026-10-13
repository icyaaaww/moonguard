///|
test "organizer moves documents and updates incoming and outgoing links" {
  let source : @moonguard.Snapshot = {
    files: [
      { path: "README.md", content: "[design](Design.md#overview)", },
      {
        path: "Design.md",
        content: "---\ncategory: engineering\n---\n[home](README.md)",
      },
    ],
    folders: [],
    blocked: [],
  }
  let p = @moonguard.organize(source)
  assert_true(p.ready())
  assert_eq(
    p.result.files[0].content,
    "[design](docs/engineering/design.md#overview)",
  )
  assert_eq(
    p.result.files[1].content,
    "---\ncategory: engineering\n---\n[home](../../README.md)",
  )
  assert_true(
    @moonguard.differences(@moonguard.restore_plan(p, p.result).result, source).is_empty(),
  )
}

///|
test "code examples external urls and anchors stay intact" {
  let moved = { "A.md": "docs/a.md" }
  let source = "`[a](A.md)`\n```md\n[a](A.md)\n```\n[a](https://example.com)\n[a](#part)\n😀 [a](A.md)"
  assert_eq(
    @moonguard.rewrite_links(source, "README.md", "README.md", moved),
    "`[a](A.md)`\n```md\n[a](A.md)\n```\n[a](https://example.com)\n[a](#part)\n😀 [a](docs/a.md)",
  )
}

///|
test "relative link resolution works across directories" {
  let moved = { "a.md": "docs/a.md" }
  assert_eq(
    @moonguard.rewrite_links(
      "[a](../a.md)", "notes/index.md", "notes/index.md", moved,
    ),
    "[a](../docs/a.md)",
  )
}

///|
test "unsupported metadata does not trigger a move" {
  let source : @moonguard.Snapshot = {
    files: [{ path: "a.md", content: "---\ncategory: other\n---", }],
    folders: [],
    blocked: [],
  }
  assert_false(@moonguard.organize(source).ready())
}

///|
test "organizer collision fails without modifying source" {
  let source : @moonguard.Snapshot = {
    files: [
      { path: "A.md", content: "---\ncategory: product\n---", },
      { path: "docs/product/a.md", content: "existing", },
    ],
    folders: ["docs", "docs/product"],
    blocked: [],
  }
  let p = @moonguard.organize(source)
  assert_false(p.ready())
  assert_true(p.result == source)
}
