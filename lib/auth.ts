import "server-only";
import { getServerSession, type NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "./db";
import type { Actor } from "./model";
export function mockLoginAllowed() {
  return (
    process.env.MOCK_LOGIN_ENABLED === "true" &&
    process.env.NODE_ENV === "development" &&
    !process.env.VERCEL &&
    process.env.FLOW_MODE !== "live"
  );
}
export function sandboxLoginAllowed() {
  return (
    process.env.LOCAL_SANDBOX_LOGIN_ENABLED === "true" &&
    process.env.NODE_ENV === "development" &&
    !process.env.VERCEL &&
    process.env.FLOW_MODE === "live" &&
    process.env.FLOW_BASE_URL === "https://openapi.flowaccount.com/test"
  );
}
export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: 8 * 3600 },
  providers: [
    ...(process.env.OIDC_ISSUER
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
              return { id: p.sub, name: p.name, email: p.email };
            },
          },
        ]
      : []),
    Credentials({
      name:
        process.env.FLOW_MODE === "live"
          ? "ทดสอบ Sandbox บนเครื่อง"
          : "ทดสอบในเครื่อง",
      credentials: {
        user: { label: "ผู้ทดสอบ (mock-user / mock-editor)", type: "text" },
      },
      async authorize(c) {
        const id =
          c?.user || (sandboxLoginAllowed() ? "sandbox-user" : "mock-user");
        if (sandboxLoginAllowed() && id === "sandbox-user")
          return {
            id,
            name: "ผู้ทดสอบ Sandbox",
            email: "sandbox@example.invalid",
          };
        return mockLoginAllowed() &&
          ["mock-user", "mock-editor", "mock-disabled"].includes(id)
          ? { id, name: "ผู้ทดสอบ", email: "mock@example.invalid" }
          : null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, user }) {
      if (account && user)
        token.identity =
          account.provider === "credentials"
            ? user.id
            : `${process.env.OIDC_ISSUER}|${user.id}`;
      return token;
    },
    async session({ session, token }) {
      (session as unknown as { identity: string }).identity = String(
        token.identity ?? "",
      );
      return session;
    },
  },
};
export async function actor(): Promise<Actor> {
  const session = await getServerSession(authOptions);
  const id = (session as unknown as { identity?: string } | null)?.identity;
  if (!id) throw new HttpError(401, "กรุณาเข้าสู่ระบบ");
  const company = process.env.APP_COMPANY_ID;
  if (!company) throw new HttpError(503, "ยังไม่ได้ตั้งค่าบริษัท");
  const { rows } = await db().query(
    "SELECT role FROM memberships WHERE identity=$1 AND company_id=$2 AND active=true",
    [id, company],
  );
  if (!rows.length) throw new HttpError(403, "ไม่มีสิทธิ์เข้าบริษัทนี้");
  return { id, company, role: rows[0].role };
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
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
