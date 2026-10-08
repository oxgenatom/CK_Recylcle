import nextEnv from "@next/env";
import { mkdir, writeFile } from "node:fs/promises";
import { sandboxConfig, SANDBOX_BASE } from "../lib/flowaccount/config";
import { SandboxTransport } from "../lib/flowaccount/transport";
import { allPages, mapContacts, mapProducts } from "../lib/flowaccount/core";
nextEnv.loadEnvConfig(process.cwd(), true);
const report: {
  checkedAt: string;
  baseUrl: string;
  status: string;
  tokenVerified: boolean;
  suppliers?: number;
  productUnits?: number;
  pages?: number;
  error?: string;
} = {
  checkedAt: new Date().toISOString(),
  baseUrl: SANDBOX_BASE,
  status: "blocked",
  tokenVerified: false,
};
try {
  const c = sandboxConfig({ ...process.env, FLOW_API_APPROVED: "true" });
  let calls: number[] = [];
  let pages = 0;
  const s = new SandboxTransport({
    ...c,
    beforeRequest: async () => {
      const now = Date.now();
      calls = calls.filter((t) => t > now - 60000);
      if (calls.length >= 18)
        await new Promise((r) =>
          setTimeout(r, Math.max(1, calls[0] + 60010 - now)),
        );
      calls.push(Date.now());
    },
  });
  await s.token();
  report.tokenVerified = true;
  const contacts = await allPages(async (p) => {
    pages++;
    return s.get("/contacts?currentPage=" + p + "&pageSize=100");
  });
  const products = await allPages(async (p) => {
    pages++;
    return s.get("/product-masters?currentPage=" + p + "&pageSize=100");
  });
  report.suppliers = mapContacts(contacts).length;
  report.productUnits = mapProducts(products).length;
  report.pages = pages;
  report.status = "passed";
  console.log(
    "Sandbox token and GET catalog verified. No purchase document created.",
  );
} catch (e) {
  report.error =
    e instanceof Error &&
    /^(sandbox_|invalid_page|incomplete_pagination|pagination_limit)/.test(
      e.message,
    )
      ? e.message
      : "sandbox_connection_failed";
  console.error("Sandbox check blocked/failed:", report.error);
  process.exitCode = 1;
} finally {
  await mkdir(".local", { recursive: true });
  await writeFile(".local/sandbox-check.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
