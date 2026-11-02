import { test } from "node:test";
import assert from "node:assert/strict";
import type { Receipt, Supplier } from "../lib/model";
import { printBank } from "../lib/print-bank";
const bank = {name: "Bank", accountName: "Holder", accountNumber: "00123", branch: "Branch"};
const old = {body: {supplierId: "1"}} as Receipt;
const supplier = {id: "1", bank} as Supplier;
test("old receipts use matching contact bank only for printing without mutation", () => {
  const before = JSON.stringify(old);
  assert.deepEqual(printBank(old, supplier), {bank, current: true});
  assert.equal(JSON.stringify(old), before);
  assert.equal(printBank(old, {...supplier, id: "2"}).bank, undefined);
  assert.equal(printBank(old).bank, undefined);
});
test("saved receipt bank is preserved over current contact bank", () => {
  const saved = {...old, body: {...old.body, bank: {...bank, accountNumber: "00999"}}};
  assert.deepEqual(printBank(saved, supplier), {bank: saved.body.bank, current: false});
});
