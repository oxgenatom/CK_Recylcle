import nextEnv from "@next/env";
import { catalogConfig } from "../lib/flowaccount/config";
import { CatalogTransport } from "../lib/flowaccount/transport";
import { allPages, mapContacts, mapProducts } from "../lib/flowaccount/core";
nextEnv.loadEnvConfig(process.cwd(), true);
// Explicit command selection, matching URL still required. Never writes business data to disk.
const production = process.argv.includes("--production");
try {
  const config = catalogConfig({
    ...process.env,
    FLOW_ENVIRONMENT: production ? "production" : "sandbox",
    FLOW_PRODUCTION_READ_APPROVED: production ? "true" : "false",
  });
  let calls: number[] = [];
  const transport = new CatalogTransport({
    ...config,
    beforeRequest: async () => {
      const now = Date.now();
      calls = calls.filter((t) => t > now - 60000);
      if (calls.length >= 18)
        await new Promise((resolve) =>
          setTimeout(resolve, Math.max(1, calls[0] + 60010 - now)),
        );
      calls.push(Date.now());
    },
  });
  await transport.token();
  const read = async (path: string) =>
    allPages(async (page) => {
      return transport.get(`${path}?currentPage=${page}&pageSize=100`);
    });
  const contacts = await read("/contacts");
  const products = await read("/product-masters");
  const suppliers = mapContacts(contacts);
  const units = mapProducts(products);
  console.log(
    JSON.stringify({
      environment: production ? "production" : "sandbox",
      token: "verified",
      pagination: "complete",
      mapping:
        suppliers.length && units.length
          ? "verified_with_data"
          : "empty_catalog_requires_selection_uat",
      documentsCreated: 0,
    }),
  );
} catch {
  console.error(
    "Catalog check failed. Check selected environment, credentials, connection and response schema. No secrets or business records logged.",
  );
  process.exitCode = 1;
}
