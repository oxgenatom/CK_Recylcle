import { defineConfig } from "@playwright/test";
const origin = "http://127.0.0.1:" + (process.env.CK_PORT || "3000");
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  timeout: 60000,
  use: { baseURL: origin },
  webServer: {
    command: "npm run dev:mock",
    env: { CK_E2E: "true" },
    url: origin,
    reuseExistingServer: false,
  },
  projects: [
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
    { name: "tablet", use: { viewport: { width: 1024, height: 768 } } },
  ],
});
