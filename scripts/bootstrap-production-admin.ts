import { readFile,writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { register } from 'node:module';
register('./server-cli-loader.mjs',import.meta.url);
if (!process.argv.includes('--owner-approved-new-admin')) throw Error('explicit_new_admin_approval_required');
Object.assign(process.env,JSON.parse(await readFile('.local/production-db-config.json','utf8')));
const { db }=await import('../lib/db');
const { verifyRuntimeTarget }=await import('../lib/staging');
const { createAccount }=await import('../lib/accounts');
try {
  await verifyRuntimeTarget(db());
  const count=await db().query('SELECT count(*)::int AS n FROM password_accounts');
  if (count.rows[0].n!==0) throw Error('fresh_bootstrap_requires_no_accounts');
  const password=randomBytes(24).toString('base64url');
  const identity=await createAccount('ck-recycle-production',{username:'admin',displayName:'CK Recycle ผู้ดูแลระบบ',password,role:'admin'});
  await writeFile('.local/production-admin-initial-credentials.txt','Production URL: https://ck-recycle.vercel.app\nUsername: admin\nTemporary password: '+password+'\nMust change password on first login. reviewer=false approver=false; Production writes disabled.\n',{mode:0o600});
  await writeFile('.local/production-admin-qa.json',JSON.stringify({identity,username:'admin',password}),{mode:0o600});
  console.log('Fresh Production admin created; reviewer/approver=false; must change password. Credentials saved only in ignored local file. No staging account copied.');
} finally { await db().end(); }
