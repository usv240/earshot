import { createHash, randomBytes } from "node:crypto";

/**
 * API keys, for anybody who wants their own space on this server.
 *
 * The public endpoint is open on purpose: a household names itself and
 * uses the server, which is what lets a judge try the whole thing from a
 * browser in a minute. The cost of open is that anybody who guesses a
 * household's name can read its history (see the note in store.ts).
 *
 * A key is the answer for anyone who minds. `POST /v1/keys` hands one out,
 * free, with no account, and a caller who sends it as a Bearer token gets
 * a space nobody without the key can reach. A caller who sends nothing
 * gets the open server, exactly as before, so nothing is gated.
 *
 * Nothing about the key is stored. The space is derived from the key's
 * own hash on every request, so there is no key table to leak, no
 * sign-up and no claim to race for. The cost is that a lost key cannot be
 * recovered or revoked, which for a demonstration server is the right
 * trade and is said in the response that issues it.
 */

export const KEY_PREFIX = "es_";
const KEY_SHAPE = /^es_[A-Za-z0-9_-]{32}$/;

export function issueKey(): string {
  return KEY_PREFIX + randomBytes(24).toString("base64url");
}

/** The space a key reaches: a prefix of its hash, never the key itself. */
export function spaceOf(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

export type Caller = { space: string | null } | { error: string };

/** Who is calling, from the Authorization header. No header is the open server. */
export function callerFrom(header: string | string[] | undefined): Caller {
  const value = Array.isArray(header) ? header[0] : header;
  if (value === undefined || value.trim() === "") return { space: null };
  const match = /^Bearer\s+(\S+)$/i.exec(value.trim());
  if (!match || !KEY_SHAPE.test(match[1]!)) {
    return { error: "Authorization must be 'Bearer es_...' with a key from POST /v1/keys" };
  }
  return { space: spaceOf(match[1]!) };
}

/**
 * Where a household's rows live. Open households are stored under their
 * own name; a keyed caller's are stored under its space. A colon is not
 * allowed in a household name, so no open name can ever spell a keyed one.
 */
export function storageName(household: string, space: string | null): string {
  return space ? `key:${space}:${household}` : household;
}

export function issuedKeyBody(key: string) {
  return {
    key,
    use: "Send it as 'Authorization: Bearer <key>' on every request to /mcp.",
    mcpClientConfig: {
      mcpServers: {
        earshot: { url: "<this server>/mcp", headers: { Authorization: `Bearer ${key}` } },
      },
    },
    yourSpace:
      "Households you name with this key are yours alone: the open server and every other key see none of them.",
    keepIt:
      "Nothing about this key is stored. It cannot be recovered if lost, and a new one is a new, empty space.",
  };
}
