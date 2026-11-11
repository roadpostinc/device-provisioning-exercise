import { createApp } from "./app.js";
import { openStore } from "./db.js";
import { createMockProvider } from "./mock-provider.js";
import { createProvider } from "./provider.js";
import { processNext } from "./worker.js";
import { createMessageGateway } from "./message-gateway.js";
import { processNextMessage } from "./message-worker.js";

// The example environment file is optional.
try { process.loadEnvFile(".env"); } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
const port = Number(process.env.API_PORT ?? 3000);
const mockPort = Number(process.env.MOCK_PORT ?? 4101);
const databasePath = process.env.DATABASE_PATH ?? "./data/provisioning.sqlite";
const store = openStore(databasePath);
const providerUrl = process.env.PROVIDER_URL ?? `http://127.0.0.1:${mockPort}`;
const provider = createProvider(providerUrl);
const gateway = createMessageGateway(providerUrl);
const mockApp = createMockProvider(databasePath + ".provider", Number(process.env.MOCK_DELAY_MS ?? 2000));
const mock = mockApp.listen(mockPort, "127.0.0.1", () => console.log(`Mock provider: http://127.0.0.1:${mockPort}`));
const api = createApp(store,gateway).listen(port, "127.0.0.1", () => console.log(`API: http://127.0.0.1:${port}`));
let stopping = false;
let running: Promise<void> | undefined;
const timer = setInterval(() => {
  if (running || stopping) return;
  running = (async () => {
    await processNext(store,provider);
    await processNextMessage(store,gateway);
  })().catch(error => console.error("Worker error",error)).finally(() => { running = undefined; });
}, 250);
async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  await running;
  await Promise.all([new Promise<void>(resolve => api.close(() => resolve())), new Promise<void>(resolve => mock.close(() => resolve()))]);
  store.close();
  mockApp.locals.closeStorage();
}
process.on("SIGINT", () => { void shutdown(); });
process.on("SIGTERM", () => { void shutdown(); });
