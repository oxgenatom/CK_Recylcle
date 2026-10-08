import { test } from "node:test";
import assert from "node:assert/strict";
import { dbConfig } from "../lib/db-config";
test("external databases require verified TLS and reject CA override", () => {
  const old = process.env.DATABASE_URL,
    ca = process.env.DATABASE_CA_BASE64;
  try {
    delete process.env.DATABASE_CA_BASE64;
    process.env.DATABASE_URL = "postgres://test@db.example.invalid/test";
    assert.throws(() => dbConfig(), /TLS/);
    process.env.DATABASE_URL += "?sslmode=verify-full";
    assert.ok(dbConfig().connectionString);
    process.env.DATABASE_CA_BASE64 = Buffer.from("test-ca").toString("base64");
    assert.throws(() => dbConfig(), /override/);
    process.env.DATABASE_URL = "postgres://test@db.example.invalid/test";
    assert.equal(
      (dbConfig().ssl as { rejectUnauthorized: boolean }).rejectUnauthorized,
      true,
    );
    process.env.DATABASE_URL = "postgres://test@127.0.0.1/test";
    delete process.env.DATABASE_CA_BASE64;
    assert.equal(dbConfig().ssl, undefined);
  } finally {
    if (old === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = old;
    if (ca === undefined) delete process.env.DATABASE_CA_BASE64;
    else process.env.DATABASE_CA_BASE64 = ca;
  }
});
