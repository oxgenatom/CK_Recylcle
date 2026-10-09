import { requireStagingTarget } from "../lib/phase2-config";
import { dbConfig } from "../lib/db-config";
import nextEnv from "@next/env";
import { Pool } from "pg";
import { readFile, readdir } from "node:fs/promises";
nextEnv.loadEnvConfig(process.cwd());
requireStagingTarget(process.env);
const pool = new Pool(dbConfig());
const c = await pool.connect();
try {
  await c.query("BEGIN");
  await c.query("SELECT pg_advisory_xact_lock(724001)");
  await c.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  for (const name of (await readdir("migrations"))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    if (
      !(
        await c.query("SELECT name FROM schema_migrations WHERE name=$1", [
          name,
        ])
      ).rowCount
    ) {
      await c.query(await readFile("migrations/" + name, "utf8"));
      await c.query("INSERT INTO schema_migrations(name) VALUES($1)", [name]);
      console.log("Applied", name);
    }
  }
  await c.query("COMMIT");
} catch (e) {
  await c.query("ROLLBACK");
  throw e;
} finally {
  c.release();
  await pool.end();
}
