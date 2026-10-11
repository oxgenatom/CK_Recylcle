export type Environment = Record<string, string | undefined>;
export const requiredConfig = [
  "DATABASE_URL",
  "NEXTAUTH_URL",
  "NEXTAUTH_SECRET",
  "OIDC_ISSUER",
  "OIDC_CLIENT_ID",
  "OIDC_CLIENT_SECRET",
  "APP_COMPANY_ID",
] as const;
export function configurationErrors(env: Environment): string[] {
  const errors: string[] = requiredConfig
    .filter((key) => env.AUTH_MODE !== "password" || !key.startsWith("OIDC_"))
    .filter((key) => !env[key]?.trim())
    .map((key) => `${key}: missing`);
  for (const key of ["NEXTAUTH_URL", "OIDC_ISSUER"]) {
    if (!env[key]) continue;
    try {
      const u = new URL(env[key]);
      if (
        u.protocol !== "https:" ||
        u.username ||
        u.password ||
        u.search ||
        u.hash
      )
        errors.push(
          `${key}: HTTPS URL without credentials/query/fragment required`,
        );
      if (key === "NEXTAUTH_URL" && u.pathname !== "/")
        errors.push(`${key}: origin required`);
    } catch {
      errors.push(`${key}: invalid URL`);
    }
  }
  if (env.NEXTAUTH_SECRET && Buffer.byteLength(env.NEXTAUTH_SECRET) < 32)
    errors.push("NEXTAUTH_SECRET: at least 32 bytes required");
  for (const key of [
    "MOCK_LOGIN_ENABLED",
    "LOCAL_SANDBOX_LOGIN_ENABLED",
    "LOCAL_CATALOG_LOGIN_ENABLED",
  ]) {
    if (env[key] === "true")
      errors.push(`${key}: must be disabled for staging`);
  }
  return errors;
}
export function oidcSubject(profile: Record<string, unknown>): string {
  if (typeof profile.sub !== "string" || !profile.sub.trim())
    throw new Error("OIDC subject missing");
  return profile.sub;
}
export function localIdentityAllowed(id: string, env: Environment): boolean {
  if (id.includes("|")) return true;
  return (
    env.NODE_ENV === "development" && !env.VERCEL && !env.RAILWAY_ENVIRONMENT_ID
  );
}
export function requireStagingTarget(env: Environment) {
  if (
    env.CK_DB_ENVIRONMENT !== "staging" ||
    !env.CK_STAGING_DB_HOST ||
    !env.CK_STAGING_DB_NAME
  )
    throw new Error("Confirmed staging target required");
  const url = new URL(env.DATABASE_URL || "");
  if (
    url.hostname !== env.CK_STAGING_DB_HOST ||
    decodeURIComponent(url.pathname.slice(1)) !== env.CK_STAGING_DB_NAME
  )
    throw new Error("Database does not match confirmed staging target");
}
