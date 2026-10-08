# Vercel / Railway deployment and recovery

Phase 1 update (8 October 2026): Production catalog reads now have separate explicit configuration. All live purchase submission/reconciliation is blocked. The rollout instructions below are historical planning; do not enable document writes. See [current Phase 1 readiness](PHASE1.md). No Railway database changes were made in Phase 1.

No services have been provisioned and no deployment has been performed. Confirm company/user counts, roles and approval requirement, free-text/list buyers, new vs PO/partial receipts, warehouses, VAT/discount rules, repository visibility, account ownership, budget and authorized FlowAccount test method first. The present deployment model is one company per app. Do not turn on production gates before that confirmation and UAT.

## Railway PostgreSQL

1. In the owner's Railway project create separate PostgreSQL services for staging and production, with separate users/passwords and volumes. Choose region and spending limits with the owner. See [PostgreSQL](https://docs.railway.com/databases/postgresql).
2. Vercel is outside Railway private networking: configure the external database endpoint or approved TLS-enabled pooler. Protect credentials in server env. A small pg Pool per Vercel instance is not a global connection limit; size a pooler and server max_connections for the expected workload. See [connection pooling](https://docs.railway.com/databases/postgresql-connection-pooling).
3. Configure TLS and verify the server certificate. Obtain the correct CA from the database operator and set DATABASE_CA_BASE64; remove sslmode/sslrootcert query parameters from DATABASE_URL in that case because pg's URL parser can override ssl options. Alternatively use a valid certificate chain with sslmode=verify-full. The app and administrative CLI reject nonlocal URLs without verified TLS settings. Do not disable certificate verification to get past an error. Test the endpoint from the Vercel region before rollout.
4. Run `npm ci`, then `npm run db:migrate` against staging first. Migrations are ordered and tracked with an advisory transaction lock. Run them as a controlled release step, not during Vercel build or on every API request. Use a migration role with schema permission; use a restricted runtime role for application tables and sequences afterward.
5. Set APP_COMPANY_ID and provision the initial OIDC admin with `npm run db:member -- "issuer|subject" admin`. Configure users with editor/sender roles. Revoke by setting active=false. Do not seed mock identities in production.

## Vercel

Import the specified GitHub repository after GitHub access is fixed. Choose Next.js and Node.js 22 LTS or a compatible newer supported runtime. Install `npm ci`; build `npm run build`. Set all values from .env.example in [server environment variables](https://vercel.com/docs/environment-variables), scoped separately for Preview and Production. Do not put credentials into a build command, a public-prefixed variable, or a tracked file. Environment changes require a new deployment.

Preview uses a staging DB, separate OIDC app, and FLOW_MODE=mock or an explicitly authorized sandbox. MOCK_LOGIN_ENABLED must be false on Vercel. Use OIDC for hosted mock testing. NEXTAUTH_URL must match the canonical HTTPS URL registered with OIDC and its callback `/api/auth/callback/oidc`. Use stable staging URLs for login callbacks. Keep preview deployment access restricted. Ensure VERCEL/VERCEL_ENV system variables are exposed so preview production protection is effective.

After approval, sandbox uses FLOW_MODE=live, FLOW_BASE_URL=https://openapi.flowaccount.com/test and FLOW_API_APPROVED=true. Production FlowAccount access is now hard-disabled in code. This revision accepts only /test; enabling production requires a separate reviewed implementation after authorization and UAT. Current live rules permit only new receipts, exclusive VAT 7%, no discount/warehouse/PO. API routes use Node runtime and maxDuration=60; confirm the selected Vercel plan's function limit, region and budget before provisioning. More than the API rate budget's pages per catalog refresh requires a resumable background sync design before rollout.

Smoke checks: OIDC login/revocation; role restrictions; draft save/reload; cross-company access; two simultaneous requests against real PostgreSQL; FlowAccount sandbox totals and stock effects; timeout and reconciliation; mobile iOS/Android keyboard/footer; staging restore. Watch 5xx responses, connection counts, unknown/submitting records and API rate budget. Never log tokens, full credential URLs or raw upstream responses.

## Backup and restore

Set RPO, RTO, retention and backup ownership with the owner. Enable [Railway volume backups](https://docs.railway.com/volumes/backups) according to the current plan; verify actual successful backups and restore behavior. Keep an encrypted off-platform logical backup as a separately scheduled operation if required. No backup schedule or paid service has been created by this implementation.

For logical backups use matching PostgreSQL client tools and a protected PGSERVICEFILE or environment configuration; avoid passing password URLs on the command line. Example using a preconfigured `ck_backup` connection service:

```powershell
pg_dump --dbname="service=ck_backup" --format=custom --file="D:\SecureBackups\ck-recycle.dump"
pg_restore --list "D:\SecureBackups\ck-recycle.dump"
```

Create a **new empty isolated database** for a restore drill with Flow gates disabled. A preconfigured `ck_restore` connection service must point to this database:

```powershell
pg_restore --dbname="service=ck_restore" --no-owner --no-acl --exit-on-error "D:\SecureBackups\ck-recycle.dump"
```

Verify migration versions, company membership, receipt counts, exact money values, document IDs and audit history; run staging tests and measure recovery time. These commands have not been executed on Railway. Do not overwrite production as a restore drill.

Before switching to a restored database, freeze receiving submissions and reconcile every document created in FlowAccount after the backup time. Restored draft state can precede an externally created document; do not re-send it. External FlowAccount is authoritative. Account for unknown and interrupted attempts explicitly.

Rollback: freeze submission; retain backups and current DB; roll Vercel back to the previous known compatible deployment. Both migrations are additive; do not drop tables in a rollback. After a DB restore, reconcile FlowAccount IDs before re-enabling submit. Rotate secrets through service dashboards and redeploy; invalidate sessions when rotating NEXTAUTH_SECRET.
