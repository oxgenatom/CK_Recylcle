// Local development/testing only. Never use this database or login on Vercel.
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
await mkdir(".local", { recursive: true });
const test = process.env.CK_E2E === "true";
const d = await PGlite.create(test ? "memory://" : ".local/mock-db");
await d.exec(
  "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY)",
);
for (const file of (await readdir("migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort()) {
  if (
    !(await d.query("SELECT name FROM schema_migrations WHERE name=$1", [file]))
      .rows.length
  ) {
    await d.exec(await readFile("migrations/" + file, "utf8"));
    await d.query("INSERT INTO schema_migrations VALUES($1)", [file]);
  }
}
await d.exec(
  "INSERT INTO companies(id,name) VALUES('mock-company','CK Mock'),('other-company','Other Mock') ON CONFLICT DO NOTHING; INSERT INTO memberships(identity,company_id,role,active) VALUES('mock-user','mock-company','admin',true),('mock-editor','mock-company','editor',true),('mock-disabled','mock-company','sender',false) ON CONFLICT DO NOTHING;",
);
if (test) {
  const raw = {
    supplierId: "101",
    buyer: "stale test",
    date: "2026-10-08",
    reference: "stale",
    notes: "",
    warehouse: "",
    po: "",
    vatMode: "exclusive",
    discount: "0",
    supplier: { id: "101", name: "Mock" },
    items: [],
  };
  for (const [id, company, status] of [
    ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "other-company", "draft"],
    ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "mock-company", "submitting"],
  ])
    await d.query(
      "INSERT INTO receiving_documents(id,company_id,body,totals,subtotal,vat,total,mode,created_by,updated_by,status,updated_at) VALUES($1,$2,$3,'{}',0,0,0,'mock','mock-user','mock-user',$4,now()-interval '5 minutes')",
      [id, company, JSON.stringify(raw), status],
    );
  await d.exec(
    "INSERT INTO submission_attempts(id,document_id,status,request_hash) VALUES('cccccccc-cccc-4ccc-8ccc-cccccccccccc','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','submitting','test')",
  );
}
const server = new PGLiteSocketServer({
  db: d,
  host: "127.0.0.1",
  port: 54329,
  maxConnections: 1,
});
await server.start();
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: "postgres://postgres@127.0.0.1:54329/postgres",
      DATABASE_CA_BASE64: "",
      DB_POOL_MAX: "1",
      APP_COMPANY_ID: "mock-company",
      NEXTAUTH_URL: "http://127.0.0.1:3000",
      NEXTAUTH_SECRET: randomBytes(32).toString("hex"),
      MOCK_LOGIN_ENABLED: "true",
      FLOW_MODE: "mock",
      FLOW_API_APPROVED: "false",
      FLOW_PRODUCTION_APPROVED: "false",
    },
  },
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  child.kill();
  await server.stop();
  await d.close();
  process.exit();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", async (code) => {
  if (stopping) return;
  await server.stop();
  await d.close();
  process.exit(code || 0);
});
