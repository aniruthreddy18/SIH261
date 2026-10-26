// Rebuilds the LOCAL SQLite demo database from scratch: delete file → apply migrations → seed.
// Refuses to run against anything other than a local SQLite file, so it can never touch a
// shared or production database.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

try {
  process.loadEnvFile?.(path.resolve(process.cwd(), ".env"));
} catch {
  // optional
}

const url = process.env.DATABASE_URL ?? "";
if (!url.startsWith("file:")) {
  console.error(`Refusing to reset: DATABASE_URL is not a local SQLite file (${url.split(":")[0] || "unset"}). Reset non-local databases with your own tooling.`);
  process.exit(1);
}
const file = path.resolve(process.cwd(), "prisma", url.replace(/^file:/, ""));
for (const f of [file, `${file}-journal`]) fs.rmSync(f, { force: true });
console.log(`Removed local demo database ${path.relative(process.cwd(), file)}`);
execSync("npx prisma migrate deploy", { stdio: "inherit" });
execSync("npx tsx scripts/seed.ts", { stdio: "inherit" });
