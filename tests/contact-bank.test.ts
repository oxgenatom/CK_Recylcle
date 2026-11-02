import { test } from "node:test";
import assert from "node:assert/strict";
import { mapContacts } from "../lib/flowaccount/core";
test("supplier bank mapping preserves leading zero and actual account holder", () => {
  const [s] = mapContacts([{id: 42, contactType: 5, contactBankId: 2, contactBankAccountNumber: "0012345678", contactBankAccountName: "Holder", contactBankBranch: "Branch"}]);
  assert.deepEqual(s.bank, {name: "ธนาคารกสิกรไทย", accountNumber: "0012345678", accountName: "Holder", branch: "Branch"});
});
test("missing bank stays absent and unknown IDs are not guessed", () => {
  const s = mapContacts([{id: 1, contactType: 5}, {id: 2, contactType: 5, contactBankAccountNumber: 0}, {id: 3, contactType: 5, contactBankId: 999, contactBankAccountNumber: "123"}]);
  assert.equal(s[0].bank, undefined);
  assert.equal(s[1].bank, undefined);
  assert.equal(s[2].bank?.name, "ธนาคารรหัส 999");
  assert.equal(s[2].bank?.accountName, "");
});
