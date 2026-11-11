import { z } from "zod";
import type { Action } from "./types.js";

const resultSchema = z.object({ reference: z.string().min(1) });
export class ProviderError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
export interface NetworkProvider {
  execute(deviceId: string, action: Action, idempotencyKey?: string): Promise<{ reference: string }>;
}
export function createProvider(baseUrl: string): NetworkProvider {
  return {
    async execute(deviceId,action,idempotencyKey) {
      const response = await fetch(new URL(`/${action}`,baseUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) },
        body: JSON.stringify({ deviceId }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new ProviderError(response.status,`Provider returned HTTP ${response.status}`);
      return resultSchema.parse(await response.json());
    },
  };
}
