import { test } from "node:test";
import assert from "node:assert/strict";
import { SandboxTransport } from "../lib/flowaccount/transport";
import { sandboxConfig, SANDBOX_BASE } from "../lib/flowaccount/config";
import {
  OutcomeUnknown,
  allPages,
  mapContacts,
  mapProducts,
} from "../lib/flowaccount/core";
const options = {
  baseUrl: SANDBOX_BASE,
  clientId: "test-client",
  clientSecret: "test-credential",
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
test("Sandbox configuration rejects production, missing credentials and placeholders", () => {
  assert.throws(
    () =>
      sandboxConfig({
        FLOW_BASE_URL: "https://openapi.flowaccount.com/v1",
        FLOW_API_APPROVED: "true",
        FLOW_CLIENT_ID: "test-client",
        FLOW_CLIENT_SECRET: "test-credential",
      }),
    /sandbox_only/,
  );
  assert.throws(
    () =>
      sandboxConfig({
        FLOW_API_APPROVED: "true",
        FLOW_CLIENT_ID: "ใส่_Client_id_ของ_Sandbox",
        FLOW_CLIENT_SECRET: "ใส่_Client_secret_ของ_Sandbox",
      }),
    /placeholder/,
  );
  assert.throws(
    () =>
      new SandboxTransport({
        ...options,
        baseUrl: "https://openapi.flowaccount.com/v1",
      }),
    /sandbox_only/,
  );
});
test("Token request encodes client_credentials/scope, shares concurrent token and never redirects secrets", async () => {
  let calls = 0;
  const s = new SandboxTransport({
    ...options,
    fetcher: async (url, init) => {
      calls++;
      assert.equal(url, SANDBOX_BASE + "/token");
      assert.equal(init?.redirect, "error");
      const form = init?.body as URLSearchParams;
      assert.equal(form.get("grant_type"), "client_credentials");
      assert.equal(form.get("scope"), "flowaccount-api");
      return json({
        access_token: "test-token",
        expires_in: 86400,
        token_type: "Bearer",
      });
    },
  });
  assert.deepEqual(await Promise.all([s.token(), s.token()]), [
    "test-token",
    "test-token",
  ]);
  await s.token();
  assert.equal(calls, 1);
});
test("GET traverses Sandbox pages and maps product-list units, with bearer authentication", async () => {
  let reads = 0;
  const s = new SandboxTransport({
    ...options,
    fetcher: async (url, init) => {
      if (String(url).endsWith("/token"))
        return json({
          access_token: "test-token",
          expires_in: 86400,
          token_type: "Bearer",
        });
      reads++;
      assert.equal(
        (init?.headers as Record<string, string>).Authorization,
        "Bearer test-token",
      );
      const page = Number(new URL(String(url)).searchParams.get("currentPage"));
      if (String(url).includes("/contacts"))
        return json({
          status: true,
          data: {
            total: 2,
            currentPage: page,
            list: [
              {
                id: page,
                contactType: page === 1 ? 5 : 7,
                contactName: "Test",
              },
            ],
          },
        });
      return json({
        status: true,
        data: {
          total: 1,
          currentPage: page,
          list: [
            {
              id: 10,
              type: 5,
              name: "Test",
              buySettings: { vatType: 3 },
              productLists: [
                { id: 100, unitId: 1, unitName: "กก.", buyPrice: 1 },
                { id: 101, unitId: 2, unitName: "ถุง", buyPrice: 10 },
              ],
            },
          ],
        },
      });
    },
  });
  const c = mapContacts(
    await allPages((p) => s.get("/contacts?currentPage=" + p + "&pageSize=1")),
  );
  const products = mapProducts(
    await allPages((p) =>
      s.get("/product-masters?currentPage=" + p + "&pageSize=100"),
    ),
  );
  assert.equal(c.length, 2);
  assert.deepEqual(
    products.map((p) => p.id),
    ["100", "101"],
  );
  assert.equal(reads, 3);
});
test("POST timeout/HTTP error/malformed success each issue one request and stay unknown", async () => {
  for (const outcome of ["timeout", "http", "malformed"]) {
    let calls = 0;
    const s = new SandboxTransport({
      ...options,
      fetcher: async () => {
        calls++;
        if (outcome === "timeout") throw new Error("transport timeout");
        return outcome === "http"
          ? json({ status: false }, 500)
          : json({ status: true, data: {} });
      },
    });
    await assert.rejects(
      s.purchase({ externalDocumentId: "ck-test" }, "test-token"),
      OutcomeUnknown,
    );
    assert.equal(calls, 1);
  }
});
test("POST success requires document ID and number", async () => {
  const s = new SandboxTransport({
    ...options,
    fetcher: async (url, init) => {
      assert.equal(url, SANDBOX_BASE + "/purchases");
      assert.equal(init?.method, "POST");
      assert.equal(init?.redirect, "error");
      return json({
        status: true,
        data: { documentId: 123, documentSerial: "RI-TEST" },
      });
    },
  });
  assert.deepEqual(await s.purchase({}, "test-token"), {
    id: "123",
    number: "RI-TEST",
  });
});
test("Invalid token response is rejected without exposing upstream body", async () => {
  const s = new SandboxTransport({
    ...options,
    fetcher: async () =>
      json({ error: "invalid_client", message: "sensitive upstream data" }),
  });
  await assert.rejects(
    s.token(),
    (e) => e instanceof Error && e.message === "sandbox_auth_failed_invalid_client" && !e.message.includes("sensitive"),
  );
});
