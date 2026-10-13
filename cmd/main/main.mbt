///|
/// Entry point for the CLI or runnable program in this template.
/// Keep main focused; move logic into the library package.
/// Run with `moon run cmd/main` from the project root.
fn main {
  let snapshot : @guard.Snapshot = {
    files: [{ path: "draft.md", content: "before", }],
    folders: [],
    blocked: [],
  }
  let planned = @guard.plan(snapshot, [
    { kind: "write", path: "draft.md", to: None, content: Some("after"), },
  ])
  println(planned.to_json().stringify(indent=2))
}
