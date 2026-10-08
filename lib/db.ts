import "server-only";
import { Pool } from "pg";
import { dbConfig } from "./db-config";
const globalDb = globalThis as unknown as { ckPool?: Pool };
export function db() {
  return (globalDb.ckPool ??= new Pool(dbConfig()));
}
