import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { __aegisPrisma?: PrismaClient };

export const prisma = g.__aegisPrisma ?? new PrismaClient({ log: ["error"] });
if (process.env.NODE_ENV !== "production") g.__aegisPrisma = prisma;

export type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export function json<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
