"use client";
import { useEffect, useState } from "react";
import { useKeyboardViewport } from "./useKeyboardViewport";
import { signIn, signOut } from "next-auth/react";
import type { Draft, Receipt, Supplier, Product, Actor } from "@/lib/model";
import { calculate } from "@/lib/money";
const blank = (): Draft => ({
  supplierId: "",
  buyer: "",
  date: new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()),
  reference: "",
  notes: "",
  warehouse: "",
  po: "",
  vatMode: "exclusive",
  discount: "0",
  items: [],
});
const labels: Record<string, string> = {
  draft: "ฉบับร่าง",
  submitting: "กำลังส่ง",
  synced: "สร้างเอกสารแล้ว",
  failed: "ส่งไม่สำเร็จ",
  unknown: "ไม่ทราบผล · ต้องตรวจสอบ",
};
async function api(path: string, method = "GET", body?: unknown) {
  const res = await fetch("/api/" + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "เกิดข้อผิดพลาด");
  return data;
}
export default function Workspace() {
  const [me, setMe] = useState<(Actor & { mode: string }) | null>(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [receipts, setReceipts] = useState<Receipt[]>([]),
    [suppliers, setSuppliers] = useState<Supplier[]>([]),
    [products, setProducts] = useState<Product[]>([]),
    [syncedAt, setSyncedAt] = useState(""),
    [selected, setSelected] = useState<Receipt | null>(null),
    [draft, setDraft] = useState<Draft>(blank),
    [editing, setEditing] = useState(false),
    [dirty, setDirty] = useState(false),
    [review, setReview] = useState(false),
    [q, setQ] = useState(""),
    [filter, setFilter] = useState(""),
    [search, setSearch] = useState(""),
    [supplierSearch, setSupplierSearch] = useState(""),
    [catalogLoading, setCatalogLoading] = useState(false),
    [catalogError, setCatalogError] = useState(""),
    [history, setHistory] = useState<
      { actor: string; action: string; created_at: string }[]
    >([]),
    [flowId, setFlowId] = useState("");
  useKeyboardViewport(editing);
  const editable = !selected || ["draft", "failed"].includes(selected.status);
  const supplierMatches = suppliers.filter((s) =>
    (s.name + " " + s.taxId)
      .toLowerCase()
      .includes(supplierSearch.trim().toLowerCase()),
  );
  const productMatches = products.filter((p) =>
    (p.name + " " + p.code + " " + p.unit)
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const supplier =
    suppliers.find((s) => s.id === draft.supplierId) || selected?.body.supplier;
  let totals;
  try {
    totals = calculate(draft);
  } catch {
    totals = null;
  }
  function change(p: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...p }));
    setDirty(true);
    setReview(false);
    setMessage("ยังไม่ได้บันทึก");
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function loadList() {
    setReceipts(
      await api("receipts?q=" + encodeURIComponent(q) + "&status=" + filter),
    );
  }
  async function loadMasters(refresh = false) {
    setCatalogLoading(true);
    setCatalogError("");
    try {
      const c = await api(
        "masters",
        refresh ? "POST" : "GET",
        refresh ? {} : undefined,
      );
      setSuppliers(c.suppliers);
      setProducts(c.products);
      setSyncedAt(c.syncedAt);
    } catch {
      setCatalogError(
        "โหลดผู้จำหน่ายและสินค้าไม่ได้ กรุณาตรวจการเชื่อมต่อแล้วลองใหม่",
      );
    } finally {
      setCatalogLoading(false);
    }
  }
  useEffect(() => {
    api("me")
      .then(async (a) => {
        setMe(a);
        await Promise.all([loadList(), loadMasters()]);
      })
      .catch((e) => setError(e.message))
      .finally(() => setReady(true));
  }, []); // initial authenticated load
  useEffect(() => {
    if (!dirty) return;
    const stop = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", stop);
    return () => window.removeEventListener("beforeunload", stop);
  }, [dirty]);
  useEffect(() => {
    if (!selected || selected.status !== "submitting") return;
    const timer = setInterval(() => {
      api("receipts/" + selected.id)
        .then((d) => setSelected(d))
        .catch((e) => setError(e.message));
    }, 3000);
    return () => clearInterval(timer);
  }, [selected]);
  async function open(d: Receipt) {
    if (dirty && !confirm("มีข้อมูลยังไม่บันทึก ต้องการออกหรือไม่?")) return;
    const fresh = await api("receipts/" + d.id);
    setSelected(fresh);
    setDraft(fresh.body);
    setEditing(true);
    setDirty(false);
    setReview(false);
    setMessage("เปิดข้อมูลที่บันทึกบนเซิร์ฟเวอร์แล้ว");
    setHistory(await api("receipts/" + d.id + "/history"));
  }
  async function save() {
    const d = await api(
      selected ? "receipts/" + selected.id : "receipts",
      selected ? "PUT" : "POST",
      selected ? { draft, version: selected.version } : draft,
    );
    setSelected(d);
    setDraft(d.body);
    setDirty(false);
    setMessage("บันทึกบนเซิร์ฟเวอร์แล้ว");
    await loadList();
    return d as Receipt;
  }
  if (!ready)
    return (
      <main>
        <h1>CK Recycle</h1>
        <p role="status">กำลังเปิดระบบ…</p>
      </main>
    );
  if (!me)
    return (
      <main className="login">
        <div className="card">
          <small>CK RECYCLE</small>
          <h1>รับสินค้าอย่างเป็นระบบ</h1>
          <p>เข้าสู่ระบบด้วยบัญชีที่ได้รับสิทธิ์จากผู้ดูแล</p>
          <p role="alert" className="error">
            {error}
          </p>
          <button className="primary" onClick={() => signIn()}>
            เข้าสู่ระบบ
          </button>
        </div>
      </main>
    );
  return (
    <>
      <header>
        <b>
          CK Recycle <small>• รับสินค้า</small>
        </b>
        <button onClick={() => signOut()}>ออกจากระบบ</button>
      </header>
      <main>
        <div className="heading">
          <div>
            <small>
              {me.mode === "mock"
                ? "โหมดทดสอบ · ไม่มีเอกสารจริง"
                : "FlowAccount · Phase 1 อ่านข้อมูลเท่านั้น"}
            </small>
            <h1>{editing ? "รับสินค้าเข้าคลัง" : "รายการใบรับสินค้า"}</h1>
          </div>
          <span className="badge">{me.role}</span>
        </div>
        <p className="error" role="alert">
          {error}
        </p>
        <p role="status" aria-live="polite">
          {message}
        </p>
        {catalogLoading && (
          <p role="status">
            กำลังโหลดผู้จำหน่ายและสินค้าจาก{" "}
            {me.mode === "mock" ? "Mock" : "FlowAccount"}…
          </p>
        )}
        {catalogError && (
          <div className="card error" role="alert">
            <p>{catalogError}</p>
            {syncedAt && (
              <p>
                กำลังแสดงข้อมูลที่โหลดสำเร็จครั้งก่อน อาจยังไม่ใช่ข้อมูลล่าสุด
              </p>
            )}
            <button
              disabled={catalogLoading}
              onClick={() => run(() => loadMasters(true))}
            >
              ลองใหม่
            </button>
          </div>
        )}
        {!editing ? (
          <>
            <section className="card">
              <div className="fields">
                <label>
                  ค้นหาผู้จำหน่าย / ผู้สั่งซื้อ / เลขเอกสาร
                  <input value={q} onChange={(e) => setQ(e.target.value)} />
                </label>
                <label>
                  สถานะ
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="">ทั้งหมด</option>
                    {Object.entries(labels).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="actions">
                <button disabled={busy} onClick={() => run(loadList)}>
                  ค้นหา
                </button>
                <button
                  className="primary"
                  onClick={() => {
                    setSelected(null);
                    setDraft(blank());
                    setEditing(true);
                    setHistory([]);
                    setMessage("");
                    setDirty(false);
                  }}
                >
                  ＋ สร้างใบรับสินค้า
                </button>
              </div>
            </section>
            {receipts.length === 0 ? (
              <p>ยังไม่มีเอกสารที่ตรงกับการค้นหา</p>
            ) : (
              receipts.map((d) => (
                <button
                  className="card receipt"
                  key={d.id}
                  onClick={() => run(() => open(d))}
                >
                  <span className={"badge " + d.status}>
                    {labels[d.status]}
                  </span>
                  <h2>
                    {d.flow_number || d.body.reference || "ใบรับสินค้าใหม่"}
                  </h2>
                  <p>
                    {d.body.supplier.name} · {d.body.buyer}
                  </p>
                  <div className="row">
                    <small>{d.body.date}</small>
                    <b>{d.totals.total} ฿</b>
                  </div>
                </button>
              ))
            )}
          </>
        ) : (
          <>
            <button
              onClick={() => {
                if (!dirty || confirm("ออกโดยไม่บันทึกหรือไม่?")) {
                  setEditing(false);
                  setReview(false);
                  setDirty(false);
                  run(loadList);
                }
              }}
            >
              ← รายการทั้งหมด
            </button>
            <p>
              <span className={"badge " + selected?.status}>
                {selected ? labels[selected.status] : "ฉบับร่างใหม่"}
              </span>{" "}
              {selected?.flow_number}
            </p>
            {selected?.status === "unknown" && (
              <div className="error card">
                ไม่ทราบว่า FlowAccount สร้างเอกสารแล้วหรือไม่
                ห้ามสร้างใหม่หรือส่งซ้ำ ให้ผู้ดูแลตรวจสอบ
                {me.role === "admin" && me.mode === "live" && (
                  <>
                    <label>
                      FlowAccount document ID ที่ตรวจพบ
                      <input
                        value={flowId}
                        onChange={(e) => setFlowId(e.target.value)}
                        inputMode="numeric"
                      />
                    </label>
                    <button
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          setSelected(
                            await api(
                              "receipts/" + selected.id + "/reconcile",
                              "POST",
                              { flowId },
                            ),
                          );
                          setHistory(
                            await api("receipts/" + selected.id + "/history"),
                          );
                        })
                      }
                    >
                      ตรวจเทียบเอกสารและยืนยันผล
                    </button>
                  </>
                )}
              </div>
            )}
            <fieldset disabled={busy || !editable || review}>
              <div className="layout">
                <aside>
                  <section className="card">
                    <h2>ข้อมูลรับสินค้า</h2>
                    <label>
                      ค้นหาผู้จำหน่าย
                      <input
                        value={supplierSearch}
                        onChange={(e) => setSupplierSearch(e.target.value)}
                      />
                    </label>
                    <label>
                      ผู้จำหน่าย
                      <select
                        aria-label="ผู้จำหน่าย"
                        disabled={catalogLoading}
                        value={draft.supplierId}
                        onChange={(e) => change({ supplierId: e.target.value })}
                      >
                        <option value="">เลือกผู้จำหน่าย</option>
                        {suppliers
                          .filter(
                            (s) =>
                              s.id === draft.supplierId ||
                              supplierMatches.includes(s),
                          )
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    {!catalogLoading &&
                      !catalogError &&
                      !supplierMatches.length && (
                        <p role="status">ไม่พบผู้จำหน่ายที่ตรงกับการค้นหา</p>
                      )}
                    {supplier && (
                      <p className="note">
                        {supplier.address} {supplier.zip}
                        <br />
                        เลขภาษี: {supplier.taxId || "ไม่ระบุ"} ·{" "}
                        {supplier.branch || "ไม่ระบุสาขา"} {supplier.branchCode}
                      </p>
                    )}
                    <label>
                      ผู้สั่งซื้อ
                      <input
                        value={draft.buyer}
                        onChange={(e) => change({ buyer: e.target.value })}
                        maxLength={100}
                      />
                    </label>
                    <div className="fields">
                      <label>
                        วันที่รับ
                        <input
                          type="date"
                          value={draft.date}
                          onChange={(e) => change({ date: e.target.value })}
                        />
                      </label>
                      <label>
                        เลขอ้างอิง
                        <input
                          value={draft.reference}
                          onChange={(e) =>
                            change({ reference: e.target.value })
                          }
                        />
                      </label>
                    </div>
                  </section>
                  <section className="card">
                    <details>
                      <summary>ภาษี ส่วนลด และข้อมูลเพิ่มเติม</summary>
                      <label>
                        รูปแบบ VAT
                        <select
                          value={draft.vatMode}
                          onChange={(e) =>
                            change({
                              vatMode: e.target.value as Draft["vatMode"],
                            })
                          }
                        >
                          <option value="exclusive">ราคาไม่รวม VAT 7%</option>
                          <option value="inclusive">ราคารวม VAT 7%</option>
                          <option value="none">ไม่มี VAT</option>
                        </select>
                      </label>
                      <label>
                        ส่วนลดทั้งเอกสาร (บาท)
                        <input
                          inputMode="decimal"
                          value={draft.discount}
                          onChange={(e) => change({ discount: e.target.value })}
                        />
                      </label>
                      {me.mode === "mock" && (
                        <label>
                          คลังสินค้า
                          <input
                            value={draft.warehouse}
                            onChange={(e) =>
                              change({ warehouse: e.target.value })
                            }
                          />
                        </label>
                      )}
                      {me.mode === "mock" && (
                        <label>
                          อ้างอิง PO
                          <input
                            value={draft.po}
                            onChange={(e) => change({ po: e.target.value })}
                          />
                        </label>
                      )}
                      <label>
                        หมายเหตุ
                        <textarea
                          value={draft.notes}
                          onChange={(e) => change({ notes: e.target.value })}
                        />
                      </label>
                      <p className="note">
                        Phase 1 เก็บผู้สั่งซื้อในร่างบนเว็บ ยังไม่ส่งเอกสารไป
                        FlowAccount
                      </p>
                    </details>
                  </section>
                </aside>
                <section>
                  <div className="card">
                    <h2>เพิ่มสินค้า</h2>
                    <label>
                      ค้นหาชื่อ / รหัสสินค้า
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                    <div className="results">
                      {productMatches.map((p) => (
                        <button
                          key={p.id}
                          disabled={catalogLoading}
                          onClick={() =>
                            change({
                              items: [
                                ...draft.items,
                                {
                                  productId: p.id,
                                  quantity: "1",
                                  price: p.price,
                                },
                              ],
                            })
                          }
                        >
                          {p.name} ＋
                          <small>
                            {p.code} · {p.unit} · {p.price} ฿
                          </small>
                        </button>
                      ))}
                    </div>
                    {!catalogLoading &&
                      !catalogError &&
                      !productMatches.length && (
                        <p role="status">ไม่พบสินค้าที่ตรงกับการค้นหา</p>
                      )}
                    <small>
                      ข้อมูลล่าสุด{" "}
                      {syncedAt
                        ? new Date(syncedAt).toLocaleString("th-TH")
                        : "—"}
                    </small>
                    <button onClick={() => run(() => loadMasters(true))}>
                      อัปเดตข้อมูลจาก{" "}
                      {me.mode === "mock" ? "Mock" : "FlowAccount"}
                    </button>
                  </div>
                  <h2>สินค้าที่รับ ({draft.items.length})</h2>
                  {draft.items.map((item, i) => {
                    const p =
                      products.find((p) => p.id === item.productId) ||
                      selected?.body.items[i]?.product;
                    return (
                      <article className="card" key={i}>
                        <div className="row">
                          <div>
                            <small>{p?.code}</small>
                            <h3>{p?.name}</h3>
                            <small>หน่วย: {p?.unit}</small>
                          </div>
                          <button
                            className="delete"
                            aria-label={"ลบสินค้า " + (i + 1)}
                            onClick={() =>
                              change({
                                items: draft.items.filter((_, k) => k !== i),
                              })
                            }
                          >
                            ×
                          </button>
                        </div>
                        <div className="fields">
                          <label>
                            จำนวนรับ
                            <input
                              aria-label={"จำนวนรับ " + (i + 1)}
                              inputMode="decimal"
                              value={item.quantity}
                              onChange={(e) =>
                                change({
                                  items: draft.items.map((v, k) =>
                                    k === i
                                      ? { ...v, quantity: e.target.value }
                                      : v,
                                  ),
                                })
                              }
                            />
                          </label>
                          <label>
                            ราคา / หน่วย
                            <input
                              aria-label={"ราคา " + (i + 1)}
                              inputMode="decimal"
                              value={item.price}
                              onChange={(e) =>
                                change({
                                  items: draft.items.map((v, k) =>
                                    k === i
                                      ? { ...v, price: e.target.value }
                                      : v,
                                  ),
                                })
                              }
                            />
                          </label>
                        </div>
                        <p className="amount">
                          รวมรายการ <b>{totals?.lines[i] || "—"} ฿</b>
                        </p>
                      </article>
                    );
                  })}
                </section>
              </div>
            </fieldset>
            {review && selected && (
              <section className="card review">
                <h2>ตรวจสอบก่อนส่ง</h2>
                <p>
                  {selected.body.supplier.name}
                  <br />
                  ผู้สั่งซื้อ: {selected.body.buyer}
                  <br />
                  วันที่: {selected.body.date} · อ้างอิง:{" "}
                  {selected.body.reference || "—"}
                </p>
                {selected.body.items.map((i, k) => (
                  <p key={k}>
                    {i.product.name} · {i.quantity} {i.product.unit} × {i.price}{" "}
                    = {selected.totals.lines[k]}
                  </p>
                ))}
                <div className="row">
                  <span>รวมสินค้า</span>
                  <b>{selected.totals.subtotal}</b>
                </div>
                <div className="row">
                  <span>ส่วนลด</span>
                  <b>{selected.totals.discount}</b>
                </div>
                <div className="row">
                  <span>ฐานภาษี / VAT</span>
                  <b>
                    {selected.totals.taxable} / {selected.totals.vat}
                  </b>
                </div>
                <p className="note">
                  {me.mode === "mock"
                    ? "ยืนยันแล้วจะสร้างผลจำลองในฐานข้อมูลทดสอบ"
                    : "Phase 1 ตรวจสอบร่างเท่านั้น ยังไม่ส่งเอกสารไป FlowAccount"}
                </p>
                <button onClick={() => setReview(false)}>กลับไปแก้ไข</button>
              </section>
            )}
            {selected && (
              <details className="card">
                <summary>ประวัติผู้ทำรายการ</summary>
                <p>
                  สร้างโดย {selected.created_by} · แก้ไขล่าสุด{" "}
                  {selected.updated_by}
                </p>
                <button
                  onClick={() =>
                    run(async () =>
                      setHistory(
                        await api("receipts/" + selected.id + "/history"),
                      ),
                    )
                  }
                >
                  อัปเดตประวัติ
                </button>
                {history.map((h, i) => (
                  <p key={i}>
                    {new Date(h.created_at).toLocaleString("th-TH")} · {h.actor}{" "}
                    · {labels[h.action] || h.action}
                  </p>
                ))}
              </details>
            )}
            <footer className="bottom">
              <div>
                <div className="total">
                  <small>
                    ยอดสุทธิ {dirty ? "· ยังไม่บันทึก" : "· บันทึกแล้ว"}
                  </small>
                  <b>{totals?.total || "—"} ฿</b>
                </div>
                <div className="actions">
                  <button
                    disabled={busy || !editable}
                    onClick={() =>
                      run(async () => {
                        await save();
                      })
                    }
                  >
                    เก็บร่าง
                  </button>
                  {review && me.mode === "live" ? (
                    <p className="note">
                      Phase 1 ตรวจสอบร่างได้ แต่ยังไม่เปิดการส่งเอกสาร
                    </p>
                  ) : review ? (
                    <button
                      className="primary"
                      disabled={
                        busy || !editable || dirty || me.role === "editor"
                      }
                      onClick={() =>
                        run(async () => {
                          let d;
                          try {
                            d = await api(
                              "receipts/" + selected!.id + "/submit",
                              "POST",
                              { version: selected!.version },
                            );
                          } catch (e) {
                            try {
                              setSelected(
                                await api("receipts/" + selected!.id),
                              );
                              setReview(false);
                            } catch {}
                            throw e;
                          }
                          setSelected(d);
                          setReview(false);
                          setMessage(
                            d.status === "synced"
                              ? "สร้างเอกสารแล้ว: " + d.flow_number
                              : labels[d.status],
                          );
                          setHistory(
                            await api("receipts/" + d.id + "/history"),
                          );
                        })
                      }
                    >
                      {busy
                        ? "กำลังส่ง…"
                        : "ยืนยันส่ง" + (me.mode === "mock" ? " (จำลอง)" : "")}
                    </button>
                  ) : (
                    <button
                      className="primary"
                      disabled={busy || !editable}
                      onClick={() =>
                        run(async () => {
                          await save();
                          setReview(true);
                        })
                      }
                    >
                      ตรวจสอบก่อนส่ง →
                    </button>
                  )}
                </div>
              </div>
            </footer>
          </>
        )}
      </main>
    </>
  );
}
