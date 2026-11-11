import { GatewayError,type MessageGateway } from "./message-gateway.js";
import type { GatewayEnvelope,Transport } from "./message-types.js";

export type DispatchResult =
  | { outcome: "accepted";transport: Transport;gatewayReference: string }
  | { outcome: "rejected";reason: string }
  | { outcome: "pending";reason: string };
export async function dispatchMessage(gateway: MessageGateway,envelope: GatewayEnvelope): Promise<DispatchResult> {
  let online = false;
  try { online = (await gateway.probe(envelope.deviceId)).httpOnline; } catch { online = false; }
  const route: Transport[] = online ? ["http","sbd"] : ["sbd"];
  for (const transport of route) {
    try {
      const result = await gateway.send(envelope,transport);
      return { outcome: "accepted",transport,gatewayReference: result.gatewayReference };
    } catch (error) {
      if (error instanceof GatewayError && error.status === 503) continue;
      if (error instanceof GatewayError && error.status >= 400 && error.status < 500) {
        return { outcome: "rejected",reason: `${transport} gateway rejected the request (HTTP ${error.status})` };
      }
      return { outcome: "pending",reason: `${transport} outcome is unconfirmed` };
    }
  }
  return { outcome: "pending",reason: "No transport accepted the request" };
}
