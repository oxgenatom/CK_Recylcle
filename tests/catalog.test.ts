import { test } from "node:test";
import assert from "node:assert/strict";
import {
  catalogConfig,
  PRODUCTION_BASE,
  SANDBOX_BASE,
} from "../lib/flowaccount/config";
import { CatalogTransport } from "../lib/flowaccount/transport";
import { localCatalogLoginAllowed } from "../lib/flowaccount/access";
import { allPages, mapProducts } from "../lib/flowaccount/core";
const env = {
  FLOW_CLIENT_ID: "fixture-client",
  FLOW_CLIENT_SECRET: "fixture-secret",
  FLOW_API_APPROVED: "true",
};
test("production selection requires explicit environment, exact URL and read approval", () => {
  assert.equal(catalogConfig(env).baseUrl, SANDBOX_BASE);
  assert.throws(() =>
    catalogConfig({ ...env, FLOW_BASE_URL: PRODUCTION_BASE }),
  );
  assert.throws(() =>
    catalogConfig({
      ...env,
      FLOW_ENVIRONMENT: "production",
      FLOW_BASE_URL: PRODUCTION_BASE,
    }),
  );
  assert.equal(
    catalogConfig({
      ...env,
      FLOW_ENVIRONMENT: "production",
      FLOW_BASE_URL: PRODUCTION_BASE,
      FLOW_PRODUCTION_READ_APPROVED: "true",
    }).baseUrl,
    PRODUCTION_BASE,
  );
});
test("catalog transport only POSTs token; purchases and other reads never reach fetch", async () => {
  const calls: string[] = [];
  const s = new CatalogTransport({
    baseUrl: PRODUCTION_BASE,
    clientId: "fixture",
    clientSecret: "fixture",
    fetcher: async (url, init) => {
      calls.push(String(url));
      assert.equal(init?.redirect, "error");
      assert.equal(init?.cache, "no-store");
      if (String(url).endsWith("/token")) {
        assert.equal(init?.method, "POST");
        return Response.json({
          access_token: "fixture-token",
          expires_in: 3600,
          token_type: "bearer",
        });
      }
      assert.equal(init?.method || "GET", "GET");
      return Response.json({
        status: true,
        data: { total: 0, currentPage: 1, list: [] },
      });
    },
  });
  await s.get("/contacts?currentPage=1&pageSize=100");
  await assert.rejects(s.purchase({}, "fixture"), /catalog_read_only/);
  for (const path of [
    "/purchases/1",
    "/company/info",
    "/contacts?redirect=https://example.com",
    "//example.com",
  ])
    await assert.rejects(s.get(path));
  assert.equal(calls.length, 2);
});
test("local catalog login cannot run on hosting or production builds", () => {
  const local = {
    NODE_ENV: "development",
    NEXTAUTH_URL: "http://127.0.0.1:3000",
    LOCAL_CATALOG_LOGIN_ENABLED: "true",
    FLOW_MODE: "live",
  };
  assert.equal(localCatalogLoginAllowed(local), true);
  for (const override of [
    { NODE_ENV: "production" },
    { NEXTAUTH_URL: "https://public.example" },
    { VERCEL: "1" },
    { RAILWAY_ENVIRONMENT_ID: "fixture" },
  ])
    assert.equal(localCatalogLoginAllowed({ ...local, ...override }), false);
});
test("pagination rejects repeated IDs, changed total and partial pages", async () => {
  for (const variant of ["duplicate", "changed", "empty"])
    await assert.rejects(
      allPages(async (page) => ({
        status: true,
        data: {
          total: variant === "changed" && page === 2 ? 3 : 2,
          currentPage: page,
          list:
            page === 1
              ? [{ id: 1 }]
              : variant === "empty"
                ? []
                : [{ id: variant === "duplicate" ? 1 : 2 }],
        },
      })),
    );
  const rows = await allPages(async (page) => ({
    status: true,
    data: {
      total: 250,
      currentPage: page,
      list: Array.from({ length: page < 3 ? 100 : 50 }, (_, i) => ({
        id: (page - 1) * 100 + i + 1,
      })),
    },
  }));
  assert.equal(rows.length, 250);
});
test("multi-unit mapping preserves list IDs, unit code, missing prices and rejects duplicates", () => {
  const raw = {
    id: 12,
    name: "fixture",
    code: "MAIN",
    type: 5,
    buySettings: { vatType: 3 },
    productLists: [
      { id: 21, unitId: 1, unitName: "kg", buyPrice: "1.25" },
      { id: 22, unitId: 2, unitName: "bag", code: "BAG", buyPrice: null },
    ],
  };
  const mapped = mapProducts([raw]);
  assert.deepEqual(
    mapped.map((p) => [p.id, p.unitId, p.code, p.price]),
    [
      ["21", "1", "MAIN", "1.2500"],
      ["22", "2", "BAG", "0.0000"],
    ],
  );
  assert.throws(() => mapProducts([raw, raw]), /invalid_product_list_id/);
  assert.throws(
    () => mapProducts([{ ...raw, productLists: null }]),
    /invalid_product_units/,
  );
});
