import type { Pool } from "pg";
import { requireStagingTarget, type Environment } from "./phase2-config";
export async function verifyStagingDatabase(
  pool: Pool,
  env: Environment = process.env,
) {
  requireStagingTarget(env);
  if (env.APP_COMPANY_ID !== "ck-recycle-staging")
    throw Error("staging_company_mismatch");
  const c = await pool.connect();
  try {
    await c.query("BEGIN READ ONLY");
    const company = await c.query("SELECT name FROM companies WHERE id=$1", [
      env.APP_COMPANY_ID,
    ]);
    const tls = await c.query(
      "SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()",
    );
    if (company.rows[0]?.name !== "CK Recycle" || tls.rows[0]?.ssl !== true)
      throw Error("staging_identity_or_tls_mismatch");
    await c.query("ROLLBACK");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export async function verifyRuntimeTarget(pool: Pool) {
  const host = new URL(process.env.DATABASE_URL || "").hostname;
  if (process.env.VERCEL_ENV === 'preview' && process.env.CK_DB_ENVIRONMENT !== 'staging') throw Error('preview_requires_staging_database');
  if (process.env.VERCEL_ENV === 'production' && process.env.CK_DB_ENVIRONMENT !== 'production') throw Error('production_requires_separate_production_database');
  if (process.env.CK_DB_ENVIRONMENT === 'production') {
    const url = new URL(process.env.DATABASE_URL || '');
    if (url.hostname !== process.env.CK_PRODUCTION_DB_HOST || decodeURIComponent(url.pathname.slice(1)) !== process.env.CK_PRODUCTION_DB_NAME || process.env.APP_COMPANY_ID !== 'ck-recycle-production') throw Error('production_target_mismatch');
    const c = await pool.connect();
    try {
      const company = await c.query('SELECT name FROM companies WHERE id=$1',[process.env.APP_COMPANY_ID]);
      const tls = await c.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()');
      if (company.rows[0]?.name !== 'CK Recycle' || tls.rows[0]?.ssl !== true) throw Error('production_identity_or_tls_mismatch');
    } finally { c.release(); }
    return;
  }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host))
    await verifyStagingDatabase(pool);
}
