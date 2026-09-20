/**
 * The digits-in-noise hearing screen, as a set of plain values.
 *
 * Nothing here knows about audio, the DOM, a television or a network.
 * The procedure is arithmetic over a sequence of correct/incorrect
 * answers, and keeping it that way is what lets the same engine run in a
 * browser, in a React Native app on a Fire TV, and in a validation
 * harness that answers the trials from a simulated ear.
 */

/** A single digit in a triplet. */
export type Digit = number;

/**
 * One presentation: three digits, at one signal-to-noise ratio.
 *
 * `snrDb` is the level of the digits relative to the noise. Negative is
 * harder. It is a ratio rather than an absolute level, which is the
 * whole reason this test can run on a television nobody calibrated: the
 * answer does not depend on how loud the set is, as long as it is
 * audible and not painful.
 */
export interface Trial {
  /** 0-based index of the presentation. */
  index: number;
  /** The digits the listener was asked to repeat back. */
  digits: Digit[];
  /** Level of the digits relative to the noise, in dB. */
  snrDb: number;
}

/** What the listener typed back, and whether it counted. */
export interface Answer {
  trial: Trial;
  /** What the listener entered. Wrong length counts as incorrect. */
  entered: Digit[];
  /**
   * All three digits right.
   *
   * Partial credit is deliberately not given. The published procedure
   * scores the triplet, not the digit, and the normative thresholds it
   * produces are only comparable if the scoring matches.
   */
  correct: boolean;
}

export interface ProcedureOptions {
  /**
   * Digits the triplets are drawn from.
   *
   * Defaults to 1 through 9. Zero and seven are left out because both
   * are two syllables in English while the rest are one, and a listener
   * who catches a second syllable has information the other digits do
   * not give them. Language versions of this test differ here, so it is
   * an option rather than a constant.
   */
  digitSet: Digit[];
  /** Digits per presentation. Three, in every published version. */
  tripletSize: number;
  /** Where the track starts, in dB SNR. Comfortably above threshold. */
  startSnrDb: number;
  /** How far the track moves after each answer, in dB. */
  stepDb: number;
  /**
   * A larger step for the first few trials, to reach the region of
   * interest quickly rather than spending the listener's patience
   * walking there two decibels at a time.
   */
  coarseStepDb: number;
  /** How many trials use the coarse step. */
  coarseTrials: number;
  /** Total presentations. */
  trials: number;
  /**
   * Trials before the run is considered settled. Everything from here
   * on feeds the threshold estimate; everything before it is the track
   * finding its way down and would drag the mean upward.
   */
  settleAfter: number;
  /** The track is clamped to this range, so a run cannot wander off. */
  minSnrDb: number;
  maxSnrDb: number;
}

/** The outcome of a completed run. */
export interface ScreenResult {
  /**
   * Speech reception threshold: the signal-to-noise ratio at which this
   * listener gets half the triplets right. Lower is better hearing.
   */
  srtDb: number;
  /** Every answer, in order, so a result can be audited or replotted. */
  answers: Answer[];
  /** How many times the track changed direction after settling. */
  reversals: number;
  /**
   * Whether the run looks like someone actually took the test.
   *
   * A result is only worth reporting if the track settled. See
   * `assessValidity` for what is checked and why each check is there.
   */
  valid: boolean;
  /** Plain-language reasons the run was rejected. Empty when valid. */
  problems: string[];
}
