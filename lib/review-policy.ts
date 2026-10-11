import { createHash } from "node:crypto";
import type { Receipt } from "./model";
import { payload } from "./flowaccount/core";
export function submissionHash(d: Pick<Receipt, 'id' | 'body'>) {
  return createHash('sha256').update(JSON.stringify(payload(d.body, d.id))).digest('hex');
}
export function reviewAllowed(a: { role: string; canReview?: boolean; canApprove?: boolean }, action: string) {
  if (action === 'approve') return a.canApprove === true;
  if (action === 'return') return a.canReview === true || a.canApprove === true;
  return ['editor','admin'].includes(a.role);
}
