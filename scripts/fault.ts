import { mockUrl } from "./env.js";
import { profiles } from "../src/mock-provider.js";
const profile = process.argv[2];
if (!profiles.includes(profile as typeof profiles[number])) {
  console.error(`Usage: npm run fault -- <${profiles.join("|")}>`);
  process.exit(1);
}
const response = await fetch(`${mockUrl}/admin/profile`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profile }),
});
if (!response.ok) throw new Error(`HTTP ${response.status}`);
console.log(await response.json());
console.log("Provider counters and operation evidence reset.");
