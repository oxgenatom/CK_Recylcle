# Phase 2 — 9 October 2026 (in progress)

Phase 2 is not complete: the owner has not created Railway/Vercel staging, selected OIDC, or named the initial administrator. No remote database write, login or deployment has been attempted. Company name: CK Recycle.

## Railway first

1. Sign into https://railway.com/dashboard. Create a dedicated project named CK Recycle Staging. Confirm billing/region in your dashboard before provisioning. Do not connect an existing production database.
2. Create an empty environment named staging. In that environment choose New → Database → PostgreSQL. Name the service ck-recycle-staging-db. Wait for deployment and its persistent volume to be healthy.
3. Confirm project/environment/service names in chat, without credentials. Reserve a separate PostgreSQL service ck-recycle-restore-drill for the later restore test; do not restore into the source service.
4. Since local tools and Vercel are outside private networking, use Settings → Networking → Public Access / TCP Proxy. Copy DATABASE_PUBLIC_URL privately into ignored .env.local as DATABASE_URL. Never paste it into chat. Obtain the database CA/certificate chain securely from the operator; configure DATABASE_CA_BASE64 with no SSL URL parameters, or sslmode=verify-full with a trusted chain. A proxy hostname must match the certificate. If validation fails, stop and fix the certificate/endpoint; do not use rejectUnauthorized=false or sslmode=require.
5. Run npm run check:phase2 -- --database. This starts a READ ONLY transaction, checks SELECT 1, active TLS and whether the migrations table exists. It prints no connection URL or business rows. This works before OIDC is selected. The check has not yet run against Railway.
6. After owner confirmation and successful read-only connectivity, privately set CK_DB_ENVIRONMENT=staging, CK_STAGING_DB_HOST and CK_STAGING_DB_NAME to match DATABASE_URL exactly. Run npm run db:migrate. Administrative migration/member commands reject an unconfirmed or mismatched target. Existing migrations 001–003 are retained; no schema change is currently needed.

Official references: https://docs.railway.com/databases/postgresql and https://docs.railway.com/guides/postgres-backups-restores. Dashboard labels/features can vary. Railway SSL availability does not prove hostname/certificate verification succeeded.

## OIDC and memberships (after Railway)

Select a provider supporting discovery, authorization code and PKCE. Create a separate staging client. Store OIDC_ISSUER (exact issuer), OIDC_CLIENT_ID, OIDC_CLIENT_SECRET and a cryptographically random NEXTAUTH_SECRET of at least 32 bytes privately. NEXTAUTH_URL is the stable HTTPS staging origin. Register exactly NEXTAUTH_URL/api/auth/callback/oidc. Set all three local-login flags false. Run npm run check:phase2 to validate configuration. No email-based automatic enrollment: identity is exact issuer|sub. The owner must supply the first user's subject and role before npm run db:member -- "issuer|subject" admin. APP_COMPANY_ID identifies CK Recycle separately from its display name. JWT sessions last eight hours; every protected API checks active membership anew. Revocation uses memberships.active=false and takes effect on the next request. Re-enrollment CLI explicitly reactivates a membership.

The buyer field remains independent of login identity. Local credential identities are additionally rejected on hosting/production, even if a previously issued JWT is supplied. Live purchase submission remains blocked in route/service/transport.

## Vercel staging (after authentication readiness)

Choose owner team/project and a stable staging domain, import the existing repository as Next.js and scope environment variables to staging Preview only. Keep deployment access restricted until OIDC/membership tests pass. Set the staging PostgreSQL connection, company and OIDC values in the dashboard; never in build arguments. Use a small DB pool and plan aggregate connections across instances. Do not run migrations in builds. Start with mock catalog data or explicitly approved Sandbox reads; never change Sandbox into Production automatically. Hosted local login stays disabled.

## Required real-service acceptance record

Record results without business data: OIDC authorized user can log in; unknown user is denied; expired session denied; same session denied immediately after membership revocation; other-company receipt IDs and history inaccessible; buyer differs from login; save/create/edit/reload/restart retains drafts; two PUTs with the same version yield exactly one success and one 409; live submit returns 403 without upstream HTTP. Test with two companies and real staging PostgreSQL, then repeat on restricted Vercel staging. Existing PGlite/browser fixtures are not Railway or OIDC evidence.

## Backup / restore

Choose backup owner, retention and RPO/RTO. Enable scheduled Railway backups and verify a completed backup. Railway volume restoration affects its source service; do not use it for this isolated drill. Instead use pg_dump custom format through a protected connection service with verified TLS, encrypt/store the dump outside Git, and pg_restore --no-owner --no-acl --exit-on-error into the separately confirmed empty restore service. Never pass password URLs on CLI or restore over staging/production. Compare migration versions, membership counts, draft/item counts, exact money/version values and audit history privately; test draft access on the restored service with writes to FlowAccount disabled. Record backup time, restore duration and comparison result. See DEPLOYMENT.md for connection-service examples. No dump or restore has yet been executed.

## Evidence

- Real checks: repository inspection, configuration presence-only scan. Baseline 854d8d7; initial tree clean including next-env.d.ts.
- Local synthetic tests: 24/24 passed; TypeScript passed. Production build passed. Local PGlite migration runner passed (001–003, repeat run, membership provisioning).
- Not tested: Railway TLS/connectivity/migrations/persistence/concurrency/restore; real OIDC login/revocation; Vercel deployment.
- Blocked by setup: staging services, provider and first administrator not selected/provisioned.

