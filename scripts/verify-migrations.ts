import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
const db = await PGlite.create();
const server = new PGLiteSocketServer({
  db,
  host: "127.0.0.1",
  port: 54330,
  maxConnections: 1,
});
await server.start();
async function run(file: string, args: string[] = []) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["node_modules/tsx/dist/cli.mjs", file, ...args],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          DATABASE_URL: "postgres://postgres@127.0.0.1:54330/postgres",
          DATABASE_CA_BASE64: "",
          APP_COMPANY_ID: "migration-test",
          CK_DB_ENVIRONMENT: "staging",
          CK_STAGING_DB_HOST: "127.0.0.1",
          CK_STAGING_DB_NAME: "postgres",
        },
      },
    );
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error("Script failed: " + file)),
    );
    child.on("error", reject);
  });
}
try {
  await run("scripts/migrate.ts");
  await run("scripts/migrate.ts");
  assert.equal(
    (await db.query("SELECT name FROM schema_migrations")).rows.length,
    3,
  );
  await run("scripts/member.ts", ["issuer|subject", "admin"]);
  assert.equal(
    (await db.query<{ role: string }>("SELECT role FROM memberships")).rows[0]
      .role,
    "admin",
  );
  console.log(
    "Migration runner passed: 3 migrations, repeat run unchanged, membership provisioning works",
  );
} finally {
  await server.stop();
  await db.close();
}
