import nextEnv from "@next/env";
import { Pool } from "pg";
import { readFile, writeFile } from "node:fs/promises";
import { dbConfig } from "../lib/db-config";
import { verifyStagingDatabase } from "../lib/staging";
import { PRODUCTION_BASE, submissionEnabled } from "../lib/flowaccount/config";
import { reviewHash } from "../lib/flowaccount/production-approval";
nextEnv.loadEnvConfig(process.cwd(), true);
Object.assign(process.env, { FLOW_MODE: "live", FLOW_ENVIRONMENT: "production", FLOW_BASE_URL: PRODUCTION_BASE, FLOW_PRODUCTION_READ_APPROVED: "true", FLOW_PRODUCTION_WRITE_APPROVED: "false", FLOW_SANDBOX_WRITE_APPROVED: "false" });
if (submissionEnabled()) throw Error("writes_must_be_disabled");
const buyer = process.argv[2];
if (!buyer?.trim()) throw Error("buyer_required");
const pool = new Pool(dbConfig());
let serviceDb: { end(): Promise<void> } | undefined;
try {
  await verifyStagingDatabase(pool);
  const selection = JSON.parse(await readFile(".local/production-real-review.json", "utf8"));
  if (!selection.sandboxAcceptance?.readback?.verified || selection.total !== "1070.00") throw Error("acceptance_required");
  const member = await pool.query("SELECT a.identity FROM password_accounts a JOIN memberships m ON m.identity=a.identity AND m.company_id=a.company_id WHERE a.company_id=$1 AND a.username='admin' AND m.active AND m.role='admin'", [process.env.APP_COMPANY_ID]);
  if (member.rowCount !== 1) throw Error("admin_identity_required");
  const actor = { id: member.rows[0].identity, role: "admin" as const, company: process.env.APP_COMPANY_ID! };
  const receipts = await import("../lib/receipts");
  serviceDb = (await import("../lib/db")).db();
  let existing: { draftId: string; version: number; reviewHash: string } | undefined;
  try { existing = JSON.parse(await readFile(".local/production-saved-review.json", "utf8")); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  let draft = existing ? await receipts.read(actor, existing.draftId) : await receipts.save(actor, { supplierId: "67389684", buyer, date: "2026-10-11", reference: "", notes: "", warehouse: "", po: "", vatMode: "inclusive", discount: "0", items: [{ productId: "80632401", quantity: "1", price: "1070.00" }] });
  if (process.argv.includes("--update-reviewed")) {
    if (!existing || draft.id !== "9b189b25-6d48-42ac-988f-8365f0fd8d55" || draft.version !== existing.version || reviewHash(draft) !== existing.reviewHash || draft.status !== "draft") throw Error("review_changed_open_again");
    const prior = await pool.query("SELECT id FROM submission_attempts WHERE document_id=$1", [draft.id]);
    if (prior.rowCount || draft.flow_id || draft.flow_number) throw Error("submission_already_attempted");
    if (draft.body.buyer !== buyer || draft.body.date !== "2026-10-11") {
      draft = await receipts.save(actor, { ...draft.body, buyer, date: "2026-10-11" }, draft.id, draft.version);
      draft = await receipts.read(actor, draft.id);
    }
  }
  if (draft.body.buyer !== buyer || draft.status !== "draft" || draft.totals.total !== "1070.00" || draft.body.items[0].product.unit !== "PCS") throw Error("saved_review_mismatch");
  const audit = await pool.query("SELECT action FROM audit_events WHERE document_id=$1 AND actor=$2 AND action='saved'", [draft.id, actor.id]);
  const attempts = await pool.query("SELECT id FROM submission_attempts WHERE document_id=$1", [draft.id]);
  if (!audit.rowCount || attempts.rowCount || draft.flow_id || draft.flow_number) throw Error("draft_audit_or_no_submission_check_failed");
  const review = { draftId: draft.id, version: draft.version, reviewHash: reviewHash(draft), body: draft.body, totals: draft.totals, expectedStatus: "awaiting", creationApproved: false, writesEnabled: submissionEnabled() };
  await writeFile(".local/production-saved-review.json", JSON.stringify(review, null, 2));
  console.log(JSON.stringify(review));
} finally { await serviceDb?.end(); await pool.end(); }
