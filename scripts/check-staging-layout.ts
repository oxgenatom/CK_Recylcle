import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const account = JSON.parse(
  await readFile(".local/staging-test-account.json", "utf8"),
);
const evidence = JSON.parse(
  await readFile(".local/staging-ui-result.json", "utf8"),
);
assert.equal(evidence.catalogEnvironment, "production");
const origin = "http://127.0.0.1:" + (process.env.CK_PORT || "3030");
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto(origin + "/login");
  await page.locator("input[name=username]").fill(account.username);
  await page.locator("input[name=password]").fill(account.password);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await page.waitForURL("**/account");
  await page.goto(origin);
  await page
    .getByRole("button")
    .filter({ hasText: evidence.drafts[0].reference })
    .click();
  for (const [name, width, height] of [
    ["mobile", 390, 844],
    ["tablet", 1024, 768],
  ] as const) {
    await page.setViewportSize({ width, height });
    assert.equal(await page.locator(".total b").innerText(), "103.79 ฿");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: `.local/production-draft-${name}.png`,
      fullPage: true,
    });
  }
  const stale = await context.request.put(
    origin + `/api/receipts/${evidence.drafts[0].id}`,
    {
      headers: { Origin: origin },
      data: {
        draft: (
          await (
            await context.request.get(
              origin + `/api/receipts/${evidence.drafts[0].id}`,
            )
          ).json()
        ).body,
        version: 1,
      },
    },
  );
  assert.equal(stale.status(), 409);
  console.log(
    JSON.stringify({
      realDraftLayout: ["mobile", "tablet"],
      horizontalOverflow: false,
      staleVersionStatus: 409,
      draftsCreated: 0,
      flowDocumentsCreated: 0,
    }),
  );
} finally {
  await browser.close();
}
