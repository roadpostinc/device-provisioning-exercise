import { expect,it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { openStore } from "../src/db.js";

it("serves the health endpoint",async () => {
  const store = openStore();
  try {
    const response = await request(createApp(store)).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  } finally { store.close(); }
});
