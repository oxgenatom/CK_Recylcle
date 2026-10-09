import { test } from "node:test";
import assert from "node:assert/strict";
import {
  configurationErrors,
  oidcSubject,
  localIdentityAllowed,
  requireStagingTarget,
} from "../lib/phase2-config";
test("staging configuration fails closed without secrets and with unsafe URLs/local flags", () => {
  assert.equal(configurationErrors({}).length, 7);
  const env = {
    DATABASE_URL: "postgres://test/db",
    NEXTAUTH_URL: "https://staging.example.invalid",
    NEXTAUTH_SECRET: "x".repeat(32),
    OIDC_ISSUER: "https://issuer.example.invalid/tenant",
    OIDC_CLIENT_ID: "test",
    OIDC_CLIENT_SECRET: "test",
    APP_COMPANY_ID: "test",
  };
  assert.deepEqual(configurationErrors(env), []);
  assert.ok(
    configurationErrors({
      ...env,
      OIDC_ISSUER: "http://issuer.invalid",
      MOCK_LOGIN_ENABLED: "true",
    }).length >= 2,
  );
});
test("OIDC requires a real subject and hosted sessions cannot retain local identities", () => {
  assert.throws(() => oidcSubject({}), /subject/);
  assert.equal(oidcSubject({ sub: "subject" }), "subject");
  assert.equal(
    localIdentityAllowed("mock-user", { NODE_ENV: "production" }),
    false,
  );
  assert.equal(
    localIdentityAllowed("sandbox-user", {
      NODE_ENV: "development",
      VERCEL: "1",
    }),
    false,
  );
  assert.equal(
    localIdentityAllowed("https://issuer|subject", { NODE_ENV: "production" }),
    true,
  );
});
test("migration target must exactly match confirmed staging database", () => {
  const env = {
    DATABASE_URL: "postgres://test@staging.invalid/staging",
    CK_DB_ENVIRONMENT: "staging",
    CK_STAGING_DB_HOST: "staging.invalid",
    CK_STAGING_DB_NAME: "staging",
  };
  assert.doesNotThrow(() => requireStagingTarget(env));
  assert.throws(
    () => requireStagingTarget({ ...env, CK_STAGING_DB_NAME: "production" }),
    /match/,
  );
  assert.throws(
    () => requireStagingTarget({ ...env, CK_DB_ENVIRONMENT: "production" }),
    /staging/,
  );
});
