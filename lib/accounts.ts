import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { hashPassword, verifyPassword, validPassword } from "./passwords";
import { z } from "zod";
import { verifyRuntimeTarget } from "./staging";
export const accountInput = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,40}$/),
  displayName: z.string().trim().min(1).max(100),
  password: z.string().refine(validPassword),
  role: z.enum(["editor", "sender", "admin"]),
});
export async function passwordLogin(username: string, password: string) {
  await verifyRuntimeTarget(db());
  username = username.trim().toLowerCase();
  if (
    !/^[a-z0-9._-]{3,40}$/.test(username) ||
    typeof password !== "string" ||
    password.length > 256
  )
    return null;
  const budget = await db().query(
    `INSERT INTO login_limits(username,attempts) VALUES($1,1) ON CONFLICT(username) DO UPDATE SET attempts=CASE WHEN login_limits.window_start < now()-interval '15 minutes' THEN 1 ELSE login_limits.attempts+1 END,window_start=CASE WHEN login_limits.window_start < now()-interval '15 minutes' THEN now() ELSE login_limits.window_start END RETURNING attempts`,
    [username],
  );
  if (budget.rows[0].attempts > 5) return null;
  const { rows } = await db().query(
    "SELECT a.*,m.active FROM password_accounts a JOIN memberships m ON m.identity=a.identity AND m.company_id=a.company_id WHERE a.username=$1 AND a.company_id=$2",
    [username, process.env.APP_COMPANY_ID],
  );
  const a = rows[0];
  const fallback = "scrypt$" + "0".repeat(48) + "$" + "0".repeat(128);
  const ok = await verifyPassword(password, a?.password_hash || fallback);
  if (!a || !ok || !a.active) return null;
  return {
    id: a.identity,
    name: a.display_name,
    sessionVersion: a.session_version,
  };
}
export async function createAccount(company: string, raw: unknown) {
  const a = accountInput.parse(raw);
  const hash = await hashPassword(a.password);
  const identity = "password|" + randomUUID();
  const c = await db().connect();
  try {
    await c.query("BEGIN");
    await c.query("INSERT INTO profiles(identity,display_name) VALUES($1,$2)", [
      identity,
      a.displayName,
    ]);
    await c.query(
      "INSERT INTO password_accounts(identity,company_id,username,display_name,password_hash) VALUES($1,$2,$3,$4,$5)",
      [identity, company, a.username, a.displayName, hash],
    );
    await c.query(
      "INSERT INTO memberships(identity,company_id,role) VALUES($1,$2,$3)",
      [identity, company, a.role],
    );
    await c.query("COMMIT");
    return identity;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
