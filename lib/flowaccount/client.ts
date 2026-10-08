import "server-only";
import { reserve } from "./budget";
import {
  allPages,
  mapContacts,
  mapProducts,
  mockSuppliers,
  mockProducts,
  OutcomeUnknown,
  documentResult,
} from "./core";
export const mode = () => (process.env.FLOW_MODE === "live" ? "live" : "mock");
function base() {
  const b = process.env.FLOW_BASE_URL;
  if (
    ![
      "https://openapi.flowaccount.com/test",
      "https://openapi.flowaccount.com/v1",
    ].includes(b || "")
  )
    throw new Error("FlowAccount URL ไม่ถูกต้อง");
  if (process.env.FLOW_API_APPROVED !== "true")
    throw new Error("ยังไม่ได้อนุญาตการทดสอบ FlowAccount");
  if (b?.endsWith("/v1") && process.env.FLOW_PRODUCTION_APPROVED !== "true")
    throw new Error("ยังไม่ได้อนุญาต production");
  if (process.env.VERCEL_ENV === "preview" && b?.endsWith("/v1"))
    throw new Error("Preview ห้ามใช้ production");
  return b!;
}
let cached: { token: string; expires: number } | undefined;
export async function token() {
  if (mode() === "mock") return "mock";
  const b = base();
  if (cached && cached.expires > Date.now() + 60000) return cached.token;
  if (!process.env.FLOW_CLIENT_ID || !process.env.FLOW_CLIENT_SECRET)
    throw new Error("ยังไม่ได้ตั้งค่า FlowAccount credentials");
  await reserve();
  const r = await fetch(b + "/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "flowaccount-api",
      client_id: process.env.FLOW_CLIENT_ID,
      client_secret: process.env.FLOW_CLIENT_SECRET,
    }),
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  const data = await r.json();
  if (!r.ok || !data.access_token)
    throw new Error("FlowAccount authentication failed");
  cached = {
    token: data.access_token,
    expires: Date.now() + Number(data.expires_in) * 1000,
  };
  return cached.token;
}
async function get(path: string) {
  const t = await token();
  await reserve();
  const r = await fetch(base() + path, {
    headers: { Authorization: "Bearer " + t },
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!r.ok) throw new Error("FlowAccount read failed");
  return r.json();
}
export async function catalog() {
  if (mode() === "mock")
    return { suppliers: mockSuppliers, products: mockProducts };
  const suppliers = mapContacts(
    await allPages((p) => get("/contacts?currentPage=" + p + "&pageSize=100")),
  );
  const products = mapProducts(
    await allPages((p) =>
      get("/product-masters?currentPage=" + p + "&pageSize=100"),
    ),
  );
  return { suppliers, products };
}
export async function createPurchase(body: unknown, accessToken: string) {
  if (mode() === "mock") {
    if (process.env.MOCK_SCENARIO === "timeout")
      throw new OutcomeUnknown("mock_timeout");
    if (process.env.MOCK_SCENARIO === "reject")
      return { kind: "failed" as const, code: "mock_rejected" };
    return {
      kind: "synced" as const,
      id: "mock-" + crypto.randomUUID(),
      number: "MOCK-" + Date.now(),
    };
  }
  try {
    const r = await fetch(base() + "/purchases", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    // No HTTP response is assumed safe to retry until its failure semantics are confirmed in UAT.
    if (!r.ok) throw new OutcomeUnknown("http_" + r.status);
    return { kind: "synced" as const, ...documentResult(await r.json()) };
  } catch (e) {
    throw e instanceof OutcomeUnknown
      ? e
      : new OutcomeUnknown("transport_or_response_error");
  }
}
export async function fetchPurchase(id: string) {
  if (mode() === "mock")
    throw new Error("ใช้เอกสารทดสอบจริงสำหรับ reconciliation");
  return get("/purchases/" + encodeURIComponent(id));
}
export async function preparePurchase() {
  const access = await token();
  if (mode() === "live") await reserve();
  return access;
}
