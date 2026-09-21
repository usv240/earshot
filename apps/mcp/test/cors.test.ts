import { afterEach, describe, expect, it } from "vitest";
import { join } from "node:path";
import { buildServer } from "../src/server";
import { isAllowedOrigin } from "../src/mcp";

const CONTENT_DIR = join(__dirname, "..", "..", "web", "public", "content");

/**
 * Exactly one layer may answer for CORS.
 *
 * On Lambda this server sits behind a function URL whose own CORS
 * configuration already reflects the request origin. If the app registers
 * CORS as well, the response carries two `Access-Control-Allow-Origin`
 * headers and every browser rejects it outright, even when both values
 * are identical.
 *
 * This is the third appearance of the same bug across these projects.
 * Bellwether found it and filed it as friction entry 6. Nightlight then
 * shipped it, and its caregiver app could not load its own data in any
 * browser while curl reported a clean 200 throughout. Here it was live on
 * the deployed MCP endpoint, verified with a real request:
 *
 *   access-control-allow-origin: https://example.com
 *   access-control-allow-origin: https://example.com
 *
 * No command-line check catches it, which is exactly why it keeps
 * happening and why it is pinned here instead.
 */
describe("CORS is owned by one layer", () => {
  const saved = process.env.AWS_LAMBDA_FUNCTION_NAME;
  afterEach(() => {
    if (saved === undefined) delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    else process.env.AWS_LAMBDA_FUNCTION_NAME = saved;
  });

  async function originHeaders(): Promise<string[]> {
    const { app } = buildServer();
    const res = await app.inject({
      method: "GET",
      url: "/healthz",
      headers: { origin: "https://example.com" },
    });
    const raw = res.headers["access-control-allow-origin"];
    await app.close();
    return raw === undefined ? [] : Array.isArray(raw) ? raw : [String(raw)];
  }

  it("sends no origin header of its own on Lambda", async () => {
    // The function URL adds it. Anything this app adds is the second copy.
    process.env.AWS_LAMBDA_FUNCTION_NAME = "earshot-mcp";
    expect(await originHeaders()).toEqual([]);
  });

  it("still answers browsers when there is no function URL in front", async () => {
    // Locally nothing else sets it, so the middleware is required.
    delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    expect(await originHeaders()).toEqual(["https://example.com"]);
  });

  it("lets a browser read the MCP session id when there is no function URL", async () => {
    // A browser hides any response header it is not told it may read, and
    // an MCP client cannot continue a session without MCP-Session-Id. The
    // function URL exposes it in production; this layer has to expose it
    // locally, or a browser-based client works deployed and fails in
    // development. That is exactly what happened: the site's live MCP
    // panel reported "the server did not open a session" against a local
    // server that had opened one.
    delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    const { app } = buildServer({ contentDir: CONTENT_DIR });
    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        origin: "http://127.0.0.1:4320",
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      payload: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "cors-test", version: "1" },
        },
      }),
    });
    await app.close();
    expect(res.headers["mcp-session-id"], `status ${res.statusCode}: ${res.body.slice(0, 160)}`).toBeTruthy();
    const exposed = String(res.headers["access-control-expose-headers"] ?? "").toLowerCase();
    expect(exposed).toContain("mcp-session-id");
  });

  it("never sends the header twice in either environment", async () => {
    for (const lambda of [true, false]) {
      if (lambda) process.env.AWS_LAMBDA_FUNCTION_NAME = "earshot-mcp";
      else delete process.env.AWS_LAMBDA_FUNCTION_NAME;
      expect((await originHeaders()).length).toBeLessThanOrEqual(1);
    }
  });
});

/**
 * Which browsers may hold a session.
 *
 * The spec requires Origin validation against DNS rebinding. Loopback-only
 * was the whole list, which is right for a server on a laptop and refused
 * this project's own deployed site with a 403: the page that exists to
 * show the Alexa+ integration working could not reach it. Agents were
 * never affected, because they send no Origin.
 */
describe("origin validation", () => {
  it("admits loopback, the way a local server must", () => {
    for (const o of ["http://localhost:3000", "http://127.0.0.1:4320", "http://[::1]:8080"]) {
      expect(isAllowedOrigin(o), o).toBe(true);
    }
  });

  it("admits the deployed site, so its own panel can hold a session", () => {
    // The deployed site is named by the stack rather than written in
    // here, so this checks the mechanism rather than a domain that will
    // be wrong the first time the distribution is replaced.
    process.env.EARSHOT_ALLOWED_ORIGINS = "https://example.cloudfront.net";
    expect(isAllowedOrigin("https://example.cloudfront.net")).toBe(true);
    expect(isAllowedOrigin("https://example.cloudfront.net/")).toBe(true);
    delete process.env.EARSHOT_ALLOWED_ORIGINS;
  });

  it("refuses everything else, including names built to look allowed", () => {
    // The suffix cases are the ones a careless startsWith or a regex
    // without anchors would let through.
    for (const o of [
      "https://example.com",
      "https://example.cloudfront.net.evil.com",
      "http://localhost.evil.com",
      "https://evil.localhost.attacker.com",
    ]) {
      expect(isAllowedOrigin(o), o).toBe(false);
    }
  });

  it("admits extra origins only when they are named", () => {
    const saved = process.env.EARSHOT_ALLOWED_ORIGINS;
    try {
      expect(isAllowedOrigin("https://preview.example.org")).toBe(false);
      process.env.EARSHOT_ALLOWED_ORIGINS = "https://preview.example.org, https://other.example";
      expect(isAllowedOrigin("https://preview.example.org")).toBe(true);
      expect(isAllowedOrigin("https://other.example")).toBe(true);
      expect(isAllowedOrigin("https://unnamed.example")).toBe(false);
    } finally {
      if (saved === undefined) delete process.env.EARSHOT_ALLOWED_ORIGINS;
      else process.env.EARSHOT_ALLOWED_ORIGINS = saved;
    }
  });
});
