import "server-only";
import { reserve } from "./budget";
import { sandboxConfig } from "./config";
import { SandboxTransport } from "./transport";
import {
  allPages,
  mapContacts,
  mapProducts,
  mockSuppliers,
  mockProducts,
  OutcomeUnknown,
} from "./core";
export function mode() {
  const value = process.env.FLOW_MODE;
  if (value && value !== "mock" && value !== "live")
    throw new Error("FLOW_MODE ต้องเป็น mock หรือ live");
  return value === "live" ? "live" : "mock";
}
let transport: SandboxTransport | undefined;
function sandbox() {
  const config = sandboxConfig();
  return (transport ??= new SandboxTransport({
    ...config,
    beforeRequest: reserve,
  }));
}
export async function token() {
  return mode() === "mock" ? "mock" : sandbox().token();
}
export async function catalog() {
  if (mode() === "mock")
    return { suppliers: mockSuppliers, products: mockProducts };
  const s = sandbox();
  return {
    suppliers: mapContacts(
      await allPages((p) =>
        s.get("/contacts?currentPage=" + p + "&pageSize=100"),
      ),
    ),
    products: mapProducts(
      await allPages((p) =>
        s.get("/product-masters?currentPage=" + p + "&pageSize=100"),
      ),
    ),
  };
}
export async function createPurchase(body: unknown, access: string) {
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
  return {
    kind: "synced" as const,
    ...(await sandbox().purchase(body, access)),
  };
}
export async function fetchPurchase(id: string) {
  if (mode() === "mock")
    throw new Error("ต้องใช้ Sandbox จริงเพื่อ reconciliation");
  return sandbox().get("/purchases/" + encodeURIComponent(id));
}
export async function preparePurchase() {
  const access = await token();
  if (mode() === "live") await reserve();
  return access;
}
