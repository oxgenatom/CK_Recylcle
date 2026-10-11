import Decimal from "decimal.js";
import type { Supplier, Product, Snapshot } from "../model";
import { calculate } from "../money";
export const mockSuppliers: Supplier[] = [
  {
    id: "101",
    name: "บริษัท รีไซเคิลตัวอย่าง จำกัด",
    address: "99 ถนนตัวอย่าง กรุงเทพฯ",
    taxId: "",
    branch: "สำนักงานใหญ่",
    branchCode: "00000",
    group: 3,
    zip: "10100",
  },
  {
    id: "102",
    name: "ผู้จำหน่ายทดสอบ B",
    address: "เชียงใหม่",
    taxId: "",
    branch: "",
    branchCode: "",
    group: 1,
    zip: "50000",
  },
];
export const mockProducts: Product[] = [
  {
    id: "201",
    masterId: "11",
    unitId: "1",
    name: "กระดาษรีไซเคิล",
    code: "PAPER-01",
    unit: "กก.",
    price: "8.50",
    type: 5,
    vatType: 3,
  },
  {
    id: "202",
    masterId: "12",
    unitId: "2",
    name: "พลาสติก PET",
    code: "PET-01",
    unit: "กก.",
    price: "12.25",
    type: 5,
    vatType: 3,
  },
  {
    id: "203",
    masterId: "12",
    unitId: "3",
    name: "พลาสติก PET",
    code: "PET-01",
    unit: "ถุง",
    price: "122.50",
    type: 5,
    vatType: 3,
  },
];
type Raw = Record<string, unknown>;
const text = (v: unknown) => String(v ?? "");
export function mapContacts(rows: Raw[]): Supplier[] {
  return rows
    .filter((c) => [5, 7].includes(Number(c.contactType)))
    .map((c) => ({
      id: text(c.id),
      name: text(c.contactName),
      address: text(c.contactAddress),
      taxId: text(c.contactTaxId),
      branch: text(c.contactBranch),
      branchCode: text(c.contactBranchCode),
      group: Number(c.contactGroup),
      zip: text(c.contactZipCode),
    }));
}
export function mapProducts(rows: Raw[]): Product[] {
  const seen = new Set<string>();
  return rows.flatMap((p) => {
    if (!Array.isArray(p.productLists) || !p.productLists.length)
      throw new Error("invalid_product_units");
    return (p.productLists as Raw[]).map((u) => {
      const id = text(u.id);
      if (!/^[1-9]\d*$/.test(id) || seen.has(id))
        throw new Error("invalid_product_list_id");
      seen.add(id);
      const price = new Decimal(text(u.buyPrice) || "0");
      if (!price.isFinite() || price.isNegative())
        throw new Error("invalid_product_price");
      return {
        id: text(u.id),
        masterId: text(p.id),
        unitId: u.unitId == null ? null : text(u.unitId),
        name: text(p.name),
        code: text(u.code ?? p.code),
        unit: text(u.unitName),
        price: price.toFixed(4),
        type: Number(p.type),
        vatType: Number((p.buySettings as Raw)?.vatType),
      };
    });
  });
}
export function payload(body: Snapshot, id: string) {
  const t = calculate(body);
  const n = (s: string) => Number(s);
  return {
    recordId: 0,
    documentStructureType: "SimpleDocument",
    contactId: n(body.supplier.id),
    contactName: body.supplier.name,
    contactAddress: body.supplier.address,
    contactTaxId: body.supplier.taxId,
    contactBranch: body.supplier.branch,
    contactZipCode: body.supplier.zip,
    contactGroup: body.supplier.group,
    publishedOn: body.date,
    creditType: 1,
    creditDays: 0,
    dueDate: body.date,
    salesName: body.buyer,
    reference: body.reference,
    remarks: body.notes,
    externalDocumentId: externalDocumentId(id),
    isVatInclusive: body.vatMode === "inclusive",
    isVat: body.vatMode !== "none",
    isManualVat: false,
    subTotal: n(t.subtotal),
    discountPercentage: new Decimal(t.subtotal).eq(0)
      ? 0
      : new Decimal(t.discount)
          .div(t.subtotal)
          .mul(100)
          .toDecimalPlaces(4)
          .toNumber(),
    discountAmount: n(t.discount),
    totalAfterDiscount: new Decimal(t.subtotal).minus(t.discount).toNumber(),
    vatAmount: n(t.vat),
    grandTotal: n(t.total),
    items: body.items.map((i, k) => ({
      id: n(i.product.id),
      type: i.product.type,
      name: i.product.name,
      unitName: i.product.unit,
      quantity: n(i.quantity),
      pricePerUnit: n(i.price),
      total: n(t.lines[k]),
    })),
  };
}
export class OutcomeUnknown extends Error {}
export function purchaseReadback(raw: any, id: string) {
  if (raw?.status !== true) throw new Error("sandbox_read_invalid_response");
  const rows = Array.isArray(raw.data?.list) ? raw.data.list : [raw.data];
  if (rows.length !== 1 || String(rows[0]?.documentId) !== id)
    throw new Error("sandbox_read_document_mismatch");
  return { status: true, data: rows[0] };
}
export function externalDocumentId(id: string) {
  return "ck-" + (id.length > 33 ? id.replace(/-/g, "") : id);
}
export function verifyPurchaseReadback(data: any, expected: ReturnType<typeof payload>, id: string, serial: string) {
  const numeric = (a: unknown, b: number) => a !== null && a !== undefined && Number.isFinite(Number(a)) && Number(a) === b;
  if (String(data?.documentId) !== id || data.documentSerial !== serial ||
    data.externalDocumentId !== expected.externalDocumentId ||
    String(data.contactId) !== String(expected.contactId) ||
    String(data.publishedOn).slice(0, 10) !== expected.publishedOn ||
    String(data.dueDate).slice(0, 10) !== expected.dueDate ||
    data.salesName !== expected.salesName || (data.reference || "") !== expected.reference ||
    (data.remarks || "") !== expected.remarks ||
    String(data.isVatInclusive) !== String(expected.isVatInclusive) ||
    !numeric(data.vatAmount, expected.vatAmount) || !numeric(data.grandTotal, expected.grandTotal) ||
    !numeric(data.discountAmount, expected.discountAmount) ||
    !numeric(data.totalWithoutVat, expected.grandTotal - expected.vatAmount) ||
    String(data.status) !== "1" || data.statusString !== "awaiting" ||
    !Array.isArray(data.items) || data.items.length !== expected.items.length)
    throw new Error("production_readback_mismatch");
  expected.items.forEach((item, k) => {
    const actual = data.items[k];
    if (String(actual?.id) !== String(item.id) || actual.unitName !== item.unitName ||
      !numeric(actual.quantity, item.quantity) || !numeric(actual.pricePerUnit, item.pricePerUnit) || !numeric(actual.total, item.total))
      throw new Error("production_readback_item_mismatch");
  });
}
export function documentResult(raw: unknown) {
  const r = raw as {
    status?: boolean;
    data?: { documentId?: unknown; documentSerial?: unknown; status?: unknown };
  };
  if (
    r?.status !== true ||
    !/^[1-9]\d*$/.test(String(r.data?.documentId)) ||
    (typeof r.data?.documentId === "number" &&
      !Number.isSafeInteger(r.data.documentId)) ||
    typeof r.data?.documentSerial !== "string" ||
    !r.data.documentSerial.trim()
  )
    throw new OutcomeUnknown("ambiguous_response");
  return {
    id: String(r.data.documentId),
    number: String(r.data.documentSerial),
    ...(typeof r.data.status === "string" || typeof r.data.status === "number"
      ? { flowStatus: String(r.data.status).slice(0, 100) } : {}),
  };
}
export async function allPages(fetchPage: (page: number) => Promise<unknown>) {
  const out: Raw[] = [];
  let total: number | undefined;
  const seen = new Set<string>();
  for (let page = 1; page <= 1000; page++) {
    const r = (await fetchPage(page)) as {
      status: boolean;
      data: { list: Raw[]; total: number; currentPage: number };
    };
    if (
      r?.status !== true ||
      !Array.isArray(r.data?.list) ||
      r.data.currentPage !== page ||
      !Number.isSafeInteger(r.data.total) ||
      r.data.total < 0
    )
      throw new Error("invalid_page");
    if (total !== undefined && total !== r.data.total)
      throw new Error("catalog_changed_retry");
    total = r.data.total;
    for (const row of r.data.list) {
      const id = String(row?.id ?? "");
      if (!id || seen.has(id)) throw new Error("invalid_or_duplicate_id");
      seen.add(id);
    }
    out.push(...r.data.list);
    if (out.length > r.data.total) throw new Error("invalid_page_total");
    if (out.length === r.data.total) return out;
    if (!r.data.list.length) throw new Error("incomplete_pagination");
  }
  throw new Error("pagination_limit");
}
