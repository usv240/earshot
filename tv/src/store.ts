import type {Session, SessionStore} from '@earshot/core';

/**
 * Sittings, kept on the television and nowhere else.
 *
 * The product's front page says that how a household watches never
 * leaves the device it was watched on. There is deliberately no
 * server-backed implementation of `SessionStore` anywhere in this
 * project, because adding one would quietly make that false.
 *
 * **This one does not survive the app closing, and that is a defect
 * rather than a decision.** React Native ships no storage of its own,
 * and the standard module for it does not build against
 * react-native-tvos 0.83 on this toolchain: its KSP step fails with
 * "Wrong plugin option format: null", which is an incompatibility in
 * that package's build rather than anything configurable here. Friction
 * log entry 13.
 *
 * It matters more than persistence usually does. The model needs months
 * before it has anything to say, so a history that forgets on restart
 * is not an inconvenience, it is a product that can never reach its own
 * threshold for speaking. The app says so on its home screen rather
 * than appearing to work.
 *
 * The rest of this file is the part that will still be right when a
 * storage module is available: appending, capping, and refusing to hand
 * a malformed row to the model. Swapping the two methods below for real
 * reads and writes is the whole change.
 */

const KEEP = 400;

/** True while sittings do not survive the app closing. */
export const PERSISTENCE_AVAILABLE = false;

export class DeviceSessionStore implements SessionStore {
  /** Stands in for the device. Replaced when a storage module builds. */
  private raw: string | null = null;

  async append(session: Session): Promise<void> {
    const rows = await this.all();
    rows.push(session);
    // Oldest first, so the baseline survives and the middle is what
    // gets dropped when the cap bites.
    const kept = rows.length > KEEP ? rows.slice(rows.length - KEEP) : rows;
    this.raw = JSON.stringify(kept);
  }

  async all(): Promise<Session[]> {
    try {
      if (!this.raw) {
        return [];
      }
      const parsed: unknown = JSON.parse(this.raw);
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
    this.raw = null;
  }

  /** Test seam, standing in for a corrupt or half-written row. */
  async writeRawForTest(raw: string): Promise<void> {
    this.raw = raw;
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
