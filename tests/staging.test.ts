import { test } from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { verifyStagingDatabase } from "../lib/staging";
const env = {
  DATABASE_URL: "postgres://test@staging.invalid/staging",
  CK_DB_ENVIRONMENT: "staging",
  CK_STAGING_DB_HOST: "staging.invalid",
  CK_STAGING_DB_NAME: "staging",
  APP_COMPANY_ID: "ck-recycle-staging",
};
test("staging verification rejects wrong company/TLS and performs only reads before releasing connection", async () => {
  for (const [company, tls, pass] of [
    ["CK Recycle", true, true],
    ["Other project", true, false],
    ["CK Recycle", false, false],
  ] as const) {
    const queries: string[] = [];
    let released = false;
    const pool = {
      connect: async () => ({
        query: async (sql: string) => {
          queries.push(sql);
          return {
            rows: sql.includes("FROM companies")
              ? [{ name: company }]
              : sql.includes("pg_stat_ssl")
                ? [{ ssl: tls }]
                : [],
          };
        },
        release: () => {
          released = true;
        },
      }),
    } as unknown as Pool;
    if (pass) await verifyStagingDatabase(pool, env);
    else await assert.rejects(verifyStagingDatabase(pool, env));
    assert.equal(queries[0], "BEGIN READ ONLY");
    assert.equal(queries.at(-1), "ROLLBACK");
    assert.equal(released, true);
    assert.equal(
      queries.some((q) => /INSERT|UPDATE|DELETE/.test(q)),
      false,
    );
    const before = queries.length;
    await assert.rejects(
      verifyStagingDatabase(pool, { ...env, CK_STAGING_DB_NAME: "other" }),
    );
    await assert.rejects(
      verifyStagingDatabase(pool, { ...env, APP_COMPANY_ID: "other" }),
    );
    assert.equal(queries.length, before);
  }
});
