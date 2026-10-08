import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import assert from "node:assert/strict";
const url = "http://127.0.0.1:3100";
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3100",
  ],
  {
    stdio: "pipe",
    env: {
      ...process.env,
      NODE_ENV: "production",
      NEXTAUTH_URL: url,
      NEXTAUTH_SECRET: randomBytes(32).toString("hex"),
      MOCK_LOGIN_ENABLED: "true",
      LOCAL_SANDBOX_LOGIN_ENABLED: "true",
      LOCAL_CATALOG_LOGIN_ENABLED: "true",
      FLOW_MODE: "mock",
    },
  },
);
let output = "";
child.stdout.on("data", (d) => (output += String(d)));
child.stderr.on("data", (d) => (output += String(d)));
try {
  let up = false;
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(url)).ok) {
        up = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.ok(up, "Production server failed to start");
  assert.equal((await fetch(url + "/api/receipts")).status, 401);
  assert.equal((await fetch(url + "/api/masters")).status, 401);
  const csrf = await fetch(url + "/api/auth/csrf");
  const data = await csrf.json();
  const cookie = csrf.headers
    .getSetCookie()
    .map((s) => s.split(";")[0])
    .join("; ");
  for (const user of ["mock-user", "sandbox-user", "catalog-user"]) {
    const res = await fetch(url + "/api/auth/callback/credentials", {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        csrfToken: data.csrfToken,
        user,
        callbackUrl: url,
        json: "true",
      }),
      redirect: "manual",
    });
    const result = await res.json();
    assert.match(result.url, /CredentialsSignin/);
  }
  console.log(
    "Production smoke passed: page 200, protected APIs 401, all local logins denied even when flags true",
  );
} finally {
  child.kill();
}
