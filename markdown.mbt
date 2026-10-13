///|
fn category(content : String) -> String? {
  if !content.has_prefix("---\n") && !content.has_prefix("---\r\n") {
    return None
  }
  let mut first = true
  for line in content.split("\n") {
    let line = line.to_owned().trim().to_owned()
    if first {
      first = false
      continue
    }
    if line == "---" {
      break
    }
    if line.has_prefix("category:") {
      let value = line[9:].to_owned().trim().to_owned()
      if value == "engineering" || value == "product" || value == "research" {
        return Some(value)
      }
    }
  }
  None
}

///|
fn resolve_link(from : String, target : String) -> String? {
  if target.is_empty() ||
    target.has_prefix("/") ||
    target.contains(":") ||
    target.contains("%") ||
    target.contains("?") ||
    target.contains("\\") {
    return None
  }
  let parts = from.split("/").map(x => x.to_owned()).to_array()
  ignore(parts.pop())
  for part in target.split("/") {
    match part.to_owned() {
      "" | "." => ()
      ".." => if parts.is_empty() { return None } else { ignore(parts.pop()) }
      value => parts.push(value)
    }
  }
  Some(parts.join("/"))
}

///|
fn relative_link(from : String, target : String) -> String {
  let a = from.split("/").map(x => x.to_owned()).to_array()
  ignore(a.pop())
  let b = target.split("/").map(x => x.to_owned()).to_array()
  let mut same = 0
  while same < a.length() && same < b.length() && a[same] == b[same] {
    same += 1
  }
  let parts = []
  for _ in same..<a.length() {
    parts.push("..")
  }
  for i in same..<b.length() {
    parts.push(b[i])
  }
  parts.join("/")
}

///|
/// Rewrite simple inline relative Markdown links, including fragments.
/// Fenced code and inline code are preserved. This is a documented subset,
/// not a CommonMark parser; encoded URLs and reference links are unchanged.
pub fn rewrite_links(
  content : String,
  old_path : String,
  new_path : String,
  moved : Map[String, String],
) -> String {
  let output = []
  let mut fence = ""
  for line_view in content.split("\n") {
    let line = line_view.to_owned()
    let trimmed = line.trim().to_owned()
    if trimmed.has_prefix("```") || trimmed.has_prefix("~~~") {
      let marker = trimmed[:3].to_owned()
      if fence == "" {
        fence = marker
      } else if fence == marker {
        fence = ""
      }
      output.push(line)
      continue
    }
    if fence != "" {
      output.push(line)
      continue
    }
    let text = StringBuilder()
    let mut i = 0
    let mut ticks = 0
    while i < line.length() {
      if line[i] == '`' {
        let start = i
        while i < line.length() && line[i] == '`' {
          i += 1
        }
        let count = i - start
        if ticks == 0 {
          ticks = count
        } else if count == ticks {
          ticks = 0
        }
        text.write_string(line[start:i].to_owned())
        continue
      }
      if ticks == 0 &&
        line[i] == ']' &&
        i + 1 < line.length() &&
        line[i + 1] == '(' {
        let start = i + 2
        let mut end = start
        while end < line.length() && line[end] != ')' {
          end += 1
        }
        if end < line.length() {
          let raw = line[start:end].to_owned()
          if !raw.contains(" ") &&
            !raw.contains("\t") &&
            !raw.contains("(") &&
            !raw.has_prefix("#") {
            let pieces = raw.split("#").map(x => x.to_owned()).to_array()
            let target = pieces[0]
            if resolve_link(old_path, target) is Some(resolved) {
              let destination = moved.get(resolved).unwrap_or(resolved)
              let suffix = if pieces.length() > 1 {
                "#" + pieces[1:].to_owned().join("#")
              } else {
                ""
              }
              text.write_string(
                "](" + relative_link(new_path, destination) + suffix + ")",
              )
              i = end + 1
              continue
            }
          }
        }
      }
      let c = line.get_char(i).unwrap()
      text.write_char(c)
      i += if c.to_int() > 65535 { 2 } else { 1 }
    }
    output.push(text.to_string())
  }
  output.join("\n")
}

///|
/// Deterministic example planner, not an LLM. Root Markdown files declaring
/// category: engineering/product/research move under docs/. External AI
/// callers can instead submit structured operations to plan().
pub fn organize(snapshot : Snapshot) -> Plan {
  let moved : Map[String, String] = Map([])
  let operations : Array[Operation] = []
  for file in snapshot.files {
    if !file.path.contains("/") && file.path.to_lower().has_suffix(".md") {
      if category(file.content) is Some(category) {
        let name = file.path.to_lower().replace_all(old=" ", new="-")
        let target = "docs/" + category + "/" + name
        moved[file.path] = target
        operations.push({
          kind: "move",
          path: file.path,
          to: Some(target),
          content: None,
        })
      }
    }
  }
  for file in snapshot.files {
    if file.path.to_lower().has_suffix(".md") {
      let new_path = moved.get(file.path).unwrap_or(file.path)
      let content = rewrite_links(file.content, file.path, new_path, moved)
      if content != file.content {
        operations.push({
          kind: "write",
          path: new_path,
          to: None,
          content: Some(content),
        })
      }
    }
  }
  plan(
    snapshot,
    operations,
    title="按主题归档文档，并更新本地链接",
  )
}
