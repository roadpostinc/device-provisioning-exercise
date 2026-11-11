import express from "express";
import { z } from "zod";
import { actions } from "./types.js";
import { RequestError, type Store } from "./db.js";
import { createMessageGateway,type MessageGateway } from "./message-gateway.js";

const requestSchema = z.object({ deviceId: z.string().min(1).max(80), action: z.enum(actions) }).strict();
export function createApp(store: Store,gateway: MessageGateway = createMessageGateway(process.env.PROVIDER_URL ?? "http://127.0.0.1:4101")) {
  const app = express();
  app.use(express.json({ limit: "16kb" }));
  app.get("/api/health", (_req,res) => res.json({ status: "ok" }));
  app.get("/api/devices", (_req,res) => res.json(store.devices()));
  app.get("/api/operations", (_req,res) => res.json(store.list()));
  app.get("/api/operations/:id", (req,res) => {
    const operation = store.get(req.params.id);
    if (!operation) return res.status(404).json({ error: "Operation not found" });
    return res.json({ ...operation, history: store.history(operation.id) });
  });
  app.post("/api/operations", (req,res) => {
    const parsed = requestSchema.safeParse(req.body);
    const key = req.header("Idempotency-Key");
    if (!parsed.success || !key || !/^[a-zA-Z0-9_-]{1,80}$/.test(key)) {
      return res.status(400).json({ error: "Provide deviceId, action (activate or deactivate), and an Idempotency-Key (1–80 letters, digits, hyphens or underscores)" });
    }
    const operation = store.create(parsed.data.deviceId,parsed.data.action,key);
    return res.status(202).json(operation);
  });
  app.get("/api/connectivity/:id",async (req,res) => {
    if (!store.device(req.params.id)) return res.status(404).json({ error: "Device not found" });
    try { return res.json(await gateway.probe(req.params.id)); }
    catch { return res.status(503).json({ error: "Connectivity unavailable" }); }
  });
  app.post("/api/mock/events",async (req,res) => {
    const parsed = z.object({ messageId: z.string().min(1),kind: z.enum(["receipt","pong"]) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Provide messageId and event kind" });
    if (!gateway.event) return res.status(503).json({ error: "Event source unavailable" });
    try { return res.json(await gateway.event(parsed.data.messageId,parsed.data.kind)); }
    catch (error) {
      const status = error instanceof Error && "status" in error && typeof error.status === "number" ? error.status : 503;
      return res.status(status).json({ error: "Event source could not produce evidence" });
    }
  });
  app.get("/api/messages",(_req,res) => res.json(store.messages.list()));
  app.get("/api/messages/:id",(req,res) => {
    const message = store.messages.get(req.params.id);
    if (!message) return res.status(404).json({ error: "Message not found" });
    return res.json({ ...message,history: store.messages.history(message.id) });
  });
  app.post("/api/messages",(_req,res) => res.status(501).json({ error: "Message service unavailable" }));
  app.post("/api/messages/:id/events",(_req,res) => res.status(501).json({ error: "Message event service unavailable" }));
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof RequestError) return res.status(error.status).json({ error: error.message });
    if (error instanceof SyntaxError) return res.status(400).json({ error: "Invalid JSON" });
    console.error("API error",error);
    return res.status(500).json({ error: "Internal server error" });
  });
  return app;
}
