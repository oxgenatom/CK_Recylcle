import type { Draft, Receipt, Supplier } from "./model";
export function printBank(receipt: Receipt, supplier?: Supplier): { bank: Draft["bank"]; current: boolean } {
  if (receipt.body.bank?.accountNumber?.trim()) return { bank: receipt.body.bank, current: false };
  if (supplier?.id === receipt.body.supplierId && supplier.bank?.accountNumber?.trim())
    return { bank: supplier.bank, current: true };
  return { bank: undefined, current: false };
}
