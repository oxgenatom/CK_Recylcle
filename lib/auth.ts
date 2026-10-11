import "server-only";
import { HttpError } from "./http-error";
export { HttpError } from "./http-error";
import { getServerSession, type NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "./db";
import { oidcSubject, localIdentityAllowed } from "./phase2-config";
import type { Actor } from "./model";
import { localCatalogLoginAllowed } from "./flowaccount/access";
import { passwordLogin } from "./accounts";
import { verifyRuntimeTarget } from "./staging";
export function mockLoginAllowed() {
  return (
    process.env.MOCK_LOGIN_ENABLED === "true" &&
    process.env.NODE_ENV === "development" &&
    !process.env.VERCEL &&
    !process.env.RAILWAY_ENVIRONMENT_ID &&
    process.env.FLOW_MODE !== "live"
  );
}
export function sandboxLoginAllowed() {
  return (
    process.env.LOCAL_SANDBOX_LOGIN_ENABLED === "true" &&
    process.env.NODE_ENV === "development" &&
    !process.env.VERCEL &&
    !process.env.RAILWAY_ENVIRONMENT_ID &&
    process.env.FLOW_MODE === "live" &&
    process.env.FLOW_BASE_URL === "https://openapi.flowaccount.com/test"
  );
}
export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: 8 * 3600 },
  providers: [
    Credentials({
      id: "password",
      name: "ชื่อผู้ใช้และรหัสผ่าน",
      credentials: {
        username: { label: "ชื่อผู้ใช้", type: "text" },
        password: { label: "รหัสผ่าน", type: "password" },
      },
      async authorize(c) {
        return c?.username && c.password
          ? await passwordLogin(c.username, c.password)
          : null;
      },
    }),
    ...(process.env.AUTH_MODE !== "password" && process.env.OIDC_ISSUER
      ? [
          {
            id: "oidc",
            name: "บัญชีบริษัท",
            type: "oauth" as const,
            wellKnown:
              process.env.OIDC_ISSUER.replace(/\/$/, "") +
              "/.well-known/openid-configuration",
            clientId: process.env.OIDC_CLIENT_ID,
            clientSecret: process.env.OIDC_CLIENT_SECRET,
            authorization: { params: { scope: "openid profile email" } },
            idToken: true,
            checks: ["pkce", "state"] as ("pkce" | "state")[],
            profile(p: Record<string, string>) {
              return { id: oidcSubject(p), name: p.name, email: p.email };
            },
          },
        ]
      : []),
    Credentials({
      name:
        process.env.FLOW_MODE === "live"
          ? "ทดสอบข้อมูล FlowAccount บนเครื่อง"
          : "ทดสอบในเครื่อง",
      credentials: {
        user: {
          label:
            process.env.LOCAL_CATALOG_LOGIN_ENABLED === "true"
              ? "ผู้ทดสอบ (catalog-user)"
              : "ผู้ทดสอบ (mock-user / mock-editor / sandbox-user)",
          type: "text",
        },
      },
      async authorize(c) {
        if (
          localCatalogLoginAllowed() &&
          (!c?.user || c.user === "catalog-user")
        )
          return {
            id: "catalog-user",
            name: "ผู้ทดสอบข้อมูลจริงบนเครื่อง",
            email: "catalog@example.invalid",
          };
        const id =
          c?.user || (sandboxLoginAllowed() ? "sandbox-user" : "mock-user");
        if (sandboxLoginAllowed() && id === "sandbox-user")
          return {
            id,
            name: "ผู้ทดสอบ Sandbox",
            email: "sandbox@example.invalid",
          };
        return mockLoginAllowed() &&
          ["mock-user", "mock-editor", "mock-disabled", ...(process.env.CK_E2E === "true" ? ["mock-approver","mock-reviewer","mock-sender"] : [])].includes(id)
          ? { id, name: "ผู้ทดสอบ", email: "mock@example.invalid" }
          : null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, user }) {
      if (account && user)
        token.identity = ["credentials", "password"].includes(account.provider)
          ? user.id
          : `${process.env.OIDC_ISSUER}|${user.id}`;
      if (account?.provider === "password" && user)
        token.sessionVersion = (
          user as unknown as { sessionVersion: number }
        ).sessionVersion;
      return token;
    },
    async session({ session, token }) {
      (session as unknown as { identity: string }).identity = String(
        token.identity ?? "",
      );
      (session as unknown as { sessionVersion: unknown }).sessionVersion =
        token.sessionVersion;
      return session;
    },
  },
};
export async function actor(allowPasswordChange = false): Promise<Actor> {
  const session = await getServerSession(authOptions);
  const id = (session as unknown as { identity?: string } | null)?.identity;
  if (!id) throw new HttpError(401, "กรุณาเข้าสู่ระบบ");
  await verifyRuntimeTarget(db());
  if (id.startsWith("password|")) {
    const { rows } = await db().query(
      "SELECT session_version,must_change FROM password_accounts WHERE identity=$1 AND company_id=$2",
      [id, process.env.APP_COMPANY_ID],
    );
    if (
      !rows.length ||
      rows[0].session_version !==
        (session as unknown as { sessionVersion: number }).sessionVersion
    )
      throw new HttpError(401, "กรุณาเข้าสู่ระบบใหม่");
    if (rows[0].must_change && !allowPasswordChange)
      throw new HttpError(403, "กรุณาเปลี่ยนรหัสผ่านครั้งแรกที่ /account");
  }
  if (!localIdentityAllowed(id, process.env))
    throw new HttpError(403, "บัญชีทดสอบใช้ได้เฉพาะเครื่อง local");
  if (id === "catalog-user" && !localCatalogLoginAllowed())
    throw new HttpError(403, "บัญชีทดสอบใช้ได้เฉพาะเครื่อง local");
  const company = process.env.APP_COMPANY_ID;
  if (!company) throw new HttpError(503, "ยังไม่ได้ตั้งค่าบริษัท");
  const { rows } = await db().query(
    "SELECT role,can_review,can_approve FROM memberships WHERE identity=$1 AND company_id=$2 AND active=true",
    [id, company],
  );
  if (!rows.length) throw new HttpError(403, "ไม่มีสิทธิ์เข้าบริษัทนี้");
  return { id, company, role: rows[0].role, canReview: rows[0].can_review, canApprove: rows[0].can_approve, authExpiresAt: session?.expires };
}
export function mutationGuard(req: Request) {
  if (
    req.headers.get("origin") !==
    new URL(process.env.NEXTAUTH_URL || req.url).origin
  )
    throw new HttpError(403, "Origin ไม่ถูกต้อง");
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError(415, "ต้องส่ง JSON");
}
