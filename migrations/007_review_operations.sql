ALTER TABLE submission_jobs DROP CONSTRAINT submission_jobs_document_id_key;
ALTER TABLE submission_jobs ADD CONSTRAINT submission_jobs_version_key UNIQUE(document_id,draft_version);
CREATE UNIQUE INDEX one_live_submission_job ON submission_jobs(document_id) WHERE status IN ('queued','running','unknown');
ALTER TABLE submission_jobs ADD COLUMN auth_expires_at timestamptz;
CREATE TABLE membership_permission_events (
 id bigserial PRIMARY KEY, company_id text NOT NULL REFERENCES companies(id), identity text NOT NULL,
 actor text NOT NULL, reason text NOT NULL, old_permissions jsonb NOT NULL, new_permissions jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
