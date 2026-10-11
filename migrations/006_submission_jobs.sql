CREATE TABLE submission_jobs (
 id uuid PRIMARY KEY, document_id uuid NOT NULL UNIQUE REFERENCES receiving_documents(id),
 company_id text NOT NULL REFERENCES companies(id), environment text NOT NULL,
 requested_by text NOT NULL, draft_version integer NOT NULL, session_version integer,
 status text NOT NULL CHECK(status IN ('queued','running','finished','blocked','unknown')),
 created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, finished_at timestamptz,
 error_code text
);
