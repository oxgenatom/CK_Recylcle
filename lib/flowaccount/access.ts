export function localCatalogLoginAllowed(
  env: Record<string, string | undefined> = process.env,
) {
  let local = false;
  try {
    const url = new URL(env.NEXTAUTH_URL || "");
    local =
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  } catch {}
  return (
    local &&
    env.NODE_ENV === "development" &&
    env.LOCAL_CATALOG_LOGIN_ENABLED === "true" &&
    env.FLOW_MODE === "live" &&
    !env.VERCEL &&
    !env.RAILWAY_ENVIRONMENT_ID
  );
}
