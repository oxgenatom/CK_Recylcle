export const SANDBOX_BASE = "https://openapi.flowaccount.com/test";
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
