"use client";

import { useState } from "react";

/**
 * The agent, held to a real session from the visitor's own browser.
 *
 * The rules ask for the MCP server to be shown in action, and a
 * paragraph saying it works is not that. This opens a session against
 * the deployed endpoint, lists the tools, calls the one tool that
 * returns no data at all, and prints every request with its status and
 * the time it took. Nothing is recorded or mocked; the endpoint is the
 * one Alexa+ would use.
 *
 * The tool it calls is deliberate. `what_the_television_watches`
 * describes the mechanism and returns none of the numbers, which is the
 * honest answer to "why did my television ask me that", and it proves
 * the point on the privacy section: the server can explain the
 * television and cannot report on it.
 *
 * Origin is the interesting part of this. The server validates it, the
 * site's own origin is handed to the server by the stack that knows it,
 * and a hostile origin gets 403. So this panel working from this page
 * is also the proof that the allowlist is wired rather than intended.
 */

const MCP_URL = "https://inwrmblw32v4iyzsxkr5bfpidu0izuah.lambda-url.us-east-1.on.aws/mcp";
const PROTOCOL = "2025-11-25";

interface Line {
  request: string;
  status: number;
  ok: boolean;
  ms: number;
  note?: string;
}

async function rpc(body: unknown, session?: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "mcp-protocol-version": PROTOCOL,
  };
  if (session) headers["mcp-session-id"] = session;
  const t0 = performance.now();
  const res = await fetch(MCP_URL, { method: "POST", headers, body: JSON.stringify(body) });
  const ms = Math.round(performance.now() - t0);
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* 202 and 204 carry no body */
  }
  return { status: res.status, ms, session: res.headers.get("mcp-session-id"), json };
}

export function McpProof() {
  const [lines, setLines] = useState<Line[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    setAnswer(null);
    const out: Line[] = [];
    const push = (l: Line) => {
      out.push(l);
      setLines([...out]);
    };
    try {
      const init = await rpc({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: PROTOCOL,
          capabilities: {},
          clientInfo: { name: "earshot-site", version: "1" },
        },
      });
      const session = init.session;
      if (!session || init.status !== 200) {
        throw new Error(`the server did not open a ${PROTOCOL} session (status ${init.status})`);
      }
      push({ request: "initialize", status: init.status, ok: true, ms: init.ms, note: `session ${session.slice(0, 8)}…` });

      const ready = await rpc({ jsonrpc: "2.0", method: "notifications/initialized" }, session);
      push({ request: "notifications/initialized", status: ready.status, ok: ready.status === 202, ms: ready.ms });

      const list = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, session);
      const tools =
        (list.json as { result?: { tools?: { name: string }[] } })?.result?.tools?.map((t) => t.name) ?? [];
      push({ request: "tools/list", status: list.status, ok: tools.length === 5, ms: list.ms, note: `${tools.length} tools` });

      const call = await rpc(
        { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "what_the_television_watches", arguments: {} } },
        session,
      );
      const text = (call.json as { result?: { content?: { text: string }[] } })?.result?.content?.[0]?.text;
      const parsed = text ? (JSON.parse(text) as { whyItIsNotAJudgement?: string }) : null;
      push({ request: "tools/call what_the_television_watches", status: call.status, ok: !!parsed, ms: call.ms });
      setAnswer(parsed?.whyItIsNotAJudgement ?? text ?? null);

      const bye = await fetch(MCP_URL, { method: "DELETE", headers: { "mcp-session-id": session } });
      push({ request: "DELETE session", status: bye.status, ok: bye.status === 204, ms: 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="card p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-[60ch]">
          <p className="eyebrow">Live, from this page</p>
          <p className="mt-2 leading-relaxed text-muted">
            Open a session against the deployed server, list its tools, and ask it what the
            television watches. Every request below is real and timed. The tool chosen is
            the one that returns no data, because that is the point.
          </p>
        </div>
        <button type="button" onClick={() => void run()} disabled={running} className="primary">
          {running ? "Running…" : "Hold a session"}
        </button>
      </div>

      {lines.length > 0 && (
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="pb-2 font-medium">Request</th>
              <th className="pb-2 font-medium">Status</th>
              <th className="pb-2 font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.request} className="border-t border-line">
                <td className="py-2 font-mono text-[12px] text-ink">
                  {l.request}
                  {l.note && <span className="ml-2 text-faint">{l.note}</span>}
                </td>
                <td className={`py-2 font-mono text-[12px] ${l.ok ? "text-ink" : "text-[var(--warn)]"}`}>
                  {l.status}
                </td>
                <td className="py-2 font-mono text-[12px] text-muted">{l.ms ? `${l.ms} ms` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {answer && (
        <blockquote className="mt-6 border-l-2 border-[var(--accent)] pl-4">
          <p className="text-sm leading-relaxed text-ink">{answer}</p>
          <footer className="mt-2 text-xs text-faint">the server, just now</footer>
        </blockquote>
      )}

      {error && <p className="mt-4 text-sm text-[var(--warn)]">{error}</p>}
    </div>
  );
}
