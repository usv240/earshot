import type {
  Answer,
  Digit,
  ProcedureOptions,
  ScreenResult,
  Trial,
} from "./types.js";

/**
 * The adaptive procedure.
 *
 * A listener hears three digits buried in noise and types back what they
 * heard. Get all three right and the next triplet is quieter relative to
 * the noise; get one wrong and it is louder. The track converges on the
 * ratio at which this person gets half of them right, and that ratio is
 * the result. It is called the speech reception threshold, and for this
 * test it is a number of decibels, usually negative, where lower is
 * better hearing.
 *
 * Two properties make it the right instrument for a television.
 *
 * It measures a ratio, not a level. The answer does not depend on how
 * loud the set is, which matters because nobody calibrates a living
 * room. That is the same reason the World Health Organization put this
 * test, rather than pure-tone audiometry, into a phone app.
 *
 * And the response is three digits. No words to read, no scale to
 * interpret, no touchscreen. A remote control has everything it needs.
 *
 * The defaults follow the published procedure: a one-up one-down track
 * with a 2 dB step, scored on the whole triplet, with the threshold
 * taken as the mean of the presented ratios once the track has settled
 * plus the one that would have come next. Changing any of them changes
 * what the number means, which is why they are named and documented
 * rather than sprinkled through the code.
 */

export function defaultOptions(): ProcedureOptions {
  return {
    // One syllable each. Zero and seven are two, in English.
    digitSet: [1, 2, 3, 4, 5, 6, 8, 9],
    tripletSize: 3,
    // Well above any plausible threshold, so the first trial is a gift
    // and the listener learns the task before it starts to matter.
    startSnrDb: 0,
    stepDb: 2,
    coarseStepDb: 4,
    coarseTrials: 4,
    trials: 24,
    settleAfter: 4,
    minSnrDb: -25,
    maxSnrDb: 10,
  };
}

/**
 * A small seeded generator, so a run can be replayed exactly.
 *
 * Math.random cannot be seeded, and a validation harness that cannot
 * replay a failing run is a harness that can only tell you something
 * went wrong once. mulberry32 is four lines and good enough for picking
 * digits.
 */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Digits for one presentation, without repeats inside the triplet. */
export function drawTriplet(
  digitSet: Digit[],
  size: number,
  rng: () => number,
): Digit[] {
  const pool = [...digitSet];
  const out: Digit[] = [];
  for (let i = 0; i < size && pool.length > 0; i++) {
    const j = Math.floor(rng() * pool.length);
    out.push(pool[j]!);
    pool.splice(j, 1);
  }
  return out;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(Math.max(x, lo), hi);

/** All three digits, in order. Nothing else counts. */
export function isCorrect(presented: Digit[], entered: Digit[]): boolean {
  if (entered.length !== presented.length) return false;
  return presented.every((d, i) => entered[i] === d);
}

export class Screen {
  readonly options: ProcedureOptions;
  private readonly rng: () => number;
  private readonly answers: Answer[] = [];
  /** The ratio each presentation was played at, in order. */
  private readonly presented: number[] = [];
  private snrDb: number;
  private pending: Trial | null = null;

  constructor(options: Partial<ProcedureOptions> = {}, seed = 1) {
    this.options = { ...defaultOptions(), ...options };
    this.rng = createRng(seed);
    this.snrDb = this.options.startSnrDb;
  }

  get finished(): boolean {
    return this.answers.length >= this.options.trials;
  }

  /** How far through the run we are, for a progress bar. */
  get progress(): { done: number; total: number } {
    return { done: this.answers.length, total: this.options.trials };
  }

  /**
   * The presentation to play now.
   *
   * Calling this twice without answering returns the same trial, so a
   * screen that re-renders does not silently draw new digits and leave
   * the listener answering a triplet they never heard.
   */
  current(): Trial {
    if (this.finished) throw new Error("the run is over; read result() instead");
    if (!this.pending) {
      this.pending = {
        index: this.answers.length,
        digits: drawTriplet(this.options.digitSet, this.options.tripletSize, this.rng),
        snrDb: this.snrDb,
      };
    }
    return this.pending;
  }

  /** Score what the listener typed and move the track. */
  submit(entered: Digit[]): Answer {
    const trial = this.current();
    const answer: Answer = {
      trial,
      entered: [...entered],
      correct: isCorrect(trial.digits, entered),
    };
    this.answers.push(answer);
    this.presented.push(trial.snrDb);
    this.pending = null;

    const step =
      this.answers.length <= this.options.coarseTrials
        ? this.options.coarseStepDb
        : this.options.stepDb;
    // One up, one down. Right means make it harder.
    this.snrDb = clamp(
      this.snrDb + (answer.correct ? -step : step),
      this.options.minSnrDb,
      this.options.maxSnrDb,
    );
    return answer;
  }

  result(): ScreenResult {
    const srtDb = estimateSrt(this.presented, this.snrDb, this.options);
    const problems = assessValidity(this.answers, this.presented, srtDb, this.options);
    return {
      srtDb,
      answers: [...this.answers],
      reversals: countReversals(this.answers, this.options.settleAfter),
      valid: problems.length === 0,
      problems,
    };
  }
}

/**
 * The threshold, from the track rather than from the answers.
 *
 * The estimate is the mean of the ratios actually presented once the
 * track has settled, together with the ratio that would have been
 * presented next. That last term is not a rounding detail. It is the
 * only place the final answer influences the result, and leaving it out
 * biases every run by half a step in the direction of the last mistake.
 */
export function estimateSrt(
  presented: number[],
  nextSnrDb: number,
  options: ProcedureOptions,
): number {
  const tail = presented.slice(options.settleAfter);
  const values = [...tail, nextSnrDb];
  if (values.length === 0) return Number.NaN;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Direction changes after the track has settled. */
export function countReversals(answers: Answer[], settleAfter: number): number {
  let reversals = 0;
  let previous: boolean | null = null;
  for (let i = settleAfter; i < answers.length; i++) {
    const going = answers[i]!.correct;
    if (previous !== null && going !== previous) reversals++;
    previous = going;
  }
  return reversals;
}

/**
 * Whether this run is worth reporting.
 *
 * A screening test that returns a number no matter what is worse than
 * one that declines, because the number gets believed. Each check below
 * is a way a run can produce a plausible-looking threshold that means
 * nothing, and all of them have to be caught before a result is shown
 * to somebody who is about to decide whether to see a doctor.
 */
export function assessValidity(
  answers: Answer[],
  presented: number[],
  srtDb: number,
  options: ProcedureOptions,
): string[] {
  const problems: string[] = [];

  if (answers.length < options.trials) {
    problems.push("The test was not finished.");
    return problems;
  }

  // A track that never changes direction never found anything. Every
  // answer right means the threshold is below the range we can present;
  // every answer wrong means it is above it. Both look like a tidy
  // average and neither is a measurement.
  const settled = answers.slice(options.settleAfter);
  const right = settled.filter((a) => a.correct).length;
  if (right === 0) {
    problems.push("Every answer after the start was wrong, so the test never found a level that worked.");
  } else if (right === settled.length) {
    problems.push("Every answer was right, so the test never found a level that was hard enough.");
  } else if (countReversals(answers, options.settleAfter) < 4) {
    problems.push("The test did not settle. It usually means the room was noisy or the answers were guessed.");
  }

  // Pinned against an end of the range: the real threshold is somewhere
  // outside what we can play, so the mean is an artefact of the clamp.
  //
  // These two say something about the test, not about the listener. A
  // run can pin at the top because somebody could not hear it, or
  // because they were pressing buttons without listening, and nothing
  // here can tell those apart. Drawing a conclusion about their hearing
  // out of a run this file has just refused would be exactly the move
  // the refusal exists to prevent.
  if (srtDb <= options.minSnrDb + 1) {
    problems.push("The level needed was below anything this test can present, so there is no threshold to report.");
  } else if (srtDb >= options.maxSnrDb - 1) {
    problems.push("The level needed was above anything this test can present, so there is no threshold to report.");
  }

  // Wrong number of digits over and over is a person fighting the remote,
  // not a person failing to hear.
  const malformed = answers.filter(
    (a) => a.entered.length !== options.tripletSize,
  ).length;
  if (malformed > answers.length / 4) {
    problems.push("Too many answers were incomplete, so the test could not be scored.");
  }

  return problems;
}
