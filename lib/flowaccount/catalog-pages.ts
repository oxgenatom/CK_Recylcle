import { mapContacts, mapProducts } from "./core";
import type { Supplier, Product } from "../model";
export type CatalogProgress = {
  kind: "contacts" | "product-masters";
  page: number;
  total?: number;
  loaded: number;
  ids: string[];
  suppliers: Supplier[];
  products: Product[];
  complete: boolean;
};
export const newCatalogProgress = (): CatalogProgress => ({
  kind: "contacts",
  page: 1,
  loaded: 0,
  ids: [],
  suppliers: [],
  products: [],
  complete: false,
});
export function advanceCatalog(
  state: CatalogProgress,
  response: unknown,
): CatalogProgress {
  const r = response as {
    status: boolean;
    data: {
      currentPage: number;
      total: number;
      list: Record<string, unknown>[];
    };
  };
  if (
    r?.status !== true ||
    !Array.isArray(r.data?.list) ||
    r.data.currentPage !== state.page ||
    !Number.isSafeInteger(r.data.total) ||
    r.data.total < 0
  )
    throw Error("invalid_page");
  if (state.total !== undefined && state.total !== r.data.total)
    throw Error("catalog_changed_retry");
  const ids = new Set(state.ids);
  for (const row of r.data.list) {
    const id = String(row?.id ?? "");
    if (!/^[1-9]\d*$/.test(id) || ids.has(id))
      throw Error("invalid_or_duplicate_id");
    ids.add(id);
  }
  const loaded = state.loaded + r.data.list.length;
  if (
    loaded > r.data.total ||
    (!r.data.list.length && loaded < r.data.total) ||
    state.page > 1000
  )
    throw Error("incomplete_pagination");
  const next = {
    ...state,
    total: r.data.total,
    loaded,
    ids: [...ids],
    page: state.page + 1,
  };
  if (state.kind === "contacts")
    next.suppliers = [...state.suppliers, ...mapContacts(r.data.list)];
  else {
    const products = mapProducts(r.data.list);
    const seen = new Set(state.products.map((p) => p.id));
    if (products.some((p) => seen.has(p.id)))
      throw Error("invalid_product_list_id");
    next.products = [...state.products, ...products];
  }
  if (loaded === r.data.total) {
    if (state.kind === "contacts")
      return {
        ...next,
        kind: "product-masters",
        page: 1,
        total: undefined,
        loaded: 0,
        ids: [],
      };
    next.complete = true;
  }
  return next;
}
