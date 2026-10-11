import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (e, k) => (e ? reject(e) : resolve(k)),
    ),
  );
export function validPassword(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 12 &&
    Buffer.byteLength(value) <= 256
  );
}
export async function hashPassword(password: string) {
  if (!validPassword(password))
    throw new Error("Password must be 12–256 bytes");
  const salt = randomBytes(24).toString("hex");
  return (
    "scrypt$" + salt + "$" + (await derive(password, salt)).toString("hex")
  );
}
export async function verifyPassword(password: string, hash: string) {
  if (typeof password !== "string" || Buffer.byteLength(password) > 256)
    return false;
  const [algorithm, salt, hex] = hash.split("$");
  if (
    algorithm !== "scrypt" ||
    !/^[a-f0-9]{48}$/.test(salt) ||
    !/^[a-f0-9]{128}$/.test(hex)
  )
    return false;
  return timingSafeEqual(await derive(password, salt), Buffer.from(hex, "hex"));
}
