///|
/// A UTF-8 text file. Paths are portable, workspace-relative paths.
pub(all) struct File {
  path : String
  content : String
} derive(Eq, Debug, ToJson, FromJson)

///|
/// Opaque files and symlinks appear in blocked; directories in folders.
pub(all) struct Snapshot {
  files : Array[File]
  folders : Array[String]
  blocked : Array[String]
} derive(Eq, Debug, ToJson, FromJson)

///|
/// Supported kinds: create, write, move and trash (recoverable removal).
pub(all) struct Operation {
  kind : String
  path : String
  to : String?
  content : String?
} derive(Eq, Debug)

///|
pub(all) struct Issue {
  code : String
  path : String
  message : String
} derive(Eq, Debug, ToJson, FromJson)

///|
/// A net path change; None means that the file is absent.
pub(all) struct Change {
  path : String
  before : String?
  after : String?
} derive(Eq, Debug)

///|
/// An immutable-by-convention plan. Hosts must recompile untrusted plans.
pub(all) struct Plan {
  schema : Int32
  title : String
  baseline : Snapshot
  result : Snapshot
  operations : Array[Operation]
  changes : Array[Change]
  issues : Array[Issue]
} derive(Eq, Debug, ToJson, FromJson)

///|
pub fn empty_snapshot() -> Snapshot {
  { files: [], folders: [], blocked: [], }
}

///|
pub fn Plan::ready(self : Plan) -> Bool {
  self.issues.is_empty() && !self.changes.is_empty()
}

///|
fn file_map(snapshot : Snapshot) -> Map[String, String] {
  let result = Map([])
  for file in snapshot.files {
    result[file.path] = file.content
  }
  result
}

///|
fn issue(code : String, path : String, message : String) -> Issue {
  { code, path, message, }
}

///|
fn copy_snapshot(snapshot : Snapshot) -> Snapshot {
  {
    files: snapshot.files.copy(),
    folders: snapshot.folders.copy(),
    blocked: snapshot.blocked.copy(),
  }
}
