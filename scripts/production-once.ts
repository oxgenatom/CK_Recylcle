import nextEnv from "@next/env";
import { Pool } from "pg";
import { readFile, writeFile } from "node:fs/promises";
import { dbConfig } from "../lib/db-config";
import { verifyStagingDatabase } from "../lib/staging";
import { PRODUCTION_BASE, submissionEnabled } from "../lib/flowaccount/config";
import { reviewHash } from "../lib/flowaccount/production-approval";
function retired(): void { throw Error("legacy_one_shot_retired_grant_consumed_do_not_reuse"); }
retired();
nextEnv.loadEnvConfig(process.cwd(), true);
Object.assign(process.env, { FLOW_MODE: "live", FLOW_ENVIRONMENT: "production", FLOW_BASE_URL: PRODUCTION_BASE, FLOW_PRODUCTION_READ_APPROVED: "true", FLOW_PRODUCTION_WRITE_APPROVED: "false", FLOW_SANDBOX_WRITE_APPROVED: "false" });
const id = "9b189b25-6d48-42ac-988f-8365f0fd8d55";
const approvedHash = "f8e6ba0dd4dc19705c337cd8fb49c5d6d65a4c3896250d4fe60d043eeaf8d868";
if (!process.argv.includes("--owner-approved-version-2")) throw Error("explicit_approval_required");
const pool = new Pool(dbConfig());
let serviceDb: { end(): Promise<void> } | undefined;
const journal: Record<string, unknown> = { draftId: id, approvedVersion: 2, approvedHash, environment: "production", startedAt: new Date().toISOString(), approval: "Owner explicitly authorized this exact draft version 2 once in chat" };
const persist = () => writeFile(".local/production-once-result.json", JSON.stringify(journal, null, 2));
try {
  await verifyStagingDatabase(pool);
  const review = JSON.parse(await readFile(".local/production-saved-review.json", "utf8"));
  if (review.draftId !== id || review.version !== 2 || review.reviewHash !== approvedHash) throw Error("approved_review_changed");
  const member = await pool.query("SELECT a.identity FROM password_accounts a JOIN memberships m ON m.identity=a.identity AND m.company_id=a.company_id WHERE a.company_id=$1 AND a.username='admin' AND m.active AND m.role='admin'", [process.env.APP_COMPANY_ID]);
  if (member.rowCount !== 1) throw Error("active_admin_required");
  const actor = { id: member.rows[0].identity, role: "admin" as const, company: process.env.APP_COMPANY_ID! };
  const receipts = await import("../lib/receipts");
  serviceDb = (await import("../lib/db")).db();
  const d = await receipts.read(actor, id);
  const prior = await pool.query("SELECT id FROM submission_attempts WHERE document_id=$1", [id]);
  if (prior.rowCount || d.flow_id || d.status !== "draft" || d.version !== 2 || reviewHash(d) !== approvedHash) throw Error("already_attempted_or_review_changed_do_not_send");
  journal.actor = actor.id;
  await persist();
  Object.assign(process.env, { FLOW_PRODUCTION_WRITE_APPROVED: "true", FLOW_PRODUCTION_DRAFT_ID: id, FLOW_PRODUCTION_DRAFT_VERSION: "2", FLOW_PRODUCTION_REVIEW_HASH: approvedHash });
  try { await receipts.submit(actor, id, 2, "production"); }
  catch (e) { journal.serviceError = e instanceof Error ? e.message : "submission_error_do_not_retry"; }
  finally { process.env.FLOW_PRODUCTION_WRITE_APPROVED = "false"; }
  const final = await receipts.read(actor, id);
  const attempts = await pool.query("SELECT id,status,flow_id,flow_number,error_code,started_at,finished_at FROM submission_attempts WHERE document_id=$1", [id]);
  const audit = await receipts.history(actor, id);
  Object.assign(journal, { status: final.status, version: final.version, flowId: final.flow_id, documentSerial: final.flow_number, attempts: attempts.rows, audit, writesEnabled: submissionEnabled(), finishedAt: new Date().toISOString() });
  await persist();
  console.log(JSON.stringify(journal));
} finally {
  process.env.FLOW_PRODUCTION_WRITE_APPROVED = "false";
  await serviceDb?.end(); await pool.end();
}
