import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { RequestError } from "./db.js";
import type { Job } from "./types.js";
import type { Json,StoredMessage,MessageEvent,Transport } from "./message-types.js";

function canonical(value: Json): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "["+value.map(canonical).join(",")+"]";
  return "{"+Object.keys(value).sort().map(key => JSON.stringify(key)+":"+canonical(value[key])).join(",")+"}";
}
export function createMessageStore(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS message_records (
      id TEXT PRIMARY KEY,deviceId TEXT NOT NULL,requestKey TEXT NOT NULL UNIQUE,content TEXT NOT NULL,
      status TEXT NOT NULL,metadata TEXT NOT NULL,transport TEXT,gatewayReference TEXT,error TEXT,
      createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS message_log (
      id INTEGER PRIMARY KEY,messageId TEXT NOT NULL,status TEXT NOT NULL,detail TEXT NOT NULL,createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS message_queue (
      id TEXT PRIMARY KEY,requestId TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'ready',
      attempts INTEGER NOT NULL DEFAULT 0,leaseUntil INTEGER NOT NULL DEFAULT 0
    );
  `);
  function transaction<T>(work: () => T): T {
    if (db.isTransaction) return work();
    db.exec("BEGIN IMMEDIATE");
    try { const result = work(); db.exec("COMMIT"); return result; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  function decode(row: Record<string,unknown> | undefined): StoredMessage | undefined {
    return row ? { ...row,content: JSON.parse(String(row.content)),metadata: JSON.parse(String(row.metadata)) } as StoredMessage : undefined;
  }
  const get = (id: string) => decode(db.prepare("SELECT * FROM message_records WHERE id=?").get(id));
  const enqueue = (id: string) => db.prepare("INSERT INTO message_queue (id,requestId) VALUES (?,?)").run(randomUUID(),id);
  function record(id: string,status: string,detail: string,now: string) {
    db.prepare("INSERT INTO message_log (messageId,status,detail,createdAt) VALUES (?,?,?,?)").run(id,status,detail,now);
  }
  return {
    get,enqueue,transaction,
    findByKey: (key: string) => decode(db.prepare("SELECT * FROM message_records WHERE requestKey=?").get(key)),
    list: () => db.prepare("SELECT * FROM message_records ORDER BY createdAt DESC,rowid DESC").all().map(row => decode(row)!),
    history: (id: string) => db.prepare("SELECT status,detail,createdAt FROM message_log WHERE messageId=? ORDER BY id").all(id) as unknown as MessageEvent[],
    create(input: { deviceId: string;requestKey: string;content: Json;status?: string;metadata?: Json }) {
      return transaction(() => {
        const existing = decode(db.prepare("SELECT * FROM message_records WHERE requestKey=?").get(input.requestKey));
        if (existing) {
          if (existing.deviceId !== input.deviceId || canonical(existing.content) !== canonical(input.content)) throw new RequestError(409,"Message key belongs to a different payload");
          return existing;
        }
        const id = randomUUID();
        const now = new Date().toISOString();
        const status = input.status ?? "queued";
        db.prepare("INSERT INTO message_records VALUES (?,?,?,?,?,?,NULL,NULL,NULL,?,?)")
          .run(id,input.deviceId,input.requestKey,canonical(input.content),status,canonical(input.metadata ?? {}),now,now);
        record(id,status,"Record created",now);
        enqueue(id);
        return get(id)!;
      });
    },
    update(id: string,status: string,detail: string,changes: {
      transport?: Transport | null;gatewayReference?: string | null;error?: string | null;metadata?: Json;
    } = {}) {
      transaction(() => {
        const current = get(id);
        if (!current) throw new RequestError(404,"Message not found");
        const now = new Date().toISOString();
        db.prepare("UPDATE message_records SET status=?,metadata=?,transport=?,gatewayReference=?,error=?,updatedAt=? WHERE id=?")
          .run(status,canonical(changes.metadata ?? current.metadata),
            changes.transport === undefined ? current.transport : changes.transport,
            changes.gatewayReference === undefined ? current.gatewayReference : changes.gatewayReference,
            changes.error === undefined ? current.error : changes.error,now,id);
        record(id,status,detail,now);
      });
    },
    claim(now = Date.now()): Job | undefined {
      return db.prepare(`
        UPDATE message_queue SET state='leased',attempts=attempts+1,leaseUntil=?
        WHERE id=(SELECT id FROM message_queue WHERE state='ready' OR (state='leased' AND leaseUntil<=?) ORDER BY rowid LIMIT 1)
        RETURNING id,requestId,attempts
      `).get(now+30000,now) as unknown as Job | undefined;
    },
    ack(id: string) { db.prepare("UPDATE message_queue SET state='done' WHERE id=?").run(id); },
  };
}
export type MessageStore = ReturnType<typeof createMessageStore>;
