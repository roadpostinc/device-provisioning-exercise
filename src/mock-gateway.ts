import express from "express";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { transports } from "./message-types.js";

export function createMockGateway(path = ":memory:") {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS gateway_connectivity (deviceId TEXT PRIMARY KEY,httpOnline INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS transport_records (
      reference TEXT PRIMARY KEY,messageId TEXT NOT NULL,deviceId TEXT NOT NULL,content TEXT NOT NULL,transport TEXT NOT NULL,
      UNIQUE(messageId,transport)
    );
    CREATE TABLE IF NOT EXISTS transport_events (messageId TEXT NOT NULL,kind TEXT NOT NULL,evidence TEXT NOT NULL,PRIMARY KEY(messageId,kind));
    INSERT OR IGNORE INTO gateway_connectivity VALUES ('DEV-1001',1),('DEV-1002',0),('DEV-1003',1);
  `);
  const app = express();
  app.use(express.json({ limit: "16kb" }));
  app.locals.closeStorage = () => db.close();
  const modes = { http: "healthy",sbd: "healthy" } as Record<"http" | "sbd","healthy" | "unavailable" | "reject" | "timeout">;
  const calls: { transport: string;messageId: string }[] = [];
  const submissions = () => db.prepare("SELECT * FROM transport_records ORDER BY rowid").all().map(row => ({
    reference: row.reference,messageId: row.messageId,deviceId: row.deviceId,
    content: JSON.parse(String(row.content)),transport: row.transport,
  }));
  app.get("/connectivity/:deviceId",(req,res) => {
    const row = db.prepare("SELECT httpOnline FROM gateway_connectivity WHERE deviceId=?").get(req.params.deviceId);
    if (!row) return res.status(404).json({ error: "Device not found" });
    return res.json({ httpOnline: Boolean(row.httpOnline) });
  });
  app.post("/admin/connectivity",(req,res) => {
    const parsed = z.object({ deviceId: z.enum(["DEV-1001","DEV-1002","DEV-1003"]),httpOnline: z.boolean() }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Provide deviceId and httpOnline boolean" });
    db.prepare("UPDATE gateway_connectivity SET httpOnline=? WHERE deviceId=?").run(Number(parsed.data.httpOnline),parsed.data.deviceId);
    return res.json(parsed.data);
  });
  app.post("/admin/gateway",(req,res) => {
    const parsed = z.object({ transport: z.enum(transports),mode: z.enum(["healthy","unavailable","reject","timeout"]) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid gateway configuration" });
    modes[parsed.data.transport] = parsed.data.mode;
    return res.json(parsed.data);
  });
  app.get("/admin/messages",(_req,res) => res.json({
    modes,calls,connectivity: db.prepare("SELECT * FROM gateway_connectivity ORDER BY deviceId").all(),submissions: submissions(),
  }));
  app.get("/admin/messages/:id",(req,res) => {
    const row = submissions().find(row => row.messageId === req.params.id);
    if (!row) return res.status(404).json({ error: "Submission not found" });
    return res.json(row);
  });
  app.post("/admin/events",(req,res) => {
    const parsed = z.object({ messageId: z.string().min(1),kind: z.enum(["receipt","pong"]) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Provide messageId and event kind" });
    const { messageId,kind } = parsed.data;
    const submission = db.prepare("SELECT * FROM transport_records WHERE messageId=? ORDER BY rowid LIMIT 1").get(messageId);
    if (!submission) return res.status(404).json({ error: "Submission not found" });
    const existing = db.prepare("SELECT evidence FROM transport_events WHERE messageId=? AND kind=?").get(messageId,kind);
    if (existing) return res.json(JSON.parse(String(existing.evidence)));
    const event = {
      eventId: randomUUID(),kind,messageId,deviceId: submission.deviceId,
      transport: submission.transport,gatewayReference: submission.reference,observedAt: new Date().toISOString(),
    };
    db.prepare("INSERT INTO transport_events VALUES (?,?,?)").run(messageId,kind,JSON.stringify(event));
    return res.json(event);
  });
  for (const transport of transports) app.post(`/transports/${transport}/messages`,async (req,res) => {
    const parsed = z.object({ messageId: z.string().min(1),deviceId: z.string().min(1),content: z.json() }).strict().safeParse(req.body);
    if (!parsed.success || req.header("Idempotency-Key") !== parsed.data.messageId) return res.status(400).json({ error: "Provide canonical message identity and JSON content" });
    const { messageId,deviceId,content } = parsed.data;
    const serialized = JSON.stringify(content);
    calls.push({ transport,messageId });
    const previous = db.prepare("SELECT * FROM transport_records WHERE messageId=? ORDER BY rowid LIMIT 1").get(messageId);
    if (previous && (previous.deviceId !== deviceId || previous.content !== serialized)) return res.status(409).json({ error: "Message identity payload conflict" });
    const existing = db.prepare("SELECT * FROM transport_records WHERE messageId=? AND transport=?").get(messageId,transport);
    if (existing) return res.status(202).json({ gatewayReference: existing.reference,accepted: true,transport });
    const online = db.prepare("SELECT httpOnline FROM gateway_connectivity WHERE deviceId=?").get(deviceId);
    if (!online) return res.status(404).json({ error: "Device not found" });
    if (transport === "http" && !online.httpOnline) return res.status(503).json({ error: "HTTP surface offline; not accepted" });
    const mode = modes[transport];
    if (mode === "unavailable") return res.status(503).json({ error: "Gateway unavailable; not accepted" });
    if (mode === "reject") return res.status(422).json({ error: "Message rejected; not accepted" });
    if (mode === "timeout") {
      await new Promise(resolve => setTimeout(resolve,1500));
      return res.status(504).json({ error: "Gateway timeout; not accepted" });
    }
    const reference = `MSG-${randomUUID()}`;
    db.prepare("INSERT INTO transport_records VALUES (?,?,?,?,?)").run(reference,messageId,deviceId,serialized,transport);
    return res.status(202).json({ gatewayReference: reference,accepted: true,transport });
  });
  return app;
}
