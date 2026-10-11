import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
const origin = "http://127.0.0.1:" + (process.env.CK_PORT || "3000");
async function login(request: APIRequestContext, user = "mock-user") {
  const c = await (await request.get("/api/auth/csrf")).json();
  const r = await request.post("/api/auth/callback/credentials", {
    form: { csrfToken: c.csrfToken, user, callbackUrl: origin, json: "true" },
  });
  expect(r.ok()).toBeTruthy();
}
const body = {
  supplierId: "101",
  buyer: "ผู้สั่งซื้อทดสอบ",
  date: "2026-10-08",
  reference: "E2E",
  notes: "",
  warehouse: "",
  po: "",
  vatMode: "exclusive",
  discount: "0",
  items: [{ productId: "201", quantity: "10", price: "8.50" }],
};
const post = (request: APIRequestContext, path: string, data: unknown) =>
  request.post(path, { data, headers: { Origin: origin } });
test("API requires authentication and active membership", async ({
  request,
}) => {
  expect((await request.get("/api/receipts")).status()).toBe(401);
  expect((await request.get("/api/masters")).status()).toBe(401);
  await login(request, "mock-disabled");
  expect((await request.get("/api/receipts")).status()).toBe(403);
  expect((await request.get("/api/masters")).status()).toBe(403);
});
test("editor cannot submit; origin/schema/version/unknown ownership checks", async ({
  request,
}) => {
  await login(request, "mock-editor");
  const d = await (await post(request, "/api/receipts", body)).json();
  expect(d.id).toBeTruthy();
  expect(
    (
      await post(request, `/api/receipts/${d.id}/submit`, {
        version: d.version,
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.post("/api/receipts", {
        data: body,
        headers: { Origin: "https://attacker.invalid" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await post(request, "/api/receipts", {
        ...body,
        items: [{ productId: "201", quantity: "0", price: "1" }],
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.put("/api/receipts/" + d.id, {
        data: { draft: body, version: 999 },
        headers: { Origin: origin },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await request.get("/api/receipts/99999999-9999-4999-8999-999999999999")
    ).status(),
  ).toBe(404);
});
test("two simultaneous submissions create at most one result and block retry", async ({
  request,
}) => {
  await login(request);
  const d = await (await post(request, "/api/receipts", body)).json();
  const responses = await Promise.all([
    post(request, `/api/receipts/${d.id}/submit`, { version: d.version }),
    post(request, `/api/receipts/${d.id}/submit`, { version: d.version }),
  ]);
  expect(responses.map((r) => r.status()).sort()).toEqual([200, 409]);
  const saved = await (await request.get("/api/receipts/" + d.id)).json();
  expect(saved.status).toBe(
    process.env.MOCK_SCENARIO === "timeout" ? "unknown" : "synced",
  );
  if (saved.status === "synced") {
    expect(saved.flow_id).toMatch(/^mock-/);
    expect(saved.flow_number).toMatch(/^MOCK-/);
  }
  expect(
    (
      await post(request, `/api/receipts/${d.id}/submit`, {
        version: saved.version,
      })
    ).status(),
  ).toBe(409);
  const h = await (await request.get(`/api/receipts/${d.id}/history`)).json();
  expect(
    h.filter((e: { action: string }) => e.action === "submitting"),
  ).toHaveLength(1);
});
test("mobile/tablet draft persists after reload, decimal total, review and submit", async ({
  page,
}) => {
  await login(page.request);
  await page.goto("/");
  await page.getByRole("button", { name: "＋ สร้างใบรับสินค้า" }).click();
  await page.getByLabel("ผู้จำหน่าย", { exact: true }).selectOption("101");
  await page
    .getByLabel("ผู้สั่งซื้อ", { exact: true })
    .fill("คุณทดสอบ " + test.info().project.name);
  await page
    .getByLabel("เลขอ้างอิง", { exact: true })
    .fill("UI-" + test.info().project.name);
  await page.getByRole("button", { name: /กระดาษรีไซเคิล ＋/ }).click();
  await page.getByLabel("จำนวนรับ 1", { exact: true }).fill("10");
  await page.getByRole("button", { name: "เก็บร่าง", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "บันทึกบนเซิร์ฟเวอร์แล้ว",
  );
  await page.reload();
  await page
    .getByRole("button")
    .filter({ hasText: "UI-" + test.info().project.name })
    .click();
  await expect(page.getByLabel("ผู้สั่งซื้อ", { exact: true })).toHaveValue(
    "คุณทดสอบ " + test.info().project.name,
  );
  await expect(page.getByLabel("จำนวนรับ 1", { exact: true })).toHaveValue(
    "10",
  );
  await expect(page.locator(".total b")).toHaveText("90.95 ฿");
  await page.getByLabel("จำนวนรับ 1", { exact: true }).fill("12");
  await page.getByText("ภาษี ส่วนลด และข้อมูลเพิ่มเติม", { exact: true }).click();
  await page.getByLabel("ส่วนลดทั้งเอกสาร (บาท)", { exact: true }).fill("5");
  await page.getByRole("button", { name: "เก็บร่าง", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("บันทึกบนเซิร์ฟเวอร์แล้ว");
  await page.context().clearCookies();
  await login(page.request);
  await page.reload();
  await page.getByRole("button").filter({ hasText: "UI-" + test.info().project.name }).click();
  await expect(page.getByLabel("จำนวนรับ 1", { exact: true })).toHaveValue("12");
  await expect(page.locator(".total b")).toHaveText("103.79 ฿");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/" + test.info().project.name + "-draft.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "ตรวจสอบก่อนส่ง →" }).click();
  await expect(
    page.getByRole("heading", { name: "ตรวจสอบก่อนส่ง" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "ยืนยันส่ง (จำลอง)" }).click();
  await expect(page.getByRole("status")).toContainText(
    process.env.MOCK_SCENARIO === "timeout" ? "รอตรวจสอบ" : "สร้างเอกสารแล้ว",
  );
});
test("cross-company document is hidden and interrupted submission becomes unknown", async ({
  request,
}) => {
  await login(request);
  expect(
    (
      await request.get("/api/receipts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
    ).status(),
  ).toBe(404);
  const id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const r = await (await request.get("/api/receipts/" + id)).json();
  expect(r.status).toBe("unknown");
  expect(
    (
      await post(request, "/api/receipts/" + id + "/submit", {
        version: r.version,
      })
    ).status(),
  ).toBe(409);
});

test("keyboard viewport simulation keeps quantity and footer above obstruction", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let visibleHeight = window.innerHeight;
    const viewport = new EventTarget();
    Object.defineProperties(viewport, {
      height: { get: () => visibleHeight },
      offsetTop: { value: 0 },
    });
    Object.defineProperty(window, "visualViewport", {
      value: viewport,
      configurable: true,
    });
    (
      window as unknown as { setKeyboard: (open: boolean) => void }
    ).setKeyboard = (open) => {
      visibleHeight = window.innerHeight - (open ? 300 : 0);
      viewport.dispatchEvent(new Event("resize"));
    };
  });
  await login(page.request);
  await page.goto("/");
  await page.getByRole("button", { name: "＋ สร้างใบรับสินค้า" }).click();
  await page.getByRole("button", { name: /กระดาษรีไซเคิล ＋/ }).click();
  await page.getByLabel("จำนวนรับ 1", { exact: true }).focus();
  await page.evaluate(() =>
    (window as unknown as { setKeyboard: (open: boolean) => void }).setKeyboard(
      true,
    ),
  );
  await expect
    .poll(() =>
      page.evaluate(() => {
        const footer = document
          .querySelector(".bottom")!
          .getBoundingClientRect();
        const input = (
          document.activeElement as HTMLElement
        ).getBoundingClientRect();
        return (
          footer.bottom <= window.visualViewport!.height + 1 &&
          input.bottom < footer.top &&
          input.top >= 0
        );
      }),
    )
    .toBeTruthy();
  await page.evaluate(() =>
    (window as unknown as { setKeyboard: (open: boolean) => void }).setKeyboard(
      false,
    ),
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.style.getPropertyValue("--keyboard-inset"),
      ),
    )
    .toBe("0px");
});
