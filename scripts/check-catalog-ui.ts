import { chromium } from "@playwright/test";
const origin = "http://127.0.0.1:" + (process.env.CK_PORT || "3002");
const browser = await chromium.launch();
let step = "start";
const check = (ok: unknown) => {
  if (!ok) throw new Error("check_failed");
};
try {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 1024, height: 768 },
  ]) {
    const context = await browser.newContext({ viewport });
    step = "unauthenticated_catalog";
    check(
      (await context.request.get(origin + "/api/masters")).status() === 401,
    );
    const csrf = await (
      await context.request.get(origin + "/api/auth/csrf")
    ).json();
    await context.request.post(origin + "/api/auth/callback/credentials", {
      form: {
        csrfToken: csrf.csrfToken,
        user: "catalog-user",
        callbackUrl: origin,
        json: "true",
      },
    });
    step = "live_submit_blocked";
    check(
      (
        await context.request.post(
          origin + "/api/receipts/00000000-0000-4000-8000-000000000000/submit",
          { data: { version: 1 }, headers: { Origin: origin } },
        )
      ).status() === 403,
    );
    step = "authenticated_real_catalog";
    const response = await context.request.get(origin + "/api/masters", {
      timeout: 180000,
    });
    step = "catalog_http_" + response.status();
    check(response.ok());
    check(response.headers()["cache-control"].includes("no-store"));
    const catalog = await response.json();
    console.log(
      "Real catalog HTTP/auth checks passed: unauthenticated 401, authenticated 200/no-store, live submit 403. Business records suppressed.",
    );
    step = "catalog_has_suppliers";
    check(catalog.suppliers.length);
    step = "catalog_has_products";
    check(catalog.products.length);
    step = "live_submit_blocked";
    check(
      (
        await context.request.post(
          origin + "/api/receipts/00000000-0000-4000-8000-000000000000/submit",
          { data: { version: 1 }, headers: { Origin: origin } },
        )
      ).status() === 403,
    );
    const page = await context.newPage();
    await page.goto(origin);
    await page.getByRole("button", { name: "＋ สร้างใบรับสินค้า" }).click();
    step = "supplier_fields";
    await page
      .getByLabel("ผู้จำหน่าย", { exact: true })
      .selectOption(catalog.suppliers[0].id);
    check(
      (await page.locator("aside .note").first().textContent())?.includes(
        catalog.suppliers[0].address,
      ),
    );
    await page.getByLabel("ผู้สั่งซื้อ", { exact: true }).fill("Local QA");
    await page.getByLabel("เลขอ้างอิง", { exact: true }).fill("Local QA");
    step = "product_unit_and_editable_price";
    await page
      .getByLabel("ค้นหาชื่อ / รหัสสินค้า")
      .fill(catalog.products[0].name);
    await page.locator(".results button").first().click();
    check(
      (await page.getByLabel("ราคา 1", { exact: true }).inputValue()) ===
        catalog.products[0].price,
    );
    await page.getByLabel("ราคา 1", { exact: true }).fill("10");
    check((await page.locator(".total b").textContent()) === "10.70 ฿");
    step = "empty_states_and_layout";
    await page.getByLabel("ค้นหาชื่อ / รหัสสินค้า").fill("NO-MATCH-QA-2f057");
    check(await page.getByText("ไม่พบสินค้าที่ตรงกับการค้นหา").isVisible());
    check(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    );
    check(
      (await page
        .getByRole("button", { name: "ยืนยันส่ง", exact: false })
        .count()) === 0,
    );
    await context.close();
  }
  console.log(
    "Real catalog UI passed: mobile/tablet, auth, supplier selection, product selection, editable price, totals, empty states, no live submission. No business records logged.",
  );
} catch {
  console.error(
    "Real catalog UI failed at: " +
      step +
      ". Details suppressed to protect business data.",
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
