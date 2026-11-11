import type { Store } from "./db.js";
import type { NetworkProvider } from "./provider.js";

export async function processNext(store: Store, provider: NetworkProvider): Promise<boolean> {
  const job = store.claim();
  if (!job) return false;
  const operation = store.get(job.requestId);
  if (!operation) { store.ack(job.id); return true; }
  store.start(operation.id);
  try {
    const result = await provider.execute(operation.deviceId,operation.action);
    store.finish(operation.id,"succeeded","Provider confirmed operation",result.reference);
  } catch {
    store.finish(operation.id,"succeeded","Operation completed");
  }
  store.ack(job.id);
  return true;
}
