import { mockUrl } from "./env.js";
const [deviceId,state] = process.argv.slice(2);
if (!deviceId || !["online","offline"].includes(state)) {
  console.error("Usage: npm run network -- <device-id> <online|offline>"); process.exit(1);
}
const response = await fetch(`${mockUrl}/admin/connectivity`,{
  method: "POST",headers: { "Content-Type": "application/json" },body: JSON.stringify({ deviceId,httpOnline: state === "online" }),
});
if (!response.ok) throw new Error(`HTTP ${response.status}`);
console.log(await response.json());
