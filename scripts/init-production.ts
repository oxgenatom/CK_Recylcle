// Bootstrap only an empty, separately confirmed production database. No staging copy.
import { readFile,readdir } from 'node:fs/promises';
import { Pool } from 'pg';
import { dbConfig } from '../lib/db-config';
if (process.env.CK_DB_ENVIRONMENT !== 'production' || process.env.APP_COMPANY_ID !== 'ck-recycle-production') throw Error('production_target_required');
const url = new URL(process.env.DATABASE_URL || '');
if (url.hostname !== process.env.CK_PRODUCTION_DB_HOST || decodeURIComponent(url.pathname.slice(1)) !== process.env.CK_PRODUCTION_DB_NAME) throw Error('production_target_mismatch');
const pool = new Pool(dbConfig());
const c = await pool.connect();
try {
  await c.query('BEGIN');
  await c.query('SELECT pg_advisory_xact_lock(724001)');
  const tls = await c.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()');
  if (tls.rows[0]?.ssl !== true) throw Error('verified_tls_required');
  const tables = await c.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
  if (tables.rowCount) throw Error('production_bootstrap_requires_empty_database');
  await c.query('CREATE TABLE schema_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())');
  for (const file of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort()) {
    await c.query(await readFile('migrations/'+file,'utf8'));
    await c.query('INSERT INTO schema_migrations(name) VALUES($1)',[file]);
  }
  await c.query("INSERT INTO companies(id,name) VALUES('ck-recycle-production','CK Recycle')");
  await c.query('COMMIT');
  console.log('Empty CK Recycle production initialized with verified TLS; zero accounts/drafts/documents copied.');
} catch(e) { await c.query('ROLLBACK'); console.error('Production initialization failed; secret details suppressed'); process.exitCode=1; } finally { c.release();await pool.end(); }
