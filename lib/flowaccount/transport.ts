import { SANDBOX_BASE, PRODUCTION_BASE } from "./config";
import { OutcomeUnknown, documentResult } from "./core";
type Options = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  fetcher?: typeof fetch;
  beforeRequest?: () => Promise<void>;
  readOnly?: boolean;
};
// No environment access or logging here; imported only by server integration and CLI/tests.
export class SandboxTransport {
  private cached?: { token: string; expires: number };
  private requesting?: Promise<string>;
  private fetcher: typeof fetch;
  constructor(private options: Options) {
    if (
      options.baseUrl !== SANDBOX_BASE &&
      !(options.readOnly && options.baseUrl === PRODUCTION_BASE)
    )
      throw new Error("sandbox_only");
    this.fetcher = options.fetcher ?? fetch;
  }
  async token(): Promise<string> {
    if (this.cached && this.cached.expires > Date.now() + 60000)
      return this.cached.token;
    if (this.requesting) return this.requesting;
    this.requesting = this.requestToken();
    try {
      return await this.requesting;
    } finally {
      this.requesting = undefined;
    }
  }
  private async requestToken() {
    await this.options.beforeRequest?.();
    const r = await this.fetcher(this.options.baseUrl + "/token", {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: "flowaccount-api",
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
      }),
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    let data;
    try {
      data = await r.json();
    } catch {
      throw new Error("sandbox_auth_invalid_response");
    }
    if (
      !r.ok ||
      typeof data.access_token !== "string" ||
      !data.access_token ||
      !Number.isFinite(data.expires_in) ||
      data.expires_in <= 0 ||
      String(data.token_type).toLowerCase() !== "bearer"
    )
      throw new Error("sandbox_auth_failed");
    this.cached = {
      token: data.access_token,
      expires: Date.now() + data.expires_in * 1000,
    };
    return data.access_token as string;
  }
  async get(path: string): Promise<any> {
    if (
      this.options.readOnly &&
      !/^\/(contacts|product-masters)\?currentPage=\d+&pageSize=100$/.test(path)
    )
      throw new Error("catalog_path_invalid");
    if (!/^\/(contacts|product-masters|purchases)(\/\d+)?(\?.*)?$/.test(path))
      throw new Error("sandbox_path_invalid");
    const access = await this.token();
    await this.options.beforeRequest?.();
    const r = await this.fetcher(this.options.baseUrl + path, {
      redirect: "error",
      headers: { Authorization: "Bearer " + access },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (!r.ok) throw new Error("sandbox_read_http_" + r.status);
    return r.json();
  }
  // Caller reserves the budget before claiming the database state. Exactly one POST, no retry.
  async purchase(body: unknown, access: string) {
    if (this.options.readOnly) throw new Error("catalog_read_only");
    try {
      const r = await this.fetcher(SANDBOX_BASE + "/purchases", {
        method: "POST",
        redirect: "error",
        headers: {
          Authorization: "Bearer " + access,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) throw new OutcomeUnknown("sandbox_http_" + r.status);
      return documentResult(await r.json());
    } catch (e) {
      throw e instanceof OutcomeUnknown
        ? e
        : new OutcomeUnknown("sandbox_transport_or_response_error");
    }
  }
}
export class CatalogTransport extends SandboxTransport {
  constructor(options: Omit<Options, "readOnly">) {
    super({ ...options, readOnly: true });
  }
}
