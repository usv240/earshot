import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server";
import { newSessionId, sessionIsOurs } from "../src/mcp";

const PROTOCOL = "2025-11-25";

describe("signed MCP sessions", () => {
  it("accepts on one server a session another issued, as two Lambda instances must", async () => {
    const a = buildServer().app;
    const b = buildServer().app;
    const init = await a.inject({
      method: "POST",
      url: "/mcp",
      headers: { "content-type": "application/json" },
      payload: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "t", version: "1" } } },
    });
    const sid = String(init.headers["mcp-session-id"]);
    const res = await b.inject({
      method: "POST",
      url: "/mcp",
      headers: { "content-type": "application/json", "mcp-session-id": sid, "mcp-protocol-version": PROTOCOL },
      payload: { jsonrpc: "2.0", id: 2, method: "tools/list" },
    });
    expect(res.statusCode).toBe(200);
  });

  it("refuses an id it did not sign, and one that was ended", async () => {
    const app = buildServer().app;
    const forged = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: { "content-type": "application/json", "mcp-session-id": "0123456789abcdef.000000000000000000000000" },
      payload: { jsonrpc: "2.0", id: 2, method: "tools/list" },
    });
    expect(forged.statusCode).toBe(404);
    const sid = newSessionId();
    expect(sessionIsOurs(sid)).toBe(true);
    expect((await app.inject({ method: "DELETE", url: "/mcp", headers: { "mcp-session-id": sid } })).statusCode).toBe(204);
    const after = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: { "content-type": "application/json", "mcp-session-id": sid },
      payload: { jsonrpc: "2.0", id: 3, method: "tools/list" },
    });
    expect(after.statusCode).toBe(404);
  });
});
