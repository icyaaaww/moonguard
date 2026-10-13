///|
/// JSON transport only. All decisions live in the reusable root package.
pub fn dispatch(input : String) -> String {
  try {
    let request = @json.parse(input)
    let value : Json = match request {
      {
        "action": "plan",
        "snapshot": snapshot,
        "operations": operations,
        "title": String(title),
        ..
      } =>
        @guard.plan(
          @json.from_json(snapshot),
          @json.from_json(operations),
          title~,
        ).to_json()
      { "action": "organize", "snapshot": snapshot, .. } =>
        @guard.organize(@json.from_json(snapshot)).to_json()
      { "action": "check", "plan": planned, "snapshot": snapshot, .. } =>
        Json(
          @guard.check_apply(
            @json.from_json(planned),
            @json.from_json(snapshot),
          ),
        )
      {
        "action": "restore",
        "plan": planned,
        "snapshot": snapshot,
        "recovery": recovery,
        ..
      } =>
        @guard.restore_plan(
          @json.from_json(planned),
          @json.from_json(snapshot),
          recovery=@json.from_json(recovery),
        ).to_json()
      _ =>
        return (
          {
            "ok": false,
            "error": "invalid_request",
            "message": "请求字段缺失或 action 不受支持",
          } : Json).stringify()
    }
    ({ "ok": true, "value": value } : Json).stringify()
  } catch {
    _ =>
      (
        {
          "ok": false,
          "error": "invalid_json",
          "message": "JSON 结构或字段类型不符合协议",
        } : Json).stringify()
  }
}
