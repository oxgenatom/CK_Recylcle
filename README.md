# CK Recycle

Next.js 16 + TypeScript mobile/tablet receiving app. PostgreSQL stores authenticated drafts, immutable submission snapshots and audit history. FlowAccount calls run only on the server. **Production has not been deployed or tested.**

## Run locally without external services

Requires Node.js 22 LTS or later and npm.

```powershell
npm ci
npm run dev:mock
```

Open http://127.0.0.1:3000 and choose the local test login. Enter `mock-user` (admin), `mock-editor` (draft editor), or leave the username blank for admin. Local test login is restricted to NODE_ENV=development, no VERCEL environment, and mock Flow mode. Disabled membership `mock-disabled` is denied. Mock documents have `MOCK-` numbers and are never sent externally. `.local/mock-db` persists drafts across restarts and is ignored by Git. This PGlite database is for local development only; production uses Railway PostgreSQL.

## PostgreSQL and company login

Copy `.env.example` to `.env.local`. The example contains variable names only. Set DATABASE_URL, APP_COMPANY_ID, NEXTAUTH_URL, NEXTAUTH_SECRET, OIDC_ISSUER, OIDC_CLIENT_ID and OIDC_CLIENT_SECRET in server configuration. Choose an OIDC identity provider supporting discovery, authorization code and PKCE. Register callback `/api/auth/callback/oidc`. Use a securely generated random NEXTAUTH_SECRET (32+ bytes). Secrets must never use NEXT_PUBLIC_ prefixes or be pasted into Git.

```powershell
npm run db:migrate
npm run db:member -- "https://your-issuer|user-subject" editor
npm run dev
```

Membership identities are exact issuer plus `|` plus OIDC subject (not email). Roles: editor can read and save company drafts; sender/admin can send; admin can reconcile unknown outcomes. Revoke access by setting memberships.active=false. Every protected request checks the database again. Provision memberships through the administrative CLI; there is no user-management UI yet. One configured company and one set of Flow credentials per deployment; schema isolates companies and mock/live data. Multi-company switching and approval workflows await scope confirmation.

## Workflow

List/search/filter → choose supplier and correct product unit → buyer/date/reference → save draft → review server-calculated totals → confirm submit. Draft version checks reject concurrent edits. Receipt and catalog snapshots persist in PostgreSQL. Save is explicit; unsaved edits show a warning. Sent documents are read-only.

An atomic database update claims each submission before the HTTP call. A unique active-attempt index adds protection. No automatic POST retry. Timeouts, malformed responses and unconfirmed HTTP failures become unknown and cannot be resent. Interrupted submitting records become unknown after two minutes when read/listed. Admin reconciliation verifies a Flow document ID against externalDocumentId and amount, then records the resolution. If no matching document can be found, keep unknown and ask FlowAccount support; there is deliberately no unsafe reset-to-draft button.

## FlowAccount

Default FLOW_MODE is mock. Set live only after approving a test account and defining UAT. Set FLOW_BASE_URL to `https://openapi.flowaccount.com/test`, FLOW_CLIENT_ID/SECRET and FLOW_API_APPROVED=true. This revision hard-rejects every production URL, even if a production approval flag is set. There is no fallback. No real credentials are included.

GET /contacts and GET /product-masters traverse every page before atomically replacing the catalog cache. Supplier types 5/7; each productLists entry is a selectable unit and its ID is used in purchases.items.id. Prices are defaults and can be edited. Refresh errors keep the old cache. Last refresh is visible. Shared database rate reservations leave headroom below FlowAccount limits (18/min sandbox; production is disabled). Large catalogs that exceed a complete refresh within the budget need a background sync job before rollout; sync currently fails clearly and keeps the previous catalog rather than publishing partial data.

POST /purchases stores documentId/documentSerial. Buyer, warehouse and PO stay in the web database and are not sent to another field. SimpleDocument schema has no dedicated buyer or warehouse field; PO linkage uses a separate upgrade workflow, not the free-text reference. Current live submission is deliberately restricted to new receipts with exclusive VAT 7%, no discount, no warehouse/PO, and product buy VAT type 3. Mock supports inclusive/exclusive/no VAT and a document discount in baht. Other live tax/discount combinations require payload/UAT validation before enabling them. Line totals round to two decimals (half up), quantities/prices accept four decimals, and totals are recomputed with Decimal on the server. Rounding midpoint equivalence and stock movement must be checked in the approved Flow test company.

See [API mapping](docs/FLOWACCOUNT.md), [deployment and recovery](docs/DEPLOYMENT.md), and [test results](docs/TESTING.md).

## Checks

```powershell
npm run test
npm run typecheck
npm run build
npm exec playwright install chromium
npm run test:e2e
$env:MOCK_SCENARIO='timeout'
npm run test:e2e
Remove-Item Env:\MOCK_SCENARIO
```

E2E starts Next.js and an ephemeral PostgreSQL-compatible PGlite database; it does not call FlowAccount. Tests cover auth, roles, validation, stale versions, reload persistence, concurrent requests and unknown outcomes at mobile/tablet viewports. Repeat concurrency and restore tests on real Railway staging PostgreSQL before production. Browser tests are Chromium simulations; physical iOS/Android UAT remains required.

Original PLAN.md, index.html and mobile.html are preserved. The application uses React components rather than executing the prototype scripts.
## Sandbox verification (current revision)

Put actual FLOW_CLIENT_ID and FLOW_CLIENT_SECRET in ignored `.env.local` on your own computer. Leave secrets blank in .env.example and never paste them into chat. `npm run check:sandbox` requests a Sandbox token and traverses contacts/product-masters without creating a purchase; its sanitized result is written to `.local/sandbox-check.json`. It rejects placeholder credentials and URLs other than https://openapi.flowaccount.com/test, and disallows HTTP redirects. Running this command explicitly authorizes read-only Sandbox testing.

`npm run dev:sandbox` starts a separate persistent `.local/sandbox-db` and local-only Sandbox test login (`sandbox-user`, or blank username). It uses real Sandbox catalog and purchase APIs, with local PostgreSQL WASM storage. This is not proof of Railway connectivity or OIDC login. The local Sandbox login is disabled outside development and whenever VERCEL is set. Hosted staging must use OIDC and a separate Railway staging DB. New migration 003 adds profiles and receiving_items with NUMERIC quantities/prices and backfills existing snapshots. Saves update the document, item rows and audit in one transaction.

See [current feature verification](docs/STATUS.md) for mock/service distinctions and outstanding setup.
