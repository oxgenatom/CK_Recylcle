import "server-only";
import { reserve } from "./budget";
import { catalogConfig } from "./config";
import { CatalogTransport } from "./transport";
import { localCatalogLoginAllowed } from "./access";
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
let transport: CatalogTransport | undefined;
let nextRead = 0;
async function catalogBudget() {
  if (!localCatalogLoginAllowed()) return reserve();
  // Reserve slots synchronously, including concurrent refreshes. Local refresh can span minutes.
  const at = Math.max(Date.now(), nextRead);
  nextRead = at + 3500;
  await new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, at - Date.now())),
  );
}
function catalogTransport() {
  const config = catalogConfig();
  return (transport ??= new CatalogTransport({
    ...config,
    beforeRequest: catalogBudget,
  }));
}
export async function token() {
  return mode() === "mock" ? "mock" : catalogTransport().token();
}
export async function catalog() {
  if (mode() === "mock")
    return { suppliers: mockSuppliers, products: mockProducts };
  const s = catalogTransport();
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
  if (mode() === "live")
    throw new Error("Phase 1: อ่านข้อมูลเท่านั้น ไม่อนุญาตสร้างเอกสาร");
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
  throw new Error("Phase 1: อ่านข้อมูลเท่านั้น");
}
export async function fetchPurchase(
  id: string,
): Promise<{
  status: boolean;
  data: {
    externalDocumentId: string;
    grandTotal: number;
    documentId: number;
    documentSerial: string;
    contactId: number;
    publishedOn: string;
  };
}> {
  throw new Error("Phase 1: ยังไม่เปิด reconciliation");
}
export async function preparePurchase() {
  if (mode() === "live")
    throw new Error("Phase 1: อ่านข้อมูลเท่านั้น ไม่อนุญาตสร้างเอกสาร");
  const access = await token();
  return access;
}
