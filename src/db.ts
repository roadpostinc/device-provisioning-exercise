import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { Action, Device, HistoryEntry, Job, Operation } from "./types.js";
import { createMessageStore } from "./message-store.js";

export class RequestError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
export function openStore(path = ":memory:") {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  const columns = db.prepare("PRAGMA table_info(devices)").all();
  if (columns.length && !columns.some(column => column.name === "state")) {
    db.close();
    throw new Error("Unsupported local database schema. Stop services and run npm run reset -- --confirm.");
  }
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY, name TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('inactive','activating','active','deactivating')),
      currentOperationId TEXT
    );
    CREATE TABLE IF NOT EXISTS operations (
      id TEXT PRIMARY KEY, deviceId TEXT NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('activate','deactivate')),
      idempotencyKey TEXT NOT NULL, previousState TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('queued','processing','succeeded','failed')),
      providerReference TEXT, error TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY, requestId TEXT NOT NULL, status TEXT NOT NULL,
      message TEXT NOT NULL, createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, requestId TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL DEFAULT 'ready', availableAt INTEGER NOT NULL DEFAULT 0,
      leaseUntil INTEGER NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO devices VALUES ('DEV-1001', 'Demo device — North', 'inactive', NULL);
    INSERT OR IGNORE INTO devices VALUES ('DEV-1002', 'Demo device — West', 'inactive', NULL);
    INSERT OR IGNORE INTO devices VALUES ('DEV-1003', 'Demo device — East', 'inactive', NULL);
  `);
  function transaction<T>(work: () => T): T {
    db.exec("BEGIN IMMEDIATE");
    try { const result = work(); db.exec("COMMIT"); return result; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  const get = (id: string) => db.prepare("SELECT * FROM operations WHERE id=?").get(id) as unknown as Operation | undefined;
  const device = (id: string) => db.prepare("SELECT * FROM devices WHERE id=?").get(id) as unknown as Device | undefined;
  const record = (id: string, status: string, message: string, now: string) => {
    db.prepare("INSERT INTO history (requestId,status,message,createdAt) VALUES (?,?,?,?)").run(id,status,message,now);
  };
  const enqueue = (requestId: string) => {
    const id = randomUUID();
    db.prepare("INSERT INTO jobs (id,requestId) VALUES (?,?)").run(id,requestId);
    return id;
  };
  return {
    db, get, device, enqueue,
    messages: createMessageStore(db),
    devices: () => db.prepare("SELECT * FROM devices ORDER BY id").all() as unknown as Device[],
    list: () => db.prepare("SELECT * FROM operations ORDER BY createdAt DESC,rowid DESC").all() as unknown as Operation[],
    history: (id: string) => db.prepare("SELECT status,message,createdAt FROM history WHERE requestId=? ORDER BY id").all(id) as unknown as HistoryEntry[],
    create(deviceId: string, action: Action, idempotencyKey: string) {
      return transaction(() => {
        const existing = db.prepare("SELECT * FROM operations WHERE idempotencyKey=? ORDER BY rowid LIMIT 1").get(idempotencyKey) as unknown as Operation | undefined;
        if (existing && (existing.deviceId !== deviceId || existing.action !== action)) {
          throw new RequestError(409,"Request key belongs to a different device or action");
        }
        const current = device(deviceId);
        if (!current) throw new RequestError(404,"Device not found");
        const expected = action === "activate" ? "inactive" : "active";
        if (!existing && (current.state !== expected || current.currentOperationId)) {
          throw new RequestError(409,`Cannot ${action} a device in state ${current.state}`);
        }
        const id = randomUUID();
        const now = new Date().toISOString();
        db.prepare("INSERT INTO operations VALUES (?,?,?,?,?,'queued',NULL,NULL,?,?)")
          .run(id,deviceId,action,idempotencyKey,existing?.previousState ?? current.state,now,now);
        if (!existing) {
          db.prepare("UPDATE devices SET state=?,currentOperationId=? WHERE id=?")
            .run(action === "activate" ? "activating" : "deactivating",id,deviceId);
        }
        record(id,"queued","Request accepted",now);
        enqueue(id);
        return get(id)!;
      });
    },
    start(id: string) {
      transaction(() => {
        const now = new Date().toISOString();
        db.prepare("UPDATE operations SET status='processing',updatedAt=? WHERE id=?").run(now,id);
        record(id,"processing","Contacting network provider",now);
      });
    },
    finish(id: string, status: "succeeded" | "failed", message: string, reference: string | null = null) {
      transaction(() => {
        const operation = get(id);
        if (!operation) throw new RequestError(404,"Operation not found");
        const now = new Date().toISOString();
        db.prepare("UPDATE operations SET status=?,error=?,providerReference=COALESCE(?,providerReference),updatedAt=? WHERE id=?")
          .run(status,status === "failed" ? message : null,reference,now,id);
        const state = status === "failed" ? operation.previousState : operation.action === "activate" ? "active" : "inactive";
        db.prepare("UPDATE devices SET state=?,currentOperationId=NULL WHERE id=? AND currentOperationId=?")
          .run(state,operation.deviceId,id);
        record(id,status,message,now);
      });
    },
    claim(now = Date.now()): Job | undefined {
      return db.prepare(`
        UPDATE jobs SET state='leased',attempts=attempts+1,leaseUntil=?
        WHERE id=(SELECT id FROM jobs
          WHERE (state='ready' AND availableAt<=?) OR (state='leased' AND leaseUntil<=?)
          ORDER BY rowid LIMIT 1)
        RETURNING id,requestId,attempts
      `).get(now+30000,now,now) as unknown as Job | undefined;
    },
    ack(id: string) { db.prepare("UPDATE jobs SET state='done' WHERE id=?").run(id); },
    retry(id: string, delayMs: number) {
      db.prepare("UPDATE jobs SET state='ready',availableAt=?,leaseUntil=0 WHERE id=?").run(Date.now()+delayMs,id);
    },
    close() { db.close(); },
  };
}
export type Store = ReturnType<typeof openStore>;
