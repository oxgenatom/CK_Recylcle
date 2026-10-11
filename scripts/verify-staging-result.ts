import nextEnv from "@next/env";
import { Pool } from "pg";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { dbConfig } from "../lib/db-config";
import { verifyStagingDatabase } from "../lib/staging";
nextEnv.loadEnvConfig(process.cwd());
const evidence = JSON.parse(
  await readFile(".local/staging-ui-result.json", "utf8"),
);
assert.equal(evidence.catalogEnvironment, "production");
const account = JSON.parse(
  await readFile(".local/staging-test-account.json", "utf8"),
);
const pool = new Pool(dbConfig());
try {
  await verifyStagingDatabase(pool);
  const c = await pool.connect();
  try {
    await c.query("BEGIN READ ONLY");
    const cache = await c.query(
      "SELECT data FROM master_cache WHERE company_id=$1 AND mode='live' AND kind='catalog:production'",
      [process.env.APP_COMPANY_ID],
    );
    const masters = cache.rows[0].data;
    for (const record of evidence.drafts) {
      const result = await c.query(
        "SELECT * FROM receiving_documents WHERE id=$1 AND company_id=$2 AND mode='live'",
        [record.id, process.env.APP_COMPANY_ID],
      );
      assert.equal(result.rowCount, 1);
      const d = result.rows[0];
      assert.equal(d.status, "draft");
      assert.equal(d.version, 2);
      assert.equal(d.total, "103.79");
      assert.equal(d.vat, "6.79");
      assert.equal(d.created_by, account.identity);
      assert.equal(d.updated_by, account.identity);
      assert.ok(d.created_at);
      assert.ok(d.updated_at);
      assert.equal(d.flow_id, null);
      assert.equal(d.flow_number, null);
      assert.equal(d.body.catalogEnvironment, "production");
      assert.ok(
        masters.suppliers.some(
          (s: { id: string }) => s.id === d.body.supplierId,
        ),
      );
      const line = d.body.items[0];
      const p = masters.products.find(
        (p: { id: string }) => p.id === line.productId,
      );
      assert.ok(p);
      for (const field of ["id", "masterId", "unitId", "unit"])
        assert.equal(line.product[field], p[field]);
      const lines = await c.query(
        "SELECT product_id,master_id,unit_id,unit_name,quantity::text,price::text FROM receiving_items WHERE document_id=$1",
        [record.id],
      );
      assert.equal(lines.rows[0].product_id, p.id);
      assert.equal(lines.rows[0].unit_name, p.unit);
      assert.equal(lines.rows[0].quantity, "12.0000");
      assert.equal(lines.rows[0].price, "8.5000");
      const audit = await c.query(
        "SELECT count(*)::int AS count FROM audit_events WHERE document_id=$1 AND action='saved' AND actor=$2",
        [record.id, account.identity],
      );
      assert.equal(audit.rows[0].count, 2);
      // A Production draft cannot match Sandbox source predicates, even when numeric IDs overlap.
      const sandbox = await c.query(
        "SELECT id FROM receiving_documents WHERE id=$1 AND company_id=$2 AND COALESCE(body->>'catalogEnvironment','sandbox')='sandbox'",
        [record.id, process.env.APP_COMPANY_ID],
      );
      assert.equal(sandbox.rowCount, 0);
    }
    assert.equal(evidence.drafts.length, 2);
    await c.query("ROLLBACK");
    console.log(
      JSON.stringify({
        draftsVerified: evidence.drafts.length,
        productAndUnitMapping: "passed",
        auditAndTimes: "passed",
        sourceIsolation: "passed",
        flowDocumentIds: "none",
        sqlWriteOperations: 0,
      }),
    );
  } finally {
    c.release();
  }
} finally {
  await pool.end();
}
