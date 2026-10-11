import type { PoolConfig } from "pg";
import { checkServerIdentity } from "node:tls";
export function dbConfig(): PoolConfig {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL ยังไม่ได้ตั้งค่า");
  const parsed = new URL(url);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  const ca = process.env.DATABASE_CA_BASE64;
  const serverName = process.env.DATABASE_TLS_SERVERNAME?.trim();
  if (serverName && (!ca || !/^[a-zA-Z0-9.-]+$/.test(serverName)))
    throw new Error("DATABASE_TLS_SERVERNAME requires an explicit trusted CA and a DNS name");
  if (
    ca &&
    ["sslmode", "sslcert", "sslkey", "sslrootcert"].some((k) =>
      parsed.searchParams.has(k),
    )
  )
    throw new Error(
      "ใช้ DATABASE_CA_BASE64 โดยลบ SSL query parameters จาก DATABASE_URL เพื่อไม่ให้ pg override CA",
    );
  if (!local && !ca && parsed.searchParams.get("sslmode") !== "verify-full")
    throw new Error(
      "ฐานข้อมูลภายนอกต้องใช้ TLS ตรวจ certificate: ตั้ง DATABASE_CA_BASE64 หรือ sslmode=verify-full",
    );
  return {
    connectionString: url,
    max: /^[1-5]$/.test(process.env.DB_POOL_MAX || "") ? Number(process.env.DB_POOL_MAX) : 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    ...(ca
      ? {
          ssl: {
            rejectUnauthorized: true,
            ca: Buffer.from(ca, "base64").toString("utf8"),
            ...(serverName
              ? { checkServerIdentity: (_host: string, cert: Parameters<typeof checkServerIdentity>[1]) => checkServerIdentity(serverName, cert) }
              : {}),
          },
        }
      : {}),
  };
}
