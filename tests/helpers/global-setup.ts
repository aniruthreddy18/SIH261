import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// Fresh, isolated database + storage, migrated and seeded with the deterministic demo dataset.
export default function setup() {
  const root = path.resolve(__dirname, "../..");
  for (const f of ["prisma/test-integration.db", "prisma/test-integration.db-journal"]) fs.rmSync(path.join(root, f), { force: true });
  fs.rmSync(path.join(root, "storage-test"), { recursive: true, force: true });
  const env = { ...process.env, DATABASE_URL: "file:./test-integration.db", STORAGE_DIR: "./storage-test" };
  execSync("npx prisma migrate deploy", { cwd: root, env, stdio: "pipe" });
  execSync("npx tsx scripts/seed.ts", { cwd: root, env, stdio: "pipe" });
}
