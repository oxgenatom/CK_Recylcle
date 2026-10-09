import nextEnv from "@next/env";
import { Pool } from "pg";
import { dbConfig } from "../lib/db-config";
import { configurationErrors, requiredConfig } from "../lib/phase2-config";
nextEnv.loadEnvConfig(process.cwd());
for (const key of requiredConfig)
  console.log(`${key}: ${process.env[key]?.trim() ? "present" : "missing"}`);
const errors = process.argv.includes("--database")
  ? process.env.DATABASE_URL
    ? []
    : ["DATABASE_URL: missing"]
  : configurationErrors(process.env);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else if (process.argv.includes("--database")) {
  const pool = new Pool(dbConfig());
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN READ ONLY");
      await client.query("SELECT 1");
      const tls = await client.query(
        "SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()",
      );
      if (tls.rows[0]?.ssl !== true)
        throw new Error("Verified TLS connection required");
      const schema = await client.query(
        "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS present",
      );
      console.log(
        "PostgreSQL read-only connection: passed; TLS: enabled; migrations table:",
        schema.rows[0].present ? "present" : "missing",
      );
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  } catch {
    console.error("Database preflight failed; check connection/TLS privately.");
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
