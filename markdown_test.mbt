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

///|
test "unclosed duplicate and unsupported frontmatter never move files" {
  for
    content in [
      "---\ncategory: engineering\nbody without closing marker", "---\ncategory: engineering\ncategory: product\n---",
      "---\ncategory: other\n---\ncategory: engineering", "---\ncategory: engineering # comment\n---",
      "body\n---\ncategory: engineering\n---",
    ] {
    let source : @moonguard.Snapshot = {
      files: [{ path: "note.md", content, }],
      folders: [],
      blocked: [],
    }
    let p = @moonguard.organize(source)
    assert_true(p.issues.is_empty())
    assert_true(p.changes.is_empty())
  }
}

///|
test "closed quoted and BOM frontmatter is recognized without altering bytes" {
  for
    content in [
      "\u{FEFF}---\r\ncategory: engineering\r\n---\r\n你好😀", "---\ncategory: 'engineering'\n---\nbody",
      "---\ncategory: \"engineering\"\n---\nbody",
    ] {
    let source : @moonguard.Snapshot = {
      files: [{ path: "Note.md", content, }],
      folders: [],
      blocked: [],
    }
    let p = @moonguard.organize(source)
    assert_true(p.ready())
    assert_eq(p.result.files[0].path, "docs/engineering/note.md")
    assert_eq(p.result.files[0].content, content)
    assert_true(
      @moonguard.restore_plan(p, p.result).result.files == source.files,
    )
  }
}

///|
test "long fences do not close on shorter runs or trailing text" {
  let moved = { "A.md": "docs/a.md" }
  for marker in ["`", "~"] {
    let short = marker + marker + marker
    let long = short + marker
    let code = long +
      "md\r\n[a](A.md)\r\n" +
      short +
      "\r\n[a](A.md)\r\n" +
      long +
      " trailing\r\n[a](A.md)\r\n" +
      long +
      "  \r\n"
    assert_eq(
      @moonguard.rewrite_links(
        code + "[a](A.md)",
        "README.md",
        "README.md",
        moved,
      ),
      code + "[a](docs/a.md)",
    )
  }
}

///|
test "unclosed mixed and indented code blocks preserve examples" {
  let moved = { "A.md": "docs/a.md" }
  for
    content in [
      "```md\n[a](A.md)\n~~~\n[a](A.md)", "   ~~~~md\n[a](A.md)\n   ~~~\n[a](A.md)",
      "    [a](A.md)\n\t[a](A.md)",
    ] {
    assert_eq(
      @moonguard.rewrite_links(content, "README.md", "README.md", moved),
      content,
    )
  }
  assert_eq(
    @moonguard.rewrite_links(
      "   ```md\n[a](A.md)\n  ````\n[a](A.md)", "README.md", "README.md", moved,
    ),
    "   ```md\n[a](A.md)\n  ````\n[a](docs/a.md)",
  )
}
