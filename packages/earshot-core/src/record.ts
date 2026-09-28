import type { ProgrammeAudio, Session } from "./types.js";

/**
 * Turning a sitting in front of a player into a row the model can use.
 *
 * This is the half of the product that a third-party app cannot do for
 * *other* applications on Fire TV, because reading what another app is
 * playing needs a permission Amazon does not grant. It can be done for
 * playback the app owns, and that is what this is: the complete
 * mechanism, running for real, on content whose dialogue loudness was
 * measured by the pipeline rather than guessed.
 *
 * Three decisions in here are the whole design.
 *
 * **The volume for a sitting is the one they settled on**, not the mean
 * and not the last. Somebody nudges the volume twice in the first
 * minute and then leaves it alone for an hour; a mean would let those
 * two nudges argue with the hour, and the last value would be whatever
 * happened to be set when they switched off. So time is accumulated per
 * level and the level with the most time wins.
 *
 * **A rewind is only a rewind if it is short.** Going back eight
 * seconds is somebody who missed a line. Going back four minutes is
 * somebody who went to make tea. Counting both would turn ordinary
 * navigation into evidence about hearing, and the people most likely to
 * scrub around a programme are not the people this is looking for.
 *
 * **A sitting that was too short does not become a row at all.** The
 * model already filters these, but producing them is how a database
 * fills with noise that every later query has to remember to exclude.
 */

export interface RecorderOptions {
  /**
   * A backward jump of at least this many seconds counts as deliberate
   * rather than a scrub artefact.
   */
  minRehearSec: number;
  /** A backward jump longer than this is navigation, not a rewind. */
  maxRehearSec: number;
  /** Below this, the sitting is not recorded at all. */
  minWatchedSec: number;
}

export function defaultRecorderOptions(): RecorderOptions {
  return { minRehearSec: 2, maxRehearSec: 30, minWatchedSec: 300 };
}

/**
 * Accumulates one sitting.
 *
 * Deliberately told about time rather than reading a clock, so a test
 * can play an hour in a millisecond and so the same code runs against a
 * real player and a simulated one.
 */
export class SessionRecorder {
  private readonly options: RecorderOptions;
  /** Seconds spent at each volume setting. */
  private readonly timeAtVolume = new Map<number, number>();
  private volume: number;
  private captionsOn: boolean;
  private captionsEverOn: boolean;
  private watchedSeconds = 0;
  private rehearSeeks = 0;
  private lastTick: number | null = null;

  constructor(
    readonly programme: ProgrammeAudio,
    readonly startedAt: string,
    initialVolume: number,
    initialCaptions = false,
    options: Partial<RecorderOptions> = {},
  ) {
    this.options = { ...defaultRecorderOptions(), ...options };
    this.volume = initialVolume;
    this.captionsOn = initialCaptions;
    this.captionsEverOn = initialCaptions;
  }

  /**
   * Playback reached this position. Called on the player's own timer.
   *
   * Elapsed time is taken from the difference between positions rather
   * than from wall-clock, so a paused player contributes nothing and a
   * seek does not invent time that nobody watched.
   */
  tick(positionSec: number): void {
    if (this.lastTick !== null) {
      const elapsed = positionSec - this.lastTick;
      // Forward, and small enough to be playback rather than a jump.
      if (elapsed > 0 && elapsed < 5) {
        this.watchedSeconds += elapsed;
        this.timeAtVolume.set(
          this.volume,
          (this.timeAtVolume.get(this.volume) ?? 0) + elapsed,
        );
      }
    }
    this.lastTick = positionSec;
  }

  volumeChanged(volume: number): void {
    this.volume = volume;
  }

  captionsChanged(on: boolean): void {
    this.captionsOn = on;
    if (on) this.captionsEverOn = true;
  }

  /** The player jumped. Only short backward jumps are rewinds. */
  seeked(fromSec: number, toSec: number): void {
    const back = fromSec - toSec;
    if (back >= this.options.minRehearSec && back <= this.options.maxRehearSec) {
      this.rehearSeeks++;
    }
    this.lastTick = toSec;
  }

  /** What was watched so far, for a progress display. */
  get seconds(): number {
    return this.watchedSeconds;
  }

  /**
   * The row, or nothing.
   *
   * Returns null for a sitting too short to mean anything, so the caller
   * cannot accidentally store one. The alternative is a store full of
   * ninety-second rows that every later query has to remember to skip.
   */
  finish(): Session | null {
    if (this.watchedSeconds < this.options.minWatchedSec) return null;
    return {
      startedAt: this.startedAt,
      programme: this.programme,
      volume: this.settledVolume(),
      watchedSeconds: Math.round(this.watchedSeconds),
      captionsOn: this.captionsEverOn,
      rehearSeeks: this.rehearSeeks,
    };
  }

  /** The level they spent the most time at. */
  private settledVolume(): number {
    let best = this.volume;
    let bestTime = -1;
    for (const [volume, seconds] of this.timeAtVolume) {
      if (seconds > bestTime) {
        best = volume;
        bestTime = seconds;
      }
    }
    return best;
  }
}

/**
 * Where a household's sittings live.
 *
 * An interface rather than an implementation because the television
 * stores them on the device and nothing else ever sees them, which is
 * the promise the product makes on its own front page. A server-backed
 * implementation of this would quietly make that promise false, so
 * there is not one.
 */
export interface SessionStore {
  append(session: Session): Promise<void>;
  all(): Promise<Session[]>;
}

/** For tests, and for a first run before anything has been written. */
export class MemorySessionStore implements SessionStore {
  private readonly rows: Session[] = [];
  async append(session: Session): Promise<void> {
    this.rows.push(session);
  }
  async all(): Promise<Session[]> {
    return [...this.rows];
  }
}
