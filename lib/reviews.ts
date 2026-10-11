import 'server-only';
import { randomUUID } from 'node:crypto';
import { db } from './db';
import { HttpError } from './http-error';
import type { Actor, Receipt } from './model';
import { read } from './receipts';
import { reviewAllowed, submissionHash } from './review-policy';
export async function reviewAction(a: Actor, id: string, version: number, action: string, reason: string) {
  if (!['request-review','approve','return','cancel-review'].includes(action)) throw new HttpError(404,'ไม่พบคำสั่ง');
  if (!reviewAllowed(a,action)) throw new HttpError(403,'ไม่มีสิทธิ์ตรวจทาน/อนุมัติ');
  if (action === 'return' && !reason.trim()) throw new HttpError(400,'กรุณาระบุเหตุผลตีกลับ');
  await read(a,id);
  const c = await db().connect();
  try {
    await c.query('BEGIN');
    const member = await c.query('SELECT role,can_review,can_approve FROM memberships WHERE identity=$1 AND company_id=$2 AND active=true FOR SHARE',[a.id,a.company]);
    const m = member.rows[0];
    if (!m || !reviewAllowed({role:m.role,canReview:m.can_review,canApprove:m.can_approve},action)) throw new HttpError(403,'สิทธิ์ถูกเพิกถอน');
    const row = await c.query('SELECT * FROM receiving_documents WHERE id=$1 AND company_id=$2 FOR UPDATE',[id,a.company]);
    const d = row.rows[0] as Receipt;
    if (!d || d.version !== version) throw new HttpError(409,'ร่างเปลี่ยนแล้ว กรุณาเปิดใหม่');
    const current = await c.query("SELECT * FROM draft_reviews WHERE document_id=$1 AND status IN ('pending','approved') FOR UPDATE",[id]);
    const review = current.rows[0];
    let next = 'draft';
    if (action === 'request-review') {
      if (d.status !== 'draft') throw new HttpError(409,'สถานะนี้ขอตรวจทานไม่ได้');
      const attempts = await c.query('SELECT id FROM submission_attempts WHERE document_id=$1 LIMIT 1',[id]);
      if (attempts.rowCount) throw new HttpError(409,'มีประวัติส่งแล้ว ห้ามส่งซ้ำ');
      await c.query("INSERT INTO draft_reviews(id,document_id,company_id,environment,draft_version,request_hash,requested_by,status) VALUES($1,$2,$3,$4,$5,$6,$7,'pending')",[randomUUID(),id,a.company,d.body.catalogEnvironment || 'mock',version,submissionHash(d),a.id]);
      next = 'pending_review';
    } else {
      if (d.status !== 'pending_review' || !review || review.status !== 'pending' || review.draft_version !== version-1 || review.request_hash !== submissionHash(d)) throw new HttpError(409,'คำขอตรวจทานไม่ตรงร่าง');
      if (action === 'cancel-review' && review.requested_by !== a.id) throw new HttpError(403,'เฉพาะผู้ขอตรวจทานยกเลิกได้');
      next = action === 'approve' ? 'approved' : 'draft';
      await c.query('UPDATE draft_reviews SET status=$1,decided_by=$2,decided_at=now(),reason=$3,approved_version=$4 WHERE id=$5',[action === 'approve' ? 'approved' : action === 'return' ? 'returned' : 'cancelled',a.id,reason,action === 'approve' ? version+1 : null,review.id]);
    }
    await c.query('UPDATE receiving_documents SET status=$1,version=version+1,updated_by=$2,updated_at=now() WHERE id=$3',[next,a.id,id]);
    await c.query('INSERT INTO audit_events(document_id,actor,action,detail) VALUES($1,$2,$3,$4)',[id,a.id,action,JSON.stringify({version,hash:submissionHash(d),reason,selfApprovalAllowed:true})]);
    await c.query('COMMIT');
  } catch(e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  return read(a,id);
}
