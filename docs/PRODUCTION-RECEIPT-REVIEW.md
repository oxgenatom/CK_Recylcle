# Production receiving inventory — pending review, 11 October 2026

**Production creation completed after explicit owner approval of version 2.** One document **RI2026100001**, FlowAccount ID **16937872**, created and read back successfully on 11 October 2026 at **14:42 Bangkok**. Actual status **1 / awaiting**. One attempt only; writes closed. The table below is the approved business data. Initial review used the Production cache synced at 13:28 Bangkok; submission validated the complete fresh Production catalog. Earlier preparation notes below are historical.

| Field | Review value |
|---|---|
| Supplier | บริษัท แม แม อินดัสเตรียล จำกัด |
| contactId | 67389684 |
| Address | 630 หมู่ 4 ถ.สุขุมวิท ต.แพรกษา อ.เมืองสมุทรปราการ จ.สมุทรปราการ 10280 |
| Branch | สำนักงานใหญ่ |
| Product | Antidotes-Room Spray-Morning in Tuscany-100 ml-Sticker 500 PCS/Roll |
| Code | RM001844 |
| items.id (product-list ID) | 80632401 |
| Master / unit IDs (local snapshot only) | 75214406 / 808749 |
| Quantity / API unit | 1 **PCS**, confirmed by owner; no conversion to rolls |
| Price including VAT | **1,070.00 THB**, per owner's latest instruction |
| Tax basis / VAT 7% | 1,000.00 / 70.00 THB |
| Discount | 0.00 |
| Total | **1,070.00 THB** |
| Receipt / due date | 2026-10-11 |
| Buyer | **บี.เค.เคมิคอล bkspacosmed**, corrected explicitly by owner; maps to salesName (document creator/salesperson) |
| Reference / notes / warehouse / PO | Empty |
| Expected status after creation | **Awaiting / รออนุมัติ** |

Product catalog buySettings.vatType is **3 (exclusive)** and buyPrice is **0.0000**. User explicitly supplied price and requested “in-vat เป็น 1070 บาท”; this review represents pricePerUnit=1070 with inclusive VAT. The owner confirmed the quantity/unit and total. No silent conversion to the catalog's zero default price.

**Inclusive VAT Sandbox acceptance passed:** one additional authorized document `RI2026100002`, ID **150703**, read back on 11 October 2026 at 13:58 Bangkok. `isVatInclusive=true`, quantity 1, price 1070, tax basis **1000**, VAT **70**, grand total **1070**, status **1 / awaiting**. Existing Sandbox supplier/product were reused without changing them. One new purchase POST, no automatic retry; duplicate admin submits returned 409 and editor returned 403.

**Saved complete draft:** `9b189b25-6d48-42ac-988f-8365f0fd8d55`, version **2**, verified CK Recycle Railway staging. Owner-authorized buyer correction saved through receipt service with version check and saved audit, then re-read. Current Bangkok date remains 2026-10-11; Production catalog snapshots only. Reference/notes remain empty. Production writes remain disabled; no submission attempts or FlowAccount IDs exist. Version 1 is superseded and must not be used for approval.

Review hash: `f8e6ba0dd4dc19705c337cd8fb49c5d6d65a4c3896250d4fe60d043eeaf8d868`.

**Remaining approval:** explicit authorization to enable and create this exact saved draft once. Read-catalog approval is independent and cannot grant writes. Dormant implementation requires separate Production credentials, exact Production endpoint, write flag, draft ID/version/review hash, sender/admin server authorization and Production environment confirmation. Default staging launcher forces writes off; `--production-catalog --production-once` additionally requires the exact owner-approved grant. Do not install that grant before final approval.

The transaction locks the document and checks for any prior submission attempt before its version transition. The attempt consumes the grant durably for this draft, including ambiguous outcomes; no automatic POST retry. One GET by returned FlowAccount ID compares supplier/date/buyer/reference/notes/items/quantity/unit/price/discount/tax basis/VAT/total and actual awaiting status. Failed readback preserves returned ID/serial and marks unknown. Runtime write flag closes after the attempt; durable attempt history also prevents reuse after restart. Read-only known-ID reconciliation remains available after closing writes. No existing FlowAccount document edits/deletes/approval/payment calls.

Prepared selection data is in ignored `.local/production-real-review.json`; complete saved review in ignored `.local/production-saved-review.json`. Login identity is used only as the audit actor, never as buyer. No password or membership changes and no schema migration.

## Validation for this saved review

38 unit/contract/database tests passed; TypeScript and final production build passed. Mobile/tablet browser fixtures: 14/14; additional timeout/concurrent-submit fixtures: 4/4. Includes editor rejection, stale version, environment isolation, review hash changes, no POST retry and readback mismatches. Production timeout transport fixture uses a fake fetcher, never a real Production POST. Preview/review saves local staging drafts only. Final configured-secret and heuristic scan passed; `.env.local` and `.local/production-saved-review.json` are ignored. No commit was made.

Saved draft was re-read from verified staging with matching buyer, total, unit, saved audit and zero submission attempts / zero FlowAccount IDs. Existing Sandbox acceptance evidence was reviewed, not repeated. This code is prepared locally; no hosted Railway web deployment was performed. Catalog snapshots are from the recorded Production sync; submission revalidates a complete fresh catalog before claiming the attempt, and changed data require save/review/approval again. Production behavior remains unverified until the explicitly approved one-document run; API idempotency and reference lookup are not assumed.

## Actual Production acceptance — 11 October 2026

Owner explicitly approved draft 9b189b25-6d48-42ac-988f-8365f0fd8d55 version 2 and its exact review hash. Initial preflight hit the shared read request budget before a submission attempt existed (draft version 2, no Flow ID, zero attempts). Read/auth budget reservations now wait before HTTP/attempt claim; purchase POST still has no retry. The subsequent command completed fresh catalog validation then made one purchase POST.

Created **RI2026100001**, Flow ID **16937872**. Attempt **e5fe6ccf-4136-4d66-86ea-27b0e37e155f**, started **14:42:21 Bangkok**, finished **14:42:27**. GET by returned ID verified at **14:42:26**: supplier, receipt/due date, corrected salesName, reference/notes, item ID/unit/quantity/price/line total, discount 0, tax basis 1000, VAT 70, grandTotal 1070, inclusive VAT, actual **1 / awaiting**. Audit stores sender identity, timestamps, attempt, approved version/hash, returned ID/serial and verified readback. Local resulting version is **4**, status synced (version 3 claimed submission; version 4 recorded result). These are state transitions, not business-data changes.

One-shot consumed and closed: runtime writesEnabled=false; only one durable attempt. No credentials or grant persisted in env files. Existing FlowAccount documents were not edited/deleted/approved/paid. Evidence: ignored .local/production-once-result.json. Latest tests 38/38, TypeScript, production build and secret scan passed. No hosted deployment or commit performed.
