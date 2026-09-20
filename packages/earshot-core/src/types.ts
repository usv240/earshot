/**
 * What a player can honestly observe about how somebody watches.
 *
 * There is a line running through this package that is worth stating
 * before any of the arithmetic. Nothing in here produces a number about
 * a person's hearing. It produces a number about their listening: how
 * far past this programme they set the volume, how often they went back
 * to hear a line again, whether the captions went on.
 *
 * That distinction is not lawyerly, it is the honest description of what
 * the evidence supports. Volume is an indicator. The published figure
 * for it is 81 percent sensitive and 52 percent specific, which is a
 * good reason to ask somebody a question and a terrible basis for
 * telling them anything. The measurement in this project is the test,
 * and the test lives in `digits-in-noise`. This package decides when it
 * is fair to offer it.
 *
 * So there is no field anywhere below that holds an estimate of hearing
 * loss, and a test enforces that there never is.
 */

/** What the pipeline measured about a programme's audio. */
export interface ProgrammeAudio {
  /** Stable identifier, so repeat viewings are recognisable. */
  id: string;
  /**
   * Loudness of the dialogue, in LUFS, measured over the regions where
   * somebody was speaking and nowhere else.
   *
   * Gating to speech is the whole reason this is worth having. Programme
   * loudness on its own is dominated by music and effects, so a quiet
   * drama and a loud action film can report the same figure while their
   * dialogue sits fifteen decibels apart. A viewer sets the volume for
   * the dialogue, because that is the part they are trying to follow.
   */
  dialogueLufs: number;
  /** Seconds of actual speech, so a music special can be excluded. */
  speechSeconds: number;
}

/** One sitting in front of the television. */
export interface Session {
  /** ISO date. Only the day is used; the hour is nobody's business. */
  startedAt: string;
  programme: ProgrammeAudio;
  /**
   * The app's own media volume, from 0 to 1.
   *
   * This is what the player can see. A household that turns up the
   * soundbar instead is invisible to it, which is a real limitation
   * rather than an edge case, and it is recorded as one.
   */
  volume: number;
  watchedSeconds: number;
  /** Captions were on for this sitting. */
  captionsOn: boolean;
  /**
   * Backward seeks that landed inside a line of dialogue.
   *
   * This is the "what did he say" rewind, and it is the most direct
   * behavioural signal available to a player: a person who understood
   * the line does not go back to it.
   */
  rehearSeeks: number;
}

/**
 * How a device's volume control maps to gain.
 *
 * Every platform does this differently, none of them document it
 * properly, and the curve is not linear in anything convenient. The
 * default here is the amplitude interpretation, where half volume is six
 * decibels down, which is close enough over the range people actually
 * use and is at least a curve that can be written down.
 *
 * It is an option rather than a constant because being wrong about it
 * shifts every level this package computes by the same amount, which is
 * harmless for drift within one household and not harmless for anything
 * compared across households.
 */
export interface VolumeCurve {
  label: string;
  /** Gain in dB for a setting from 0 to 1. Full volume is 0 dB. */
  gainDb(volume: number): number;
}

/** A single reason the package thinks a question is warranted. */
export interface Reason {
  kind: "drift" | "level" | "rehear" | "captions";
  /** One sentence, for a person, naming the number behind it. */
  sentence: string;
  /** The figure the sentence quotes, so a screen can show it. */
  value: number;
}
