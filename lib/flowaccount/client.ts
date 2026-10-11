import "server-only";
import { reserve } from "./budget";
import { catalogConfig, submissionConfig, PRODUCTION_BASE } from "./config";
import { CatalogTransport, SandboxTransport } from "./transport";
import { localCatalogLoginAllowed } from "./access";
import { catalogErrorMessage } from "./errors";
import { HttpError } from "../http-error";
import {
  allPages,
  mapContacts,
  mapProducts,
  mockSuppliers,
  mockProducts,
  OutcomeUnknown,
  purchaseReadback,
} from "./core";
export function mode() {
  const value = process.env.FLOW_MODE;
  if (value && value !== "mock" && value !== "live")
    throw new Error("FLOW_MODE ต้องเป็น mock หรือ live");
  return value === "live" ? "live" : "mock";
}
let transport: CatalogTransport | undefined;
let nextRead = 0;
// Wait only before HTTP reads/auth and before claiming an attempt. Never repeat a purchase POST.
async function reserveReadSlot() {
  for (;;) {
    try { return await reserve(); }
    catch (e) {
      if (!(e instanceof HttpError && e.status === 429) || process.env.VERCEL) throw e;
      await new Promise(resolve => setTimeout(resolve, 4000));
    }
  }
}
async function catalogBudget() {
  if (!localCatalogLoginAllowed()) return reserveReadSlot();
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
export async function catalogPage(kind:"contacts"|"product-masters", page:number) {
  try { return await catalogTransport().get(`/${kind}?currentPage=${page}&pageSize=100`); }
  catch(e) { if(e instanceof HttpError)throw e;throw new HttpError(503,catalogErrorMessage(e)); }
}
export async function token() {
  return mode() === "mock" ? "mock" : catalogTransport().token();
}
export async function catalog() {
  if (mode() === "mock")
    return { suppliers: mockSuppliers, products: mockProducts };
  try {
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
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(503, catalogErrorMessage(e));
  }
}
export async function createPurchase(body: unknown, access: string) {
  if (mode() === "live")
    return { kind: "synced" as const, ...await purchaseTransport().purchase(body, access) };
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
export async function fetchPurchase(id: string): Promise<{
  status: boolean;
  data: {
    externalDocumentId: string;
    grandTotal: number;
    documentId: number;
    documentSerial: string;
    contactId: number;
    publishedOn: string;
    status?: string | number;
  };
}> {
  const config = catalogConfig();
  const reader = new SandboxTransport({ ...config, receiptReadOnly: true, beforeRequest: reserveReadSlot });
  return purchaseReadback(await reader.get("/purchases/" + id), id);
}
function purchaseTransport() {
  const config = submissionConfig(); // Check every request even after transport has been cached.
  return new SandboxTransport({ ...config, productionPurchase: config.baseUrl === PRODUCTION_BASE, beforeRequest: reserveReadSlot });
}
export async function preparePurchase() {
  if (mode() === "live") {
    const access = await purchaseTransport().token();
    await reserveReadSlot();
    return access;
  }
  const access = await token();
  return access;
}
