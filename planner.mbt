///|
/// Build a plan without changing the input. An invalid operation invalidates
/// the entire plan; partial previews are never returned as executable results.
pub fn plan(
  snapshot : Snapshot,
  operations : Array[Operation],
  title~ : String = "文件变更计划",
) -> Plan {
  let issues = validate_snapshot(snapshot)
  let files = file_map(snapshot)
  if operations.length() > 200 {
    issues.push(issue("limit", "", "一次最多 200 个操作"))
  }
  if issues.is_empty() {
    for op in operations {
      if !valid_path(op.path) || !text_path(op.path) {
        issues.push(
          issue(
            "invalid_path",
            op.path,
            "路径越界、保留名称或文件类型不受支持",
          ),
        )
        continue
      }
      match op.kind {
        "create" =>
          if op.to != None || op.content == None {
            issues.push(
              issue(
                "invalid_operation",
                op.path,
                "创建操作需要 content，且不能带 to",
              ),
            )
          } else if path_collision(op.path, files, snapshot) {
            issues.push(issue("collision", op.path, "目标路径已被占用"))
          } else {
            files[op.path] = op.content.unwrap()
          }
        "write" =>
          if op.to != None || op.content == None {
            issues.push(
              issue(
                "invalid_operation",
                op.path,
                "写入操作需要 content，且不能带 to",
              ),
            )
          } else if !files.contains(op.path) {
            issues.push(
              issue("missing", op.path, "要修改的文件不存在"),
            )
          } else {
            files[op.path] = op.content.unwrap()
          }
        "move" =>
          match op.to {
            None =>
              issues.push(
                issue(
                  "invalid_operation",
                  op.path,
                  "移动操作缺少目标路径",
                ),
              )
            Some(to) =>
              if op.content != None || !valid_path(to) || !text_path(to) {
                issues.push(
                  issue(
                    "invalid_path", to, "移动目标不合法，或包含多余内容",
                  ),
                )
              } else if !files.contains(op.path) {
                issues.push(
                  issue("missing", op.path, "要移动的文件不存在"),
                )
              } else if path_collision(to, files, snapshot) {
                issues.push(
                  issue(
                    "collision", to, "目标已存在，或存在大小写/目录冲突",
                  ),
                )
              } else {
                files[to] = files[op.path]
                files.remove(op.path)
              }
          }
        "trash" =>
          if op.to != None || op.content != None {
            issues.push(
              issue(
                "invalid_operation",
                op.path,
                "回收操作不能带 to 或 content",
              ),
            )
          } else if !files.contains(op.path) {
            issues.push(
              issue("missing", op.path, "要回收的文件不存在"),
            )
          } else {
            files.remove(op.path)
          }
        _ =>
          issues.push(
            issue(
              "unsupported",
              op.path,
              "未知操作；仅接受 create / write / move / trash",
            ),
          )
      }
    }
  }
  let output : Array[File] = []
  for path, content in files {
    output.push({ path, content, })
  }
  output.sort_by((a, b) => a.path.compare(b.path))
  let candidate : Snapshot = {
    files: output,
    folders: snapshot.folders.copy(),
    blocked: snapshot.blocked.copy(),
  }
  if issues.is_empty() {
    issues.append(validate_snapshot(candidate))
    let paths = snapshot_paths(snapshot)
    paths.append(snapshot_paths(candidate))
    issues.append(path_case_issues(paths))
  }
  let baseline = copy_snapshot(snapshot)
  let result = if issues.is_empty() {
    candidate
  } else {
    copy_snapshot(snapshot)
  }
  let changes = differences(baseline, result)
  {
    schema: 1,
    title,
    baseline,
    result,
    operations: operations.copy(),
    changes,
    issues,
  }
}

///|
/// Sorted net differences, suitable for verification and recovery journals.
pub fn differences(before : Snapshot, after : Snapshot) -> Array[Change] {
  let a = file_map(before)
  let b = file_map(after)
  let keys : Map[String, Bool] = Map([])
  for k, _ in a {
    keys[k] = true
  }
  for k, _ in b {
    keys[k] = true
  }
  let result = []
  for k, _ in keys {
    if a.get(k) != b.get(k) {
      result.push({ path: k, before: a.get(k), after: b.get(k), })
    }
  }
  result.sort_by((a, b) => a.path.compare(b.path))
  result
}

///|
/// Reject a stale plan using its whole read snapshot. Hosts must also check
/// real filesystem types and serialize their own writers at the I/O boundary.
pub fn check_apply(planned : Plan, current : Snapshot) -> Array[Issue] {
  let rebuilt = plan(planned.baseline, planned.operations, title=planned.title)
  let issues = validate_snapshot(current)
  if planned.schema != 1 || rebuilt != planned {
    issues.push(
      issue("invalid_plan", "", "计划内容与重新计算的结果不一致"),
    )
    return issues
  }
  if !planned.ready() {
    issues.push(
      issue("not_ready", "", "计划包含错误或没有实际变更"),
    )
    return issues
  }
  for change in differences(planned.baseline, current) {
    issues.push(
      issue(
        "stale",
        change.path,
        "文件已在预演后发生变化，请重新预演",
      ),
    )
  }
  let old_blocked = planned.baseline.blocked.copy()
  let now_blocked = current.blocked.copy()
  let old_folders = planned.baseline.folders.copy()
  let now_folders = current.folders.copy()
  old_blocked.sort()
  now_blocked.sort()
  old_folders.sort()
  now_folders.sort()
  if old_blocked != now_blocked || old_folders != now_folders {
    issues.push(
      issue(
        "stale_structure", "", "目录或不可操作文件已变化，请重新预演",
      ),
    )
  }
  issues
}

///|
/// Construct a restore plan. Unrelated new files survive; modified touched
/// files cause a conflict. recovery=true permits either before or after values
/// for an interrupted commit/restore, without overwriting a third value.
pub fn restore_plan(
  planned : Plan,
  current : Snapshot,
  recovery~ : Bool = false,
) -> Plan {
  let issues = []
  let operations = []
  let files = file_map(current)
  let rebuilt = plan(planned.baseline, planned.operations, title=planned.title)
  if planned.schema != 1 || rebuilt != planned || !planned.ready() {
    issues.push(issue("invalid_plan", "", "原始计划不合法"))
  } else {
    for change in planned.changes {
      let actual = files.get(change.path)
      if actual != change.after && !(recovery && actual == change.before) {
        issues.push(
          issue(
            "restore_conflict",
            change.path,
            "操作后文件又被修改；恢复已停止，保留你的改动",
          ),
        )
      }
    }
  }
  // Remove created destinations first, then restore original paths.
  for change in planned.changes {
    if change.before == None && files.contains(change.path) {
      operations.push({
        kind: "trash",
        path: change.path,
        to: None,
        content: None,
      })
    }
  }
  for change in planned.changes {
    if change.before is Some(content) && files.get(change.path) != Some(content) {
      operations.push({
        kind: if files.contains(change.path) {
          "write"
        } else {
          "create"
        },
        path: change.path,
        to: None,
        content: Some(content),
      })
    }
  }
  let restore = plan(current, operations, title="恢复：" + planned.title)
  if issues.is_empty() {
    restore
  } else {
    { ..restore, result: copy_snapshot(current), changes: [], issues, }
  }
}
