import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const account = JSON.parse(await readFile(".local/staging-test-account.json", "utf8"));
const inclusive = process.argv.includes("--inclusive-1070");
const journal = JSON.parse(await readFile(inclusive ? ".local/sandbox-inclusive-uat-journal.json" : ".local/sandbox-uat-journal.json", "utf8"));
const origin = "http://127.0.0.1:3031";
const browser = await chromium.launch();
try {
  const context = await browser.newContext(); const page = await context.newPage();
  await page.goto(origin + "/login");
  await page.locator("input[name=username]").fill(account.username);
  await page.locator("input[name=password]").fill(account.password);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await page.waitForURL("**/account");
  const me = await (await context.request.get(origin + "/api/me")).json();
  assert.equal(me.catalogEnvironment, "sandbox"); assert.equal(me.role, "editor"); assert.equal(me.submissionEnabled, true);
  const denied = await context.request.post(origin + `/api/receipts/${journal.draftId}/submit`, { headers: { Origin: origin }, data: { version: 1, environment: "sandbox" } });
  assert.equal(denied.status(), 403);
  assert.equal((await context.request.get(origin + "/api/receipts/93e73f3d-2514-448f-9639-2af7193b046c")).status(), 404);
  await page.goto(origin);
  await page.getByRole("button").filter({ hasText: journal.documentSerial || "CK TEST SANDBOX 2026-10-11" }).first().click();
  for (const [name, width, height] of [["mobile", 390, 844], ["tablet", 1024, 768]] as const) {
    await page.setViewportSize({ width, height });
    assert.equal(await page.locator(".total b").innerText(), inclusive ? "1070.00 ฿" : "11.22 ฿");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: `.local/sandbox-${inclusive ? "inclusive" : "submit"}-${name}.png`, fullPage: true });
  }
  console.log("Real staging/Sandbox UI: mobile/tablet totals and layout passed; editor submit 403; Production draft read through Sandbox 404.");
} finally { await browser.close(); }
