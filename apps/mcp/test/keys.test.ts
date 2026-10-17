import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server";
import { callerFrom, issueKey, spaceOf } from "../src/keys";

const PROTOCOL = "2025-11-25";

async function session(app: ReturnType<typeof buildServer>["app"], key?: string) {
  const auth = key ? { authorization: `Bearer ${key}` } : {};
  const init = await app.inject({
    method: "POST",
    url: "/mcp",
    headers: { "content-type": "application/json", ...auth },
    payload: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "t", version: "1" } } },
  });
  const sid = String(init.headers["mcp-session-id"]);
  let id = 10;
  return async (name: string, args: Record<string, unknown>) => {
    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: { "content-type": "application/json", "mcp-session-id": sid, "mcp-protocol-version": PROTOCOL, ...auth },
      payload: { jsonrpc: "2.0", id: id++, method: "tools/call", params: { name, arguments: args } },
    });
    const body = res.json() as { result?: { content: { text: string }[] }; error?: { message: string } };
    return { status: res.statusCode, body, data: body.result ? JSON.parse(body.result.content[0]!.text) : null };
  };
}

describe("API keys", () => {
  it("issues a key with no account, and stores nothing about it", async () => {
    const { app } = buildServer();
    const res = await app.inject({ method: "POST", url: "/v1/keys" });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { key: string; mcpClientConfig: unknown };
    expect(body.key).toMatch(/^es_[A-Za-z0-9_-]{32}$/);
    expect(JSON.stringify(body.mcpClientConfig)).toContain(`Bearer ${body.key}`);
    expect(spaceOf(body.key)).toHaveLength(16);
  });

  it("gives a keyed caller a household nobody else can see, and leaves the open server open", async () => {
    const { app } = buildServer();
    const key = issueKey();
    const mine = await session(app, key);
    const open = await session(app);
    const other = await session(app, issueKey());

    const rec = await mine("record_screen_result", { household: "judges", valid: true, srt_db: -9.5, placeholder_audio: true });
    expect(rec.data.stored.household).toBe("judges");

    expect((await mine("get_screen_history", { household: "judges" })).data.screens).toHaveLength(1);
    expect((await open("get_screen_history", { household: "judges" })).data.screens).toHaveLength(0);
    expect((await other("get_screen_history", { household: "judges" })).data.screens).toHaveLength(0);

    await open("record_screen_result", { household: "judges", valid: true, srt_db: -8, placeholder_audio: true });
    expect((await open("get_screen_history", { household: "judges" })).data.screens).toHaveLength(1);
    expect((await mine("get_screen_history", { household: "judges" })).data.screens).toHaveLength(1);
  });

  it("refuses a malformed key rather than treating the caller as open", async () => {
    const { app } = buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: { "content-type": "application/json", authorization: "Bearer nope" },
      payload: { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "t", version: "1" } } },
    });
    expect(res.statusCode).toBe(401);
    expect(res.headers["www-authenticate"]).toContain("Bearer");
    expect(callerFrom(undefined)).toEqual({ space: null });
  });

  it("does not let an open household name spell a keyed one", async () => {
    const { app } = buildServer();
    const open = await session(app);
    const res = await open("get_screen_history", { household: "key:abc:judges" });
    expect(res.body.error?.message).toContain("colon");
  });
});
