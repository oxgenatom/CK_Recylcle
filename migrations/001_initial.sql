CREATE TABLE companies (id text PRIMARY KEY, name text NOT NULL);
CREATE TABLE memberships (identity text NOT NULL, company_id text NOT NULL REFERENCES companies(id), role text NOT NULL CHECK(role IN ('editor','sender','admin')), active boolean NOT NULL DEFAULT true, PRIMARY KEY(identity,company_id));
CREATE TABLE receiving_documents (
 id uuid PRIMARY KEY, company_id text NOT NULL REFERENCES companies(id), status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitting','synced','failed','unknown')),
 version integer NOT NULL DEFAULT 1, body jsonb NOT NULL, totals jsonb NOT NULL,
 subtotal numeric(18,2) NOT NULL, vat numeric(18,2) NOT NULL, total numeric(18,2) NOT NULL,
 mode text NOT NULL CHECK(mode IN ('mock','live')), flow_id text, flow_number text,
 created_by text NOT NULL, updated_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(company_id,mode,flow_id)
);
CREATE INDEX receipts_company_updated ON receiving_documents(company_id,updated_at DESC);
CREATE TABLE submission_attempts (id uuid PRIMARY KEY, document_id uuid NOT NULL REFERENCES receiving_documents(id), status text NOT NULL CHECK(status IN ('submitting','synced','failed','unknown')), request_hash text NOT NULL, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz, error_code text, flow_id text, flow_number text);
CREATE UNIQUE INDEX single_active_submission ON submission_attempts(document_id) WHERE status='submitting';
CREATE TABLE audit_events (id bigserial PRIMARY KEY, document_id uuid NOT NULL REFERENCES receiving_documents(id), actor text NOT NULL, action text NOT NULL, detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE master_cache (company_id text NOT NULL REFERENCES companies(id), mode text NOT NULL, kind text NOT NULL, data jsonb NOT NULL, synced_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(company_id,mode,kind));