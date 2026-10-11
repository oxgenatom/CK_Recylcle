import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogErrorMessage } from "../lib/flowaccount/errors";
test("catalog errors explain auth, rate limit and partial data without exposing upstream secrets", () => {
  assert.match(catalogErrorMessage(Error("sandbox_auth_failed")), /ไม่อนุญาต/);
  assert.match(catalogErrorMessage(Error("sandbox_read_http_429")), /1 นาที/);
  assert.match(catalogErrorMessage(Error("incomplete_pagination")), /ไม่ครบ/);
  assert.equal(
    catalogErrorMessage(Error("secret-value")).includes("secret-value"),
    false,
  );
});
