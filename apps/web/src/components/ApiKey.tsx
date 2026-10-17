"use client";

import { useState } from "react";

/**
 * Your own key, and the proof that it is yours.
 *
 * The server is open: anybody names a household and uses it, which is
 * what lets a judge try everything from this page. A key is for anybody
 * who wants their own space. One press issues one, free and with no
 * account, and shows the line to paste into an MCP client.
 *
 * The second press is the proof, against the deployed server: record a
 * check for "judges" with the key, read it back with the key, then ask
 * for the same household with no key. The open server sees none of it.
 * The check is recorded as placeholder audio, so it can never be read
 * as anybody's hearing.
 */

const BASE = "https://inwrmblw32v4iyzsxkr5bfpidu0izuah.lambda-url.us-east-1.on.aws";
const PROTOCOL = "2025-11-25";

async function call(key: string | null, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const auth: Record<string, string> = key ? { authorization: `Bearer ${key}` } : {};
  const init = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", ...auth },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: "earshot-site-key", version: "1" } } }),
  });
  const session = init.headers.get("mcp-session-id");
  if (!session) throw new Error(`no session (status ${init.status})`);
  const headers = { "content-type": "application/json", "mcp-session-id": session, "mcp-protocol-version": PROTOCOL, ...auth };
  const res = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } }),
  });
  const body = (await res.json()) as { result?: { content?: { text: string }[] }; error?: { message: string } };
  await fetch(`${BASE}/mcp`, { method: "DELETE", headers: { "mcp-session-id": session } });
  if (body.error) throw new Error(body.error.message);
  return JSON.parse(body.result?.content?.[0]?.text ?? "{}") as Record<string, unknown>;
}

export function ApiKey() {
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [proof, setProof] = useState<{ withKey: number; withoutKey: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const issue = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/v1/keys`, { method: "POST" });
      const body = (await res.json()) as { key: string };
      setKey(body.key);
      setProof(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const prove = async () => {
    if (!key) return;
    setBusy(true);
    setError(null);
    try {
      await call(key, "record_screen_result", { household: "judges", valid: true, srt_db: -9.5, surface: "web", placeholder_audio: true });
      const mine = await call(key, "get_screen_history", { household: "judges" });
      const open = await call(null, "get_screen_history", { household: "judges" });
      const count = (r: Record<string, unknown>) => ((r.screens as unknown[]) ?? []).filter((s) => (s as { placeholderAudio?: boolean }).placeholderAudio && (s as { srtDb?: number }).srtDb === -9.5).length;
      setProof({ withKey: count(mine), withoutKey: count(open) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const config = key
    ? JSON.stringify({ mcpServers: { earshot: { url: `${BASE}/mcp`, headers: { Authorization: `Bearer ${key}` } } } }, null, 2)
    : "";

  return (
    <div className="card p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-[60ch]">
          <p className="eyebrow">Your own key</p>
          <p className="mt-2 leading-relaxed text-muted">
            The server is open, so you can try everything above with no key. If you want a
            space of your own, take a key: free, no account, and households you name with it
            are yours alone. Nothing about the key is stored, so keep it.
          </p>
        </div>
        <button type="button" onClick={() => void issue()} disabled={busy} className="primary">
          {busy && !key ? "Issuing…" : key ? "Another key" : "Get an API key"}
        </button>
      </div>

      {key && (
        <>
          <pre className="mt-6 overflow-x-auto rounded-lg border border-line bg-[var(--raised)] p-3 font-mono text-[12px] leading-relaxed text-ink">{key}</pre>
          <p className="mt-4 text-sm text-muted">Paste into any MCP client, Claude Desktop or an Alexa+ integration:</p>
          <pre className="mt-2 overflow-x-auto rounded-lg border border-line bg-[var(--raised)] p-3 font-mono text-[12px] leading-relaxed text-ink">{config}</pre>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <button type="button" onClick={() => void prove()} disabled={busy} className="primary">
              {busy ? "Checking…" : "Prove it is yours"}
            </button>
            <p className="text-sm text-muted">Records a placeholder check for &ldquo;judges&rdquo; with your key, then asks for the same household with none.</p>
          </div>
          {proof && (
            <table className="mt-6 w-full text-sm">
              <tbody>
                <tr className="border-t border-line">
                  <td className="py-2 text-ink">&ldquo;judges&rdquo;, asked with your key</td>
                  <td className="py-2 font-mono text-[12px] text-ink">{proof.withKey} check{proof.withKey === 1 ? "" : "s"}</td>
                </tr>
                <tr className="border-t border-line">
                  <td className="py-2 text-ink">&ldquo;judges&rdquo;, asked with no key</td>
                  <td className="py-2 font-mono text-[12px] text-ink">{proof.withoutKey} of yours</td>
                </tr>
              </tbody>
            </table>
          )}
        </>
      )}

      {error && <p className="mt-4 text-sm text-[var(--warn)]">{error}</p>}
    </div>
  );
}
