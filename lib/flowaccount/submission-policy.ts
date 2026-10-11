import type { Actor, Snapshot } from "../model";
import { submissionEnabled } from "./config";
export function submissionProblem(role: Actor["role"], body: Snapshot, confirmation: string | undefined, env: Record<string, string | undefined> = process.env): string | null {
  if (!["sender", "admin"].includes(role)) return "ไม่มีสิทธิ์ส่งเอกสาร";
  if (!submissionEnabled(env)) return "ยังไม่อนุญาตส่งเอกสารใน environment นี้";
  if (env.FLOW_MODE === "live") {
    if (body.catalogEnvironment !== env.FLOW_ENVIRONMENT || confirmation !== env.FLOW_ENVIRONMENT)
      return "ร่างและการยืนยันต้องตรง environment ห้ามส่งข้าม environment";
    if (body.warehouse || body.po) return "API รุ่นนี้ไม่รองรับคลังและ PO ในใบรับสินค้า";
  }
  return null;
}
