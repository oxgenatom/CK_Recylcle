import "server-only";
import { db } from "./db";
import { draftSchema, type Actor } from "./model";
import { mode } from "./flowaccount/client";
import { HttpError } from "./http-error";

export async function readBank(a: Actor, supplierId: string) {
  const result = await db().query(
    "SELECT bank FROM supplier_banks WHERE company_id=$1 AND mode=$2 AND environment=$3 AND supplier_id=$4",
    [a.company, mode(), process.env.FLOW_ENVIRONMENT || "sandbox", supplierId],
  );
  return result.rows[0]?.bank ?? null;
}
export async function saveBank(a: Actor, supplierId: string, raw: unknown) {
  if (!["admin", "editor"].includes(a.role)) throw new HttpError(403, "ไม่มีสิทธิ์แก้ไขข้อมูลธนาคาร");
  const bank = draftSchema.shape.bank.unwrap().parse(raw);
  await db().query(
    "INSERT INTO supplier_banks(company_id,mode,environment,supplier_id,bank) VALUES($1,$2,$3,$4,$5) ON CONFLICT(company_id,mode,environment,supplier_id) DO UPDATE SET bank=EXCLUDED.bank",
    [a.company, mode(), process.env.FLOW_ENVIRONMENT || "sandbox", supplierId, JSON.stringify(bank)],
  );
  return bank;
}
