import { describe, expect, it } from "vitest";
import {
  createRng,
  defaultListener,
  defaultOptions,
  drawTriplet,
  estimateSrt,
  isCorrect,
  probabilityCorrect,
  runScreen,
  Screen,
  sweep,
} from "../src/index.js";

/**
 * Does this test measure what it says it measures?
 *
 * Every real listener gives one number, once. There is nothing to
 * compare it against, so a hearing screen can be confidently wrong for
 * its whole life and nobody finds out. The only way to know is to run
 * the procedure against ears whose thresholds we chose in advance, and
 * ask whether the number that comes back is the number we put in.
 *
 * That is what most of this file does, and the three figures it produces
 * are the same three the validation literature reports for this test:
 * bias, test-retest spread, and how both behave across the range of
 * hearing the test is meant to cover.
 */

describe("the presentation", () => {
  it("draws the right number of digits, from the set, without repeats", () => {
    const options = defaultOptions();
    const rng = createRng(7);
    for (let i = 0; i < 200; i++) {
      const triplet = drawTriplet(options.digitSet, options.tripletSize, rng);
      expect(triplet).toHaveLength(options.tripletSize);
      expect(new Set(triplet).size).toBe(options.tripletSize);
      for (const d of triplet) expect(options.digitSet).toContain(d);
    }
  });

  it("leaves out the digits that are two syllables in English", () => {
    // A listener who hears a second syllable has information the other
    // digits do not give them, which makes those two easier for reasons
    // that are not hearing.
    expect(defaultOptions().digitSet).not.toContain(0);
    expect(defaultOptions().digitSet).not.toContain(7);
  });

  it("replays exactly from the same seed", () => {
    const a = new Screen({}, 42).current();
    const b = new Screen({}, 42).current();
    expect(a.digits).toEqual(b.digits);
  });

  it("does not redraw the digits when asked for the same trial twice", () => {
    // A screen that re-renders must not quietly swap the digits out from
    // under somebody who is halfway through answering them.
    const screen = new Screen({}, 3);
    expect(screen.current().digits).toEqual(screen.current().digits);
  });

  it("scores the triplet, in order, or not at all", () => {
    expect(isCorrect([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(isCorrect([1, 2, 3], [3, 2, 1])).toBe(false);
    expect(isCorrect([1, 2, 3], [1, 2])).toBe(false);
    expect(isCorrect([1, 2, 3], [1, 2, 3, 4])).toBe(false);
    // Two out of three is still wrong. The published thresholds are only
    // comparable if the scoring matches, and it scores whole triplets.
    expect(isCorrect([1, 2, 3], [1, 2, 4])).toBe(false);
  });
});

describe("the track", () => {
  it("gets harder when the listener is right and easier when wrong", () => {
    const screen = new Screen({ coarseTrials: 0, stepDb: 2 }, 1);
    const first = screen.current().snrDb;
    screen.submit(screen.current().digits);
    const afterCorrect = screen.current().snrDb;
    expect(afterCorrect).toBe(first - 2);
    screen.submit([]);
    expect(screen.current().snrDb).toBe(afterCorrect + 2);
  });

  it("takes bigger steps at the start, to stop wasting the listener's patience", () => {
    const screen = new Screen({ coarseTrials: 2, coarseStepDb: 4, stepDb: 2 }, 1);
    const start = screen.current().snrDb;
    screen.submit(screen.current().digits);
    expect(screen.current().snrDb).toBe(start - 4);
    screen.submit(screen.current().digits);
    expect(screen.current().snrDb).toBe(start - 8);
    screen.submit(screen.current().digits);
    expect(screen.current().snrDb).toBe(start - 10);
  });

  it("cannot wander outside the range it can actually play", () => {
    const screen = new Screen({ minSnrDb: -10, maxSnrDb: 2, coarseTrials: 0 }, 1);
    for (let i = 0; i < 20 && !screen.finished; i++) screen.submit(screen.current().digits);
    expect(screen.current === undefined || true).toBe(true);
    const result = screen.result();
    for (const a of result.answers) {
      expect(a.trial.snrDb).toBeGreaterThanOrEqual(-10);
      expect(a.trial.snrDb).toBeLessThanOrEqual(2);
    }
  });

  it("counts the ratio that would have come next, not just the ones played", () => {
    // Leaving the notional next value out biases every run by half a
    // step in the direction of whatever the listener did last, because
    // the final answer would otherwise change nothing at all.
    const options = defaultOptions();
    const played = [-8, -8, -8, -8, -8, -8];
    const withNext = estimateSrt(played, -12, { ...options, settleAfter: 4 });
    const withoutInfluence = estimateSrt(played, -8, { ...options, settleAfter: 4 });
    expect(withNext).toBeLessThan(withoutInfluence);
  });
});

describe("the simulated ear", () => {
  it("gets exactly half of them right at its own threshold", () => {
    // If this drifts, every bias number below is measuring an error we
    // introduced ourselves rather than one in the procedure.
    for (const lapseRate of [0, 0.02, 0.05, 0.1]) {
      const listener = { trueSrtDb: -9, slopePerDb: 0.18, lapseRate };
      expect(probabilityCorrect(-9, listener)).toBeCloseTo(0.5, 6);
    }
  });

  it("does better when the speech is louder than the noise", () => {
    const listener = defaultListener();
    expect(probabilityCorrect(-3, listener)).toBeGreaterThan(
      probabilityCorrect(-9, listener),
    );
    expect(probabilityCorrect(-15, listener)).toBeLessThan(
      probabilityCorrect(-9, listener),
    );
  });
});

describe("what the procedure measures", () => {
  it("lands on the threshold it was given, not a decibel away from it", () => {
    const summary = sweep(defaultListener(), 400);
    expect(Math.abs(summary.biasDb)).toBeLessThan(0.5);
  });

  it("repeats itself about as closely as the published test does", () => {
    // Reported test-retest standard deviations for digits-in-noise sit
    // around 0.7 to 1.2 dB. A procedure noisier than that cannot tell a
    // borderline result from a clear one and should not be shown to
    // anybody as though it could.
    const summary = sweep(defaultListener(), 400);
    expect(summary.sdDb).toBeLessThan(1.5);
  });

  it("stays honest across the range of hearing it is meant to cover", () => {
    const worst: { srt: number; bias: number }[] = [];
    for (const trueSrtDb of [-14, -12, -10, -9, -7, -5, -3]) {
      const summary = sweep({ trueSrtDb, slopePerDb: 0.18, lapseRate: 0.02 }, 200);
      worst.push({ srt: trueSrtDb, bias: summary.biasDb });
      expect(
        Math.abs(summary.biasDb),
        `at a true threshold of ${trueSrtDb} dB the estimate is off by ${summary.biasDb.toFixed(2)} dB`,
      ).toBeLessThan(0.6);
    }
    expect(worst).toHaveLength(7);
  });

  it("survives a listener who fumbles one answer in twenty", () => {
    const careless = { trueSrtDb: -9, slopePerDb: 0.18, lapseRate: 0.05 };
    const summary = sweep(careless, 300);
    expect(Math.abs(summary.biasDb)).toBeLessThan(0.8);
  });
});

describe("runs it refuses to report", () => {
  it("declines when the listener never got one wrong", () => {
    // Hearing better than the quietest ratio we can present. The mean of
    // the track is a tidy number and it is not a measurement.
    const superhuman = { trueSrtDb: -60, slopePerDb: 0.18, lapseRate: 0 };
    const result = runScreen(superhuman, 1);
    expect(result.valid).toBe(false);
    expect(result.problems.join(" ")).toMatch(/better than|never found/i);
  });

  it("declines when the listener never got one right", () => {
    const profound = { trueSrtDb: 40, slopePerDb: 0.18, lapseRate: 0 };
    const result = runScreen(profound, 1);
    expect(result.valid).toBe(false);
  });

  it("declines a run that was abandoned half way", () => {
    const screen = new Screen({}, 1);
    for (let i = 0; i < 5; i++) screen.submit(screen.current().digits);
    const result = screen.result();
    expect(result.valid).toBe(false);
    expect(result.problems.join(" ")).toMatch(/not finished/i);
  });

  it("declines when somebody was fighting the remote rather than listening", () => {
    const screen = new Screen({}, 1);
    while (!screen.finished) screen.submit([1]);
    expect(screen.result().valid).toBe(false);
  });

  it("reports the ordinary case", () => {
    const result = runScreen(defaultListener(), 11);
    expect(result.valid).toBe(true);
    expect(result.problems).toEqual([]);
    expect(result.answers).toHaveLength(defaultOptions().trials);
  });
});
