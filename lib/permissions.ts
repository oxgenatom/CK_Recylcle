import 'server-only';
import { z } from 'zod';
import { db } from './db';
import { HttpError } from './http-error';
import type { Actor } from './model';
const input=z.object({identity:z.string().min(1).max(200),canReview:z.boolean(),canApprove:z.boolean(),reason:z.string().trim().min(1).max(1000)});
export async function setReviewPermissions(a: Actor,raw: unknown) {
  const b=input.parse(raw),c=await db().connect();
  try {
    await c.query('BEGIN');
    const admin=await c.query("SELECT role FROM memberships WHERE identity=$1 AND company_id=$2 AND active=true FOR SHARE",[a.id,a.company]);
    if (admin.rows[0]?.role!=='admin') throw new HttpError(403,'เฉพาะผู้ดูแลที่ active');
    const target=await c.query('SELECT can_review,can_approve FROM memberships WHERE identity=$1 AND company_id=$2 FOR UPDATE',[b.identity,a.company]);
    if (!target.rowCount) throw new HttpError(404,'ไม่พบบัญชีในบริษัทนี้');
    await c.query('UPDATE memberships SET can_review=$1,can_approve=$2 WHERE identity=$3 AND company_id=$4',[b.canReview,b.canApprove,b.identity,a.company]);
    await c.query('INSERT INTO membership_permission_events(company_id,identity,actor,reason,old_permissions,new_permissions) VALUES($1,$2,$3,$4,$5,$6)',[a.company,b.identity,a.id,b.reason,JSON.stringify(target.rows[0]),JSON.stringify({can_review:b.canReview,can_approve:b.canApprove})]);
    await c.query('COMMIT');
  } catch(e) { await c.query('ROLLBACK');throw e; } finally { c.release(); }
}
