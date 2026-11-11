import { apiUrl } from "./env.js";
import { createMessageApi } from "../web/message-api.js";
const [id,kind = "receipt"] = process.argv.slice(2);
if (!id || !["receipt","pong"].includes(kind)) {
  console.error("Usage: npm run receipt -- <message-id> [receipt|pong]"); process.exit(1);
}
const api = createMessageApi(apiUrl);
try {
  const event = await api.generateEvent(id,kind as "receipt" | "pong");
  console.log(await api.recordEvent(event));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Event failed");
  process.exitCode = 1;
}
