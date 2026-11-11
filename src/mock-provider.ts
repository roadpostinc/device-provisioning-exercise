import express from "express";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { actions } from "./types.js";
import { createMockGateway } from "./mock-gateway.js";

export const profiles = ["healthy", "transient", "rate-limit", "permanent", "timeout"] as const;
type Profile = typeof profiles[number];
export function createMockProvider(path = ":memory:", initialDelayMs = 0) {
  if (!Number.isInteger(initialDelayMs) || initialDelayMs < 0 || initialDelayMs > 10000) {
    throw new Error("Provider delay must be an integer between 0 and 10000 ms");
  }
  if (path !== ":memory:") mkdirSync(dirname(path),{ recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS devices (id TEXT PRIMARY KEY,state TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS results (key TEXT PRIMARY KEY,deviceId TEXT NOT NULL,action TEXT NOT NULL,reference TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS effects (id INTEGER PRIMARY KEY,deviceId TEXT NOT NULL,action TEXT NOT NULL,reference TEXT NOT NULL,key TEXT);
  `);
  const app = express();
  const gateway = createMockGateway(path);
  app.locals.closeStorage = () => { db.close(); gateway.locals.closeStorage(); };
  app.use(gateway);
  app.use(express.json({ limit: "16kb" }));
  let profile: Profile = "healthy";
  let delayMs = initialDelayMs;
  let calls = 0;
  const attempts = new Map<string,number>();
  app.get("/health",(_req,res) => res.json({ status: "ok" }));
  app.get("/admin/state",(_req,res) => res.json({
    profile,delayMs,calls,effects: db.prepare("SELECT deviceId,action,reference,key FROM effects ORDER BY id").all(),
    devices: db.prepare("SELECT id,state FROM devices ORDER BY id").all(),
  }));
  app.post("/admin/delay",(req,res) => {
    const parsed = z.object({ delayMs: z.number().int().min(0).max(10000) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "delayMs must be an integer between 0 and 10000" });
    delayMs = parsed.data.delayMs;
    return res.json({ delayMs });
  });
  app.post("/admin/profile",(req,res) => {
    const parsed = z.enum(profiles).safeParse(req.body.profile);
    if (!parsed.success) return res.status(400).json({ error: "Unknown profile" });
    profile = parsed.data; calls = 0; attempts.clear();
    db.exec("DELETE FROM effects");
    return res.json({ profile });
  });
  function state(deviceId: string) {
    return (db.prepare("SELECT state FROM devices WHERE id=?").get(deviceId)?.state as string | undefined) ?? "inactive";
  }
  for (const action of actions) app.post(`/${action}`,async (req,res) => {
    const parsed = z.object({ deviceId: z.string().min(1) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "deviceId required" });
    const { deviceId } = parsed.data;
    const key = req.header("Idempotency-Key");
    calls++;
    const requestDelayMs = delayMs;
    if (requestDelayMs > 0) await new Promise(resolve => setTimeout(resolve,requestDelayMs));
    if (key) {
      const existing = db.prepare("SELECT * FROM results WHERE key=?").get(key);
      if (existing) {
        if (existing.deviceId !== deviceId || existing.action !== action) {
          return res.status(409).json({ error: "Idempotency key payload conflict" });
        }
        return res.json({ reference: existing.reference });
      }
    }
    const expected = action === "activate" ? "inactive" : "active";
    if (state(deviceId) !== expected) return res.status(409).json({ error: `Cannot ${action} a device in state ${state(deviceId)}` });
    const attemptKey = key ?? `${action}:${deviceId}`;
    const count = (attempts.get(attemptKey) ?? 0)+1;
    attempts.set(attemptKey,count);
    if (profile === "transient" && count <= 2) return res.status(503).json({ error: "Temporarily unavailable" });
    if (profile === "rate-limit" && count <= 2) return res.set("Retry-After","1").status(429).json({ error: "Rate limited" });
    if (profile === "permanent") return res.status(422).json({ error: "Operation rejected" });
    if (profile === "timeout") {
      await new Promise(resolve => setTimeout(resolve,20000));
      return res.status(504).json({ error: "Provider timeout; no operation applied" });
    }
    const reference = `NET-${randomUUID()}`;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("INSERT INTO devices VALUES (?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state")
        .run(deviceId,action === "activate" ? "active" : "inactive");
      if (key) db.prepare("INSERT INTO results VALUES (?,?,?,?)").run(key,deviceId,action,reference);
      db.prepare("INSERT INTO effects (deviceId,action,reference,key) VALUES (?,?,?,?)").run(deviceId,action,reference,key ?? null);
      db.exec("COMMIT");
    } catch (error) { db.exec("ROLLBACK"); throw error; }
    return res.json({ reference });
  });
  return app;
}
