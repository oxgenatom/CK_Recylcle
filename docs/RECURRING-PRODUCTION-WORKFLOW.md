# CK Recycle recurring receipt review — 11 October 2026

Owner policy: an approver may approve a draft they created or requested themselves. This does not confer sender permission. No existing member gains review permissions through migration.

## Roles and actions

| Capability | Actions |
|---|---|
| editor | Create/edit draft, request review, cancel own pending request |
| reviewer (`can_review`) | Inspect and return a pending request with a required reason |
| approver (`can_approve`) | Approve a pending request for submission; return with reason; self approval allowed |
| sender | Send only an approved Production draft when the server switch is open |
| admin | Existing edit/send/account administration; review/approval still require explicit capability flags |

All active company members can read company drafts/history. State filters expose pending and approved queues. Admin account management has separate review capability controls and requires a reason; changes have a company-scoped permission audit. Staging `admin` was explicitly granted reviewer/approver by the owner for Preview. Staging editor remains unchanged. New Production admin starts with both flags false and must change its temporary password.

## State and integrity

`draft → pending_review → approved → queued worker → submitting → synced/unknown`

Queue progress is a durable job associated with the approved draft. A blocked job before an attempt can proceed only after a changed version and a new review; an interrupted job or any Production attempt cannot be automatically retried. Return/cancel lead back to draft and preserve the review record. Edits invalidate pending/approved records and increment version. Opening the review screen never saves or invalidates approval.

Each review records draft ID, requested version, SHA-256 of the actual outgoing payload, company/environment, requester/time, decision actor/time/reason, and approved state version. Submission rechecks active sender membership, current version/hash, fresh complete supplier/product catalog and mapping, and absence of any old attempt under locks before permanently consuming approval and inserting the attempt. Product catalog changes invalidate approval and require saving/review again. A completed POST never has an automatic retry. Readback mismatch/timeout becomes unknown; reconciliation requires a known verified FlowAccount ID and complete matching evidence. Empty search results are never proof of absence.

**CK Recycle approval permits creating a document only. FlowAccount remains awaiting approval (status 1). No FlowAccount update/delete/document-approval/payment endpoint is used.**

The old one-shot for draft `9b189b25-6d48-42ac-988f-8365f0fd8d55` is retired. RI2026100001 / Flow ID 16937872 and its consumed attempt/history remain in staging without modification. The historical grant helpers/evidence remain for audit, but do not authorize the recurring API. The old execution script fails before any operation. The new Production database is independent; no staging accounts, drafts or accounting history were copied.

## Hosting and operations

Preview: https://ck-recycle-preview-oxygenatoms-projects.vercel.app — staging PostgreSQL only, password auth, Vercel SSO retained, all external document writes disabled.

Production: separate Railway PostgreSQL / `ck-recycle-production`, verified TLS with the root CA fetched over authenticated Railway SSH. The temporary SSH key was revoked immediately afterward. Public PostgreSQL proxy was separately owner-authorized. Different auth secret/database/company from Preview; server-only credentials; max two pool connections per web instance. Vercel build runs `npm ci` and `npm run build`, never migrations. Runtime refuses Preview/Production database mismatch. Use the configured canonical NEXTAUTH_URL; arbitrary deployment origins cannot mutate.

`FLOW_PRODUCTION_SUBMISSION_ENABLED=false` is the default and stays false at handoff. The old one-shot env grant is ignored by the recurring write gate. Production additionally requires exact API URL/read configuration and an approved matching database record. Preview can never enable Production submission.

Production preflight may exceed Vercel request limits: full catalog plus shared request budget can span minutes. The web only enqueues; a dedicated Railway worker runs `npm run worker:submission` with `CK_SUBMISSION_WORKER=true`, the same confirmed Production target, and the server switch. It awaits each complete operation; no background Promise is attached to a web request. Web catalog refresh is one page per request; budget exhaustion returns 429 on Vercel. Worker jobs are claimed once with SKIP LOCKED; crashed running jobs become unknown after 30 minutes and are never automatically returned to the queue. Jobs retain requester/session version/expiry; expired or revoked sessions are blocked before sending. Membership is rechecked after lengthy preflight.

## Before opening document submission

1. Owner chooses explicit Production reviewer/approver/sender memberships; test them on the hosted app. Production admin capability flags start false.
2. Verify the dedicated worker and credentials/target, catalog/mapping, reconciliation and monitoring. Confirm the Vercel plan/connection capacity; retain low pools and monitor PostgreSQL max connections.
3. Owner separately authorizes opening the recurring Production submission switch. Deployment permission does not authorize accounting writes.
4. Review and approve the first exact real draft, then obtain the owner's separate first-document authorization before pressing send.

Rollback: set the submission switch false on both web and worker and stop worker processing before changing deployment. Preserve jobs, attempts, reviews, audit and the additive migrations. Roll back the Vercel deployment only to a version compatible with these statuses; do not roll back to the one-shot implementation. An interrupted claimed operation needs known-ID reconciliation, never resend. Do not drop tables or erase history to unblock a job.

## Preview trial

Sign into Vercel when prompted, then CK Recycle with an existing staging account. Editor: save a draft clearly marked QA, request review, inspect pending status. Admin: inspect supplier/item/unit/quantity/price/discount/VAT/total/buyer/date/environment, approve or return with reason. Try canceling your own pending request; edit an approved QA draft and confirm it returns to draft with preserved audit. Production send stays disabled. Existing RI2026100001 must remain synced and cannot be resubmitted.

## Validation and handoff

Production website: https://ck-recycle.vercel.app (Vercel login protection retained). The new admin temporary credential is only in the ignored local file `.local/production-admin-initial-credentials.txt`; change it at `/account` on first login. No staging password/account was copied or reset.

Applied migrations: staging received additive 005–007 after verified target/TLS checks; the new, empty Production database received 001–007. Repeat migration runner tests left seven applied records unchanged. Final read-only Production check found zero documents, zero attempts and zero jobs; only new admin, with mandatory password change and both review flags false. PostgreSQL max_connections is 500; each web/worker pool is bounded to two connections (total deployed instances must still be monitored).

Validation: 41 unit/service tests, 18 mobile/tablet E2E tests, TypeScript, optimized Production build, idempotent migrations, and heuristic/exact secret scanning passed. Exact scans include both staging and Production configured secrets and browser bundles. Service tests intercept all external HTTP: stale/concurrent approval, self approval, return/cancel, edit/catalog invalidation, company/environment separation, expired/revoked session/membership/approver, permanent claim, a single simulated timeout POST, and confirmed-ID reconciliation with persisted readback. No new Sandbox or Production accounting document was created by these tests; earlier Sandbox acceptance evidence remains in SANDBOX-SUBMISSION-REVIEW.md.

Hosted Preview checks passed password login, Secure/HttpOnly session cookies, origin rejection, verified staging identity, mobile/tablet overflow checks, local QA request/cancel/history, editor approval denial and Production submission rejection. RI2026100001 remains synced. Hosted Production checks passed HTTPS login with the new admin, forced password change, Secure/HttpOnly cookie, origin rejection and mobile/tablet account layout. Business APIs correctly reject this account until its password is changed. Approval/return on the hosted Preview still needs the owner to trial with the existing admin password, which was not reset; all roles are covered by automated fixtures. Production business-screen/member setup requires the owner to complete initial password change and choose memberships.

Dedicated Railway worker service: `ck-recycle-submission-worker` (`b64ef7aa-f103-4faa-a3b2-43743228a795`). Startup verified the Production database and reported submission disabled. The full initial Production catalog was populated using read-only GET requests: 576 suppliers and 3,508 product units. The worker is idle while the write switch is false; real accounting execution is intentionally untested until separate owner authorization.

Vercel Hobby with Fluid compute currently permits up to 300 seconds, but these web routes deliberately use a 60-second bound. Full catalog validation can exceed either bound under the shared request budget, so durable worker processing is required. Reference: [Vercel function limits](https://vercel.com/docs/functions/limitations), [Railway Dockerfile configuration](https://docs.railway.com/config-as-code/reference). Builds never migrate; manual deployments are used, and Git auto-deploy is not connected.
