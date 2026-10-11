# CK Recycle

Next.js 16 + TypeScript mobile/tablet receiving app. **Phase 1 connects the real supplier/product catalog; live document submission is disabled at route, service and transport layers.** FlowAccount credentials and tokens stay on the server. Production deployment has not been performed.

## Phase 1: open the real catalog locally

Keep credentials in ignored `.env.local` or server environment variables. For Sandbox use `FLOW_BASE_URL=https://openapi.flowaccount.com/test`, Sandbox credentials, and `FLOW_API_APPROVED=true`.

```powershell
npm ci
npm run check:catalog:sandbox
npm run dev:catalog:sandbox
```

Open http://127.0.0.1:3000, choose the credentials login and enter `catalog-user`. Select “สร้างใบรับสินค้า” to open the form; search/select suppliers and product units. Buyer/date/reference and editable purchase prices/totals are retained. Saving creates a local web draft only. No live FlowAccount purchase can be submitted.

Production is a separate explicit configuration: set `FLOW_BASE_URL=https://openapi.flowaccount.com/v1` and Production credentials yourself, then run `npm run check:catalog:production` and `npm run dev:catalog:production`. These commands explicitly approve token + catalog GET only and require the matching URL; they never switch an existing Sandbox URL automatically. For OIDC deployments select `FLOW_ENVIRONMENT=production` and `FLOW_PRODUCTION_READ_APPROVED=true` explicitly. Do not expose live data publicly before hosted OIDC/membership verification.

Local catalog servers bind to 127.0.0.1 and use separate ignored `.local/catalog-sandbox-db` / `.local/catalog-production-db` databases. The development-only catalog login is disabled on production builds, Vercel and Railway. All catalog endpoints check session and active company membership and respond with `private, no-store`. No credentials are returned to the client. Use `CK_PORT=3002` to choose another local port. The local DB socket uses port 54329; run only one local helper at a time.

GET `/contacts` includes supplier types 5/7; GET `/product-masters` traverses all pages (100 masters/page). Every `productLists.id` is a distinct selectable unit; unit ID/name, per-unit code and purchase price are preserved. Duplicate IDs, changing totals, incomplete pages and malformed units fail the refresh rather than publishing partial data. Missing purchase price defaults to zero and is editable. Catalog refresh publishes atomically and keeps the previously successful cache with an explicit stale-data notice on failure; it never substitutes Mock data. Caches are separated by company and environment. Local requests are paced conservatively for large catalogs; hosted long-running refreshes need a background sync design in Phase 2.

See [Phase 1 results and Railway checklist](docs/PHASE1.md). `scripts/check-catalog-ui.ts` can verify real catalog selection in local Chromium at mobile/tablet sizes without logging business records or saving a receipt.

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

Default FLOW_MODE is mock. FLOW_MODE=live uses the explicit Phase 1 catalog configuration above. The legacy `check:sandbox` command and SandboxTransport tests remain Sandbox-only. No real credentials are included.

Hosted catalog requests use shared database rate reservations (18/minute conservative budget). Oversized hosted refreshes fail clearly and keep the last complete cache; Phase 1 real-data UAT uses the paced local helper.

Live POST /purchases and live reconciliation are disabled for Phase 1. Existing document transport/payload code is retained for regression tests with synthetic fetchers only. The previously confirmed `salesName` buyer mapping and 36-character `externalDocumentId` limit are Phase 2 requirements; Phase 1 does not submit a payload. Mock submission remains available for regression tests. Totals use Decimal with two-place half-up line rounding and four-place quantities/prices.

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

Legacy `npm run dev:sandbox` still uses the isolated `.local/sandbox-db` and `sandbox-user` login; live purchases are now blocked there too. Prefer `dev:catalog:sandbox` for Phase 1. Neither local helper verifies Railway or hosted OIDC. No migration is added in this Phase; Railway migration/provisioning awaits Phase 2.

See [current feature verification](docs/STATUS.md) for mock/service distinctions and outstanding setup.

## Phase 2 staging setup (in progress)

Start with [Railway → OIDC → Vercel instructions and verification status](docs/PHASE2.md). Run `npm run check:phase2 -- --database` for sanitized read-only PostgreSQL preflight, then `npm run check:phase2` once OIDC is configured. `db:migrate` and `db:member` now require CK_DB_ENVIRONMENT=staging plus CK_STAGING_DB_HOST/CK_STAGING_DB_NAME matching the owner-confirmed database. No real-service Phase 2 success is claimed yet. Live FlowAccount writes remain disabled.
# Current staging catalog workflow (11 October 2026)

See [Production catalog and staging drafts](docs/PRODUCTION-CATALOG-STAGING.md) for the current username/password workflow, separate Production/Sandbox credentials, resumable pagination and real-service acceptance results. Earlier phase notes below are historical. Live FlowAccount document writes remain disabled.
