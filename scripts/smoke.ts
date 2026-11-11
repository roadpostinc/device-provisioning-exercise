import assert from "node:assert/strict";
import { apiUrl, mockUrl } from "./env.js";
for (const url of [`${apiUrl}/api/health`, `${mockUrl}/health`]) {
  const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
  assert.equal(response.status,200);
}
const response = await fetch(`${apiUrl}/api/devices`);
assert.equal(response.status,200);
const devices = await response.json() as { id: string }[];
assert.ok(devices.some(device => device.id === "DEV-1001"));
for (const url of [`${apiUrl}/api/messages`, `${mockUrl}/admin/messages`]) {
  const result = await fetch(url, { signal: AbortSignal.timeout(3000) });
  assert.equal(result.status,200);
}
console.log("Smoke passed: API, lifecycle provider, message gateways, database, and devices are available. No operation or message created.");
