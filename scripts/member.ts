import { requireStagingTarget } from "../lib/phase2-config";
import { dbConfig } from "../lib/db-config";
import nextEnv from "@next/env";
import { Pool } from "pg";
nextEnv.loadEnvConfig(process.cwd());
const [identity, role = "editor"] = process.argv.slice(2);
if (
  !identity ||
  !["editor", "sender", "admin"].includes(role) ||
  !process.env.APP_COMPANY_ID
)
  throw new Error(
    "Usage: npm run db:member -- issuer|subject editor|sender|admin (APP_COMPANY_ID required)",
  );
requireStagingTarget(process.env);
const p = new Pool(dbConfig());
await p.query(
  "INSERT INTO companies(id,name) VALUES($1,$2) ON CONFLICT DO NOTHING",
  [process.env.APP_COMPANY_ID, "CK Recycle"],
);
await p.query(
  "INSERT INTO profiles(identity) VALUES($1) ON CONFLICT DO NOTHING",
  [identity],
);
await p.query(
  "INSERT INTO memberships(identity,company_id,role) VALUES($1,$2,$3) ON CONFLICT(identity,company_id) DO UPDATE SET role=$3,active=true",
  [identity, process.env.APP_COMPANY_ID, role],
);
await p.end();
console.log("Membership updated");
