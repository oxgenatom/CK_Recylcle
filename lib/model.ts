import { z } from "zod";
const decimal = z
  .string()
  .regex(/^\d{1,9}(\.\d{1,4})?$/, "ใช้ทศนิยมไม่เกิน 4 ตำแหน่ง");
export const draftSchema = z.object({
  supplierId: z.string().min(1),
  buyer: z.string().trim().min(1).max(100),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (s) =>
        !Number.isNaN(Date.parse(s)) &&
        new Date(s).toISOString().slice(0, 10) === s,
    ),
  reference: z.string().max(100),
  notes: z.string().max(1000),
  warehouse: z.string().max(100),
  po: z.string().max(100),
  vatMode: z.enum(["exclusive", "inclusive", "none"]),
  discount: decimal,
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: decimal.refine((s) => Number(s) > 0),
        price: decimal,
      }),
    )
    .min(1)
    .max(100),
});
export type Draft = z.infer<typeof draftSchema>;
export type Supplier = {
  id: string;
  name: string;
  address: string;
  taxId: string;
  branch: string;
  branchCode: string;
  group: number;
  zip: string;
};
export type Product = {
  id: string;
  masterId: string;
  unitId: string | null;
  name: string;
  code: string;
  unit: string;
  price: string;
  type: number;
  vatType: number;
};
export type Snapshot = Omit<Draft, "items"> & {
  supplier: Supplier;
  items: (Draft["items"][number] & { product: Product })[];
};
export type Status = "draft" | "submitting" | "synced" | "failed" | "unknown";
export type Receipt = {
  id: string;
  version: number;
  status: Status;
  body: Snapshot;
  totals: Totals;
  flow_id: string | null;
  flow_number: string | null;
  mode: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
};
export type Totals = {
  subtotal: string;
  discount: string;
  taxable: string;
  vat: string;
  total: string;
  lines: string[];
};
export type Actor = {
  id: string;
  company: string;
  role: "editor" | "sender" | "admin";
};
