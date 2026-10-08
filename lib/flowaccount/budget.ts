import "server-only";
import { db } from "../db";
import { HttpError } from "../auth";
// Shared across Vercel instances. Reserve before issuing HTTP. Never retry POST.
export async function reserve() {
  const c = await db().connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(724002)");
    const company = process.env.APP_COMPANY_ID;
    const limit = process.env.FLOW_BASE_URL?.endsWith("/test") ? 18 : 90;
    const r = await c.query(
      "SELECT count(*)::integer AS count FROM flow_request_log WHERE company_id=$1 AND requested_at>now()-interval '1 minute'",
      [company],
    );
    if (r.rows[0].count >= limit)
      throw new HttpError(
        429,
        "ถึงขีดจำกัด FlowAccount กรุณารออย่างน้อย 1 นาที",
      );
    await c.query(
      "DELETE FROM flow_request_log WHERE requested_at<now()-interval '5 minutes'",
    );
    await c.query("INSERT INTO flow_request_log(company_id) VALUES($1)", [
      company,
    ]);
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
