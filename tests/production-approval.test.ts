import { test } from "node:test";
import assert from "node:assert/strict";
import { productionApprovalMatches, reviewHash } from "../lib/flowaccount/production-approval";
import { submissionEnabled, submissionConfig, PRODUCTION_BASE } from "../lib/flowaccount/config";
import { submissionProblem } from "../lib/flowaccount/submission-policy";
import { SandboxTransport } from "../lib/flowaccount/transport";
import type { Receipt } from "../lib/model";
import { payload, verifyPurchaseReadback, mockSuppliers, mockProducts } from "../lib/flowaccount/core";
import type { Snapshot } from "../lib/model";
const d = { id: "11111111-1111-4111-8111-111111111111", version: 1, status: "draft", body: { catalogEnvironment: "production", buyer: "fixture", warehouse: "", po: "" }, totals: { total: "1070.00" } } as Receipt;
const env = { FLOW_MODE: "live", FLOW_ENVIRONMENT: "production", FLOW_BASE_URL: PRODUCTION_BASE, FLOW_PRODUCTION_READ_APPROVED: "true", FLOW_PRODUCTION_WRITE_APPROVED: "true", FLOW_PRODUCTION_CLIENT_ID: "fixture-production-client", FLOW_PRODUCTION_CLIENT_SECRET: "fixture-production-secret", FLOW_PRODUCTION_DRAFT_ID: d.id, FLOW_PRODUCTION_DRAFT_VERSION: "1", FLOW_PRODUCTION_REVIEW_HASH: reviewHash(d) };
test("Production requires exact saved review, explicit write grant and separate credentials", () => {
  assert.equal(submissionEnabled(env), false);
  const regular = {...env,FLOW_PRODUCTION_SUBMISSION_ENABLED:"true"};
  assert.equal(submissionEnabled(regular), true);
  assert.equal(submissionEnabled({...regular,VERCEL_ENV:"preview"}), false);
  assert.equal(submissionConfig(regular).clientId, env.FLOW_PRODUCTION_CLIENT_ID);
  assert.equal(productionApprovalMatches(d, env), true);
  for (const changed of [{ ...d, version: 2 }, { ...d, status: "unknown" }, { ...d, id: crypto.randomUUID() }, { ...d, body: { ...d.body, buyer: "changed" } }])
    assert.equal(productionApprovalMatches(changed as Receipt, env), false);
  assert.equal(submissionEnabled({ ...env, FLOW_PRODUCTION_WRITE_APPROVED: "false" }), false);
  assert.equal(submissionEnabled({ ...env, FLOW_PRODUCTION_REVIEW_HASH: undefined }), false);
  assert.ok(submissionProblem("editor", d.body, "production", env));
  assert.ok(submissionProblem("admin", d.body, "sandbox", env));
  assert.ok(submissionProblem("sender", { ...d.body, catalogEnvironment: "sandbox" }, "production", env));
});
test("Production timeout fixture POST happens exactly once; read-only cannot create", async () => {
  let posts = 0;
  const transport = new SandboxTransport({ baseUrl: PRODUCTION_BASE, clientId: "fixture", clientSecret: "fixture", productionPurchase: true, fetcher: async (url) => { assert.equal(url, PRODUCTION_BASE + "/purchases"); posts++; throw new Error("timeout"); } });
  await assert.rejects(transport.purchase({}, "fixture"));
  assert.equal(posts, 1);
  const reader = new SandboxTransport({ baseUrl: PRODUCTION_BASE, clientId: "fixture", clientSecret: "fixture", receiptReadOnly: true });
  await assert.rejects(reader.purchase({}, "fixture"), /read_only/);
});
test("readback compares receipt ID, buyer, date, items, totals, VAT and awaiting status", () => {
  const b = { supplierId: mockSuppliers[0].id, supplier: mockSuppliers[0], buyer: "fixture", date: "2026-10-11", reference: "", notes: "", warehouse: "", po: "", vatMode: "inclusive", discount: "0", items: [{ productId: mockProducts[0].id, product: mockProducts[0], quantity: "1", price: "1070" }] } as Snapshot;
  const p = payload(b, d.id);
  const actual = { ...p, documentId: 99, documentSerial: "RI-fixture", totalWithoutVat: 1000, status: 1, statusString: "awaiting" };
  verifyPurchaseReadback(actual, p, "99", "RI-fixture");
  for (const changed of [{ salesName: "wrong" }, { vatAmount: 71 }, { grandTotal: 1071 }, { status: 2 }, { items: [] }, { items: [{ ...p.items[0], quantity: 2 }] }, { publishedOn: "2026-10-12" }])
    assert.throws(() => verifyPurchaseReadback({ ...actual, ...changed }, p, "99", "RI-fixture"));
});
