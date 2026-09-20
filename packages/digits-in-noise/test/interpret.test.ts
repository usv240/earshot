import { describe, expect, it } from "vitest";
import {
  allMessages,
  defaultListener,
  interpret,
  PROVISIONAL_DIOTIC,
  runScreen,
  type ScreenResult,
} from "../src/index.js";

/**
 * What the screen is allowed to say.
 *
 * This is a tool that will be read by somebody sitting alone in front of
 * a television, who has just been told something about their body by an
 * appliance. The wording is a safety property, in the same way a bounds
 * check is a safety property, so it is tested rather than reviewed.
 *
 * Three things must be impossible. It must never name a condition,
 * because a ratio measured through a television cannot know one. It must
 * never promise an outcome. And it must never turn a test that did not
 * work into good news, which is the dangerous direction: the listener
 * most likely to produce an unusable run is the one whose hearing is
 * furthest outside the range we can play.
 */

const result = (over: Partial<ScreenResult>): ScreenResult => ({
  srtDb: -9,
  answers: [],
  reversals: 8,
  valid: true,
  problems: [],
  ...over,
});

describe("the wording", () => {
  it("never names a condition or claims a diagnosis", () => {
    const forbidden = [
      /\bdiagnos/i,
      /\byou have\b/i,
      /\byou are (deaf|going deaf)\b/i,
      /\bhearing loss\b/i,
      /\bdeaf\b/i,
      /\bdisease\b/i,
      /\bnormal hearing\b/i,
    ];
    for (const message of allMessages()) {
      for (const pattern of forbidden) {
        expect(
          pattern.test(message),
          `a result message matches ${pattern}: ${JSON.stringify(message)}`,
        ).toBe(false);
      }
    }
  });

  it("never promises that anything can be fixed", () => {
    for (const message of allMessages()) {
      expect(/\b(will|guarantee|cure|restore)\b/i.test(message), message).toBe(false);
    }
  });

  it("says something for every band, rather than going quiet", () => {
    const messages = allMessages();
    expect(messages.length).toBeGreaterThanOrEqual(8);
    for (const m of messages) expect(m.trim().length).toBeGreaterThan(20);
  });
});

describe("the bands", () => {
  it("never calls a failed test good news", () => {
    // The exact zero of this project. A run that did not work is
    // unmeasured, at every threshold it could possibly have produced,
    // including the ones that would otherwise read as clear.
    for (let srtDb = -30; srtDb <= 20; srtDb += 0.25) {
      const band = interpret(result({ srtDb, valid: false, problems: ["x"] })).band;
      expect(band, `an invalid run at ${srtDb} dB was reported as ${band}`).toBe("unmeasured");
    }
  });

  it("sorts a threshold into exactly the band the reference describes", () => {
    const r = PROVISIONAL_DIOTIC;
    expect(interpret(result({ srtDb: r.clearAtOrBelowDb - 1 })).band).toBe("clear");
    expect(interpret(result({ srtDb: r.clearAtOrBelowDb })).band).toBe("clear");
    expect(interpret(result({ srtDb: r.clearAtOrBelowDb + 0.5 })).band).toBe("borderline");
    expect(interpret(result({ srtDb: r.referAboveDb })).band).toBe("borderline");
    expect(interpret(result({ srtDb: r.referAboveDb + 0.5 })).band).toBe("refer");
  });

  it("never skips a band as the threshold worsens", () => {
    // Monotonic, with no gaps: a worse threshold can never come back
    // with better advice than a better one.
    const order = { clear: 0, borderline: 1, refer: 2, unmeasured: -1 };
    let previous = -1;
    for (let srtDb = -25; srtDb <= 9; srtDb += 0.25) {
      const rank = order[interpret(result({ srtDb })).band];
      expect(rank).toBeGreaterThanOrEqual(previous);
      previous = rank;
    }
    expect(previous).toBe(2);
  });

  it("carries the reference that produced the bands, so a figure can be traced", () => {
    // A threshold in decibels means nothing without the material it was
    // measured against. Every interpretation names its source.
    const i = interpret(result({}));
    expect(i.reference.label).toBeTruthy();
    expect(i.reference.source.length).toBeGreaterThan(30);
  });

  it("calls the reference provisional, because our own material is not normed yet", () => {
    expect(PROVISIONAL_DIOTIC.label.toLowerCase()).toContain("provisional");
    expect(PROVISIONAL_DIOTIC.source.toLowerCase()).toContain("provisional");
  });

  it("interprets an ordinary run end to end", () => {
    const i = interpret(runScreen(defaultListener(), 5));
    expect(["clear", "borderline", "refer"]).toContain(i.band);
    expect(i.nextStep.length).toBeGreaterThan(20);
  });
});
