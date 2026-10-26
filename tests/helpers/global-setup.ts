import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export default function setup() {
  const root = path.resolve(__dirname, "../..");
  for (const f of ["prisma/test-integration.db", "prisma/test-integration.db-journal"]) fs.rmSync(path.join(root, f), { force: true });
  fs.rmSync(path.join(root, "storage-test"), { recursive: true, force: true });
  execSync("npx prisma migrate deploy", { cwd: root, env: { ...process.env, DATABASE_URL: "file:./test-integration.db" }, stdio: "pipe" });
}
