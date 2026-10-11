import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { db } from "./db";
import { HttpError } from "./http-error";
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
import { payload, externalDocumentId, verifyPurchaseReadback } from "./flowaccount/core";
import { submissionEnabled } from "./flowaccount/config";
import { submissionProblem } from "./flowaccount/submission-policy";
import { submissionHash } from "./review-policy";
import { reviewHash } from "./flowaccount/production-approval";
import { catalogPage } from "./flowaccount/client";
import {
  newCatalogProgress,
  advanceCatalog,
  type CatalogProgress,
} from "./flowaccount/catalog-pages";
const catalogKey = () =>
  mode() === "mock"
    ? "catalog"
    : "catalog:" + (process.env.FLOW_ENVIRONMENT || "sandbox");
const catalogEnvironment = () =>
  mode() === "mock" ? "mock" : process.env.FLOW_ENVIRONMENT || "sandbox";
export async function masters(a: Actor, refresh = false) {
  if (mode() === "live") return liveMasters(a, refresh);
  const q = await db().query(
    "SELECT data,synced_at FROM master_cache WHERE company_id=$1 AND mode=$2 AND kind=$3",
    [a.company, mode(), catalogKey()],
  );
  if (q.rows.length && !refresh)
    return { ...q.rows[0].data, syncedAt: q.rows[0].synced_at };
  const data = await catalog();
  const r = await db().query(
    "INSERT INTO master_cache(company_id,mode,kind,data) VALUES($1,$2,$3,$4) ON CONFLICT(company_id,mode,kind) DO UPDATE SET data=$4,synced_at=now() RETURNING synced_at",
    [a.company, mode(), catalogKey(), JSON.stringify(data)],
  );
  return { ...data, syncedAt: r.rows[0].synced_at };
}
async function liveMasters(a: Actor, refresh: boolean) {
  const c = await db().connect();
  const key = catalogKey(),
    progressKey = key + ":progress";
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      a.company + ":" + key,
    ]);
    const cached = await c.query(
      "SELECT data,synced_at FROM master_cache WHERE company_id=$1 AND mode='live' AND kind=$2",
      [a.company, key],
    );
    const progress = await c.query(
      "SELECT data FROM master_cache WHERE company_id=$1 AND mode='live' AND kind=$2",
      [a.company, progressKey],
    );
    if (cached.rows.length && !refresh && !progress.rows.length) {
      await c.query("COMMIT");
      return {
        ...cached.rows[0].data,
        syncedAt: cached.rows[0].synced_at,
        loading: false,
      };
    }
    let state: CatalogProgress = progress.rows[0]?.data ?? newCatalogProgress();
    let retryAfterMs = 3500;
    try {
      state = advanceCatalog(state, await catalogPage(state.kind, state.page));
    } catch (e) {
      if (!(e instanceof HttpError && e.status === 429)) throw e;
      retryAfterMs = 15000;
    }
    if (state.complete) {
      const data = { suppliers: state.suppliers, products: state.products };
      const saved = await c.query(
        "INSERT INTO master_cache(company_id,mode,kind,data) VALUES($1,'live',$2,$3) ON CONFLICT(company_id,mode,kind) DO UPDATE SET data=$3,synced_at=now() RETURNING synced_at",
        [a.company, key, JSON.stringify(data)],
      );
      await c.query(
        "DELETE FROM master_cache WHERE company_id=$1 AND mode='live' AND kind=$2",
        [a.company, progressKey],
      );
      await c.query("COMMIT");
      return { ...data, syncedAt: saved.rows[0].synced_at, loading: false };
    }
    await c.query(
      "INSERT INTO master_cache(company_id,mode,kind,data) VALUES($1,'live',$2,$3) ON CONFLICT(company_id,mode,kind) DO UPDATE SET data=$3,synced_at=now()",
      [a.company, progressKey, JSON.stringify(state)],
    );
    await c.query("COMMIT");
    return {
      ...(cached.rows[0]?.data ?? { suppliers: [], products: [] }),
      syncedAt: cached.rows[0]?.synced_at,
      loading: true,
      retryAfterMs,
      progress: {
        kind: state.kind,
        page: state.page,
        loaded: state.loaded,
        total: state.total,
      },
    };
  } catch (e) {
    await c.query("ROLLBACK");
    // Keep the last complete catalog; a new refresh may restart an inconsistent upstream snapshot.
    await c.query(
      "DELETE FROM master_cache WHERE company_id=$1 AND mode='live' AND kind=$2",
      [a.company, progressKey],
    );
    if (e instanceof HttpError) throw e;
    throw new HttpError(
      503,
      "ข้อมูล FlowAccount เปลี่ยนหรือไม่ครบ กรุณากดอัปเดตข้อมูลใหม่",
    );
  } finally {
    c.release();
  }
}
async function snapshot(a: Actor, raw: unknown): Promise<Snapshot> {
  const d = draftSchema.parse(raw);
  const m = await masters(a);
  if ("loading" in m && m.loading)
    throw new HttpError(
      409,
      "กำลังโหลด catalog ให้ครบ กรุณารอสักครู่ก่อนบันทึก",
    );
  const supplier = (m.suppliers as Supplier[]).find(
    (s) => s.id === d.supplierId,
  );
  if (!supplier) throw new HttpError(400, "ไม่พบผู้จำหน่าย กรุณาอัปเดตข้อมูล");
  return {
    ...d,
    catalogEnvironment: catalogEnvironment(),
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
    "SELECT * FROM receiving_documents WHERE id=$1 AND company_id=$2 AND mode=$3 AND COALESCE(body->>'catalogEnvironment',CASE WHEN mode='mock' THEN 'mock' ELSE 'sandbox' END)=$4",
    [id, a.company, mode(), catalogEnvironment()],
  );
  if (!r.rows.length) throw new HttpError(404, "ไม่พบเอกสาร");
  const job = await db().query('SELECT status,error_code,draft_version FROM submission_jobs WHERE document_id=$1 ORDER BY created_at DESC LIMIT 1',[id]);
  return {...r.rows[0], submission_job:job.rows[0] || null};
}
export async function recover(a: Actor, id?: string) {
  const c = await db().connect();
  try {
    await c.query("BEGIN");
    const r = await c.query(
      "UPDATE receiving_documents SET status='unknown',version=version+1,updated_at=now() WHERE company_id=$1 AND mode=$2 AND status='submitting' AND updated_at<now()-interval '2 minutes' AND ($3::uuid IS NULL OR id=$3) AND COALESCE(body->>'catalogEnvironment',CASE WHEN mode='mock' THEN 'mock' ELSE 'sandbox' END)=$4 RETURNING id",
      [a.company, mode(), id || null, catalogEnvironment()],
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
      "SELECT * FROM receiving_documents WHERE company_id=$1 AND mode=$2 AND ($3='' OR body->>'buyer' ILIKE $3 OR body->>'reference' ILIKE $3 OR body->'supplier'->>'name' ILIKE $3 OR flow_number ILIKE $3) AND ($4='' OR status=$4) AND COALESCE(body->>'catalogEnvironment',CASE WHEN mode='mock' THEN 'mock' ELSE 'sandbox' END)=$5 ORDER BY updated_at DESC LIMIT 100",
      [a.company, mode(), q ? "%" + q + "%" : "", status, catalogEnvironment()],
    )
  ).rows;
}
export async function save(
  a: Actor,
  raw: unknown,
  id?: string,
  version?: number,
) {
  if (!['editor','admin'].includes(a.role)) throw new HttpError(403,'ไม่มีสิทธิ์สร้างหรือแก้ร่าง');
  const b = await snapshot(a, raw);
  let t;
  try {
    t = calculate(b);
  } catch {
    throw new HttpError(400, "ส่วนลดต้องไม่เกินยอดสินค้า");
  }
  if (Number(t.total) > 999999999999)
    throw new HttpError(400, "ยอดสูงเกินขอบเขต");
  const c = await db().connect();
  try {
    await c.query("BEGIN");
    let r;
    const member = await c.query("SELECT role FROM memberships WHERE identity=$1 AND company_id=$2 AND active=true FOR SHARE",[a.id,a.company]);
    if (!member.rows.length || !['editor','admin'].includes(member.rows[0].role)) throw new HttpError(403,'สิทธิ์แก้ร่างถูกเพิกถอน');
    if (id) {
      z.uuid().parse(id);
      r = await c.query(
        "UPDATE receiving_documents SET body=$1,totals=$2,subtotal=$3,vat=$4,total=$5,version=version+1,status='draft',updated_by=$6,updated_at=now() WHERE id=$7 AND company_id=$8 AND mode=$9 AND version=$10 AND status IN ('draft','failed','approved','pending_review') AND NOT EXISTS (SELECT 1 FROM submission_attempts WHERE document_id=receiving_documents.id) AND COALESCE(body->>'catalogEnvironment',CASE WHEN mode='mock' THEN 'mock' ELSE 'sandbox' END)=$11 RETURNING *",
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
          catalogEnvironment(),
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
    await c.query("UPDATE draft_reviews SET status='invalidated',decided_by=$2,decided_at=now(),reason='draft_changed' WHERE document_id=$1 AND status IN ('pending','approved')",[r.rows[0].id,a.id]);
    await c.query("DELETE FROM receiving_items WHERE document_id=$1", [
      r.rows[0].id,
    ]);
    for (const [k, item] of b.items.entries())
      await c.query(
        "INSERT INTO receiving_items(document_id,line_number,product_id,master_id,unit_id,unit_name,product_name,product_code,quantity,price,line_total,vat_type) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
        [
          r.rows[0].id,
          k + 1,
          item.productId,
          item.product.masterId,
          item.product.unitId,
          item.product.unit,
          item.product.name,
          item.product.code,
          item.quantity,
          item.price,
          t.lines[k],
          item.product.vatType,
        ],
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
export async function submit(a: Actor, id: string, version: number, confirmation?: string, worker = false) {
  if (!submissionEnabled())
    throw new HttpError(403, "ยังไม่อนุญาตส่งเอกสารใน environment นี้");
  if (!["sender", "admin"].includes(a.role)) throw new HttpError(403, "ไม่มีสิทธิ์ส่งเอกสาร");
  const d = await read(a, id);
  const problem = submissionProblem(a.role, d.body, confirmation);
  if (problem) throw new HttpError(422, problem);
  const production = mode() === "live" && catalogEnvironment() === "production";
  if (production && !worker) {
    const { enqueueSubmission } = await import('./submission-queue');
    return enqueueSubmission(a,id,version,confirmation);
  }
  if (worker && (process.env.VERCEL || process.env.CK_SUBMISSION_WORKER !== 'true')) throw new HttpError(403,'dedicated_worker_required');
  if (production && d.status !== "approved")
    throw new HttpError(403, "ยังไม่ได้อนุมัติร่างและ version นี้สำหรับ Production");
  if (d.status !== "draft" && d.status !== "failed" && !(production && d.status === "approved"))
    throw new HttpError(409, "สถานะนี้ส่งซ้ำไม่ได้");
  if (d.version !== version)
    throw new HttpError(409, "เอกสารเปลี่ยนแล้ว กรุณาเปิดใหม่");
  if (mode() === "live") {
    // Sandbox UAT allows exclusive/inclusive 7%; discounts and mixed taxes remain blocked.
    if (
      !["exclusive", "inclusive"].includes(d.body.vatMode) ||
      Number(d.body.discount) !== 0 ||
      d.body.warehouse ||
      d.body.po
    )
      throw new HttpError(
        422,
        "Sandbox รองรับ VAT 7% รวม/ไม่รวมภาษี ไม่มีส่วนลด คลัง หรือ PO เท่านั้น",
      );
    if (d.body.items.some((i) => i.product.vatType !== 3))
      throw new HttpError(422, "ต้องยืนยันประเภท VAT สินค้าก่อนส่ง");
    // Submission needs a complete fresh snapshot; the UI's resumable refresh returns partial progress.
    const fresh = await catalog();
    if (
      !(fresh.suppliers as Supplier[]).some((s) => s.id === d.body.supplierId)
    )
      throw new HttpError(422, "ผู้จำหน่ายถูกลบ กรุณาตรวจสอบ");
    const currentSupplier = (fresh.suppliers as Supplier[]).find(s => s.id === d.body.supplierId);
    if (!currentSupplier || (Object.keys(currentSupplier) as (keyof Supplier)[]).some(key => currentSupplier[key] !== d.body.supplier[key]))
      { await invalidateCatalogApproval(a,d); throw new HttpError(422, "ข้อมูลผู้จำหน่ายเปลี่ยน กรุณาบันทึกและตรวจทานใหม่"); }
    if (!/^[1-9]\d*$/.test(d.body.supplierId) || !Number.isSafeInteger(Number(d.body.supplierId)))
      throw new HttpError(422, "รหัสผู้จำหน่ายไม่ตรง schema FlowAccount");
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
        Object.keys(p).some(key => p[key as keyof Product] !== item.product[key as keyof Product])
      )
        { await invalidateCatalogApproval(a,d); throw new HttpError(422, "ข้อมูลสินค้าเปลี่ยน กรุณาบันทึกและตรวจทานใหม่"); }
    }
  }
  const body = payload(d.body, id);
  const access = await preparePurchase();
  const attempt = randomUUID();
  const hash = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  const c = await db().connect();
  try {
    await c.query("BEGIN");
    if (worker && a.authExpiresAt && new Date(a.authExpiresAt).getTime() <= Date.now()) throw new HttpError(401,'session หมดอายุก่อนส่ง');
    if (worker) {
      const authorization = await c.query("SELECT j.id FROM submission_jobs j LEFT JOIN password_accounts p ON p.identity=j.requested_by AND p.company_id=j.company_id WHERE j.document_id=$1 AND j.company_id=$2 AND j.requested_by=$3 AND j.draft_version=$4 AND j.status='running' AND j.auth_expires_at>now() AND (j.session_version IS NULL OR j.session_version=p.session_version)",[id,a.company,a.id,version]);
      if (!authorization.rowCount) throw new HttpError(401,'session หรือ worker job ไม่ตรงร่าง');
    }
    const member = await c.query("SELECT role FROM memberships WHERE identity=$1 AND company_id=$2 AND active=true FOR SHARE",[a.id,a.company]);
    if (!member.rows.length || !['sender','admin'].includes(member.rows[0].role)) throw new HttpError(403,'สิทธิ์ส่งถูกเพิกถอน');
    let reviewId: string | null = null;
    if (production) {
      await c.query("SELECT id FROM receiving_documents WHERE id=$1 FOR UPDATE", [id]);
      const prior = await c.query("SELECT id FROM submission_attempts WHERE document_id=$1 LIMIT 1", [id]);
      if (prior.rowCount) throw new HttpError(409, "มีประวัติส่งแล้ว ห้ามส่งซ้ำ");
      const approval = await c.query("SELECT r.* FROM draft_reviews r JOIN memberships m ON m.identity=r.decided_by AND m.company_id=r.company_id AND m.active AND m.can_approve WHERE r.document_id=$1 AND r.company_id=$2 AND r.environment='production' AND r.status='approved' AND r.approved_version=$3 AND r.request_hash=$4 FOR UPDATE OF r FOR SHARE OF m",[id,a.company,version,submissionHash(d)]);
      if (!approval.rows.length) throw new HttpError(403,'ไม่มี approval ที่ตรงกับร่าง');
      reviewId = approval.rows[0].id;
      await c.query("UPDATE draft_reviews SET status='consumed' WHERE id=$1",[reviewId]);
    }
    const r = await c.query(
      "UPDATE receiving_documents SET status='submitting',version=version+1,updated_by=$1,updated_at=now() WHERE id=$2 AND company_id=$3 AND mode=$4 AND version=$5 AND status IN ('draft','failed','approved') AND COALESCE(body->>'catalogEnvironment',CASE WHEN mode='mock' THEN 'mock' ELSE 'sandbox' END)=$6 RETURNING id",
      [a.id, id, a.company, mode(), version, catalogEnvironment()],
    );
    if (!r.rowCount) throw new HttpError(409, "เอกสารถูกส่งหรือเปลี่ยนแล้ว");
    await c.query(
      "INSERT INTO submission_attempts(id,document_id,status,request_hash,review_id) VALUES($1,$2,'submitting',$3,$4)",
      [attempt, id, hash, reviewId],
    );
    await c.query(
      "INSERT INTO audit_events(document_id,actor,action,detail) VALUES($1,$2,'submitting',$3)",
      [id, a.id, JSON.stringify({ attempt, approvalId: reviewId, environment: catalogEnvironment(), approvedVersion: version, reviewHash: reviewHash(d), approvalConsumed: production })],
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
    flowStatus?: string;
  };
  let readback: { verified: boolean; flowStatus?: string | number; verifiedAt?: string; actual?: unknown } | undefined;
  try {
    result = await createPurchase(body, access);
    if (production && result.kind === "synced" && result.id && result.number) {
      try {
        const raw = await fetchPurchase(result.id);
        verifyPurchaseReadback(raw.data, body, result.id, result.number);
        readback = { verified: true, flowStatus: raw.data.status, verifiedAt: new Date().toISOString(), actual: raw.data };
      } catch {
        result = { ...result, kind: "unknown", code: "readback_required_do_not_resend" };
        readback = { verified: false };
      }
    }
  } catch {
    result = { kind: "unknown", code: "verify_before_retry" };
  } finally {
    // Regular submission switch is managed externally; approval is consumed durably.
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
      [id, a.id, result.kind, JSON.stringify({ attempt, code: result.code,
        environment: catalogEnvironment(), flowId: result.id, flowNumber: result.number,
        flowStatus: result.flowStatus ?? null, expectedFlowStatus: "awaiting", readback, approvalConsumed: production })],
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
async function invalidateCatalogApproval(a: Actor,d: Receipt) {
  const c = await db().connect();
  try {
    await c.query('BEGIN');
    const r = await c.query("UPDATE receiving_documents SET status='draft',version=version+1,updated_at=now() WHERE id=$1 AND company_id=$2 AND version=$3 AND status='approved' RETURNING id",[d.id,a.company,d.version]);
    if (r.rowCount) {
      await c.query("UPDATE draft_reviews SET status='invalidated',decided_by=$2,decided_at=now(),reason='catalog_changed' WHERE document_id=$1 AND status='approved'",[d.id,a.id]);
      await c.query("INSERT INTO audit_events(document_id,actor,action,detail) VALUES($1,$2,'approval_invalidated','{\"reason\":\"catalog_changed\"}')",[d.id,a.id]);
    }
    await c.query('COMMIT');
  } catch(e) { await c.query('ROLLBACK');throw e; } finally { c.release(); }
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
  if (catalogEnvironment() === "production") {
    if (d.flow_id && d.flow_id !== flowId) throw new HttpError(422, "ต้องใช้ FlowAccount ID ที่ตอบกลับเท่านั้น");
    try { verifyPurchaseReadback(data, payload(d.body, d.id), flowId, data.documentSerial); }
    catch { throw new HttpError(422, "ผลอ่านกลับไม่ตรงร่าง ห้ามสร้างซ้ำ"); }
  }
  if (
    raw.status !== true ||
    typeof data?.documentSerial !== "string" ||
    !data.documentSerial.trim() ||
    String(data?.contactId) !== d.body.supplierId ||
    String(data?.publishedOn).slice(0, 10) !== d.body.date ||
    String(data?.documentId) !== flowId ||
    data?.externalDocumentId !== externalDocumentId(id) ||
    Number(data?.grandTotal) !== Number(d.totals.total)
  )
    throw new HttpError(422, "เอกสารไม่ตรง กรุณาตรวจสอบใน FlowAccount");
  const c = await db().connect();
  try {
    await c.query("BEGIN");
    const member = await c.query("SELECT role FROM memberships WHERE identity=$1 AND company_id=$2 AND active=true FOR SHARE",[a.id,a.company]);
    if (member.rows[0]?.role !== 'admin') throw new HttpError(403,'สิทธิ์ตรวจสอบผลถูกเพิกถอน');
    const r = await c.query(
      "UPDATE receiving_documents SET status='synced',flow_id=$1,flow_number=$2,version=version+1,updated_at=now(),updated_by=$3 WHERE id=$4 AND company_id=$5 AND mode=$6 AND status='unknown' AND version=$7 RETURNING id",
      [flowId, data.documentSerial, a.id, id, a.company, mode(), d.version],
    );
    if (!r.rowCount) throw new HttpError(409, "สถานะเปลี่ยนแล้ว");
    await c.query(
      "UPDATE submission_attempts SET status='synced',flow_id=$1,flow_number=$2,finished_at=now() WHERE document_id=$3 AND status='unknown'",
      [flowId, data.documentSerial, id],
    );
    await c.query("UPDATE submission_jobs SET status='finished',finished_at=now(),error_code=null WHERE document_id=$1 AND status='unknown'",[id]);
    await c.query(
      "INSERT INTO audit_events(document_id,actor,action,detail) VALUES($1,$2,'reconciled',$3)",
      [id, a.id, JSON.stringify({ flowId, flowNumber:data.documentSerial, flowStatus: data.status ?? null, environment: catalogEnvironment(), readback:data, version:d.version })],
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
