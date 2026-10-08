import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { HttpError } from "./auth";
import {
  draftSchema,
  type Actor,
  type Receipt,
  type Snapshot,
  type Supplier,
  type Product,
} from "./model";
import { calculate } from "./money";
import {
  catalog,
  mode,
  preparePurchase,
  createPurchase,
  fetchPurchase,
} from "./flowaccount/client";
import { payload } from "./flowaccount/core";
export async function masters(a: Actor, refresh = false) {
  const q = await db().query(
    "SELECT data,synced_at FROM master_cache WHERE company_id=$1 AND mode=$2 AND kind=$3",
    [a.company, mode(), "catalog"],
  );
  if (q.rows.length && !refresh)
    return { ...q.rows[0].data, syncedAt: q.rows[0].synced_at };
  const data = await catalog();
  const r = await db().query(
    "INSERT INTO master_cache(company_id,mode,kind,data) VALUES($1,$2,$3,$4) ON CONFLICT(company_id,mode,kind) DO UPDATE SET data=$4,synced_at=now() RETURNING synced_at",
    [a.company, mode(), "catalog", JSON.stringify(data)],
  );
  return { ...data, syncedAt: r.rows[0].synced_at };
}
async function snapshot(a: Actor, raw: unknown): Promise<Snapshot> {
  const d = draftSchema.parse(raw);
  const m = await masters(a);
  const supplier = (m.suppliers as Supplier[]).find(
    (s) => s.id === d.supplierId,
  );
  if (!supplier) throw new HttpError(400, "ไม่พบผู้จำหน่าย กรุณาอัปเดตข้อมูล");
  return {
    ...d,
    supplier,
    items: d.items.map((i) => {
      const product = (m.products as Product[]).find(
        (p) => p.id === i.productId,
      );
      if (!product) throw new HttpError(400, "ไม่พบสินค้า/หน่วย");
      return { ...i, product };
    }),
  };
}
export async function read(a: Actor, id: string): Promise<Receipt> {
  z.uuid().parse(id);
  await recover(a, id);
  const r = await db().query(
    "SELECT * FROM receiving_documents WHERE id=$1 AND company_id=$2 AND mode=$3",
    [id, a.company, mode()],
  );
  if (!r.rows.length) throw new HttpError(404, "ไม่พบเอกสาร");
  return r.rows[0];
}
export async function recover(a: Actor, id?: string) {
  const c = await db().connect();
  try {
    await c.query("BEGIN");
    const r = await c.query(
      "UPDATE receiving_documents SET status='unknown',version=version+1,updated_at=now() WHERE company_id=$1 AND mode=$2 AND status='submitting' AND updated_at<now()-interval '2 minutes' AND ($3::uuid IS NULL OR id=$3) RETURNING id",
      [a.company, mode(), id || null],
    );
    for (const d of r.rows) {
      await c.query(
        "UPDATE submission_attempts SET status='unknown',finished_at=now(),error_code='stale_submission' WHERE document_id=$1 AND status='submitting'",
        [d.id],
      );
      await c.query(
        "INSERT INTO audit_events(document_id,actor,action) VALUES($1,$2,'stale_unknown')",
        [d.id, a.id],
      );
    }
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export async function list(a: Actor, q: string, status: string) {
  await recover(a);
  return (
    await db().query(
      "SELECT * FROM receiving_documents WHERE company_id=$1 AND mode=$2 AND ($3='' OR body->>'buyer' ILIKE $3 OR body->>'reference' ILIKE $3 OR body->'supplier'->>'name' ILIKE $3 OR flow_number ILIKE $3) AND ($4='' OR status=$4) ORDER BY updated_at DESC LIMIT 100",
      [a.company, mode(), q ? "%" + q + "%" : "", status],
    )
  ).rows;
}
export async function save(
  a: Actor,
  raw: unknown,
  id?: string,
  version?: number,
) {
  const b = await snapshot(a, raw);
  const t = calculate(b);
  if (Number(t.total) > 999999999999)
    throw new HttpError(400, "ยอดสูงเกินขอบเขต");
  const c = await db().connect();
  try {
    await c.query("BEGIN");
    let r;
    if (id) {
      z.uuid().parse(id);
      r = await c.query(
        "UPDATE receiving_documents SET body=$1,totals=$2,subtotal=$3,vat=$4,total=$5,version=version+1,status='draft',updated_by=$6,updated_at=now() WHERE id=$7 AND company_id=$8 AND mode=$9 AND version=$10 AND status IN ('draft','failed') RETURNING *",
        [
          JSON.stringify(b),
          JSON.stringify(t),
          t.subtotal,
          t.vat,
          t.total,
          a.id,
          id,
          a.company,
          mode(),
          version,
        ],
      );
    } else {
      r = await c.query(
        "INSERT INTO receiving_documents(id,company_id,body,totals,subtotal,vat,total,created_by,updated_by,mode) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8,$9) RETURNING *",
        [
          randomUUID(),
          a.company,
          JSON.stringify(b),
          JSON.stringify(t),
          t.subtotal,
          t.vat,
          t.total,
          a.id,
          mode(),
        ],
      );
    }
    if (!r.rowCount)
      throw new HttpError(
        409,
        "เอกสารเปลี่ยนแล้วหรือแก้ไขไม่ได้ กรุณาเปิดใหม่",
      );
    await c.query(
      "INSERT INTO audit_events(document_id,actor,action) VALUES($1,$2,'saved')",
      [r.rows[0].id, a.id],
    );
    await c.query("COMMIT");
    return r.rows[0] as Receipt;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export async function submit(a: Actor, id: string, version: number) {
  if (a.role === "editor") throw new HttpError(403, "ไม่มีสิทธิ์ส่งเอกสาร");
  const d = await read(a, id);
  if (d.status !== "draft" && d.status !== "failed")
    throw new HttpError(409, "สถานะนี้ส่งซ้ำไม่ได้");
  if (d.version !== version)
    throw new HttpError(409, "เอกสารเปลี่ยนแล้ว กรุณาเปิดใหม่");
  if (mode() === "live") {
    // Until UAT confirms inclusive VAT, discounts and mixed taxes, fail closed for those combinations.
    if (
      d.body.vatMode !== "exclusive" ||
      Number(d.body.discount) !== 0 ||
      d.body.warehouse ||
      d.body.po
    )
      throw new HttpError(
        422,
        "Live รุ่นนี้รองรับ VAT 7% ไม่รวมภาษี ไม่มีส่วนลด คลัง หรือ PO เท่านั้น รอ UAT เพิ่มเติม",
      );
    if (d.body.items.some((i) => i.product.vatType !== 3))
      throw new HttpError(422, "ต้องยืนยันประเภท VAT สินค้าก่อนส่ง");
    const fresh = await masters(a, true);
    if (
      !(fresh.suppliers as Supplier[]).some((s) => s.id === d.body.supplierId)
    )
      throw new HttpError(422, "ผู้จำหน่ายถูกลบ กรุณาตรวจสอบ");
    if (d.body.supplier.taxId && !/^\d{13}$/.test(d.body.supplier.taxId))
      throw new HttpError(422, "เลขภาษีผู้จำหน่ายต้องมี 13 หลัก");
    if (
      d.body.items.some(
        (i) =>
          i.product.unit.length > 10 ||
          !Number.isSafeInteger(Number(i.product.id)),
      )
    )
      throw new HttpError(422, "หน่วยหรือรหัสสินค้าไม่ตรง schema FlowAccount");
    for (const item of d.body.items) {
      const p = (fresh.products as Product[]).find(
        (p) => p.id === item.productId,
      );
      if (
        !p ||
        p.unit !== item.product.unit ||
        p.unitId !== item.product.unitId ||
        p.masterId !== item.product.masterId ||
        p.type !== item.product.type ||
        p.vatType !== item.product.vatType
      )
        throw new HttpError(422, "ข้อมูลสินค้าเปลี่ยน กรุณาบันทึกใหม่");
    }
  }
  const body = payload(d.body, id);
  const access = await preparePurchase();
  const attempt = randomUUID();
  const hash = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  const c = await db().connect();
  try {
    await c.query("BEGIN");
    const r = await c.query(
      "UPDATE receiving_documents SET status='submitting',version=version+1,updated_by=$1,updated_at=now() WHERE id=$2 AND company_id=$3 AND mode=$4 AND version=$5 AND status IN ('draft','failed') RETURNING id",
      [a.id, id, a.company, mode(), version],
    );
    if (!r.rowCount) throw new HttpError(409, "เอกสารถูกส่งหรือเปลี่ยนแล้ว");
    await c.query(
      "INSERT INTO submission_attempts(id,document_id,status,request_hash) VALUES($1,$2,'submitting',$3)",
      [attempt, id, hash],
    );
    await c.query(
      "INSERT INTO audit_events(document_id,actor,action,detail) VALUES($1,$2,'submitting',$3)",
      [id, a.id, JSON.stringify({ attempt })],
    );
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
  let result: {
    kind: "synced" | "failed" | "unknown";
    id?: string;
    number?: string;
    code?: string;
  };
  try {
    result = await createPurchase(body, access);
  } catch {
    result = { kind: "unknown", code: "verify_before_retry" };
  }
  const f = await db().connect();
  try {
    await f.query("BEGIN");
    await f.query(
      "UPDATE receiving_documents SET status=$1,flow_id=$2,flow_number=$3,version=version+1,updated_at=now() WHERE id=$4 AND company_id=$5 AND mode=$6 AND status IN ('submitting','unknown')",
      [
        result.kind,
        result.id || null,
        result.number || null,
        id,
        a.company,
        mode(),
      ],
    );
    await f.query(
      "UPDATE submission_attempts SET status=$1,finished_at=now(),error_code=$2,flow_id=$3,flow_number=$4 WHERE id=$5",
      [
        result.kind,
        result.code || null,
        result.id || null,
        result.number || null,
        attempt,
      ],
    );
    await f.query(
      "INSERT INTO audit_events(document_id,actor,action,detail) VALUES($1,$2,$3,$4)",
      [id, a.id, result.kind, JSON.stringify({ attempt, code: result.code })],
    );
    await f.query("COMMIT");
  } catch (e) {
    await f.query("ROLLBACK");
    throw new HttpError(503, "บันทึกผลไม่ได้ ห้ามส่งซ้ำ ให้ผู้ดูแลตรวจสอบ");
  } finally {
    f.release();
  }
  return read(a, id);
}
export async function history(a: Actor, id: string) {
  await read(a, id);
  return (
    await db().query(
      "SELECT actor,action,detail,created_at FROM audit_events WHERE document_id=$1 ORDER BY id",
      [id],
    )
  ).rows;
}
export async function reconcile(a: Actor, id: string, flowId: string) {
  if (a.role !== "admin") throw new HttpError(403, "เฉพาะผู้ดูแล");
  const d = await read(a, id);
  if (d.status !== "unknown")
    throw new HttpError(409, "ตรวจสอบได้เฉพาะ unknown");
  z.string().regex(/^\d+$/).parse(flowId);
  const raw = await fetchPurchase(flowId);
  const data = raw.data;
  if (
    raw.status !== true ||
    typeof data?.documentSerial !== "string" ||
    !data.documentSerial.trim() ||
    String(data?.contactId) !== d.body.supplierId ||
    String(data?.publishedOn).slice(0, 10) !== d.body.date ||
    String(data?.documentId) !== flowId ||
    data?.externalDocumentId !== "ck-" + id ||
    Number(data?.grandTotal) !== Number(d.totals.total)
  )
    throw new HttpError(422, "เอกสารไม่ตรง กรุณาตรวจสอบใน FlowAccount");
  const c = await db().connect();
  try {
    await c.query("BEGIN");
    const r = await c.query(
      "UPDATE receiving_documents SET status='synced',flow_id=$1,flow_number=$2,version=version+1,updated_at=now(),updated_by=$3 WHERE id=$4 AND company_id=$5 AND mode=$6 AND status='unknown' RETURNING id",
      [flowId, data.documentSerial, a.id, id, a.company, mode()],
    );
    if (!r.rowCount) throw new HttpError(409, "สถานะเปลี่ยนแล้ว");
    await c.query(
      "UPDATE submission_attempts SET status='synced',flow_id=$1,flow_number=$2,finished_at=now() WHERE document_id=$3 AND status='unknown'",
      [flowId, data.documentSerial, id],
    );
    await c.query(
      "INSERT INTO audit_events(document_id,actor,action,detail) VALUES($1,$2,'reconciled',$3)",
      [id, a.id, JSON.stringify({ flowId })],
    );
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
  return read(a, id);
}
