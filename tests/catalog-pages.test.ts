import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newCatalogProgress,
  advanceCatalog,
} from "../lib/flowaccount/catalog-pages";
const page = (currentPage: number, total: number, list: unknown[]) => ({
  status: true,
  data: { currentPage, total, list },
});
test("resumable catalog preserves progress across requests and exposes complete multi-unit data only at end", () => {
  let state = advanceCatalog(
    newCatalogProgress(),
    page(1, 2, [{ id: 1, contactType: 5, contactName: "supplier" }]),
  );
  state = JSON.parse(JSON.stringify(state));
  assert.equal(state.complete, false);
  assert.equal(state.page, 2);
  assert.throws(
    () => advanceCatalog(state, page(2, 2, [{ id: 1 }])),
    /duplicate/,
  );
  assert.throws(
    () => advanceCatalog(state, page(2, 3, [{ id: 2 }])),
    /changed/,
  );
  assert.throws(() => advanceCatalog(state, page(2, 2, [])), /incomplete/);
  state = advanceCatalog(state, page(2, 2, [{ id: 2, contactType: 1 }]));
  assert.equal(state.kind, "product-masters");
  assert.equal(state.suppliers.length, 1);
  state = advanceCatalog(
    state,
    page(1, 1, [
      {
        id: 8,
        name: "test",
        type: 5,
        buySettings: { vatType: 3 },
        productLists: [
          { id: 81, unitId: 1, unitName: "kg", buyPrice: 8.5 },
          { id: 82, unitId: 2, unitName: "bag", buyPrice: 85 },
        ],
      },
    ]),
  );
  assert.equal(state.complete, true);
  assert.deepEqual(
    state.products.map((p) => [p.id, p.masterId, p.unitId]),
    [
      ["81", "8", "1"],
      ["82", "8", "2"],
    ],
  );
});
