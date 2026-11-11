import { rmSync } from "node:fs";
import { dbPath } from "./env.js";
if (!process.argv.includes("--confirm")) {
  console.error("Stop npm run dev first. Then run: npm run reset -- --confirm");
  process.exit(1);
}
for (const base of [dbPath, dbPath + ".provider"]) {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(base + suffix, { force: true });
}
console.log("Local database removed. Restart the application to seed demo devices.");
