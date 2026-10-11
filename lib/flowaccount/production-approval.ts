import { createHash } from "node:crypto";
import type { Receipt } from "../model";

// A grant is installed only after the owner approves this exact saved review.
// The document/version transition and attempt history consume it durably.
export function reviewHash(d: Pick<Receipt, "id" | "version" | "body" | "totals">) {
  return createHash("sha256").update(JSON.stringify({ id: d.id, version: d.version, body: d.body, totals: d.totals })).digest("hex");
}
export function productionGrantConfigured(env: Record<string, string | undefined>) {
  return env.FLOW_PRODUCTION_WRITE_APPROVED === "true" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(env.FLOW_PRODUCTION_DRAFT_ID || "") &&
    /^[1-9]\d*$/.test(env.FLOW_PRODUCTION_DRAFT_VERSION || "") &&
    /^[0-9a-f]{64}$/.test(env.FLOW_PRODUCTION_REVIEW_HASH || "");
}
export function productionApprovalMatches(d: Receipt, env: Record<string, string | undefined> = process.env) {
  return productionGrantConfigured(env) && d.body.catalogEnvironment === "production" &&
    d.status === "draft" && d.id === env.FLOW_PRODUCTION_DRAFT_ID &&
    String(d.version) === env.FLOW_PRODUCTION_DRAFT_VERSION && reviewHash(d) === env.FLOW_PRODUCTION_REVIEW_HASH;
}
