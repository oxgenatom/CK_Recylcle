"use client";
import { useEffect, useState } from "react";
import type { Supplier } from "@/lib/model";
export default function BankSettings() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [id, setId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function load(refresh = false) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/masters", {
        method: refresh ? "POST" : "GET", cache: "no-store",
        ...(refresh ? { headers: { "Content-Type": "application/json" }, body: "{}" } : {}),
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "โหลดข้อมูลไม่สำเร็จ");
      setSuppliers(data.suppliers || []);
      setMessage(data.loading ? "กำลังโหลดข้อมูล กรุณากดดึงข้อมูลต่อจนเสร็จ" : data.warning || "โหลดข้อมูลแล้ว");
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  const supplier = suppliers.find((s) => s.id === id);
  return <section className="card">
    <h2>ข้อมูลธนาคารผู้จำหน่ายจาก FlowAccount</h2>
    <p>แก้ไขบัญชีในหน้าผู้ติดต่อของ FlowAccount แล้วกดดึงข้อมูล ใบรับสินค้าที่บันทึกหลังจากนั้นจะใช้ข้อมูลนี้พิมพ์ท้ายเอกสาร</p>
    <button type="button" disabled={busy} onClick={() => load(true)}>ดึงข้อมูลจาก FlowAccount / โหลดต่อ</button>
    <label>ผู้จำหน่าย<select value={id} disabled={busy} onChange={(event) => setId(event.target.value)}>
      <option value="">เลือกผู้จำหน่าย</option>
      {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select></label>
    {supplier && (supplier.bank ? <>
      {([ ["name", "ธนาคาร"], ["accountName", "ชื่อบัญชี"], ["accountNumber", "เลขที่บัญชี"], ["branch", "สาขาธนาคาร"] ] as const).map(([key, label]) =>
        <label key={key}>{label}<input readOnly value={supplier.bank?.[key] || ""} /></label>)}
    </> : <p>ไม่มีข้อมูลบัญชีจาก FlowAccount ในข้อมูลที่โหลดไว้ กรุณาตรวจข้อมูลผู้ติดต่อและกดดึงข้อมูลอีกครั้ง</p>)}
    <p role="status">{busy ? "กำลังดึงข้อมูล…" : message}</p>
  </section>;
}
