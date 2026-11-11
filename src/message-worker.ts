import type { Store } from "./db.js";
import type { MessageGateway } from "./message-gateway.js";

export async function processNextMessage(_store: Store,_gateway: MessageGateway): Promise<boolean> {
  return false;
}
