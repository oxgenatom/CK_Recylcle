# CK Recycle — Sandbox catalog and Railway staging, 11 October 2026

This report describes the earlier Sandbox-only run. The subsequent authorized reuse of Production credentials and successful real staging draft tests are recorded in [Production catalog → staging drafts](PRODUCTION-CATALOG-STAGING.md).

## Verified against real services

- Read-only preflight matched the configured host/database, `ck-recycle-staging` company ID and company name `CK Recycle`. Verified CA/server-name TLS is enabled. Migrations 001–004 were already present; no migration was applied in this run.
- Sandbox token and complete contacts/product-masters pagination succeeded. Actual result: **0 suppliers, 0 product masters, 0 product units**. No mock fallback was used.
- Production read was requested afterward. Explicit `/v1` read-only check failed at token acquisition with OAuth **invalid_client**. The current credentials were rejected by Production. No production catalog or document data was accessed successfully.
- Follow-up history audit confirmed that Production succeeded on 8 October and created `RI2026100001`. That run passed the Production credentials from the prior reference directly to `/v1/token`; it did not load `FLOW_CLIENT_ID`/`FLOW_CLIENT_SECRET` from `.env.local`. This run loaded the current Sandbox configuration from `.env.local`. The failed check therefore does not establish that the previously successful Production credentials have stopped working or been revoked. No new Production document was created during this audit.
- A dedicated test editor account `ck-test-1791698643414` (`CK TEST staging editor`) was created in this staging company. Its generated password is stored only in ignored `.local/staging-test-account.json`; existing accounts, passwords and roles were unchanged.
- Real password login, refresh, empty catalog display, supplier/product searches and no horizontal overflow passed at 390×844 and 1024×768 using the production build. Anonymous catalog access returned 401; editor account management and live submission returned 403; an unavailable document/history returned 404; attempted save with nonexistent supplier/product returned 400.
- **0 receiving drafts and 0 FlowAccount documents were created.** Staging writes consisted of the new test account/profile/membership, its login-attempt counters and Sandbox catalog cache/request-budget records. No other project database was accessed.

## Implementation

- Preserved username/password authentication, active membership checks on APIs, company-scoped draft storage, version checks, numeric item snapshots and creator/editor/audit timestamps.
- Added runtime staging identity/TLS verification before authenticated APIs and password-login writes. Wrong company, unconfirmed host/database and TLS mismatch fail closed.
- Added `npm run dev:staging` / `npm run start:staging`: verify CK Recycle staging first, force Sandbox live catalog reads, disable local mock login and keep live document submission blocked. Bound to loopback; these commands do not deploy Railway/Vercel.
- Explained empty upstream catalog and sanitized authentication, rate-limit, incomplete-data and connection errors. No upstream body or secret is exposed.
- Scoped request-budget cleanup to the configured company; reject malformed receipt action routes and excessive discounts clearly.
- Isolated local E2E output from the existing dev server, fixed local migration/mock TLS configuration leakage, extended refresh/edit/relogin tests, and scanned tracked plus nonignored untracked source for configured secrets.

## Validation

- Unit/integration tests: 28 passed (local fixtures, including pagination, multi-unit IDs, money/VAT and staging target mismatch).
- Browser E2E: 14 passed, mobile and tablet, **local PGlite/mock catalog only**. Includes save, refresh, edit, save, new login and reopened draft. Example: 12×8.50−5.00 = 97.00; VAT 6.79; total 103.79.
- Migration runner: four migrations, repeat run unchanged, local membership provisioning passed. No Railway migration write.
- TypeScript, production build, production smoke and secret scan passed. This is not a claim that real-service receiving E2E has passed.
- Private real-service evidence/screenshots: `.local/staging-ui-result.json`, `.local/staging-mobile.png`, `.local/staging-tablet.png`.

## Remaining acceptance and manual trial

Sandbox receiving save/edit/relogin remains blocked by the empty catalog. Add clearly named test suppliers/products in the authorized Sandbox account, then refresh catalog. Do not substitute production records or mock IDs for Sandbox data. Production catalog requires credentials authorized for Production; keep them separate from Sandbox and out of Git/chat.

Open http://127.0.0.1:3030/login; use an existing username/password; choose “ไปหน้ารับสินค้า”, then “สร้างใบรับสินค้า”. Once Sandbox data exists, update catalog, select supplier/product and its unit, enter buyer/date/quantity/price/discount/VAT and “เก็บร่าง”. Refresh, open by reference, change quantity, save, log out/in and open again. Check totals and audit history. Do not submit to FlowAccount.

Reproducible guarded real-service browser check: `npx tsx scripts/check-staging-ui.ts` while `CK_PORT=3030` and staging server is running. With nonempty Sandbox catalog it creates one explicitly named CK TEST draft per viewport, edits and reopens after login, verifies VAT/audit, and reports every ID/reference. Existing test credentials are reused without resetting passwords.

Official mapping checked: [Product API](https://developers.flowaccount.com/tutorial/product-api/) uses `productLists[*].id` for document item references, preserving `unitId` and `unitName` separately from product-master IDs; [product retrieval](https://developers.flowaccount.com/tutorial/product-api/get-product/) describes pagination; [client credentials](https://developers.flowaccount.com/tutorial/connect/client-credentials-flow/) documents OAuth `invalid_client`. Live purchase submission remains disabled.
