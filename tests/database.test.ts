import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
test("migration enforces unique active submission and retains decimal drafts", async () => {
  const db = await PGlite.create();
  try {
    await db.exec(await readFile("migrations/001_initial.sql", "utf8"));
    await db.exec("INSERT INTO companies VALUES('a','A'),('b','B')");
    const id = "11111111-1111-4111-8111-111111111111";
    await db.query(
      "INSERT INTO receiving_documents(id,company_id,body,totals,subtotal,vat,total,mode,created_by,updated_by) VALUES($1,'a',$2,$3,0.30,0.02,0.32,'mock','user','user')",
      [
        id,
        JSON.stringify({
          buyer: "ผู้สั่งซื้อ",
          items: [{ quantity: "0.3", price: "1" }],
        }),
        "{}",
      ],
    );
    const saved = await db.query<{ body: { buyer: string }; total: string }>(
      "SELECT body,total::text FROM receiving_documents WHERE id=$1",
      [id],
    );
    assert.equal(saved.rows[0].body.buyer, "ผู้สั่งซื้อ");
    assert.equal(saved.rows[0].total, "0.32");
    assert.equal(
      (
        await db.query(
          "SELECT id FROM receiving_documents WHERE id=$1 AND company_id='b'",
          [id],
        )
      ).rows.length,
      0,
    );
    await db.query(
      "INSERT INTO submission_attempts(id,document_id,status,request_hash) VALUES($1,$2,'submitting','hash')",
      ["22222222-2222-4222-8222-222222222222", id],
    );
    await assert.rejects(
      db.query(
        "INSERT INTO submission_attempts(id,document_id,status,request_hash) VALUES($1,$2,'submitting','hash')",
        ["33333333-3333-4333-8333-333333333333", id],
      ),
    );
  } finally {
    await db.close();
  }
});
