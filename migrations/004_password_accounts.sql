CREATE TABLE password_accounts (
 identity text PRIMARY KEY REFERENCES profiles(identity),
 company_id text NOT NULL REFERENCES companies(id),
 username text NOT NULL UNIQUE CHECK(username ~ '^[a-z0-9._-]{3,40}$'),
 display_name text NOT NULL,
 password_hash text NOT NULL,
 must_change boolean NOT NULL DEFAULT true,
 session_version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE login_limits (
 username text PRIMARY KEY,
 window_start timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 0
);
