import { mockUrl } from "./env.js";
const value = process.argv[2];
const delayMs = value === undefined ? NaN : Number(value);
if (!value || !Number.isInteger(delayMs) || delayMs < 0 || delayMs > 10000) {
  console.error("Usage: npm run delay -- <milliseconds, 0–10000>");
  process.exit(1);
}
const response = await fetch(`${mockUrl}/admin/delay`,{
  method: "POST",headers: { "Content-Type": "application/json" },body: JSON.stringify({ delayMs }),
});
if (!response.ok) throw new Error(`HTTP ${response.status}`);
console.log(await response.json());
