import nextEnv from "@next/env";
import { Pool } from "pg";
import { spawn } from "node:child_process";
import { dbConfig } from "../lib/db-config";
import { verifyStagingDatabase } from "../lib/staging";
import {
  catalogConfig,
  SANDBOX_BASE,
  PRODUCTION_BASE,
  submissionEnabled,
} from "../lib/flowaccount/config";
nextEnv.loadEnvConfig(process.cwd(), true);
const port = process.env.CK_PORT || "3020";
if (!/^\d+$/.test(port) || +port < 1024 || +port > 65535)
  throw Error("invalid_port");
const productionCatalog = process.argv.includes("--production-catalog");
const sandboxSend = process.argv.includes("--sandbox-send");
const productionOnce = process.argv.includes("--production-once");
if (productionOnce && (!productionCatalog || sandboxSend)) throw Error("production_once_requires_production_catalog");
if (productionCatalog && sandboxSend) throw Error("production_submission_blocked");
const catalogEnv = {
  ...process.env,
  FLOW_ENVIRONMENT: productionCatalog ? "production" : "sandbox",
  FLOW_BASE_URL: productionCatalog ? PRODUCTION_BASE : SANDBOX_BASE,
  FLOW_PRODUCTION_READ_APPROVED: productionCatalog ? "true" : "false",
  FLOW_SANDBOX_WRITE_APPROVED: sandboxSend ? "true" : "false",
  FLOW_PRODUCTION_WRITE_APPROVED: productionOnce ? process.env.FLOW_PRODUCTION_WRITE_APPROVED : "false",
};
catalogConfig(catalogEnv);
if (productionOnce && !submissionEnabled({ ...catalogEnv, FLOW_MODE: "live" })) throw Error("exact_production_review_approval_required");
const pool = new Pool(dbConfig());
try {
  await verifyStagingDatabase(pool);
} catch {
  console.error("CK Recycle staging verification failed; server not started");
  process.exitCode = 1;
} finally {
  await pool.end();
}
if (!process.exitCode) {
  console.log(
    `Verified CK Recycle staging; ${productionCatalog ? "Production" : "Sandbox"} catalog; ${productionOnce ? "Production exact-review one-shot grant configured" : sandboxSend ? "Sandbox submission enabled" : "FlowAccount document writes blocked"}`,
  );
  const child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      process.argv.includes("--production") ? "start" : "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      port,
    ],
    {
      stdio: "inherit",
      env: {
        ...catalogEnv,
        NEXTAUTH_URL: `http://127.0.0.1:${port}`,
        AUTH_MODE: "password",
        FLOW_MODE: "live",
        MOCK_LOGIN_ENABLED: "false",
        LOCAL_CATALOG_LOGIN_ENABLED: "false",
        LOCAL_SANDBOX_LOGIN_ENABLED: "false",
      },
    },
  );
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () => child.kill(signal));
}
