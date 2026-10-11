ALTER TABLE memberships ADD COLUMN can_review boolean NOT NULL DEFAULT false;
ALTER TABLE memberships ADD COLUMN can_approve boolean NOT NULL DEFAULT false;
ALTER TABLE receiving_documents DROP CONSTRAINT receiving_documents_status_check;
ALTER TABLE receiving_documents ADD CONSTRAINT receiving_documents_status_check CHECK(status IN ('draft','pending_review','approved','submitting','synced','failed','unknown'));
CREATE TABLE draft_reviews (
 id uuid PRIMARY KEY, document_id uuid NOT NULL REFERENCES receiving_documents(id),
 company_id text NOT NULL REFERENCES companies(id), environment text NOT NULL,
 draft_version integer NOT NULL, request_hash text NOT NULL,
 requested_by text NOT NULL, requested_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL CHECK(status IN ('pending','approved','returned','cancelled','invalidated','consumed')),
 decided_by text, decided_at timestamptz, reason text NOT NULL DEFAULT '',
 approved_version integer
);
CREATE UNIQUE INDEX one_current_review ON draft_reviews(document_id) WHERE status IN ('pending','approved');
ALTER TABLE submission_attempts ADD COLUMN review_id uuid REFERENCES draft_reviews(id);
