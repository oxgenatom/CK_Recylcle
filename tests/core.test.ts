import { test } from "node:test";
import assert from "node:assert/strict";
import { draftSchema, type Draft, type Snapshot } from "../lib/model";
import { calculate } from "../lib/money";
import {
  allPages,
  mapProducts,
  mapContacts,
  payload,
  documentResult,
  mockProducts,
  mockSuppliers,
  OutcomeUnknown,
} from "../lib/flowaccount/core";
const d: Draft = {
  supplierId: "101",
  buyer: "ผู้สั่งซื้อ",
  date: "2026-10-08",
  reference: "INV-01",
  notes: "",
  warehouse: "",
  po: "",
  vatMode: "exclusive",
  discount: "0",
  items: [{ productId: "201", quantity: "10", price: "8.50" }],
};
test("decimal totals and fractional quantity avoid binary floating point", () => {
  assert.equal(calculate(d).total, "90.95");
  assert.equal(
    calculate({
      ...d,
      items: [{ productId: "201", quantity: "0.3", price: "0.1" }],
    }).subtotal,
    "0.03",
  );
});
test("inclusive VAT, none and document discount", () => {
  assert.equal(
    calculate({
      ...d,
      vatMode: "inclusive",
      items: [{ productId: "201", quantity: "1", price: "107" }],
    }).vat,
    "7.00",
  );
  assert.equal(
    calculate({ ...d, vatMode: "none", discount: "5" }).total,
    "80.00",
  );
  assert.throws(() => calculate({ ...d, discount: "86" }));
});
test("round each line half up to 2 places before document sum", () => {
  assert.equal(
    calculate({
      ...d,
      items: [
        { productId: "201", quantity: "1", price: "1.005" },
        { productId: "201", quantity: "1", price: "1.005" },
      ],
    }).subtotal,
    "2.02",
  );
});
test("validation rejects invalid dates, scientific notation, negative and zero quantity", () => {
  for (const patch of [
    { date: "2026-02-30" },
    { items: [{ productId: "201", quantity: "0", price: "2" }] },
    { discount: "1e3" },
    { items: [{ productId: "201", quantity: "1", price: "-1" }] },
  ])
    assert.equal(draftSchema.safeParse({ ...d, ...patch }).success, false);
});
test("pagination loads all pages and refuses incomplete lists", async () => {
  const rows = await allPages(async (p) => ({
    status: true,
    data: {
      total: 3,
      currentPage: p,
      list: p === 1 ? [{ id: 1 }, { id: 2 }] : [{ id: 3 }],
    },
  }));
  assert.equal(rows.length, 3);
  await assert.rejects(
    allPages(async (p) => ({
      status: true,
      data: { total: 3, currentPage: p, list: [] },
    })),
  );
});
test("supplier types 5 and 7 only and product-list IDs/units", () => {
  assert.equal(
    mapContacts([
      { id: 1, contactType: 3 },
      { id: 2, contactType: 5 },
      { id: 3, contactType: 7 },
    ]).length,
    2,
  );
  const rows = mapProducts([
    {
      id: 11,
      type: 5,
      name: "PET",
      buySettings: { vatType: 3 },
      productLists: [
        { id: 201, unitId: 1, unitName: "กก.", buyPrice: 1 },
        { id: 202, unitId: 2, unitName: "ถุง", buyPrice: 10 },
      ],
    },
  ]);
  assert.deepEqual(
    rows.map((p) => p.id),
    ["201", "202"],
  );
  assert.equal(rows[1].masterId, "11");
});
test("payload preserves reference and approved salesName mapping; warehouse and PO stay local", () => {
  const b: Snapshot = {
    ...d,
    supplier: mockSuppliers[0],
    items: d.items.map((i) => ({ ...i, product: mockProducts[0] })),
  };
  const p = payload(b, "local-id");
  assert.equal(p.items[0].id, 201);
  assert.equal(p.reference, "INV-01");
  assert.equal(p.externalDocumentId, "ck-local-id");
  assert.equal(p.salesName, d.buyer);
  assert.equal("warehouse" in p, false);
  assert.equal("po" in p, false);
  assert.equal(p.grandTotal, 90.95);
});
test("ambiguous success remains unknown; require both ID and document number", () => {
  assert.deepEqual(
    documentResult({
      status: true,
      data: { documentId: 1, documentSerial: "RI1" },
    }),
    { id: "1", number: "RI1" },
  );
  assert.throws(
    () => documentResult({ status: true, data: { documentId: 1 } }),
    OutcomeUnknown,
  );
  assert.throws(() => documentResult({ status: false }), OutcomeUnknown);
});
test("inclusive 1070 payload keeps input price and grand total while extracting 70 VAT", () => {
  const b: Snapshot = { ...d, vatMode: "inclusive", supplier: mockSuppliers[0], items: [{ productId: "201", quantity: "1", price: "1070.00", product: mockProducts[0] }] };
  assert.deepEqual(calculate(b), { lines: ["1070.00"], subtotal: "1070.00", discount: "0.00", taxable: "1000.00", vat: "70.00", total: "1070.00" });
  const p = payload(b, "inclusive-test");
  assert.equal(p.isVatInclusive, true); assert.equal(p.isVat, true);
  assert.equal(p.items[0].pricePerUnit, 1070); assert.equal(p.items[0].total, 1070);
  assert.equal(p.vatAmount, 70); assert.equal(p.grandTotal, 1070);
});
