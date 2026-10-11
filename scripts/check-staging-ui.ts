// Real staging test: never creates FlowAccount catalog or purchase documents.
import nextEnv from "@next/env";
import { Pool } from "pg";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { expect } from "@playwright/test";
import { dbConfig } from "../lib/db-config";
import { verifyStagingDatabase } from "../lib/staging";
import { hashPassword } from "../lib/passwords";
nextEnv.loadEnvConfig(process.cwd());
const origin = "http://127.0.0.1:" + (process.env.CK_PORT || "3030");
const file = ".local/staging-test-account.json";
const pool = new Pool(dbConfig());
let credential: { username: string; password: string; identity: string };
try {
  await verifyStagingDatabase(pool);
  try {
    credential = JSON.parse(await readFile(file, "utf8"));
  } catch {
    credential = {
      username: "ck-test-" + Date.now(),
      password: randomBytes(24).toString("base64url"),
      identity: "password|" + randomUUID(),
    };
    await mkdir(".local", { recursive: true });
    // Save privately before insertion so a retry never resets a password.
    await writeFile(file, JSON.stringify(credential));
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query(
        "INSERT INTO profiles(identity,display_name) VALUES($1,'CK TEST staging editor')",
        [credential.identity],
      );
      await c.query(
        "INSERT INTO password_accounts(identity,company_id,username,display_name,password_hash,must_change) VALUES($1,$2,$3,'CK TEST staging editor',$4,false)",
        [
          credential.identity,
          process.env.APP_COMPANY_ID,
          credential.username,
          await hashPassword(credential.password),
        ],
      );
      await c.query(
        "INSERT INTO memberships(identity,company_id,role) VALUES($1,$2,'editor')",
        [credential.identity, process.env.APP_COMPANY_ID],
      );
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
} finally {
  await pool.end();
}
const browser = await chromium.launch();
const results: unknown[] = [];
let source = "";
const drafts: {
  id: string;
  reference: string;
  version: number;
  total: string;
}[] = [];
try {
  for (const [name, width, height] of [
    ["mobile", 390, 844],
    ["tablet", 1024, 768],
  ] as const) {
    const context = await browser.newContext({ viewport: { width, height } });
    assert.equal(
      (await context.request.get(origin + "/api/masters")).status(),
      401,
    );
    const page = await context.newPage();
    await page.goto(origin + "/login");
    await page.locator("input[name=username]").fill(credential.username);
    await page.locator("input[name=password]").fill(credential.password);
    await page
      .getByRole("button", { name: "เข้าสู่ระบบ", exact: true })
      .click();
    await page.waitForURL("**/account");
    await page.goto(origin);
    await page.getByRole("button", { name: "＋ สร้างใบรับสินค้า" }).waitFor();
    const me = await (await context.request.get(origin + "/api/me")).json();
    assert.equal(me.company, "ck-recycle-staging");
    assert.equal(me.role, "editor");
    assert.equal(me.mode, "live");
    assert.equal(me.catalogEnvironment, "production");
    source = me.catalogEnvironment;
    const response = await context.request.get(origin + "/api/masters");
    assert.equal(response.status(), 200);
    let masters = await response.json();
    let polls = 0;
    while (masters.loading) {
      if (++polls > 400) throw Error("Catalog sync acceptance timeout");
      if (polls % 10 === 1)
        console.log(
          JSON.stringify({ catalogSync: "pending", ...masters.progress }),
        );
      await new Promise((resolve) =>
        setTimeout(resolve, masters.retryAfterMs || 3500),
      );
      const next = await context.request.get(origin + "/api/masters");
      assert.equal(next.status(), 200);
      masters = await next.json();
    }
    await expect(
      page.getByRole("status").filter({ hasText: "กำลังโหลดผู้จำหน่าย" }),
    ).toHaveCount(0, { timeout: 30000 });
    await page.getByRole("button", { name: "＋ สร้างใบรับสินค้า" }).click();
    await page
      .getByLabel("ผู้สั่งซื้อ", { exact: true })
      .fill("CK TEST staging");
    await page.getByLabel("ค้นหาผู้จำหน่าย", { exact: true }).fill("CK TEST");
    await page.getByLabel("ค้นหาชื่อ / รหัสสินค้า").fill("CK TEST");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    if (!masters.suppliers.length || !masters.products.length) {
      await page
        .getByText("ไม่มีการใช้ข้อมูลจำลองแทน", { exact: false })
        .waitFor();
      const rejected = await context.request.post(origin + "/api/receipts", {
        headers: { Origin: origin },
        data: {
          supplierId: "CK-TEST-MISSING",
          buyer: "CK TEST",
          date: "2026-10-11",
          reference: "CK TEST blocked",
          notes: "",
          warehouse: "",
          po: "",
          vatMode: "exclusive",
          discount: "0",
          items: [
            { productId: "CK-TEST-MISSING", quantity: "1", price: "100" },
          ],
        },
      });
      assert.equal(rejected.status(), 400);
    } else {
      const reference = `CK TEST 2026-10-11 ${name} ${Date.now()}`;
      await page.getByLabel("ค้นหาผู้จำหน่าย", { exact: true }).fill("");
      await page
        .getByLabel("ผู้จำหน่าย", { exact: true })
        .selectOption(masters.suppliers[0].id);
      await page.getByLabel("ค้นหาชื่อ / รหัสสินค้า").fill("");
      await page.locator(".results button").first().click();
      await page.getByLabel("เลขอ้างอิง", { exact: true }).fill(reference);
      await page.getByLabel("จำนวนรับ 1", { exact: true }).fill("10");
      await page.getByLabel("ราคา 1", { exact: true }).fill("8.50");
      await page
        .getByText("ภาษี ส่วนลด และข้อมูลเพิ่มเติม", { exact: true })
        .click();
      await page
        .getByLabel("ส่วนลดทั้งเอกสาร (บาท)", { exact: true })
        .fill("5");
      await page.getByRole("button", { name: "เก็บร่าง", exact: true }).click();
      await page
        .getByRole("status")
        .filter({ hasText: "บันทึกบนเซิร์ฟเวอร์แล้ว" })
        .waitFor();
      await page.reload();
      await page.getByRole("button").filter({ hasText: reference }).click();
      assert.equal(await page.locator(".total b").innerText(), "85.60 ฿");
      await page.getByLabel("จำนวนรับ 1", { exact: true }).fill("12");
      await page.getByRole("button", { name: "เก็บร่าง", exact: true }).click();
      await page
        .getByRole("status")
        .filter({ hasText: "บันทึกบนเซิร์ฟเวอร์แล้ว" })
        .waitFor();
      await context.clearCookies();
      await page.goto(origin + "/login");
      await page.locator("input[name=username]").fill(credential.username);
      await page.locator("input[name=password]").fill(credential.password);
      await page
        .getByRole("button", { name: "เข้าสู่ระบบ", exact: true })
        .click();
      await page.waitForURL("**/account");
      await page.goto(origin);
      await page.getByRole("button").filter({ hasText: reference }).click();
      assert.equal(await page.locator(".total b").innerText(), "103.79 ฿");
      const records = await (
        await context.request.get(
          origin + "/api/receipts?q=" + encodeURIComponent(reference),
        )
      ).json();
      const saved = records.find(
        (r: { body: { reference: string } }) => r.body.reference === reference,
      );
      assert.equal(saved.totals.vat, "6.79");
      assert.equal(saved.created_by, credential.identity);
      assert.equal(saved.updated_by, credential.identity);
      assert.equal(saved.status, "draft");
      assert.equal(saved.body.catalogEnvironment, "production");
      assert.equal(saved.body.supplier.id, masters.suppliers[0].id);
      assert.equal(saved.body.items[0].product.id, masters.products[0].id);
      assert.equal(
        saved.body.items[0].product.masterId,
        masters.products[0].masterId,
      );
      assert.equal(
        saved.body.items[0].product.unitId,
        masters.products[0].unitId,
      );
      assert.equal(saved.body.items[0].product.unit, masters.products[0].unit);
      assert.ok(saved.updated_at);
      const conflict = await context.request.put(
        origin + `/api/receipts/${saved.id}`,
        {
          headers: { Origin: origin },
          data: { draft: saved.body, version: 1 },
        },
      );
      assert.equal(conflict.status(), 409);
      assert.equal(saved.version, 2);
      const audit = await (
        await context.request.get(origin + `/api/receipts/${saved.id}/history`)
      ).json();
      assert.equal(
        audit.filter((r: { action: string }) => r.action === "saved").length,
        2,
      );
      drafts.push({
        id: saved.id,
        reference,
        version: saved.version,
        total: saved.totals.total,
      });
    }
    assert.equal(
      (
        await context.request.get(
          origin + "/api/receipts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/history",
        )
      ).status(),
      404,
    );
    assert.equal(
      (
        await context.request.post(
          origin + "/api/receipts/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/submit",
          { headers: { Origin: origin }, data: { version: 1 } },
        )
      ).status(),
      403,
    );
    assert.equal(
      (await context.request.get(origin + "/api/accounts")).status(),
      403,
    );
    await page.reload();
    await page.getByRole("button", { name: "＋ สร้างใบรับสินค้า" }).waitFor();
    await page.screenshot({
      path: `.local/staging-${name}.png`,
      fullPage: true,
    });
    results.push({
      viewport: name,
      passwordLogin: "passed",
      permissions: "passed",
      refresh: "passed",
      horizontalOverflow: false,
      suppliers: masters.suppliers.length,
      products: masters.products.length,
      catalogEnvironment: source,
      draftTest:
        masters.suppliers.length && masters.products.length
          ? "passed"
          : "blocked_empty_sandbox",
    });
    await context.close();
  }
  await writeFile(
    ".local/staging-ui-result.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        catalogEnvironment: source,
        testAccount: credential.username,
        results,
        drafts,
        draftsCreated: drafts.length,
        flowDocumentsCreated: 0,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      testAccount: credential.username,
      results,
      drafts,
      draftsCreated: drafts.length,
      flowDocumentsCreated: 0,
    }),
  );
} finally {
  await browser.close();
}
