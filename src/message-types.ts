export const transports = ["http","sbd"] as const;
export type Transport = typeof transports[number];
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface GatewayEnvelope { messageId: string; deviceId: string; content: Json }
export interface StoredMessage {
  id: string;
  deviceId: string;
  requestKey: string;
  content: Json;
  status: string;
  metadata: Json;
  transport: Transport | null;
  gatewayReference: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface MessageEvent { status: string; detail: string; createdAt: string }
