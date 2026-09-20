import { createRng, Screen } from "./procedure.js";
import type {
  Digit,
  ProcedureOptions,
  ScreenResult,
  Trial,
} from "./types.js";

/**
 * An ear with a known answer.
 *
 * This is the instrument that measures the instrument. A screening test
 * that has never been run against a listener whose threshold is known in
 * advance is a test whose output nobody can check: every real person
 * gives one number, once, and there is nothing to compare it to.
 *
 * A simulated listener has a threshold we chose. Run the procedure
 * against a few thousand of them and the questions that actually matter
 * become answerable. Does the estimate land on the truth, or a decibel
 * above it? How much does the same ear vary between runs? Does the
 * answer drift if the listener is tired and fumbles one in fifty?
 *
 * Those three numbers are the ones the validation literature reports for
 * this test, which means ours can be compared against theirs instead of
 * being asserted.
 *
 * The model is the standard one: the chance of getting a triplet right
 * rises smoothly with the signal-to-noise ratio, passing through one
 * half at the listener's threshold.
 */

export interface ListenerOptions {
  /** The ratio at which this ear gets half the triplets right, in dB. */
  trueSrtDb: number;
  /**
   * How sharply performance improves with a better ratio, as a
   * proportion per dB at the midpoint. Published triplet slopes sit
   * around 0.15 to 0.20; below about 0.10 the curve is so shallow that
   * no adaptive procedure can pin it down, which is itself worth being
   * able to simulate.
   */
  slopePerDb: number;
  /**
   * How often the listener gets it wrong for reasons that have nothing
   * to do with hearing: looked away, hit the wrong button, sneezed.
   * Real runs contain these and an estimator that cannot survive them
   * is not ready for a living room.
   */
  lapseRate: number;
}

export function defaultListener(): ListenerOptions {
  return { trueSrtDb: -9, slopePerDb: 0.18, lapseRate: 0.02 };
}

/**
 * Probability this ear repeats a triplet correctly at a given ratio.
 *
 * The midpoint of the curve is shifted so that `trueSrtDb` really is the
 * half-right point even when lapses cap the curve below one. Without
 * that correction a listener defined with a 2% lapse rate has a true
 * threshold a fraction of a decibel away from the number we set, and
 * every bias measurement inherits the error we introduced ourselves.
 */
export function probabilityCorrect(snrDb: number, listener: ListenerOptions): number {
  const { trueSrtDb, slopePerDb, lapseRate } = listener;
  const ceiling = 1 - lapseRate;
  if (ceiling <= 0.5) return ceiling;
  const k = 4 * slopePerDb;
  const midpoint = trueSrtDb + Math.log(1 - 2 * lapseRate) / k;
  return ceiling / (1 + Math.exp(-k * (snrDb - midpoint)));
}

/** What this ear types back for one presentation. */
export function respond(
  trial: Trial,
  listener: ListenerOptions,
  rng: () => number,
): Digit[] {
  if (rng() < probabilityCorrect(trial.snrDb, listener)) return [...trial.digits];
  // Any wrong answer scores the same, so one mangled digit is enough,
  // and it is what a real mishearing usually looks like.
  const wrong = [...trial.digits];
  const at = Math.floor(rng() * wrong.length);
  wrong[at] = ((wrong[at]! % 9) + 1) as Digit;
  if (wrong[at] === trial.digits[at]) wrong[at] = ((wrong[at]! % 9) + 1) as Digit;
  return wrong;
}

/** Drive a whole run against a simulated ear. */
export function runScreen(
  listener: ListenerOptions,
  seed: number,
  options: Partial<ProcedureOptions> = {},
): ScreenResult {
  const screen = new Screen(options, seed);
  const rng = createRng(seed ^ 0x9e3779b9);
  while (!screen.finished) {
    screen.submit(respond(screen.current(), listener, rng));
  }
  return screen.result();
}

export interface SweepSummary {
  runs: number;
  /** Mean estimate minus the truth. Positive means we read too high. */
  biasDb: number;
  /** Spread of the estimate for one unchanging ear: test-retest. */
  sdDb: number;
  /** Largest single miss, in dB. */
  worstDb: number;
  /** Runs the procedure itself declined to report. */
  rejected: number;
}

/** Run the same ear many times and summarise how well we measured it. */
export function sweep(
  listener: ListenerOptions,
  runs: number,
  options: Partial<ProcedureOptions> = {},
  firstSeed = 1,
): SweepSummary {
  const errors: number[] = [];
  let rejected = 0;
  for (let i = 0; i < runs; i++) {
    const result = runScreen(listener, firstSeed + i, options);
    if (!result.valid) {
      rejected++;
      continue;
    }
    errors.push(result.srtDb - listener.trueSrtDb);
  }
  const n = errors.length;
  const bias = n ? errors.reduce((a, b) => a + b, 0) / n : Number.NaN;
  const variance = n > 1
    ? errors.reduce((a, e) => a + (e - bias) ** 2, 0) / (n - 1)
    : Number.NaN;
  return {
    runs: n,
    biasDb: bias,
    sdDb: Math.sqrt(variance),
    worstDb: n ? Math.max(...errors.map(Math.abs)) : Number.NaN,
    rejected,
  };
}
