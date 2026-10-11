import nextEnv from "@next/env";
import { Pool } from "pg";
import { dbConfig } from "../lib/db-config";
import { requireStagingTarget } from "../lib/phase2-config";
nextEnv.loadEnvConfig(process.cwd());
requireStagingTarget(process.env);
const pool = new Pool(dbConfig());
try {
  const c = await pool.connect();
  try {
    await c.query("BEGIN READ ONLY");
    const company = await c.query("SELECT name FROM companies WHERE id=$1", [
      process.env.APP_COMPANY_ID,
    ]);
    if (
      process.env.APP_COMPANY_ID !== "ck-recycle-staging" ||
      company.rows[0]?.name !== "CK Recycle"
    )
      throw Error("staging_company_mismatch");
    const migrations = await c.query(
      "SELECT name FROM schema_migrations ORDER BY name",
    );
    const accounts = await c.query(
      "SELECT count(*)::int AS count, count(*) FILTER (WHERE NOT a.must_change AND m.active)::int AS usable FROM password_accounts a JOIN memberships m ON m.identity=a.identity AND m.company_id=a.company_id WHERE a.company_id=$1",
      [process.env.APP_COMPANY_ID],
    );
    const tls = await c.query(
      "SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()",
    );
    const catalog = await c.query(
      "SELECT kind,data->>'kind' AS page_kind,data->>'page' AS next_page,data->>'loaded' AS loaded,data->>'total' AS total,jsonb_array_length(data->'suppliers') AS suppliers,jsonb_array_length(data->'products') AS product_units FROM master_cache WHERE company_id=$1 AND mode='live' AND kind LIKE 'catalog:production%'",
      [process.env.APP_COMPANY_ID],
    );
    console.log(
      JSON.stringify({
        target: "CK Recycle staging",
        tls: tls.rows[0]?.ssl,
        migrations: migrations.rows.map((r) => r.name),
        accounts: accounts.rows[0],
        testLoginBudget: (await c.query("SELECT l.attempts, GREATEST(0,ceil(EXTRACT(EPOCH FROM (l.window_start+interval '15 minutes'-now()))))::int AS seconds_until_reset FROM login_limits l JOIN password_accounts a ON a.username=l.username WHERE a.company_id=$1 AND a.display_name='CK TEST staging editor'",[process.env.APP_COMPANY_ID])).rows,
        catalog: catalog.rows,
      }),
    );
    await c.query("ROLLBACK");
  } finally {
    c.release();
  }
} catch {
  console.error("Staging identity inspection failed; no credentials logged");
  process.exitCode = 1;
} finally {
  await pool.end();
}
