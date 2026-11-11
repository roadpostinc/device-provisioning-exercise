export const actions = ["activate", "deactivate"] as const;
export type Action = typeof actions[number];
export const statuses = ["queued", "processing", "succeeded", "failed"] as const;
export type Status = typeof statuses[number];
export type DeviceState = "inactive" | "activating" | "active" | "deactivating";
export interface Device {
  id: string;
  name: string;
  state: DeviceState;
  currentOperationId: string | null;
}
export interface Operation {
  id: string;
  deviceId: string;
  action: Action;
  idempotencyKey: string;
  previousState: "inactive" | "active";
  status: Status;
  providerReference: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface Job { id: string; requestId: string; attempts: number }
export interface HistoryEntry { status: Status; message: string; createdAt: string }
