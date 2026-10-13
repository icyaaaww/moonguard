///|
test "wire format uses string or null rather than tagged options" {
  let json : Json = {
    "kind": "create",
    "path": "new.md",
    "to": null,
    "content": "",
  }
  let operation : @moonguard.Operation = @json.from_json(json)
  assert_true(operation.content == Some(""))
  assert_true(operation.to_json() == json)
  let change : @moonguard.Change = {
    path: "new.md",
    before: None,
    after: Some("hello"),
  }
  assert_true(
    change.to_json() is { "before": Null, "after": String("hello"), .. },
  )
}

///|
test "reject NUL contents before a host can write them" {
  let p = @moonguard.plan(@moonguard.empty_snapshot(), [
    { kind: "create", path: "bad.txt", to: None, content: Some("a\u0000b"), },
  ])
  assert_false(p.ready())
  assert_true(p.issues.any(i => i.code == "invalid_text"))
}
