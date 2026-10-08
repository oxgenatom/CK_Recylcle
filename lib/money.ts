import Decimal from "decimal.js";
import type { Draft, Totals } from "./model";
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export function calculate(d: Draft): Totals {
  const lines = d.items.map((i) =>
    new Decimal(i.quantity).mul(i.price).toDecimalPlaces(2).toFixed(2),
  );
  const subtotal = lines.reduce((s, n) => s.plus(n), new Decimal(0));
  const discount = new Decimal(d.discount).toDecimalPlaces(2);
  if (discount.gt(subtotal)) throw new Error("ส่วนลดเกินยอดสินค้า");
  const net = subtotal.minus(discount);
  const taxable =
    d.vatMode === "inclusive" ? net.div("1.07").toDecimalPlaces(2) : net;
  const vat =
    d.vatMode === "none"
      ? new Decimal(0)
      : d.vatMode === "inclusive"
        ? net.minus(taxable)
        : taxable.mul("0.07").toDecimalPlaces(2);
  return {
    lines,
    subtotal: subtotal.toFixed(2),
    discount: discount.toFixed(2),
    taxable: taxable.toFixed(2),
    vat: vat.toFixed(2),
    total: taxable.plus(vat).toFixed(2),
  };
}
