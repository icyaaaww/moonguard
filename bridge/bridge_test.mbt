///|
test "invalid protocol is a structured error" {
  let response = @json.parse(@bridge.dispatch("{"))
  assert_true(response is { "ok": false, "error": "invalid_json", .. })
  let response = @json.parse(@bridge.dispatch("{}"))
  assert_true(response is { "ok": false, "error": "invalid_request", .. })
}
