import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../lib/passwords";
test("scrypt hashes are salted, reject wrong passwords and malformed hashes", async () => {
  const p = "temporary-test-password-123";
  const a = await hashPassword(p),
    b = await hashPassword(p);
  assert.notEqual(a, b);
  assert.equal(await verifyPassword(p, a), true);
  assert.equal(await verifyPassword("incorrect", a), false);
  assert.equal(await verifyPassword(p, "invalid"), false);
  await assert.rejects(hashPassword("short"));
});
