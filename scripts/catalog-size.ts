import nextEnv from "@next/env";
import { catalogConfig, PRODUCTION_BASE } from "../lib/flowaccount/config";
import { CatalogTransport } from "../lib/flowaccount/transport";
nextEnv.loadEnvConfig(process.cwd(), true);
try {
  const transport = new CatalogTransport(
    catalogConfig({
      ...process.env,
      FLOW_ENVIRONMENT: "production",
      FLOW_BASE_URL: PRODUCTION_BASE,
      FLOW_PRODUCTION_READ_APPROVED: "true",
    }),
  );
  for (const kind of ["contacts", "product-masters"]) {
    const r = await transport.get(`/${kind}?currentPage=1&pageSize=100`);
    console.log(
      JSON.stringify({
        kind,
        total: r.data?.total,
        page: r.data?.currentPage,
        firstPageCount: r.data?.list?.length,
      }),
    );
  }
} catch {
  console.error("Read-only catalog size check failed; no upstream data logged");
  process.exitCode = 1;
}
