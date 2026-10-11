import nextEnv from "@next/env";
import { Pool } from "pg";
import { readFile, writeFile } from "node:fs/promises";
import { dbConfig } from "../lib/db-config";
import { verifyStagingDatabase } from "../lib/staging";
import type { Product, Supplier } from "../lib/model";
nextEnv.loadEnvConfig(process.cwd(), true);
const pool = new Pool(dbConfig());
try {
  await verifyStagingDatabase(pool);
  const c = await pool.connect();
  try {
    await c.query("BEGIN READ ONLY");
    const r = await c.query("SELECT data,synced_at FROM master_cache WHERE company_id=$1 AND mode='live' AND kind='catalog:production'", [process.env.APP_COMPANY_ID]);
    const suppliers = (r.rows[0]?.data.suppliers ?? []).filter((s: Supplier) => s.name.includes("แม แม"));
    const products = (r.rows[0]?.data.products ?? []).filter((p: Product) => p.name.toLowerCase().includes("morning in tuscany") && p.name.toLowerCase().includes("sticker"));
    if (suppliers.length !== 1 || products.length !== 1) throw Error("production_selection_not_unique");
    const sandbox = JSON.parse(await readFile(".local/sandbox-inclusive-uat-journal.json", "utf8"));
    if (!sandbox.readback?.verified || Number(sandbox.readback.grandTotal) !== 1070 || Number(sandbox.readback.vat) !== 70 || sandbox.readback.isVatInclusive !== "true") throw Error("inclusive_sandbox_acceptance_missing");
    const review = { environment: "production", catalogSyncedAt: r.rows[0]?.synced_at, suppliers, products, quantity: "1", priceInclusiveVat: "1070.00", vatMode: "inclusive", discount: "0", taxable: "1000.00", vat: "70.00", total: "1070.00", date: "2026-10-11", buyer: null, expectedStatus: "awaiting", creationApproved: false, sandboxAcceptance: { documentSerial: sandbox.documentSerial, flowId: sandbox.flowId, readback: sandbox.readback }, missingFields: ["buyer"], notes: "Inclusive VAT Sandbox verified. Production review only; buyer name not supplied. No FlowAccount write and no database draft yet." };
    await writeFile(".local/production-real-review.json", JSON.stringify(review, null, 2));
    console.log(JSON.stringify(review));
    await c.query("ROLLBACK");
  } finally { c.release(); }
} finally { await pool.end(); }
