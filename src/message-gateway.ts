import { z } from "zod";
import type { GatewayEnvelope,Transport } from "./message-types.js";

export class GatewayError extends Error {
  constructor(public readonly status: number,message: string) { super(message); }
}
export interface MessageGateway {
  probe(deviceId: string): Promise<{ httpOnline: boolean }>;
  send(envelope: GatewayEnvelope,transport: Transport): Promise<{ gatewayReference: string }>;
  event?(messageId: string,kind: "receipt" | "pong"): Promise<unknown>;
}
export function createMessageGateway(baseUrl: string,timeoutMs = 1000): MessageGateway {
  return {
    async probe(deviceId) {
      const response = await fetch(new URL(`/connectivity/${encodeURIComponent(deviceId)}`,baseUrl),{ signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) throw new GatewayError(response.status,`Connectivity returned HTTP ${response.status}`);
      return z.object({ httpOnline: z.boolean() }).parse(await response.json());
    },
    async event(messageId,kind) {
      const response = await fetch(new URL("/admin/events",baseUrl),{
        method: "POST",headers: { "Content-Type": "application/json" },body: JSON.stringify({ messageId,kind }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new GatewayError(response.status,`Event source returned HTTP ${response.status}`);
      return response.json();
    },
    async send(envelope,transport) {
      const response = await fetch(new URL(`/transports/${transport}/messages`,baseUrl),{
        method: "POST",headers: { "Content-Type": "application/json","Idempotency-Key": envelope.messageId },
        body: JSON.stringify(envelope),signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new GatewayError(response.status,`Gateway returned HTTP ${response.status}`);
      return z.object({ gatewayReference: z.string().min(1) }).parse(await response.json());
    },
  };
}
