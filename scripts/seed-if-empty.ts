// Seeds the demo dataset on first start only. Used by scripts/docker-start.sh so that redeploys
// keep the data already on the persistent volume. To start over, use `npm run db:reset` locally
// or delete the database file on the volume.
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

async function main() {
  const db = new PrismaClient();
  const users = await db.user.count();
  await db.$disconnect();
  if (users > 0) {
    console.log(`Database already holds ${users} user account(s); keeping existing data.`);
    return;
  }
  console.log("Empty database: seeding the demo dataset…");
  execSync("npx tsx scripts/seed.ts", { stdio: "inherit" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
