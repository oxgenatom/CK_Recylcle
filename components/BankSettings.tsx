"use client";
import { useEffect, useState } from "react";
import type { Draft, Supplier } from "@/lib/model";
const empty = { name: "", accountName: "", accountNumber: "", branch: "" };
async function request(path: string, bank?: Draft["bank"]) {
  const response = await fetch("/api/" + path, {
    method: bank ? "PUT" : "GET",
    headers: bank ? { "Content-Type": "application/json" } : undefined,
    body: bank ? JSON.stringify(bank) : undefined,
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "โหลดข้อมูลไม่สำเร็จ");
  return data;
}
export default function BankSettings() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [id, setId] = useState("");
  const [bank, setBank] = useState(empty);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    request("masters").then((data) => {
      if (!active) return;
      setSuppliers(data.suppliers || []);
      if (data.loading) setMessage("กรุณาอัปเดตผู้จำหน่ายที่หน้ารับสินค้าให้ครบ แล้วเปิดหน้านี้อีกครั้ง");
    }).catch((error) => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    setBank(empty); setLoaded(false); setMessage("");
    if (!id) return;
    setLoading(true);
    request("bank-settings/" + encodeURIComponent(id)).then((data) => {
      if (active) { setBank(data || empty); setLoaded(true); }
    }).catch((error) => { if (active) setMessage(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);
  return <section className="card">
    <h2>ข้อมูลธนาคารผู้จำหน่าย</h2>
    <p>ใช้พิมพ์ท้ายใบรับสินค้าเมื่อบันทึกใบใหม่หรือแก้ไขใบเดิม</p>
    <form onSubmit={async (event) => {
      event.preventDefault(); setLoading(true); setMessage("");
      try {
        await request("bank-settings/" + encodeURIComponent(id), bank);
        setMessage("บันทึกข้อมูลธนาคารแล้ว");
      } catch (error) { setMessage((error as Error).message); }
      finally { setLoading(false); }
    }}>
      <label>ผู้จำหน่าย<select value={id} disabled={loading} onChange={(event) => setId(event.target.value)}>
        <option value="">เลือกผู้จำหน่าย</option>
        {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
      </select></label>
      <fieldset disabled={!loaded || loading}>
        {([ ["name", "ธนาคาร", 100], ["accountName", "ชื่อบัญชี", 200], ["accountNumber", "เลขที่บัญชี", 50], ["branch", "สาขาธนาคาร", 100] ] as const).map(([key, label, maxLength]) =>
          <label key={key}>{label}<input type="text" maxLength={maxLength} value={bank[key]} onChange={(event) => setBank({ ...bank, [key]: event.target.value })} /></label>)}
        <button type="submit">บันทึกข้อมูลธนาคาร</button>
      </fieldset>
      <p role="status">{loading ? "กำลังโหลด / บันทึก…" : message}</p>
    </form>
  </section>;
}
