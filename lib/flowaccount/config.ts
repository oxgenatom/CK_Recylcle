export const SANDBOX_BASE = "https://openapi.flowaccount.com/test";
export const PRODUCTION_BASE = "https://openapi.flowaccount.com/v1";
// Production submission remains locked until Sandbox acceptance and explicit approval.
export function submissionEnabled(env: Record<string, string | undefined> = process.env) {
  return env.FLOW_MODE !== "live" ||
    (env.FLOW_ENVIRONMENT === "sandbox" && env.FLOW_BASE_URL === SANDBOX_BASE && env.FLOW_SANDBOX_WRITE_APPROVED === "true") ||
    (env.FLOW_MODE === "live" && env.FLOW_ENVIRONMENT === "production" && env.FLOW_BASE_URL === PRODUCTION_BASE && env.FLOW_PRODUCTION_READ_APPROVED === "true" && env.FLOW_PRODUCTION_SUBMISSION_ENABLED === "true" && env.VERCEL_ENV !== "preview");
}
export function submissionConfig(env: Record<string, string | undefined> = process.env) {
  if (env.FLOW_ENVIRONMENT === "production" && submissionEnabled(env)) return catalogConfig(env);
  if (env.FLOW_ENVIRONMENT !== "sandbox" || !submissionEnabled(env))
    throw new Error("document_write_not_approved");
  return sandboxConfig(env);
}
// Production must be selected explicitly; never infer it from credentials.
export function catalogConfig(
  env: Record<string, string | undefined> = process.env,
) {
  if (env.FLOW_ENVIRONMENT !== "production") {
    if (env.FLOW_ENVIRONMENT && env.FLOW_ENVIRONMENT !== "sandbox")
      throw new Error("flow_environment_invalid");
    return sandboxConfig(env);
  }
  if (
    env.FLOW_BASE_URL !== PRODUCTION_BASE ||
    env.FLOW_PRODUCTION_READ_APPROVED !== "true"
  )
    throw new Error("production_read_not_configured");
  const { clientId, clientSecret } = sandboxConfig({
    ...env,
    FLOW_BASE_URL: SANDBOX_BASE,
    FLOW_CLIENT_ID: env.FLOW_PRODUCTION_CLIENT_ID,
    FLOW_CLIENT_SECRET: env.FLOW_PRODUCTION_CLIENT_SECRET,
    FLOW_API_APPROVED: "true",
  });
  return { baseUrl: PRODUCTION_BASE, clientId, clientSecret };
}
export function sandboxConfig(
  env: Record<string, string | undefined> = process.env,
) {
  if (env.FLOW_BASE_URL && env.FLOW_BASE_URL !== SANDBOX_BASE)
    throw new Error("sandbox_only");
  if (env.FLOW_API_APPROVED !== "true")
    throw new Error("sandbox_not_configured");
  const clientId = env.FLOW_CLIENT_ID,
    clientSecret = env.FLOW_CLIENT_SECRET;
  if (
    !clientId ||
    !clientSecret ||
    [clientId, clientSecret].some((v) =>
      /ใส่_|your[_ -]|placeholder|<|>/i.test(v),
    )
  )
    throw new Error("sandbox_credentials_missing_or_placeholder");
  return { baseUrl: SANDBOX_BASE, clientId, clientSecret };
}
