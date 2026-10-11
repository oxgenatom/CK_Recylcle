import { test, expect } from "@playwright/test";
const origin = "http://127.0.0.1:" + (process.env.CK_PORT || "3000");
test("catalog failure shows retry; empty search and multiple units remain usable", async ({
  page,
  context,
}) => {
  const csrf = await (await context.request.get("/api/auth/csrf")).json();
  await context.request.post("/api/auth/callback/credentials", {
    form: {
      csrfToken: csrf.csrfToken,
      user: "mock-user",
      callbackUrl: origin,
      json: "true",
    },
  });
  let fail = true;
  await page.route("**/api/masters", async (route) => {
    if (fail) {
      await route.fulfill({ status: 503, json: { error: "fixture outage" } });
    } else await route.continue();
  });
  await page.goto("/");
  await expect(
    page.getByText("fixture outage", { exact: false }),
  ).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "ลองใหม่", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "ลองใหม่", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "＋ สร้างใบรับสินค้า" }).click();
  await page
    .getByLabel("ค้นหาผู้จำหน่าย", { exact: true })
    .fill("NO-MATCH-FIXTURE");
  await expect(
    page.getByText("ไม่พบผู้จำหน่ายที่ตรงกับการค้นหา"),
  ).toBeVisible();
  await page.getByLabel("ค้นหาผู้จำหน่าย", { exact: true }).fill("รีไซเคิล");
  await page.getByLabel("ผู้จำหน่าย", { exact: true }).selectOption("101");
  await expect(
    page.getByText("สำนักงานใหญ่", { exact: false }).first(),
  ).toBeVisible();
  await page.getByLabel("ค้นหาชื่อ / รหัสสินค้า").fill("NO-MATCH-FIXTURE");
  await expect(page.getByText("ไม่พบสินค้าที่ตรงกับการค้นหา")).toBeVisible();
  await page.getByLabel("ค้นหาชื่อ / รหัสสินค้า").fill("PET-01");
  await expect(page.locator(".results button")).toHaveCount(2);
  await page.locator(".results button").nth(1).click();
  await expect(page.getByText("หน่วย: ถุง", { exact: true })).toBeVisible();
  await expect(page.getByLabel("ราคา 1", { exact: true })).toHaveValue(
    "122.50",
  );
  await page.getByLabel("ราคา 1", { exact: true }).fill("100");
  await expect(page.locator(".total b")).toHaveText("107.00 ฿");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
