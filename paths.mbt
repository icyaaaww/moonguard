///|
/// Reject ambiguous paths rather than silently normalizing a requested action.
///
/// ```mbt check
/// test {
///   assert_true(@moonguard.valid_path("notes/设计.md"))
///   assert_false(@moonguard.valid_path("../private.txt"))
/// }
/// ```
pub fn valid_path(path : String) -> Bool {
  if path.is_empty() || path.length() > 240 || !valid_text(path) {
    return false
  }
  for c in path {
    if c < ' ' ||
      c == '\u{007f}' ||
      c == '\\' ||
      c == ':' ||
      c == '<' ||
      c == '>' ||
      c == '"' ||
      c == '|' ||
      c == '?' ||
      c == '*' {
      return false
    }
  }
  for part in path.split("/") {
    let part = part.to_owned()
    if part.is_empty() ||
      part.has_prefix(".") ||
      part.has_suffix(".") ||
      part.has_suffix(" ") {
      return false
    }
    let base = part.split(".").to_array()[0].to_owned().to_lower()
    if base == "con" ||
      base == "prn" ||
      base == "aux" ||
      base == "nul" ||
      base == "conin$" ||
      base == "conout$" {
      return false
    }
    if base.length() == 4 && (base.has_prefix("com") || base.has_prefix("lpt")) {
      if base[3] >= '1' && base[3] <= '9' {
        return false
      }
    }
  }
  true
}

///|
fn text_path(path : String) -> Bool {
  let lower = path.to_lower()
  lower.has_suffix(".md") ||
  lower.has_suffix(".txt") ||
  lower.has_suffix(".json") ||
  lower.has_suffix(".csv")
}

///|
// JSON may carry lone UTF-16 surrogates which cannot round-trip through UTF-8.
fn valid_text(content : String) -> Bool {
  let mut i = 0
  while i < content.length() {
    let unit = content[i].to_int()
    if unit == 0 || (unit >= 0xDC00 && unit <= 0xDFFF) {
      return false
    }
    if unit >= 0xD800 && unit <= 0xDBFF {
      if i + 1 >= content.length() {
        return false
      }
      let next = content[i + 1].to_int()
      if next < 0xDC00 || next > 0xDFFF {
        return false
      }
      i += 2
    } else {
      i += 1
    }
  }
  true
}

///|
fn parent_paths(path : String) -> Array[String] {
  let parts = path.split("/").map(v => v.to_owned()).to_array()
  let paths = []
  for i in 1..<parts.length() {
    paths.push(parts[:i].to_owned().join("/"))
  }
  paths
}

///|
fn path_collision(
  path : String,
  files : Map[String, String],
  snapshot : Snapshot,
) -> Bool {
  let lower = path.to_lower()
  for other, _ in files {
    let other = other.to_lower()
    if lower == other ||
      lower.has_prefix(other + "/") ||
      other.has_prefix(lower + "/") {
      return true
    }
  }
  for other in snapshot.blocked {
    let other = other.to_lower()
    if lower == other ||
      lower.has_prefix(other + "/") ||
      other.has_prefix(lower + "/") {
      return true
    }
  }
  for dir in snapshot.folders {
    if lower == dir.to_lower() || dir.to_lower().has_prefix(lower + "/") {
      return true
    }
  }
  false
}

///|
/// Full snapshot validation is shared by all frontends.
pub fn validate_snapshot(snapshot : Snapshot) -> Array[Issue] {
  let issues = []
  let seen : Map[String, String] = Map([])
  if snapshot.files.length() > 200 ||
    snapshot.folders.length() > 500 ||
    snapshot.blocked.length() > 500 {
    issues.push(issue("limit", "", "工作区超过首版容量限制"))
  }
  let mut total = 0
  for file in snapshot.files {
    total += file.content.length()
    if !valid_text(file.content) {
      issues.push(
        issue(
          "invalid_text",
          file.path,
          "内容包含 NUL 或不能编码为 UTF-8 的字符",
        ),
      )
    }
    if !valid_path(file.path) || !text_path(file.path) {
      issues.push(
        issue(
          "invalid_path",
          file.path,
          "仅支持工作区内的非隐藏文本文件",
        ),
      )
    }
    if file.content.length() > 262144 {
      issues.push(
        issue("limit", file.path, "单文件内容超过 256K 字符"),
      )
    }
    if seen.contains(file.path.to_lower()) {
      issues.push(
        issue("collision", file.path, "存在重复或大小写冲突的路径"),
      )
    }
    seen[file.path.to_lower()] = file.path
  }
  if total > 2097152 {
    issues.push(issue("limit", "", "文本总量超过 2M 字符"))
  }
  for file in snapshot.files {
    for parent in parent_paths(file.path) {
      if seen.contains(parent.to_lower()) {
        issues.push(
          issue("collision", file.path, "父级路径已被文件占用"),
        )
      }
    }
    for other in snapshot.blocked {
      if file.path.to_lower() == other.to_lower() ||
        file.path.to_lower().has_prefix(other.to_lower() + "/") {
        issues.push(
          issue(
            "blocked",
            file.path,
            "路径与不可操作的文件或链接冲突",
          ),
        )
      }
    }
    for dir in snapshot.folders {
      if file.path.to_lower() == dir.to_lower() ||
        dir.to_lower().has_prefix(file.path.to_lower() + "/") {
        issues.push(
          issue("collision", file.path, "文件路径与目录冲突"),
        )
      }
    }
  }
  issues
}
