CREATE TABLE profiles (identity text PRIMARY KEY, display_name text, created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO profiles(identity) SELECT DISTINCT identity FROM memberships ON CONFLICT DO NOTHING;
ALTER TABLE memberships ADD CONSTRAINT memberships_profile_fk FOREIGN KEY(identity) REFERENCES profiles(identity);
CREATE TABLE receiving_items (
 document_id uuid NOT NULL REFERENCES receiving_documents(id) ON DELETE CASCADE,
 line_number integer NOT NULL CHECK(line_number>0), product_id text NOT NULL, master_id text NOT NULL,
 unit_id text, unit_name text NOT NULL, product_name text NOT NULL, product_code text NOT NULL,
 quantity numeric(18,4) NOT NULL CHECK(quantity>0), price numeric(18,4) NOT NULL CHECK(price>=0),
 line_total numeric(18,2) NOT NULL CHECK(line_total>=0), vat_type integer NOT NULL,
 PRIMARY KEY(document_id,line_number)
);
INSERT INTO receiving_items(document_id,line_number,product_id,master_id,unit_id,unit_name,product_name,product_code,quantity,price,line_total,vat_type)
 SELECT d.id,i.ordinality::integer,i.item->>'productId',i.item->'product'->>'masterId',i.item->'product'->>'unitId',i.item->'product'->>'unit',i.item->'product'->>'name',COALESCE(i.item->'product'->>'code',''),(i.item->>'quantity')::numeric,(i.item->>'price')::numeric,(d.totals->'lines'->>(i.ordinality::integer-1))::numeric,(i.item->'product'->>'vatType')::integer
 FROM receiving_documents d CROSS JOIN LATERAL jsonb_array_elements(d.body->'items') WITH ORDINALITY AS i(item,ordinality);