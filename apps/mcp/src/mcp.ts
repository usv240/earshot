import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { interpret, PROVISIONAL_DIOTIC } from "digits-in-noise";
import { changeAcross, type ScreenRecord, type ScreenStore } from "./store";

/**
 * MCP server for Earshot, implementing the Model Context Protocol spec
 * revision 2025-11-25 over the Streamable HTTP transport.
 *
 * Why an agent belongs on a hearing product, and what it is not allowed
 * to know.
 *
 * The person who first notices somebody is struggling is usually not
 * that person. It is whoever else is in the room, and what they do is
 * ask a question out loud rather than open an application. So the
 * division of labour is: the television takes the measurement, and the
 * agent answers the questions about it.
 *
 * The harder half of the design is what this server is deliberately
 * ignorant of. How loud a household has its television, whether the
 * subtitles are on, how often somebody rewinds: none of it is here, and
 * none of it is uploaded anywhere. That is the promise the product makes
 * on its own front page, and a server that quietly held the data would
 * make the promise false however carefully it was worded.
 *
 * So the agent can explain what the television watches, and it can talk
 * about screens that were actually taken, and it cannot report on how
 * anybody watches television. `what_the_television_watches` describes
 * the mechanism and returns none of the numbers, which is the honest
 * answer to "why did my television ask me that".
 *
 * Transport behaviour, per the spec:
 * - POST /mcp: JSON-RPC 2.0 requests and notifications, answered as JSON.
 * - GET /mcp: 405 with an Allow header. The spec permits exactly this for a
 *   server that offers no server-initiated SSE stream.
 * - DELETE /mcp: terminates the session (204).
 * - MCP-Session-Id issued on initialize and required thereafter: missing is
 *   400, unknown or terminated is 404.
 * - MCP-Protocol-Version validated when present.
 * - Origin validated per the DNS-rebinding guidance.
 */

export const MCP_PROTOCOL_VERSION = "2025-11-25";
/** Older revision accepted for header-less backwards compatibility only. */
const FALLBACK_PROTOCOL_VERSION = "2025-03-26";

const SERVER_INFO = { name: "earshot-mcp", version: "0.1.0" };

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const HOUSEHOLD = {
  type: "string",
  description:
    "Which household's screens to look at. A name the household chose, not an account: this server holds no identities.",
};

const TOOLS: ToolDef[] = [
  {
    name: "what_the_television_watches",
    description:
      "Explains what Earshot looks at on a television and why, for somebody asking why they were asked about their hearing. Returns the mechanism and no data: how a household watches never leaves its own device, so this server cannot report it and does not have it.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "explain_the_check",
    description:
      "What the ninety-second check actually measures, in plain language, including what it cannot tell anybody. Use this before or after a result rather than inventing an explanation.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "record_screen_result",
    description:
      "Store a completed check. Called by the Earshot television app when somebody finishes one, including when the run was not usable, because a refused run is information and hiding it would make the history look better than it was.",
    inputSchema: {
      type: "object",
      properties: {
        household: HOUSEHOLD,
        srt_db: {
          type: "number",
          description:
            "Speech reception threshold in dB signal to noise. Omit when the run was not usable.",
        },
        valid: { type: "boolean", description: "Whether the run settled and can be reported." },
        surface: { type: "string", enum: ["television", "web"] },
        placeholder_audio: {
          type: "boolean",
          description:
            "True when the digits were not real speech. A result measured this way says nothing about hearing and is stored so that it cannot be mistaken for one.",
        },
        taken_at: { type: "string", description: "ISO date. Defaults to today." },
      },
      required: ["household", "valid"],
      additionalProperties: false,
    },
  },
  {
    name: "get_screen_history",
    description:
      "Past checks for a household, newest first, with whether anything has actually changed. A difference smaller than the test's own repeatability is reported as no change rather than as a trend.",
    inputSchema: {
      type: "object",
      properties: { household: HOUSEHOLD, limit: { type: "number" } },
      required: ["household"],
      additionalProperties: false,
    },
  },
  {
    name: "prepare_for_appointment",
    description:
      "One page to take to a doctor: what was measured, when, with what, and what it does not establish. Written to be handed to a clinician who has never heard of this product.",
    inputSchema: {
      type: "object",
      properties: { household: HOUSEHOLD },
      required: ["household"],
      additionalProperties: false,
    },
  },
];

/** The tool names, for the health endpoint and the conformance probe. */
export const TOOL_NAMES = TOOLS.map((t) => t.name);

const textContent = (payload: unknown) => ({
  content: [{ type: "text", text: JSON.stringify(payload, null, 1) }],
});

const rpcResult = (id: number | string | null, result: unknown) => ({
  jsonrpc: "2.0" as const,
  id,
  result,
});

const rpcError = (
  id: number | string | null,
  code: number,
  message: string,
) => ({ jsonrpc: "2.0" as const, id, error: { code, message } });

/**
 * Which browser origins may hold a session.
 *
 * The MCP spec requires servers to validate Origin, because a local
 * server bound to loopback can otherwise be driven by any web page through
 * DNS rebinding. Loopback-only is the right answer for a server on a
 * developer's own machine, and it was the only answer here.
 *
 * But this server is also deployed publicly, and its own site holds a
 * session with it from the browser to show the Alexa+ integration
 * working. A loopback-only list refused that site with a 403 while every
 * agent kept working, because agents send no Origin at all. It was found
 * by pressing the panel against a local build before it ever shipped.
 *
 * So the list is loopback plus explicitly named origins: the deployed
 * site by default, and whatever EARSHOT_ALLOWED_ORIGINS adds. Anything
 * else is still refused. A request with no Origin header is not a browser
 * and is not subject to this check, which is how agents connect.
 */
const LOOPBACK = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
/*
  No site origin is hardcoded here.

  The sibling project wrote its CloudFront domain into this file, which
  works until the distribution is replaced and then fails in the one
  way nobody tests for: the server keeps working for every agent,
  because agents send no Origin at all, and refuses only the browser
  panel that exists to show the integration working.

  So the deployed site's origin is handed in by the stack that knows
  it, and a request with no Origin is not a browser and is not subject
  to this check.
*/
export function isAllowedOrigin(origin: string): boolean {
  if (LOOPBACK.test(origin)) return true;
  const named = new Set(
    [...(process.env.EARSHOT_ALLOWED_ORIGINS ?? "").split(",")]
      .map((o) => o.trim().replace(/\/$/, ""))
      .filter(Boolean),
  );
  return named.has(origin.replace(/\/$/, ""));
}

export function registerMcp(
  app: FastifyInstance,
  deps: { store: ScreenStore },
): void {
  const sessions = new Set<string>();

  const checkOrigin = (req: FastifyRequest, reply: FastifyReply): boolean => {
    const origin = req.headers.origin;
    if (typeof origin === "string" && origin.length > 0) {
      if (!isAllowedOrigin(origin)) {
        reply.code(403).send(rpcError(null, -32600, "Origin not allowed"));
        return false;
      }
    }
    return true;
  };

  const requireHousehold = (args: Record<string, unknown>): string => {
    const household = args.household;
    if (typeof household !== "string" || household.trim().length === 0) {
      throw Object.assign(
        new Error("household is required and must be a non-empty string"),
        { code: -32602 },
      );
    }
    return household.trim();
  };

  const callTool = async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> => {
    switch (name) {
      case "what_the_television_watches": {
        /*
          Answers the question without answering it with data, which is
          the whole point. Somebody asking why their television brought
          this up deserves a straight account of the mechanism. Nobody,
          including them, gets the numbers out of this server, because
          the numbers are on the television and stay there.
        */
        return textContent({
          watches: [
            "How loud the dialogue in a programme actually is, measured from the audio, against the volume this household chose for it.",
            "Whether subtitles were switched on.",
            "How often somebody went back to hear a line again.",
          ],
          doesNotWatch: [
            "There is no microphone anywhere in Earshot, on the television or on the website.",
            "There is no camera.",
            "Nothing about how a household watches leaves the device it was watched on, which is why this server cannot report any of it.",
          ],
          whenItSpeaks:
            "Only after months of viewing, never during a programme, never twice in a season, and never again if somebody declines twice.",
          whyItIsNotAJudgement:
            "Turning the volume up is a reason to ask a question. It is not a measurement of anybody's hearing, and Earshot never treats it as one. The measurement is the check.",
        });
      }

      case "explain_the_check": {
        return textContent({
          whatItIs:
            "Three spoken digits with noise behind them, repeated about two dozen times, getting harder while you are right and easier while you are wrong, until it finds the ratio at which you get half of them.",
          whatItMeasures:
            "Speech in noise, reported as a speech reception threshold in decibels of signal to noise. Lower is better.",
          whyNotTones:
            "A pure-tone test plays tones in a quiet room. People with ordinary results on one of those routinely cannot follow dialogue, so tones do not answer the question that brings anybody here.",
          whyItWorksOnATelevision:
            "It measures a ratio rather than a level, so it does not need calibrated equipment. And the response is three digits, so a remote control is enough.",
          whatItCannotDo: [
            "It is a screen, not a diagnosis. It cannot say what is wrong or how bad it is.",
            "It cannot tell a hearing difficulty from a noisy room or a distracted listener, which is why a run that does not settle is refused rather than reported.",
          ],
          reference: PROVISIONAL_DIOTIC,
        });
      }

      case "record_screen_result": {
        const household = requireHousehold(args);
        const valid = args.valid === true;
        const srtDb = typeof args.srt_db === "number" ? args.srt_db : null;

        if (valid && srtDb === null) {
          throw Object.assign(new Error("a usable run has to carry srt_db"), {
            code: -32602,
          });
        }

        const reading = interpret({
          srtDb: srtDb ?? Number.NaN,
          answers: [],
          reversals: 0,
          valid,
          problems: valid ? [] : ["reported as unusable by the client"],
        });

        const entry: ScreenRecord = {
          household,
          takenAt:
            typeof args.taken_at === "string"
              ? args.taken_at
              : new Date().toISOString().slice(0, 10),
          srtDb,
          valid,
          band: reading.band,
          reference: reading.reference.label,
          surface: args.surface === "web" ? "web" : "television",
          placeholderAudio: args.placeholder_audio === true,
        };
        await deps.store.record(entry);

        return textContent({
          stored: entry,
          headline: reading.headline,
          nextStep: reading.nextStep,
          ...(entry.placeholderAudio
            ? {
                warning:
                  "This was measured with placeholder audio rather than speech, so it says nothing about anybody's hearing. It is stored so that it cannot later be mistaken for a real result.",
              }
            : {}),
        });
      }

      case "get_screen_history": {
        const household = requireHousehold(args);
        const limit = typeof args.limit === "number" ? args.limit : 20;
        const history = await deps.store.history(household, limit);
        return textContent({
          household,
          screens: history,
          change: changeAcross(history),
          note:
            "Nothing here is aggregated in storage. Every figure is derived from the rows at the moment you asked.",
        });
      }

      case "prepare_for_appointment": {
        const household = requireHousehold(args);
        const history = await deps.store.history(household, 20);
        const usable = history.filter((r) => r.valid && !r.placeholderAudio);

        return textContent({
          forAClinician: {
            whatWasDone:
              "A self-administered digits-in-noise screen, taken at home on a television, unsupervised and on uncalibrated equipment.",
            results: usable.map((r) => ({
              takenAt: r.takenAt,
              speechReceptionThresholdDb: r.srtDb,
              comparedAgainst: r.reference,
            })),
            change: changeAcross(usable),
            limitations: [
              "The digit material is synthesised rather than drawn from a normed corpus, so the reference bands are provisional and the absolute threshold should not be read against published norms.",
              "The presentation level was set by the listener for comfort and was not calibrated.",
              "This measures speech in noise only. It says nothing about pure-tone thresholds, middle ear function, or anything else.",
              "The procedure was validated against simulated listeners rather than in a trial with people.",
            ],
            whyItMightStillBeUseful:
              "It is a dated record of difficulty with speech in noise, taken more than once, in the room where the difficulty was noticed.",
          },
          screensExcluded: history.length - usable.length,
          whyExcluded:
            "Runs that did not settle, and any taken with placeholder audio, are left out of the page rather than included with a caveat.",
        });
      }

      default:
        throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32602 });
    }
  };

  app.post("/mcp", async (req, reply) => {
    if (!checkOrigin(req, reply)) return;

    const parsed = req.body as { json?: unknown; parseError?: string } | undefined;
    if (parsed?.parseError) {
      // JSON-RPC is specific here: a body the server cannot parse is -32700,
      // and the HTTP status is a client error rather than a server one.
      return reply.code(400).send(rpcError(null, -32700, "Parse error"));
    }

    const body = parsed?.json;
    if (Array.isArray(body)) {
      return reply
        .code(400)
        .send(rpcError(null, -32600, "Batching is not part of this protocol revision"));
    }
    const msg = body as JsonRpcRequest | undefined;
    if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
      return reply.code(400).send(rpcError(null, -32600, "Invalid JSON-RPC request"));
    }

    const sessionHeader = req.headers["mcp-session-id"];
    const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;
    const versionHeader = req.headers["mcp-protocol-version"];
    const version = Array.isArray(versionHeader) ? versionHeader[0] : versionHeader;

    if (
      version !== undefined &&
      version !== MCP_PROTOCOL_VERSION &&
      version !== FALLBACK_PROTOCOL_VERSION
    ) {
      return reply
        .code(400)
        .send(rpcError(msg.id ?? null, -32600, `Unsupported protocol version: ${version}`));
    }

    if (msg.method === "initialize") {
      const newSession = randomUUID();
      sessions.add(newSession);
      reply.header("MCP-Session-Id", newSession);
      return reply.send(
        rpcResult(msg.id ?? null, {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions:
            "EveryWord turns watching into reading with word-by-word karaoke captions. Ask what is in the library, recommend a story for a reader, report how many words someone has actually read, or explain a word they are stuck on. Report only numbers these tools return, and never estimate a reading level or diagnose a reading difficulty.",
        }),
      );
    }

    if (!sessionId) {
      return reply
        .code(400)
        .send(rpcError(msg.id ?? null, -32600, "Missing MCP-Session-Id header"));
    }
    if (!sessions.has(sessionId)) {
      return reply
        .code(404)
        .send(rpcError(msg.id ?? null, -32001, "Unknown or terminated session"));
    }

    // Notifications get 202 Accepted with no body.
    if (msg.id === undefined || msg.id === null) {
      return reply.code(202).send();
    }

    switch (msg.method) {
      case "ping":
        return reply.send(rpcResult(msg.id, {}));
      case "tools/list":
        return reply.send(rpcResult(msg.id, { tools: TOOLS }));
      case "tools/call": {
        const params = msg.params ?? {};
        const name = typeof params.name === "string" ? params.name : "";
        const args =
          typeof params.arguments === "object" && params.arguments !== null
            ? (params.arguments as Record<string, unknown>)
            : {};
        try {
          const result = await callTool(name, args);
          return reply.send(rpcResult(msg.id, result));
        } catch (err) {
          const code = (err as { code?: number }).code ?? -32603;
          return reply.send(rpcError(msg.id, code, (err as Error).message));
        }
      }
      default:
        return reply.send(rpcError(msg.id, -32601, `Method not found: ${msg.method}`));
    }
  });

  app.get("/mcp", async (_req, reply) =>
    reply.code(405).header("Allow", "POST, DELETE").send(),
  );

  app.delete("/mcp", async (req, reply) => {
    const sessionHeader = req.headers["mcp-session-id"];
    const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;
    if (sessionId && sessions.has(sessionId)) {
      sessions.delete(sessionId);
      return reply.code(204).send();
    }
    return reply.code(404).send();
  });
}
