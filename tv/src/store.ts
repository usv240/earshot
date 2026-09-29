import type {Session, SessionStore} from '@earshot/core';

/**
 * Sittings, kept on the television and nowhere else.
 *
 * The product's front page says that how a household watches never
 * leaves the device it was watched on. There is deliberately no
 * server-backed implementation of `SessionStore` anywhere in this
 * project, because adding one would quietly make that false.
 *
 * It matters more than persistence usually does. The model needs months
 * before it has anything to say, so a history that forgets on restart is
 * not an inconvenience, it is a product that can never reach its own
 * threshold for speaking.
 *
 * Storage is `react-native-mmkv`, chosen after the standard AsyncStorage
 * module failed to build against react-native-tvos 0.83 (friction log
 * entry 13). mmkv is synchronous and lives in native code, which is why
 * the seam below exists: the adapter at the bottom is the only line that
 * touches the module, so under Jest, or on any build where the native
 * side is missing, the store degrades to memory and says so through
 * `PERSISTENCE_AVAILABLE` rather than throwing on first use.
 *
 * Append only, and capped. A household watching every evening for five
 * years would otherwise accumulate rows nothing ever reads: the drift
 * calculation uses the earliest and latest handful, and everything in
 * between only has to establish that the span is real.
 */

const KEY = 'earshot.sessions.v1';
const KEEP = 400;

/** The one thing a backing store has to do: hold a string by key. */
interface KeyValue {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** In memory. What runs under Jest, and the fallback if native is absent. */
class MemoryKeyValue implements KeyValue {
  private readonly map = new Map<string, string>();
  get(key: string) {
    return this.map.get(key) ?? null;
  }
  set(key: string, value: string) {
    this.map.set(key, value);
  }
  remove(key: string) {
    this.map.delete(key);
  }
}

function openNative(): KeyValue | null {
  try {
    // Required lazily so a missing native module fails here, once, in a
    // place that catches it, instead of at import time for the whole app.
    const {createMMKV} = require('react-native-mmkv') as typeof import('react-native-mmkv');
    const mmkv = createMMKV({id: 'earshot'});
    return {
      get: key => mmkv.getString(key) ?? null,
      set: (key, value) => mmkv.set(key, value),
      remove: key => {
        mmkv.remove(key);
      },
    };
  } catch {
    return null;
  }
}

const native = openNative();

/** True when sittings survive the app closing. */
export const PERSISTENCE_AVAILABLE = native !== null;

export class DeviceSessionStore implements SessionStore {
  private readonly kv: KeyValue;

  constructor(kv: KeyValue = native ?? new MemoryKeyValue()) {
    this.kv = kv;
  }

  async append(session: Session): Promise<void> {
    const rows = await this.all();
    rows.push(session);
    // Oldest first, so the baseline survives and the middle is what
    // gets dropped when the cap bites.
    const kept = rows.length > KEEP ? rows.slice(rows.length - KEEP) : rows;
    this.kv.set(KEY, JSON.stringify(kept));
  }

  async all(): Promise<Session[]> {
    try {
      const raw = this.kv.get(KEY);
      if (!raw) {
        return [];
      }
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      // A row written by an older version, or a half-finished write, is
      // dropped rather than fed to the model. A malformed sitting would
      // otherwise become a drift figure nobody can account for.
      return parsed.filter(isSession);
    } catch {
      // Storage unavailable or corrupt. An empty history is the honest
      // answer and means the app says it has nothing to report, which
      // is exactly what it should say when it knows nothing.
      return [];
    }
  }

  /** For somebody who wants the television to forget. */
  async clear(): Promise<void> {
    this.kv.remove(KEY);
  }

  /** Test seam, standing in for a corrupt or half-written row. */
  async writeRawForTest(raw: string): Promise<void> {
    this.kv.set(KEY, raw);
  }
}

function isSession(row: unknown): row is Session {
  if (typeof row !== 'object' || row === null) {
    return false;
  }
  const s = row as Partial<Session>;
  return (
    typeof s.startedAt === 'string' &&
    typeof s.volume === 'number' &&
    typeof s.watchedSeconds === 'number' &&
    typeof s.captionsOn === 'boolean' &&
    typeof s.rehearSeeks === 'number' &&
    typeof s.programme === 'object' &&
    s.programme !== null &&
    typeof s.programme.dialogueLufs === 'number' &&
    typeof s.programme.speechSeconds === 'number'
  );
}
