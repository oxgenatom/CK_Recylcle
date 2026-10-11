import 'server-only';
import { randomUUID } from 'node:crypto';
import { db } from './db';
import type { Actor } from './model';
import { HttpError } from './http-error';
import { submissionHash } from './review-policy';
import { read } from './receipts';
export async function enqueueSubmission(a: Actor,id: string,version: number,environment?: string) {
  const c = await db().connect();
  try {
    await c.query('BEGIN');
    const m = await c.query("SELECT role FROM memberships WHERE identity=$1 AND company_id=$2 AND active=true FOR SHARE",[a.id,a.company]);
    if (!m.rows.length || !['sender','admin'].includes(m.rows[0].role)) throw new HttpError(403,'ไม่มีสิทธิ์ส่ง');
    const r = await c.query("SELECT * FROM receiving_documents WHERE id=$1 AND company_id=$2 AND mode='live' AND body->>'catalogEnvironment'='production' FOR UPDATE",[id,a.company]);
    const d = r.rows[0];
    if (!d || environment !== 'production') throw new HttpError(404,'ไม่พบร่าง Production');
    if (d.version !== version || d.status !== 'approved') throw new HttpError(409,'ร่างไม่ได้อนุมัติหรือ version เปลี่ยน');
    const review = await c.query("SELECT r.id FROM draft_reviews r JOIN memberships m ON m.identity=r.decided_by AND m.company_id=r.company_id AND m.active AND m.can_approve WHERE r.document_id=$1 AND r.company_id=$2 AND r.environment='production' AND r.status='approved' AND r.approved_version=$3 AND r.request_hash=$4 FOR SHARE OF m",[id,a.company,version,submissionHash(d)]);
    if (!review.rowCount) throw new HttpError(403,'approval ไม่ตรงร่าง');
    const prior = await c.query("SELECT id FROM submission_attempts WHERE document_id=$1 UNION ALL SELECT id FROM submission_jobs WHERE document_id=$1 AND (status <> 'blocked' OR draft_version=$2)",[id,version]);
    if (prior.rowCount) throw new HttpError(409,'มีงานส่งหรือประวัติส่งแล้ว ห้ามกดซ้ำ');
    const session = await c.query('SELECT session_version FROM password_accounts WHERE identity=$1 AND company_id=$2',[a.id,a.company]);
    await c.query("INSERT INTO submission_jobs(id,document_id,company_id,environment,requested_by,draft_version,status,session_version,auth_expires_at) VALUES($1,$2,$3,'production',$4,$5,'queued',$6,$7)",[randomUUID(),id,a.company,a.id,version,session.rows[0]?.session_version ?? null,a.authExpiresAt || new Date(Date.now()+8*3600000).toISOString()]);
    await c.query("INSERT INTO audit_events(document_id,actor,action,detail) VALUES($1,$2,'submission_queued',$3)",[id,a.id,JSON.stringify({version,environment})]);
    await c.query('COMMIT');
  } catch(e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  return read(a,id);
}
