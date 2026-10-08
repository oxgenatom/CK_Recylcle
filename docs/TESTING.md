# Verification — 8 October 2026

Executed locally on Windows using Node.js 25.2.1, Next.js 16.4.0 and Chromium. Recommended deployment runtime is Node 22 LTS or a compatible supported version. Test databases were PGlite PostgreSQL WASM, isolated from production. No real FlowAccount requests, Vercel deployments or Railway restores were performed.

| Check | Verified result |
|---|---|
| Unit/contract/database/TLS | 16 tests passed |
| E2E normal mock | 12 tests passed at 390×844 and 1024×768 |
| E2E timeout mock | 12 tests passed; unknown blocks repeat submission |
| Production build | successful optimized Next.js build and TypeScript check |
| Production smoke | page 200, protected API 401, local mock login denied with flag true |
| Migration runner | all three SQL migrations applied; repeated run unchanged; membership CLI passed |
| npm install audit | 0 vulnerabilities reported at installation |

E2E verifies active membership, unauthenticated access, editor submission denial, Origin checking, input validation, stale draft versions, cross-company document hiding, atomic submission claim, one submission audit for simultaneous requests, stored mock ID/number, persistence after reload, exact decimal total, review/confirmation and recovery of an interrupted submitting record. Tests exercise the application API and PostgreSQL transactions; PGlite uses a serialized local connection. True overlapping PostgreSQL transactions and multiple Vercel instances still require Railway staging verification.

Visual screenshots are in ignored `test-results/mobile-draft.png` and `test-results/tablet-draft.png`. Browser simulation is not proof of actual iOS/Android behavior. Physical device keyboard/orientation/long-list UAT remains outstanding. OIDC login against the owner's real provider is not configured; tests use the strictly local development login.

Live contract and UAT outstanding: contacts/product pagination using actual credentials; taxes/discount midpoint agreement; purchase creation response and awaiting status; inventory movements on creation/approval; PO/partial receipts; warehouse support; upstream success followed by database outage; admin reconciliation with an actual Flow ID; TLS endpoint connectivity; hosted connection pooling; backup/restore drill and measured RPO/RTO. Catalog sync is atomic but synchronous; catalogs exceeding the request/time budget need a resumable job before rollout.

See README for rerun commands. Git commit/push results are reported separately after execution; this report does not assert a successful remote push.
