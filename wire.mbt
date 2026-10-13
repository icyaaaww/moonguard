///|
pub impl ToJson for Operation with fn to_json(self) {
  {
    "kind": self.kind,
    "path": self.path,
    "to": nullable_json(self.to),
    "content": nullable_json(self.content),
  }
}

///|
pub impl @json.FromJson for Operation with fn from_json(value, json_path) {
  match value {
    {
      "kind": String(kind),
      "path": String(path),
      "to"? : to,
      "content"? : content,
      ..
    } =>
      {
        kind,
        path,
        to: nullable_string(to.unwrap_or(null), json_path),
        content: nullable_string(content.unwrap_or(null), json_path),
      }
    _ =>
      raise @json.JsonDecodeError(
        (json_path, "Expected operation with kind and path"),
      )
  }
}

///|
pub impl ToJson for Change with fn to_json(self) {
  {
    "path": self.path,
    "before": nullable_json(self.before),
    "after": nullable_json(self.after),
  }
}

///|
pub impl @json.FromJson for Change with fn from_json(value, json_path) {
  match value {
    { "path": String(path), "before"? : before, "after"? : after, .. } =>
      {
        path,
        before: nullable_string(before.unwrap_or(null), json_path),
        after: nullable_string(after.unwrap_or(null), json_path),
      }
    _ => raise @json.JsonDecodeError((json_path, "Expected change with path"))
  }
}

///|
fn nullable_json(value : String?) -> Json {
  match value {
    None => null
    Some(s) => Json(s)
  }
}

///|
fn nullable_string(
  value : Json,
  path : @json.JsonPath,
) -> String? raise @json.JsonDecodeError {
  match value {
    Null => None
    String(s) => Some(s)
    _ => raise @json.JsonDecodeError((path, "Expected string or null"))
  }
}
