CREATE TABLE supplier_banks (
 company_id text NOT NULL REFERENCES companies(id),
 mode text NOT NULL,
 environment text NOT NULL,
 supplier_id text NOT NULL,
 bank jsonb NOT NULL,
 PRIMARY KEY(company_id, mode, environment, supplier_id)
);
