import Decimal from "decimal.js";

export function formatQuantity(value: string): string {
  if (!/^-?\d+(\.\d+)?$/.test(value)) return value;
  const [whole, fraction] = value.split(".");
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") +
    (fraction === undefined ? "" : "." + fraction);
}

export function formatMoney(value: string): string {
  try {
    const amount = new Decimal(value);
    if (!amount.isFinite()) return value;
    const [whole, fraction] = amount.toFixed(2, Decimal.ROUND_HALF_UP).split(".");
    return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + fraction;
  } catch {
    return value;
  }
}
