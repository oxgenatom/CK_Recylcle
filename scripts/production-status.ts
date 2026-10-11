import nextEnv from "@next/env";
import { Pool } from "pg";
import { dbConfig } from "../lib/db-config";
import { verifyStagingDatabase } from "../lib/staging";
nextEnv.loadEnvConfig(process.cwd(), true);
const pool = new Pool(dbConfig());
try {
  await verifyStagingDatabase(pool);
  const draft = await pool.query("SELECT id,version,status,flow_id,flow_number FROM receiving_documents WHERE id=$1 AND company_id=$2", ["9b189b25-6d48-42ac-988f-8365f0fd8d55", process.env.APP_COMPANY_ID]);
  const requests = await pool.query("SELECT count(*)::int AS count,min(requested_at) AS earliest,max(requested_at) AS latest FROM flow_request_log WHERE company_id=$1 AND requested_at>now()-interval '5 minutes'", [process.env.APP_COMPANY_ID]);
  const attempts = await pool.query("SELECT id,status,flow_id,flow_number,error_code,started_at,finished_at FROM submission_attempts WHERE document_id=$1", ["9b189b25-6d48-42ac-988f-8365f0fd8d55"]);
  console.log(JSON.stringify({ draft: draft.rows, requests: requests.rows, attempts: attempts.rows }));
} finally { await pool.end(); }
