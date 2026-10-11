import nextEnv from "@next/env";
import { readFile, writeFile } from "node:fs/promises";
import { Pool } from "pg";
import assert from "node:assert/strict";
import { dbConfig } from "../lib/db-config";
import { verifyStagingDatabase } from "../lib/staging";
import { sandboxConfig, SANDBOX_BASE } from "../lib/flowaccount/config";
import { SandboxTransport } from "../lib/flowaccount/transport";
import { allPages, mapContacts, mapProducts, externalDocumentId, purchaseReadback } from "../lib/flowaccount/core";
nextEnv.loadEnvConfig(process.cwd(), true);
Object.assign(process.env, { FLOW_MODE: "live", FLOW_ENVIRONMENT: "sandbox", FLOW_BASE_URL: SANDBOX_BASE, FLOW_SANDBOX_WRITE_APPROVED: "true" });
const inclusive = process.argv.includes("--inclusive-1070");
if (!process.argv.includes("--approved-test-data")) throw Error("explicit_sandbox_test_data_approval_required");
const path = inclusive ? ".local/sandbox-inclusive-uat-journal.json" : ".local/sandbox-uat-journal.json";
let journal: Record<string, any>;
try { journal = JSON.parse(await readFile(path, "utf8")); }
catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  journal = { environment: "sandbox", approval: inclusive ? "user approved one inclusive VAT Sandbox document, grandTotal 1070" : "user approved CK TEST data 2026-10-11", createdAt: new Date().toISOString() };
  if (inclusive) {
    const previous = JSON.parse(await readFile(".local/sandbox-uat-journal.json", "utf8"));
    assert.equal(previous.supplier.state, "created"); assert.equal(previous.product.state, "created");
    journal.supplier = { state: "created" }; journal.product = { state: "created" }; // Reuse verified Sandbox masters; never creates new masters for this test.
  }
}
const persist = () => writeFile(path, JSON.stringify(journal, null, 2));
const pool = new Pool(dbConfig());
let serviceDb: { end: () => Promise<void> } | undefined;
try {
  await verifyStagingDatabase(pool);
  const member = await pool.query("SELECT a.identity,m.role FROM password_accounts a JOIN memberships m ON m.identity=a.identity AND m.company_id=a.company_id WHERE a.company_id=$1 AND a.username='admin' AND m.active AND m.role='admin'", [process.env.APP_COMPANY_ID]);
  assert.equal(member.rowCount, 1);
  const actor = { id: member.rows[0].identity, role: "admin" as const, company: process.env.APP_COMPANY_ID! };
  let next = 0;
  const beforeRequest = async () => { const at = Math.max(Date.now(), next); next = at + 3500; await new Promise(r => setTimeout(r, at - Date.now())); };
  const transport = new SandboxTransport({ ...sandboxConfig(), beforeRequest });
  const token = await transport.token();
  if (journal.product?.state === "submitting" && process.argv.includes("--reviewed-product-absent")) {
    const rows = await allPages(p => transport.get(`/product-masters?currentPage=${p}&pageSize=100`));
    assert.equal(rows.length, 0); // Manual master-data recovery only; never resets document POST state.
    journal.productRecovery = { fullCatalogEmptyAt: new Date().toISOString(), reason: "omit opening-stock settings; zero opening quantity is invalid per official product guide" };
    delete journal.product; await persist();
  }
  async function createMaster(kind: "contacts" | "product-masters", key: string, body: unknown) {
    if (journal[key]?.state === "created") return;
    if (journal[key]) throw Error("ambiguous_master_creation_manual_review_required");
    journal[key] = { state: "submitting" }; await persist();
    await beforeRequest();
    const response = await fetch(SANDBOX_BASE + "/" + kind, { method: "POST", redirect: "error", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    const raw = await response.json();
    journal[key].response = { httpStatus: response.status, status: raw.status, code: typeof raw.code === "number" ? raw.code : undefined }; await persist();
    if (!response.ok || raw.status !== true) throw Error("sandbox_master_creation_unconfirmed");
    journal[key] = { state: "created" }; await persist();
  }
  await createMaster("contacts", "supplier", { contactName: "CK TEST ผู้จำหน่าย Sandbox", contactGroup: 1, contactType: 5, contactAddress: "ข้อมูลทดสอบ Sandbox เท่านั้น", contactTaxId: "" });
  await createMaster("product-masters", "product", { type: 5, name: "CK TEST กระดาษรีไซเคิล", code: "CKTEST-PAPER-01", buySettings: { vatType: 3 }, sellSettings: { vatType: 3 }, productLists: [{ unitName: "กก.", buyPrice: 8.5, sellPrice: 8.5, isMainProduct: true }] });
  const suppliers = mapContacts(await allPages(p => transport.get(`/contacts?currentPage=${p}&pageSize=100`)));
  const products = mapProducts(await allPages(p => transport.get(`/product-masters?currentPage=${p}&pageSize=100`)));
  const supplier = suppliers.filter(s => s.name === "CK TEST ผู้จำหน่าย Sandbox");
  const product = products.filter(p => p.name === "CK TEST กระดาษรีไซเคิล" && p.unit === "กก.");
  assert.equal(supplier.length, 1); assert.equal(product.length, 1);
  const receipts = await import("../lib/receipts");
  serviceDb = (await import("../lib/db")).db();
  let masters = await receipts.masters(actor, true);
  while ("loading" in masters && masters.loading) { await new Promise(r => setTimeout(r, 3500)); masters = await receipts.masters(actor); }
  if (!journal.draftId) {
    const draft = await receipts.save(actor, { supplierId: supplier[0].id, buyer: "CK TEST ผู้สั่งซื้อ", date: "2026-10-11", reference: inclusive ? "CK TEST SANDBOX IN-VAT 1070 2026-10-11" : "CK TEST SANDBOX 2026-10-11", notes: "ทดสอบระบบ CK Recycle ใน Sandbox เท่านั้น", warehouse: "", po: "", vatMode: inclusive ? "inclusive" : "exclusive", discount: "0", items: [{ productId: product[0].id, quantity: inclusive ? "1" : "1.2345", price: inclusive ? "1070.00" : "8.50" }] });
    journal.draftId = draft.id; await persist();
  }
  let draft = await receipts.read(actor, journal.draftId);
  assert.equal(draft.totals.total, inclusive ? "1070.00" : "11.22");
  if (inclusive) { assert.equal(draft.totals.taxable, "1000.00"); assert.equal(draft.totals.vat, "70.00"); }
  if (draft.status === "draft" && !journal.postAttempted) {
    // Wait for catalog validation to finish before calling the service once.
    journal.postAttempted = true; await persist();
    try { draft = await receipts.submit(actor, draft.id, draft.version, "sandbox"); }
    catch (e) {
      draft = await receipts.read(actor, draft.id);
      if (draft.status === "draft") { journal.postAttempted = false; await persist(); }
      throw e;
    }
  }
  journal.localStatus = draft.status; journal.flowId = draft.flow_id; journal.documentSerial = draft.flow_number; await persist();
  if (draft.status !== "synced" || !draft.flow_id) throw Error("sandbox_submission_requires_manual_review");
  const raw = purchaseReadback(await transport.get("/purchases/" + draft.flow_id), draft.flow_id);
  const data = raw.data;
  assert.equal(raw.status, true); assert.equal(String(data.documentId), draft.flow_id);
  assert.equal(data.externalDocumentId, externalDocumentId(draft.id));
  assert.equal(String(data.contactId), supplier[0].id); assert.equal(data.publishedOn.slice(0, 10), draft.body.date);
  assert.equal(Number(data.grandTotal), inclusive ? 1070 : 11.22); assert.equal(Number(data.vatAmount), inclusive ? 70 : 0.73);
  assert.equal(String(data.isVatInclusive), String(inclusive));
  if (inclusive) assert.equal(Number(data.totalWithoutVat), 1000);
  assert.equal(data.salesName, draft.body.buyer); assert.equal(data.items.length, 1);
  assert.equal(Number(data.items[0].quantity), inclusive ? 1 : 1.2345); assert.equal(Number(data.items[0].pricePerUnit), inclusive ? 1070 : 8.5); assert.equal(data.items[0].unitName, "กก.");
  assert.equal(String(data.items[0].id), product[0].id);
  assert.equal(data.statusString, "awaiting");
  for (const role of ["admin", "editor"] as const) {
    const attempts = await Promise.allSettled([receipts.submit({ ...actor, role }, draft.id, draft.version, "sandbox"), receipts.submit({ ...actor, role }, draft.id, draft.version, "sandbox")]);
    for (const attempt of attempts) {
      assert.equal(attempt.status, "rejected");
      if (attempt.status === "rejected") assert.equal(attempt.reason.status, role === "admin" ? 409 : 403);
    }
  }
  journal.realDuplicateBlocked = true; journal.realEditorBlocked = true;
  journal.readback = { verified: true, verifiedAt: new Date().toISOString(), actualStatus: data.status, statusString: data.statusString, isVatInclusive: data.isVatInclusive, taxable: data.totalWithoutVat, quantity: data.items[0].quantity, price: data.items[0].pricePerUnit, vat: data.vatAmount, grandTotal: data.grandTotal };
  if (!journal.readbackAudited) {
    await pool.query("INSERT INTO audit_events(document_id,actor,action,detail) VALUES($1,$2,'readback_verified',$3)", [draft.id, actor.id, JSON.stringify(journal.readback)]);
    journal.readbackAudited = true;
  }
  await persist(); console.log(JSON.stringify({ environment: "sandbox", draftId: draft.id, flowId: draft.flow_id, documentSerial: draft.flow_number, readback: journal.readback }));
} catch (e) {
  const safe = e instanceof Error && /^(sandbox_|ambiguous_master_|explicit_|staging_|document_write_)/.test(e.message) ? e.message : e instanceof Error ? e.name : "Error";
  console.error("Sandbox UAT stopped:", safe, "Inspect journal and draft status before any retry. No secrets logged."); process.exitCode = 1;
} finally { await pool.end(); await serviceDb?.end(); }
