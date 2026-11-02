import type { Receipt, Supplier } from "@/lib/model";
import { printBank } from "@/lib/print-bank";
import { formatMoney, formatQuantity } from "@/lib/format-money";

export default function ReceiptPrint({ receipt: r, supplier }: { receipt: Receipt; supplier?: Supplier }) {
  const { bank, current } = printBank(r, supplier);
  return (
    <section className="receipt80" aria-label="ใบรับสินค้าสำหรับพิมพ์ 80 มม.">
      <h1>CK Recycle</h1>
      <h2>ใบรับสินค้า</h2>
      <p>
        {r.flow_number || "ร่าง " + r.id.slice(0, 8)} · {r.status}
      </p>
      <p>
        {r.body.catalogEnvironment === "production"
          ? "Production"
          : r.body.catalogEnvironment === "sandbox"
            ? "Sandbox"
            : "ข้อมูลจำลอง"}
      </p>
      <p>
        วันที่: {r.body.date}
        <br />
        ผู้จำหน่าย: {r.body.supplier.name}
        <br />
        {r.body.supplier.address}
        <br />
        ผู้สั่งซื้อ: {r.body.buyer}
      </p>
      {r.body.reference && <p>อ้างอิง: {r.body.reference}</p>}
      <hr />
      {r.body.items.map((line, i) => (
        <div className="print-item" key={i}>
          <strong>
            {i + 1}. {line.product.name}
          </strong>
          <div>
            {formatQuantity(line.quantity)} {line.product.unit} × {formatMoney(line.price)}
            <span>{formatMoney(r.totals.lines[i])}</span>
          </div>
        </div>
      ))}
      <hr />
      <dl>
        {[
          ["รวมรายการ", r.totals.subtotal],
          ["ส่วนลด", r.totals.discount],
          ["ฐานภาษี", r.totals.taxable],
          ["VAT", r.totals.vat],
          ["ยอดสุทธิ (บาท)", r.totals.total],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{formatMoney(value)}</dd>
          </div>
        ))}
      </dl>
      <p>
        ราคา
        {r.body.vatMode === "inclusive"
          ? "รวม VAT"
          : r.body.vatMode === "exclusive"
            ? "ไม่รวม VAT"
            : "ไม่คิด VAT"}
      </p>
      {r.body.notes && <p>หมายเหตุ: {r.body.notes}</p>}
      {bank && (
        <div className="print-bank">
          {current && <p>ข้อมูลบัญชีปัจจุบันจาก FlowAccount</p>}
          {([
            ["ธนาคาร", bank.name],
            ["ชื่อบัญชี", bank.accountName],
            ["เลขที่บัญชี", bank.accountNumber],
            ["สาขา", bank.branch],
          ] as const).map(([label, value]) => value && <p key={label}>{label}: {value}</p>)}
        </div>
      )}
      <hr />
      <p>ผู้รับสินค้า __________________</p>
      <p>
        เอกสารพิมพ์จาก CK Recycle
        <br />
        ไม่ใช่ใบกำกับภาษี
      </p>
    </section>
  );
}
