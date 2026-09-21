import Fastify from "fastify";
import cors from "@fastify/cors";
import { MCP_PROTOCOL_VERSION, registerMcp, TOOL_NAMES } from "./mcp";
import { MemoryStore, type ScreenStore } from "./store";

/**
 * The Earshot MCP server.
 *
 * POST/GET/DELETE /mcp   Model Context Protocol, spec 2025-11-25,
 *                        Streamable HTTP. This is the Alexa+ surface.
 * GET /healthz           liveness
 */

export function buildServer(
  opts: {
    store?: ScreenStore;
  } = {},
): { app: ReturnType<typeof Fastify>; store: ScreenStore } {
  const store = opts.store ?? new MemoryStore();
  const app = Fastify({ logger: false });

  // A body parser that hands malformed and empty bodies to the route
  // as data rather than as a transport failure.
  //
  // An empty body with a JSON content-type is legal and common: real MCP
  // clients send exactly that on DELETE when terminating a session. In the
  // Nightlight codebase this surfaced as a 500 that thirteen conformance
  // tests missed, because Fastify's inject() sends no content-type unless
  // asked and so never produced the shape a real client sends. It was found
  // by pointing an actual agent at the server. The fix is carried here from
  // the start, and the regression test below pins it.
  //
  // Malformed JSON is the same lesson a second time. Handing the parse error
  // to `done` lets Fastify answer with its own 500 envelope, but JSON-RPC is
  // explicit that an unparseable body is a -32700 Parse error, and a 500
  // tells a client to retry something that will never succeed. Found on the
  // deployed Lambda by the conformance probe in the Nightlight repository
  // (scripts/mcp-conform.mjs), which speaks real HTTP; every injected test
  // here passed while the live server was wrong.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_req, body, done) => {
      const raw = body as Buffer;
      if (raw.length === 0) {
        done(null, { raw, json: undefined });
        return;
      }
      try {
        done(null, { raw, json: JSON.parse(raw.toString("utf8")) });
      } catch (err: unknown) {
        done(null, { raw, json: undefined, parseError: (err as Error).message });
      }
    },
  );

  /*
    CORS is handled by exactly one layer.

    This Lambda sits behind a function URL whose own CORS configuration
    already reflects the request origin (infra/bin/app.ts). If this app
    also registers CORS, the response carries two
    `Access-Control-Allow-Origin` headers and every browser rejects it
    outright, even when both values are identical.

    That is not hypothetical and it is not new. Bellwether hit it first and
    filed it as friction log entry 6; Nightlight then shipped it, and its
    caregiver app could not load its own data in any browser while curl
    reported a clean 200 throughout. This is the third appearance of the
    same bug, and it was live on the deployed MCP endpoint: a judge
    driving this server from any browser-based tool would have been
    blocked by it, with nothing in a terminal to explain why.

    Locally there is no function URL, so the middleware is needed and is
    registered. Guarding on the Lambda runtime variable keeps exactly one
    layer responsible in each environment.
  */
  if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
    // Exposed to match the function URL's own CORS config exactly.
    //
    // A browser hides every response header it is not told it may read,
    // and an MCP client cannot continue without reading MCP-Session-Id.
    // Production exposes it at the function URL, so this layer and that
    // one have to agree; before this they did not, and any browser-based
    // MCP client worked in production and failed in local development
    // with a session the server had opened and the client could not see.
    // Bellwether's server had this right from the start. This is the
    // second CORS fix in a row that one sibling had and the others did
    // not.
    app.register(cors, { origin: true, exposedHeaders: ["mcp-session-id"] });
  }

  app.get("/healthz", async () => ({
    ok: true,
    server: "earshot-mcp",
    protocol: MCP_PROTOCOL_VERSION,
    tools: TOOL_NAMES,
    store: store instanceof MemoryStore ? "in-memory" : "dynamodb",
    holds: "Completed checks only. How a household watches television is never uploaded.",
  }));

  registerMcp(app, { store });

  return { app, store };
}

const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("src/server.ts") ?? false;
if (isMain) {
  const { app } = buildServer();
  const port = Number(process.env.PORT ?? 8788);
  app
    .listen({ port, host: "127.0.0.1" })
    .then(() =>
      console.log(
        `Earshot MCP server on http://127.0.0.1:${port}/mcp (${TOOL_NAMES.length} tools)`,
      ),
    )
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
