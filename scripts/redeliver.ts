import { openStore } from "../src/db.js";
import { dbPath } from "./env.js";
const store = openStore(dbPath);
try {
  const id = process.argv[2];
  if (!id || !store.get(id)) {
    console.error("Usage: npm run redeliver -- <existing-request-id>");
    process.exitCode = 1;
  } else console.log({ jobId: store.enqueue(id), requestId: id });
} finally { store.close(); }
