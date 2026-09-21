import { beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server";
import { MCP_PROTOCOL_VERSION, TOOL_NAMES } from "../src/mcp";
import { MemoryStore } from "../src/store";

/**
 * The agent surface, against the spec and against its own promises.
 *
 * Two kinds of test live here and the second kind matters more.
 *
 * The first is conformance: sessions, versions, status codes, error
 * numbers. Those are what makes an MCP client able to talk to this at
 * all, and getting one wrong produces a server that works in a test
 * harness and fails against a real agent.
 *
 * The second is the promise the product makes on its own front page:
 * that how a household watches television never leaves the television.
 * A server that quietly held that data would make the promise false
 * however carefully the sentence was worded, so there are tests that
 * the tools cannot report it, including a test that walks every tool
 * and fails if any of them ever returns a listening figure.
 */

type Json = Record<string, unknown>;

function makeApp() {
  const store = new MemoryStore();
  const { app } = buildServer({ store });
  return { app, store };
}

async function initialise(app: ReturnType<typeof makeApp>["app"]) {
  const res = await app.inject({
    method: "POST",
    url: "/mcp",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "test", version: "0" },
      },
    }),
  });
  const session = res.headers["mcp-session-id"] as string;
  return { res, session };
}

async function call(
  app: ReturnType<typeof makeApp>["app"],
  session: string,
  name: string,
  args: Json = {},
) {
  const res = await app.inject({
    method: "POST",
    url: "/mcp",
    headers: { "content-type": "application/json", "mcp-session-id": session },
    payload: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  const body = res.json() as {
    result?: { content?: { text: string }[] };
    error?: { code: number; message: string };
  };
  const text = body.result?.content?.[0]?.text;
  return {
    status: res.statusCode,
    error: body.error,
    payload: text ? (JSON.parse(text) as Json) : undefined,
    raw: text ?? "",
  };
}

describe("the transport", () => {
  it("opens a session and answers with the protocol revision it implements", async () => {
    const { app } = makeApp();
    const { res, session } = await initialise(app);
    expect(res.statusCode).toBe(200);
    expect(session).toBeTruthy();
    expect((res.json() as Json).result).toMatchObject({
      protocolVersion: MCP_PROTOCOL_VERSION,
    });
  });

  it("refuses a request with no session", async () => {
    const { app } = makeApp();
    await initialise(app);
    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list" }),
    });
    expect(res.statusCode).toBe(400);
  });

  it("refuses a session it never issued", async () => {
    const { app } = makeApp();
    await initialise(app);
    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: { "content-type": "application/json", "mcp-session-id": "made-up" },
      payload: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list" }),
    });
    expect(res.statusCode).toBe(404);
  });

  it("answers a body it cannot parse with a parse error rather than a crash", async () => {
    // JSON-RPC is specific: an unparseable body is -32700. A 500 tells a
    // client to retry something that will never succeed.
    const { app } = makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: { "content-type": "application/json" },
      payload: "{ not json",
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: { code: number } }).error.code).toBe(-32700);
  });

  it("ends a session when asked", async () => {
    const { app } = makeApp();
    const { session } = await initialise(app);
    const res = await app.inject({
      method: "DELETE",
      url: "/mcp",
      headers: { "mcp-session-id": session },
    });
    expect(res.statusCode).toBe(204);
  });

  it("lists exactly the tools it implements", async () => {
    const { app } = makeApp();
    const { session } = await initialise(app);
    const res = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: { "content-type": "application/json", "mcp-session-id": session },
      payload: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/list" }),
    });
    const tools = (res.json() as { result: { tools: { name: string }[] } }).result.tools;
    expect(tools.map((t) => t.name).sort()).toEqual([...TOOL_NAMES].sort());
    for (const tool of tools) {
      expect(tool.name).toBeTruthy();
    }
  });
});

describe("what the agent is allowed to know", () => {
  let app: ReturnType<typeof makeApp>["app"];
  let session: string;

  beforeEach(async () => {
    app = makeApp().app;
    session = (await initialise(app)).session;
  });

  it("explains what the television watches without reporting any of it", async () => {
    /*
      The whole design in one test. Somebody asking why their television
      brought this up gets a straight account of the mechanism, and
      nobody gets the numbers, because the numbers are on the television.
    */
    const { payload, raw } = await call(app, session, "what_the_television_watches");
    expect(payload?.watches).toBeTruthy();
    expect(raw).toContain("no microphone");
    expect(raw).toContain("leaves the device it was watched on");
    // No figures of any kind: this tool has no data to report.
    expect(raw).not.toMatch(/\d+(\.\d+)?\s*dB/);
  });

  it("never returns a listening measurement from any tool", async () => {
    // Walks the whole surface rather than the one tool somebody
    // remembered to check. Volume, drift and rewinds are the things that
    // stay on the device, so their appearance anywhere here would mean
    // the promise on the front page had quietly stopped being true.
    await call(app, session, "record_screen_result", {
      household: "home",
      valid: true,
      srt_db: -8.2,
    });
    /*
      Keys, not words. The first version of this banned the word
      "volume" anywhere in a response, and failed on the one tool whose
      job is explaining in prose that the volume is watched. What must
      never appear is the data: a field carrying a listening figure.
    */
    const FORBIDDEN_KEYS = [
      "driftDb",
      "baselineDb",
      "recentDb",
      "rehearSeeks",
      "rehearRate",
      "captionShare",
      "listeningLevelDb",
      "dialogueLufs",
    ];
    for (const name of TOOL_NAMES) {
      const { raw } = await call(app, session, name, { household: "home" });
      for (const key of FORBIDDEN_KEYS) {
        expect(
          raw.includes(`"${key}"`),
          `${name} returned a ${key} field`,
        ).toBe(false);
      }
    }
  });

  it("explains the check, including what it cannot do", async () => {
    const { raw, payload } = await call(app, session, "explain_the_check");
    expect(payload?.whatItCannotDo).toBeTruthy();
    expect(raw).toContain("screen, not a diagnosis");
    expect(raw).toContain("Provisional");
  });
});

describe("recording a check", () => {
  let app: ReturnType<typeof makeApp>["app"];
  let session: string;

  beforeEach(async () => {
    app = makeApp().app;
    session = (await initialise(app)).session;
  });

  it("stores a usable result and says what it means", async () => {
    const { payload } = await call(app, session, "record_screen_result", {
      household: "home",
      valid: true,
      srt_db: -10.4,
    });
    expect((payload?.stored as Json).band).toBe("clear");
    expect(payload?.nextStep).toBeTruthy();
  });

  it("refuses a usable result with no threshold in it", async () => {
    const { error } = await call(app, session, "record_screen_result", {
      household: "home",
      valid: true,
    });
    expect(error?.code).toBe(-32602);
  });

  it("stores a refused run rather than dropping it", async () => {
    // A history that only contains the runs that worked looks better
    // than the thing it describes.
    const { payload } = await call(app, session, "record_screen_result", {
      household: "home",
      valid: false,
    });
    expect((payload?.stored as Json).band).toBe("unmeasured");

    const history = await call(app, session, "get_screen_history", { household: "home" });
    expect((history.payload?.screens as unknown[]).length).toBe(1);
  });

  it("marks a result taken with placeholder audio so it cannot be mistaken later", async () => {
    const { raw } = await call(app, session, "record_screen_result", {
      household: "home",
      valid: true,
      srt_db: -9,
      placeholder_audio: true,
    });
    expect(raw).toContain("says nothing about anybody");
  });

  it("wants a household, and says so rather than inventing one", async () => {
    const { error } = await call(app, session, "get_screen_history", {});
    expect(error?.code).toBe(-32602);
  });
});

describe("whether anything has changed", () => {
  let app: ReturnType<typeof makeApp>["app"];
  let session: string;

  beforeEach(async () => {
    app = makeApp().app;
    session = (await initialise(app)).session;
  });

  const record = (srt: number, takenAt: string, extra: Json = {}) =>
    call(app, session, "record_screen_result", {
      household: "home",
      valid: true,
      srt_db: srt,
      taken_at: takenAt,
      ...extra,
    });

  it("calls one result a measurement rather than a direction", async () => {
    await record(-9, "2026-01-01");
    const { payload } = await call(app, session, "get_screen_history", { household: "home" });
    expect((payload?.change as Json).changeDb).toBeNull();
  });

  it("calls a decibel of difference no change, because the test moves that much", async () => {
    /*
      The measured test-retest spread of this procedure is 0.748 dB. Two
      results a month apart differing by one decibel is the instrument
      repeating itself. Reporting that as deterioration would be the
      cruellest possible false positive.
    */
    await record(-9, "2026-01-01");
    await record(-8, "2026-02-01");
    const { payload } = await call(app, session, "get_screen_history", { household: "home" });
    expect((payload?.change as Json).note).toMatch(/not a change/i);
  });

  it("speaks up when the difference is larger than the instrument", async () => {
    await record(-12, "2026-01-01");
    await record(-6, "2026-06-01");
    const { payload } = await call(app, session, "get_screen_history", { household: "home" });
    const change = payload?.change as Json;
    expect(change.changeDb).toBeCloseTo(6, 1);
    expect(change.note).toMatch(/clinician/i);
  });

  it("leaves placeholder results out of the page for a doctor", async () => {
    await record(-9, "2026-01-01", { placeholder_audio: true });
    await record(-8.5, "2026-02-01");
    const { payload } = await call(app, session, "prepare_for_appointment", {
      household: "home",
    });
    const clinical = payload?.forAClinician as Json;
    expect((clinical.results as unknown[]).length).toBe(1);
    expect(payload?.screensExcluded).toBe(1);
  });

  it("hands a clinician the limitations without being asked", async () => {
    await record(-8, "2026-02-01");
    const { payload } = await call(app, session, "prepare_for_appointment", {
      household: "home",
    });
    const limitations = (payload?.forAClinician as Json).limitations as string[];
    expect(limitations.length).toBeGreaterThanOrEqual(4);
    expect(limitations.join(" ")).toMatch(/not calibrated|uncalibrated/i);
    expect(limitations.join(" ")).toMatch(/simulated listeners/i);
  });
});
