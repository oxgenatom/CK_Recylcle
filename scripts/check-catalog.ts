import nextEnv from "@next/env";
import { catalogConfig, PRODUCTION_BASE, SANDBOX_BASE } from "../lib/flowaccount/config";
import { CatalogTransport } from "../lib/flowaccount/transport";
import { allPages, mapContacts, mapProducts } from "../lib/flowaccount/core";
import { catalogErrorMessage } from "../lib/flowaccount/errors";
nextEnv.loadEnvConfig(process.cwd(), true);
// Explicit command selection, matching URL still required. Never writes business data to disk.
const production = process.argv.includes("--production");
try {
  const config = catalogConfig({
    ...process.env,
    FLOW_ENVIRONMENT: production ? "production" : "sandbox",
    FLOW_BASE_URL: production ? PRODUCTION_BASE : SANDBOX_BASE,
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
      supplierCount: suppliers.length,
      productMasterCount: products.length,
      productUnitCount: units.length,
      mapping:
        suppliers.length && units.length
          ? "verified_with_data"
          : "empty_catalog_requires_selection_uat",
      documentsCreated: 0,
    }),
  );
} catch (error) {
  const code =
    error instanceof Error &&
    /^(sandbox_auth_failed(?:_invalid_client|_invalid_scope|_unsupported_grant_type)?|sandbox_auth_invalid_response|sandbox_read_http_\d{3}|invalid_[a-z_]+|catalog_changed_retry|incomplete_pagination|pagination_limit|production_read_not_configured|sandbox_credentials_missing_or_placeholder)$/.test(
      error.message,
    )
      ? error.message
      : "connection_or_configuration_failed";
  console.error(
    JSON.stringify({
      environment: production ? "production" : "sandbox",
      status: "failed",
      code,
      message: catalogErrorMessage(error).replaceAll(
        "Sandbox",
        production ? "Production" : "Sandbox",
      ),
      documentsCreated: 0,
    }),
  );
  console.error(
    "Catalog check failed. Check selected environment, credentials, connection and response schema. No secrets or business records logged.",
  );
  process.exitCode = 1;
}
