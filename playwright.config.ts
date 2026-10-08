import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  timeout: 60000,
  use: { baseURL: "http://127.0.0.1:3000" },
  webServer: {
    command: "npm run dev:mock",
    env: { CK_E2E: "true" },
    url: "http://127.0.0.1:3000",
    reuseExistingServer: false,
  },
  projects: [
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
    { name: "tablet", use: { viewport: { width: 1024, height: 768 } } },
  ],
});
