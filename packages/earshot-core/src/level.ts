import type { Session, VolumeCurve } from "./types.js";

/**
 * How far past the programme this household is listening.
 *
 * The physics is simple and the unknown is stubborn. What reaches an ear
 * is roughly the programme's own loudness, plus whatever the volume
 * control is doing, plus a fixed amount contributed by the television,
 * the room and where the sofa is. That last term cannot be known without
 * a microphone, and this project does not have one and does not want
 * one.
 *
 * Which is fine, because it is constant. Subtract nothing, compare a
 * household against itself, and the unknown cancels. A number that drifts
 * upward over weeks means the same thing whatever the sofa is doing.
 *
 * That is why the signal this package leans on is drift rather than
 * absolute level, and why the absolute figure is reported with a warning
 * attached rather than used to decide anything on its own.
 */

/** Half volume is six decibels down. Full volume is the reference. */
export const AMPLITUDE_CURVE: VolumeCurve = {
  label: "Amplitude, 20 log10",
  gainDb(volume: number): number {
    if (!(volume > 0)) return -Infinity;
    return 20 * Math.log10(Math.min(volume, 1));
  },
};

/**
 * What the viewer chose to do to this programme's dialogue.
 *
 * Positive means they are listening above the point where the dialogue
 * would sit at full volume, which is not physically possible, so in
 * practice this is a negative number that gets less negative as somebody
 * turns the set up or the dialogue gets quieter.
 *
 * The programme's dialogue loudness is added rather than subtracted on
 * purpose. A viewer who turns up a quiet-dialogue film to compensate has
 * not changed how loud the dialogue is at their ear, and the figure
 * should say so by staying flat. Only a viewer reaching for more than
 * the material needs moves it.
 */
export function listeningLevelDb(
  session: Session,
  curve: VolumeCurve = AMPLITUDE_CURVE,
): number {
  return curve.gainDb(session.volume) + session.programme.dialogueLufs;
}

export interface LevelOptions {
  /** Sittings with less speech than this tell us nothing about dialogue. */
  minSpeechSeconds: number;
  /** A sitting shorter than this was somebody deciding what to watch. */
  minWatchedSeconds: number;
  /** How many early sittings establish what normal looks like here. */
  baselineSessions: number;
  /** How many recent sittings are compared against it. */
  recentSessions: number;
  curve: VolumeCurve;
}

export function defaultLevelOptions(): LevelOptions {
  return {
    minSpeechSeconds: 120,
    minWatchedSeconds: 300,
    baselineSessions: 8,
    recentSessions: 8,
    curve: AMPLITUDE_CURVE,
  };
}

/** Sittings with enough dialogue in them to mean anything. */
export function qualifying(sessions: Session[], options: LevelOptions): Session[] {
  return sessions
    .filter(
      (s) =>
        s.programme.speechSeconds >= options.minSpeechSeconds &&
        s.watchedSeconds >= options.minWatchedSeconds &&
        s.volume > 0 &&
        Number.isFinite(s.programme.dialogueLufs),
    )
    .slice()
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
}

/**
 * The middle value, not the mean.
 *
 * One action film with the volume up, one night with guests, one
 * afternoon with the grandchildren shouting. A mean carries all of them
 * into the answer. A median shrugs.
 */
export function median(values: number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export interface Drift {
  /** How much higher the recent sittings sit, in dB. */
  driftDb: number;
  baselineDb: number;
  recentDb: number;
  /** Sittings that counted toward each figure. */
  baselineCount: number;
  recentCount: number;
  /** Days between the earliest and latest sitting used. */
  spanDays: number;
}

/**
 * Change in listening level between the earliest sittings and the latest.
 *
 * Returns null rather than a number when there is not enough to compare,
 * which happens more often than it does not: a household that has used
 * the app twice has no baseline, and inventing one would mean the first
 * loud film anybody watches looks like deterioration.
 */
export function drift(
  sessions: Session[],
  options: LevelOptions = defaultLevelOptions(),
): Drift | null {
  const usable = qualifying(sessions, options);
  const needed = options.baselineSessions + options.recentSessions;
  if (usable.length < needed) return null;

  const levels = usable.map((s) => listeningLevelDb(s, options.curve));
  const baselineDb = median(levels.slice(0, options.baselineSessions));
  const recentDb = median(levels.slice(-options.recentSessions));

  const first = Date.parse(usable[0]!.startedAt);
  const last = Date.parse(usable[usable.length - 1]!.startedAt);

  return {
    driftDb: recentDb - baselineDb,
    baselineDb,
    recentDb,
    baselineCount: options.baselineSessions,
    recentCount: options.recentSessions,
    spanDays: Math.round((last - first) / 86_400_000),
  };
}

/**
 * Backward seeks into dialogue, per hour of speech.
 *
 * Per hour of speech rather than per hour of programme, because a
 * three-hour film with twenty minutes of talking gives somebody far
 * fewer chances to miss a line than a dialogue-heavy hour does.
 */
export function rehearRatePerHour(
  sessions: Session[],
  options: LevelOptions = defaultLevelOptions(),
): number | null {
  const usable = qualifying(sessions, options);
  if (usable.length === 0) return null;
  const seeks = usable.reduce((n, s) => n + s.rehearSeeks, 0);
  const speechHours = usable.reduce((h, s) => h + s.programme.speechSeconds, 0) / 3600;
  if (speechHours <= 0) return null;
  return seeks / speechHours;
}

/** Share of recent sittings watched with the captions on. */
export function captionShare(
  sessions: Session[],
  options: LevelOptions = defaultLevelOptions(),
): number | null {
  const usable = qualifying(sessions, options);
  if (usable.length === 0) return null;
  const recent = usable.slice(-options.recentSessions);
  return recent.filter((s) => s.captionsOn).length / recent.length;
}
