export type FormKind = "chat" | "sos" | "sonar";
export interface MessageIntent {
  deviceId: string;
  kind: FormKind;
  requestKey: string;
  fields: Record<string,string>;
}
export interface MessageView {
  id: string;
  deviceId: string;
  kind: string;
  requestKey: string;
  status: string;
  summary?: string;
  details?: unknown;
  transport?: string | null;
  gatewayReference?: string | null;
  error?: string | null;
  history?: { status: string;detail: string;createdAt: string }[];
}
export interface DeviceEvent {
  eventId: string;
  kind: "receipt" | "pong";
  messageId: string;
  deviceId: string;
  transport: string;
  gatewayReference: string;
  observedAt: string;
}
export function createMessageApi(baseUrl = "") {
  async function json<T>(path: string,init?: RequestInit): Promise<T> {
    const response = await fetch(baseUrl+path,init);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
    return body as T;
  }
  return {
    list: (signal?: AbortSignal) => json<MessageView[]>("/api/messages",{ signal }),
    get: (id: string,signal?: AbortSignal) => json<MessageView>(`/api/messages/${encodeURIComponent(id)}`,{ signal }),
    submit: (intent: MessageIntent) => json<MessageView>("/api/messages",{
      method: "POST",headers: { "Content-Type": "application/json","Idempotency-Key": intent.requestKey },
      body: JSON.stringify({ deviceId: intent.deviceId,kind: intent.kind,...intent.fields }),
    }),
    generateEvent: (messageId: string,kind: "receipt" | "pong") => json<DeviceEvent>("/api/mock/events",{
      method: "POST",headers: { "Content-Type": "application/json" },body: JSON.stringify({ messageId,kind }),
    }),
    recordEvent: (event: DeviceEvent) => json<MessageView>(`/api/messages/${encodeURIComponent(event.messageId)}/events`,{
      method: "POST",headers: { "Content-Type": "application/json" },body: JSON.stringify(event),
    }),
  };
}
