// Run as a dedicated Railway worker, never inside a Vercel request/build.
import nextEnv from '@next/env';
import { register } from 'node:module';
nextEnv.loadEnvConfig(process.cwd());
register('./server-cli-loader.mjs',import.meta.url);
const { db } = await import('../lib/db');
const { submit } = await import('../lib/receipts');
const { verifyRuntimeTarget } = await import('../lib/staging');
const { submissionEnabled } = await import('../lib/flowaccount/config');
if (process.env.VERCEL || process.env.CK_SUBMISSION_WORKER !== 'true') throw Error('dedicated_worker_required');
await verifyRuntimeTarget(db());
console.log('Verified CK Recycle worker target; Production submission ' + (submissionEnabled() ? 'enabled' : 'disabled'));
let stopping = false;
process.on('SIGTERM',()=>{stopping=true;});
process.on('SIGINT',()=>{stopping=true;});
while (!stopping) {
  if (!submissionEnabled()) { await new Promise(r=>setTimeout(r,3000)); continue; }
  const c = await db().connect();
  let job;
  try {
    await c.query('BEGIN');
    // A crashed worker is never automatically retried, even if it died before POST.
    await c.query("UPDATE submission_jobs SET status='unknown',error_code='worker_interrupted_do_not_retry' WHERE status='running' AND started_at<now()-interval '30 minutes' AND company_id=$1",[process.env.APP_COMPANY_ID]);
    const r = await c.query("SELECT * FROM submission_jobs WHERE status='queued' AND company_id=$1 AND environment=$2 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1",[process.env.APP_COMPANY_ID,process.env.FLOW_ENVIRONMENT]);
    job = r.rows[0];
    if (job) await c.query("UPDATE submission_jobs SET status='running',started_at=now() WHERE id=$1",[job.id]);
    await c.query('COMMIT');
  } catch(e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  if (!job) { await new Promise(r=>setTimeout(r,1500)); continue; }
  try {
    if (new Date(job.created_at).getTime() < Date.now()-8*3600000) throw Error('queued_session_expired');
    if (job.auth_expires_at && new Date(job.auth_expires_at).getTime() <= Date.now()) throw Error('queued_session_expired');
    if (job.session_version !== null) {
      const account = await db().query('SELECT session_version FROM password_accounts WHERE identity=$1 AND company_id=$2',[job.requested_by,job.company_id]);
      if (account.rows[0]?.session_version !== job.session_version) throw Error('session_revoked');
    }
    const result=await submit({id:job.requested_by,company:job.company_id,role:'sender',authExpiresAt:job.auth_expires_at},job.document_id,job.draft_version,job.environment,true);
    await db().query("UPDATE submission_jobs SET status=$2,finished_at=now() WHERE id=$1",[job.id,result.status==='unknown' ? 'unknown' : 'finished']);
  } catch {
    await db().query("UPDATE submission_jobs SET status=CASE WHEN EXISTS(SELECT 1 FROM submission_attempts WHERE document_id=$2) THEN 'unknown' ELSE 'blocked' END,finished_at=now(),error_code='inspect_audit_do_not_retry' WHERE id=$1",[job.id,job.document_id]);
    console.error('Submission job blocked; inspect document audit. No POST retry.');
  }
}
await db().end();
