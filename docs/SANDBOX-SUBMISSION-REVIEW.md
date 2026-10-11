# CK Recycle — Sandbox submission review, 11 October 2026

## Actual external evidence — initial check

Sandbox credentials authenticated successfully. Complete GET catalog returned **0 suppliers, 0 product masters, 0 product-list units**. No contact, product or receiving document has been created. There is no test document number or readback result yet. Production has received no writes.

Current official schema downloaded read-only to ignored `.local/flowaccount-current.yml` from https://developers.flowaccount.com/swagger.yml. Reference: https://developers.flowaccount.com/api-reference/.

`POST /purchases`, SimpleDocument, creates receiving inventory in **awaiting / รออนุมัติ**. `GET /purchases/{id}` reads it. No approval, payment, update or delete endpoint is called. Stock movements are not yet verified.

The schema documents no idempotency key. `searchString` searches contact name, project name and document serial; reference/externalDocumentId search is **not documented**. An empty search cannot establish absence. Timeout, HTTP errors and ambiguous responses stay unknown (รอตรวจสอบ), with no POST retry. Admin reconciliation requires a known Flow ID and matching external ID, supplier, date and amount. There is no automatic reset from unknown to draft.

## Mapping and scope

| Draft | Outgoing field |
|---|---|
| Supplier | contactId/name/address/taxId/branch/zip/group |
| Product/unit | productLists[*].id → items.id; unitName; masterId/unitId stay in local snapshot |
| Buyer | salesName, per earlier owner-approved mapping; API describes document creator/salesperson, not a dedicated purchase buyer |
| Date | publishedOn and dueDate; creditDays=0 |
| Reference / notes | reference / remarks, preserved |
| UUID | externalDocumentId `ck-` + compact UUID; same formatter for creation and reconciliation |
| Quantity / price | four decimal places accepted locally; line sums half-up to two decimals |
| VAT | Initial live scope: exclusive 7%, product buySettings.vatType=3 |
| Discount | Initial live scope: zero; other discounts blocked pending real comparison |
| Warehouse / PO | No confirmed dedicated SimpleDocument field; blocked for live submissions, never moved into remarks/reference |

Returned ID and serial are persisted on the draft and attempt. Returned Flow status, environment, ID and serial are recorded in the success audit detail; sender and timestamp are audit actor/created_at. Expected awaiting is recorded separately from actual returned status. Missing status is stored as null, not invented.

## Proposed Sandbox data — approved by user and executed

Create exactly one supplier and one product using **Sandbox credentials and newly returned Sandbox IDs only**:

| Field | Proposed value |
|---|---|
| Supplier | CK TEST ผู้จำหน่าย Sandbox; person contactGroup=1; supplier contactType=5 |
| Address | ข้อมูลทดสอบ Sandbox เท่านั้น |
| Tax ID | Empty; no fabricated tax registration |
| Product | CK TEST กระดาษรีไซเคิล; code CKTEST-PAPER-01; inventory type=5 |
| Unit | กก. (single main unit) |
| Buy/sell price | 8.50 |
| Buy/sell VAT | 3, exclusive VAT |
| Opening stock | 0; no existing stock overwritten |
| Buyer | CK TEST ผู้สั่งซื้อ |
| Date | 2026-10-11 |
| Quantity | 1.2345 กก. |
| Discount | 0.00 |
| Line / VAT / total | 10.49 / 0.73 / **11.22 THB** |
| Reference | CK TEST SANDBOX 2026-10-11 |
| Notes | ทดสอบระบบ CK Recycle ใน Sandbox เท่านั้น |
| Warehouse / PO | Empty |
| New document status | Awaiting approval; no status transition requested |

The approval question initially displayed 11.23 THB; the corrected review amount is **11.22 THB**.

After approval: create test masters once, read them back, select returned product-list ID, save Sandbox draft, show review, submit once, GET returned document ID and compare supplier, items, quantity, unit, prices, date, salesName, VAT, grandTotal and actual status. Record serial and ID. Do not retry ambiguous master or document creation; inspect first.

## Production readiness

Production catalog read flag remains independent from Sandbox write flag. `FLOW_SANDBOX_WRITE_APPROVED` defaults false. Production writes remain hard-blocked even if `FLOW_PRODUCTION_WRITE_APPROVED=true` until Sandbox acceptance and a subsequent explicitly authorized implementation/deployment step.

Production business draft is pending the owner's supplier, product/unit, quantity, price, VAT, buyer and date. Existing CK TEST Production-catalog drafts are test examples, not actual transactions. Do not treat them as an approved real draft. Present a complete real draft and its expected awaiting status for approval before any Production POST.

Admin passwords, memberships and other projects' databases are unchanged. No migration is needed for this change.

## Completed acceptance record

The initial empty-catalog evidence above preceded user approval. User approved the proposed masters and one Sandbox receiving document. Created one supplier and one inventory product. Initial product payload incorrectly supplied opening quantity/price zero; complete GET confirmed no product existed, then the corrected creation omitted opening-stock settings as required by the official product guide (https://developers.flowaccount.com/tutorial/product-api/create-product/). No opening stock movement was requested.

**Actual Sandbox document:** `RI2026100001`, FlowAccount ID **150702**, local staging draft `a4ea8849-f35c-49a1-aa47-a69c49add0c2`. A single purchase POST created it. Actual returned status **1**, statusString **awaiting**. Final readback verified 11 October 2026, 13:51 Bangkok. GET `/purchases/150702` returned `{status:true,data:{totalDocument:"1",list:[...]}}`, not a direct data object; normalization now checks exactly one matching ID and rejects missing/duplicate/mismatched results.

Verified supplier contactId **1345102**, purchase product-list ID **1584622**, external UUID reference, date, buyer (`salesName`), item ID, quantity **1.2345**, price **8.50**, unit **กก.**, line **10.49**, VAT **0.73**, grandTotal **11.22**, and awaiting status. Audit stores submitter/time/result and a `readback_verified` event. No approval, payment, update or delete was issued to FlowAccount.

Actual service duplicate submissions against the synced document: both rejected **409**; editor: **403**. Real password-authenticated staging UI on mobile 390×844 and tablet 1024×768 passed totals/layout; editor POST rejected 403; attempting to open an existing Production-source draft through Sandbox returned 404. Pure policy tests also reject Production-source snapshots and missing/mismatched environment confirmations for sender/admin.

Local automated checks: **34 unit/contract/database tests**, TypeScript, production build and secret scan passed. Browser suite **14/14** passed; separately simulated timeout/concurrency cases **4/4** passed on mobile/tablet. Timeout tests use mock transport, not a deliberate real FlowAccount network failure. Tests do not imply inclusive VAT, discount, stock movement or Production write acceptance.

Production candidate now selected: see `PRODUCTION-RECEIPT-REVIEW.md`; real buyer name still missing. Owner confirmed 1 PCS and inclusive total 1070. Inclusive VAT requires additional explicitly authorized Sandbox acceptance before Production submission can be enabled.

### Additional inclusive VAT acceptance — 11 October 2026

Owner explicitly authorized **one additional Sandbox document, grandTotal 1070**. Created **RI2026100002**, Flow ID **150703**, local staging draft **3ae18389-d120-4216-9969-86b2ff652cea**. Reused Sandbox contact **1345102** and product-list **1584622**; no master update or additional master creation. One purchase POST only. Readback at 13:58 Bangkok verified `isVatInclusive=true`, quantity **1**, price **1070**, tax basis **1000**, VAT **70**, grand total **1070**, external UUID, supplier, date, salesName, unit/item ID, and **1 / awaiting** status. This supersedes the earlier inclusive-VAT limitation for this exact 7%, zero-discount case. Audit recorded readback evidence. Actual duplicate admin submissions returned 409; editor returned 403. Production writes remain blocked. Updated local suite: **35/35**, TypeScript and production build passed.

Web: http://127.0.0.1:3031 (verified Railway CK staging database, Sandbox writes enabled through explicit `--sandbox-send`; existing password accounts/roles). This is a local website, not a hosted Railway web deployment. Production writes remain disabled.

### Production preparation update — same date

The earlier unconditional Production hard block describes the preceding implementation. Dormant exact-draft one-shot support is now prepared locally; write approval remains false and no Production POST has been called. Production catalog read permission still cannot grant document writes. Complete saved review and current validation: `PRODUCTION-RECEIPT-REVIEW.md`. Both Sandbox documents above are historical verified acceptance, not newly recreated in this preparation step.
