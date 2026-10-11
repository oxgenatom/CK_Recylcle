import { test } from "node:test";
import assert from "node:assert/strict";
import { submissionConfig, submissionEnabled, SANDBOX_BASE, PRODUCTION_BASE } from "../lib/flowaccount/config";
import { submissionProblem } from "../lib/flowaccount/submission-policy";
import { externalDocumentId, purchaseReadback } from "../lib/flowaccount/core";
import type { Snapshot } from "../lib/model";
const env = { FLOW_MODE: "live", FLOW_ENVIRONMENT: "sandbox", FLOW_BASE_URL: SANDBOX_BASE, FLOW_API_APPROVED: "true", FLOW_CLIENT_ID: "sandbox-client", FLOW_CLIENT_SECRET: "sandbox-secret", FLOW_SANDBOX_WRITE_APPROVED: "true" };
test("read approval cannot enable submission; Production writes remain locked even with flag", () => {
  assert.equal(submissionEnabled({ ...env, FLOW_SANDBOX_WRITE_APPROVED: "false" }), false);
  assert.throws(() => submissionConfig({ ...env, FLOW_ENVIRONMENT: "production", FLOW_BASE_URL: PRODUCTION_BASE, FLOW_PRODUCTION_WRITE_APPROVED: "true" }));
  assert.equal(submissionConfig(env).baseUrl, SANDBOX_BASE);
});
test("sender/admin require Sandbox draft and explicit Sandbox confirmation; editor denied", () => {
  const body = { catalogEnvironment: "sandbox", warehouse: "", po: "" } as Snapshot;
  for (const role of ["sender", "admin"] as const) {
    assert.equal(submissionProblem(role, body, "sandbox", env), null);
    assert.ok(submissionProblem(role, { ...body, catalogEnvironment: "production" }, "sandbox", env));
    assert.ok(submissionProblem(role, body, undefined, env));
    assert.ok(submissionProblem(role, { ...body, po: "PO1" }, "sandbox", env));
  }
  assert.ok(submissionProblem("editor", body, "sandbox", env));
});
test("creation and reconciliation use the same bounded external reference", () => {
  assert.equal(externalDocumentId("11111111-1111-4111-8111-111111111111"), "ck-11111111111141118111111111111111");
  assert.ok(externalDocumentId(crypto.randomUUID()).length <= 36);
});
test("real Sandbox GET list wrapper is normalized and wrong/duplicate/missing documents rejected", () => {
  const data = { documentId: 150702, documentSerial: "RI2026100001", status: "1", statusString: "awaiting" };
  assert.deepEqual(purchaseReadback({ status: true, data: { totalDocument: "1", list: [data] } }, "150702"), { status: true, data });
  assert.deepEqual(purchaseReadback({ status: true, data }, "150702"), { status: true, data });
  for (const list of [[], [data, data], [{ ...data, documentId: 99 }]])
    assert.throws(() => purchaseReadback({ status: true, data: { list } }, "150702"));
});
