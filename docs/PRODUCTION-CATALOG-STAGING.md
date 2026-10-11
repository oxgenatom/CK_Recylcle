# Production catalog → CK Recycle staging drafts

11 October 2026. This follows the earlier Sandbox-only checks; the owner explicitly authorized reuse of the previously successful Production credentials for catalog reads and staging receiving drafts. FlowAccount document writes remain disabled.

## Configuration and operation

Production credentials were recovered from the previously authorized connection and stored under `FLOW_PRODUCTION_CLIENT_ID` and `FLOW_PRODUCTION_CLIENT_SECRET` in ignored `.env.local`. Sandbox retains `FLOW_CLIENT_ID` and `FLOW_CLIENT_SECRET`. Production never falls back to Sandbox credentials. No secret is copied into tracked files, browser bundles or reports.

Start the production build locally with `CK_PORT=3030 npm run start:staging:production-catalog` (set the environment variable using the shell syntax). The launcher verifies the configured CK Recycle staging host/database, company ID/name and verified TLS before starting. Password login and the existing company memberships are preserved. The app shows **FlowAccount Production — reads only — staging drafts**. The server listens on loopback; this is not a hosted deployment.

Sandbox remains available with `npm run start:staging`. Both startup modes keep FlowAccount submission/reconciliation disabled.

The owner's additional instruction explicitly prohibits overwriting/deleting any FlowAccount data. Production transport allows only authentication token POST and GET of paginated contacts/product-masters; no contact/product/document mutation endpoint is callable through this integration. Receipt POST/PUT operations write only to the verified CK Recycle staging database.

## Large catalog

First-page reads showed 9,551 contacts and 3,507 product masters. Master sync now reads one page per API request, validates page numbers/totals/duplicate IDs and stores resumable progress in the company/environment-specific staging cache. UI polls with progress and backs off when the shared 18 requests/minute budget is exhausted. Completed snapshots alone become selectable data; saves are rejected while sync is pending. Refresh or server restart can resume unfinished pagination. A refresh retains the previous complete snapshot and its timestamp until replacement completes.

Supplier types 5/7 are retained. Document product IDs come from `productLists[*].id`, with master IDs, unit IDs and unit names retained separately. Product search displays up to 50 matches to keep mobile rendering responsive. Narrow the search to find other products. Production and Sandbox have separate caches and receiving source tags; ID overlap does not allow a draft to be reopened/edited through the other source. Legacy live drafts without a tag are treated as Sandbox.

## Validation and records

Real-service acceptance **passed** on the production build connected to verified Railway staging. Complete Production catalog: **576 suppliers**, **3,507 product masters**, **3,508 product/unit entries** (9,551 contacts scanned). Earlier blocked Sandbox results remain historical in STAGING-CATALOG-2026-10-11.md.

Two explicitly labeled test drafts were created using the existing staging test editor `ck-test-1791698643414`; no account was created/reset and no existing role changed in this continuation:

| Viewport | Draft ID | Reference | Final version / total |
|---|---|---|---|
| Mobile 390×844 | `93e73f3d-2514-448f-9639-2af7193b046c` | `CK TEST 2026-10-11 mobile 1791700110483` | 2 / 103.79 |
| Tablet 1024×768 | `947f6f51-0cc4-45d1-a551-33be2464df49` | `CK TEST 2026-10-11 tablet 1791700167095` | 2 / 103.79 |

For each viewport: password login → select real supplier/product → buyer/reference/quantity/price/discount → save → refresh/reopen → edit quantity → save → clear session/login again/reopen passed. Initial 10×8.50−5 = 80.00 plus VAT 5.60 = 85.60. Final 12×8.50−5 = 97.00 plus VAT 6.79 = **103.79**.

SQL READ ONLY verification confirmed product-list/master/unit ID and unit-name snapshots against the complete cache and numeric item rows; creator/editor and timestamps; exactly two saved audit events per draft; version 2; source isolation; draft status; null FlowAccount document ID/number. Anonymous catalog access returned 401, editor account management and live submission returned 403, unavailable history returned 404. No FlowAccount contact/product/document was created, overwritten, updated or deleted. Only authenticated GET master reads and token requests were used upstream.

Additional browser QA reopened the existing saved draft with real Production data at both mobile and tablet sizes: totals remained 103.79, no horizontal overflow, and stale-version PUT returned 409 without changing the draft. These checks created no additional draft. Screenshots were visually inspected; testing used Chromium viewport simulation rather than physical devices.

Private evidence: `.local/staging-ui-result.json`, `.local/production-draft-mobile.png`, `.local/production-draft-tablet.png`. Reproducible checks: `npx tsx scripts/check-staging-ui.ts` (creates two more clearly labeled test drafts when rerun), `npx tsx scripts/verify-staging-result.ts` (SQL READ ONLY), `npx tsx scripts/check-staging-layout.ts` (reopens existing drafts and checks stale-version rejection, creates no draft).

Unit/integration tests: 30 passed. Local mock/PGlite mobile/tablet E2E: 14 passed. Production build and production authentication smoke passed. Exact configured-secret scan includes both credential sets and tracked/nonignored untracked source. Existing admin password and account permissions were not changed; the dedicated staging test editor from the earlier run is reused.

## Manual trial

Open http://127.0.0.1:3030/login and log in with your existing username/password. Choose “ไปหน้ารับสินค้า”. Wait for the initial Production catalog sync to finish; later logins use the complete staging cache. Create a receiving draft, search/select the supplier and correct product unit, enter buyer/date/reference/quantity/price/discount/VAT, then “เก็บร่าง”. Refresh, reopen by reference, edit and save. Log out/in and reopen; check totals and audit history. No FlowAccount bill is sent.
