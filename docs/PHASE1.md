# Phase 1 — 8 October 2026

## Delivered behavior

- Next.js/TypeScript supplier search by name/tax ID; product search by name/code/unit. Supplier selection fills address, tax ID and branch/code. Product selection preserves product-list ID, master ID, unit ID/name and editable purchase price.
- Server-only token/cache handling. Real catalog mode never falls back to Mock. UI shows loading, no matches, refresh errors, retry and a notice when retaining an older successful cache.
- Explicit Sandbox/Production configuration, exact endpoint validation and redirect rejection. Existing SandboxTransport tests remain Sandbox-only. CatalogTransport allows only token POST and GET contacts/product-masters; purchase calls fail before HTTP.
- Every company API checks session and active membership. Responses use private/no-store. Local catalog login requires development, loopback NEXTAUTH_URL and explicit local flag; it is disabled on Vercel/Railway/production builds.
- All live submission/reconciliation endpoints are blocked. Live service and transport guards provide additional protection. Mock regression submission still uses synthetic records only.
- Full pagination before atomic cache replacement. Duplicate IDs, changed totals, incomplete pages or malformed product units reject the refresh. Environment/company cache keys prevent catalog mixing. Local requests are paced to handle catalogs beyond one rate window; hosted background sync remains Phase 2.
- Existing buyer/date/reference/Decimal totals and drafts are retained. The pre-existing externalDocumentId compact-UUID change was preserved. No new PO, warehouse, lot/serial or barcode feature was added; existing Mock-only fields are hidden in live mode.

## Verification: what actually passed

| Check | Result |
| --- | --- |
| Unit/database/transport tests | 21 passed, including 250-master pagination fixture, multi-unit IDs, Production gates, no catalog purchase HTTP, and local-login restrictions |
| Browser E2E | 14 passed in Chromium at 390×844 and 1024×768; includes outage/retry, no matches, multi-unit selection, price changes, totals and existing draft regression tests |
| TypeScript / production build | Passed |
| Production-build smoke | Page 200, protected company APIs 401, local login denied even with flags enabled |
| Real Sandbox token + GET catalog | Passed with configured local credentials; pagination response accepted; no purchase created |
| Real local Sandbox HTTP access | Unauthenticated catalog 401, authenticated catalog 200 with no-store, live submit endpoint 403 before accessing a document |
| Real supplier/product selection UAT | Not completed: Sandbox returned no eligible suppliers, so the real-data UI checker stopped before selection |
| Production FlowAccount UAT | Not performed: existing .env.local selects Sandbox /test. Production checker rejected mismatched configuration before HTTP; Sandbox was not switched automatically |
| Secrets / business records | Staged-file heuristic scan and exact local-secret scan passed; .env.local, .local caches, node_modules, screenshots and test artifacts excluded |
| GitHub access | Both local Git and connected GitHub returned Repository not found / 404 for oxgenatom/CK_Reycle; push awaits repository access |

The Production token, prior receipt creation and salesName results reported by the owner are prior evidence, not new tests in this Phase. Actual document numbers, buyer names and business records are deliberately excluded from this report. No new FlowAccount receipt, contact or product was created or changed. Existing transport POST tests use synthetic fetch functions; browser submission tests use Mock only. No purchase list/detail endpoint was used in the real checks.

Physical iOS/Android keyboards, orientation, large real multi-page catalogs, real multi-unit selection, revoked/expired Production credentials and hosted OIDC are still unverified. Unit fixtures prove pagination/mapping behavior, not contents of the owner's Production catalog.

## Open locally

Keep Sandbox credentials and `/test` URL in ignored `.env.local`; run `npm run dev:catalog:sandbox`, then http://127.0.0.1:3000 and credentials login `catalog-user`. An empty supplier result is displayed honestly. To use an alternate port:

```powershell
$env:CK_PORT='3002'
npm run dev:catalog:sandbox
```

Production requires explicitly configuring `/v1` with Production credentials before `npm run check:catalog:production` / `npm run dev:catalog:production`. Never send credentials in chat or commit them. The local helper uses a separate local DB for each environment. Do not run helpers simultaneously; the database socket uses 54329. The helper started for this verification was stopped afterward; the pre-existing server on 3000 was left alone.

## Railway readiness (read-only assessment)

No Railway DATABASE_URL, TLS certificate, OIDC configuration or company membership setup was supplied in the project's local environment. Repository code was inspected: pg uses a small pool, external URLs require verified TLS, migrations and membership provisioning are separate administrative commands, and the company APIs check active membership. No Railway connection, migration, provisioning, data write, backup or restore was attempted. This is code/configuration readiness, not proof that Railway is reachable or operational.

Phase 2 work:

1. Establish staging/production database endpoints, verified TLS, runtime/migration roles, connection limits and separate environments. Test connectivity read-only first; apply migrations only in the next authorized phase.
2. Configure hosted OIDC and company membership; verify login, revocation and cross-company access before exposing company data. Keep all local login flags off on hosting.
3. Provide a populated approved catalog environment for real supplier/product selection and multiple-page/multiple-unit UAT. Recheck actual unit codes/prices/branches without committing business fixtures.
4. Implement background catalog sync for hosting duration limits, resumable pagination/rate control and monitoring; local in-process pacing is not a distributed sync worker.
5. Verify Railway staging draft persistence, concurrent updates, backup/restore and rollout/rollback. No DB readiness claim can be made until these are tested.
6. Separately authorize and implement receipt submission: buyer → salesName, externalDocumentId ≤36, payload/tax/rounding/stock UAT, idempotency/unknown-outcome reconciliation. Keep live writes blocked until that work is reviewed.
7. Resolve GitHub repository access and push the reviewed local commit. No public deployment was performed in Phase 1.
