import "server-only";
import { Pool, types } from "pg";

// numeric → number (para tutarları 2 ondalık; JS double hassasiyeti bu ölçekte yeterli)
types.setTypeParser(1700, (v) => Number(v));
// int8 (bigserial) → number
types.setTypeParser(20, (v) => Number(v));

const g = globalThis as unknown as { __pool?: Pool };

export function db(): Pool {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL tanımlı değil (.env.local)");
  g.__pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  return g.__pool;
}
