import { mockUrl } from "./env.js";
const [transport,mode] = process.argv.slice(2);
if (!["http","sbd"].includes(transport) || !["healthy","unavailable","reject","timeout"].includes(mode)) {
  console.error("Usage: npm run gateway -- <http|sbd> <healthy|unavailable|reject|timeout>"); process.exit(1);
}
const response = await fetch(`${mockUrl}/admin/gateway`,{
  method: "POST",headers: { "Content-Type": "application/json" },body: JSON.stringify({ transport,mode }),
});
if (!response.ok) throw new Error(`HTTP ${response.status}`);
console.log(await response.json());
