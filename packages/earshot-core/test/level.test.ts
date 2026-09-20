import { describe, expect, it } from "vitest";
import {
  AMPLITUDE_CURVE,
  captionShare,
  defaultLevelOptions,
  drift,
  listeningLevelDb,
  median,
  qualifying,
  rehearRatePerHour,
  type Session,
} from "../src/index.js";

/** A sitting, with everything that is not under test held still. */
function sitting(over: Partial<Session> & { startedAt: string }): Session {
  return {
    programme: { id: "p", dialogueLufs: -27, speechSeconds: 1800 },
    volume: 0.5,
    watchedSeconds: 3600,
    captionsOn: false,
    rehearSeeks: 0,
    ...over,
  };
}

/** n sittings, one per day, from a start date. */
function run(n: number, over: (i: number) => Partial<Session>, from = "2026-01-01"): Session[] {
  const start = Date.parse(from);
  return Array.from({ length: n }, (_, i) =>
    sitting({
      startedAt: new Date(start + i * 86_400_000).toISOString().slice(0, 10),
      ...over(i),
    }),
  );
}

describe("the volume curve", () => {
  it("treats half volume as six decibels down", () => {
    expect(AMPLITUDE_CURVE.gainDb(1)).toBeCloseTo(0, 6);
    expect(AMPLITUDE_CURVE.gainDb(0.5)).toBeCloseTo(-6.02, 2);
    expect(AMPLITUDE_CURVE.gainDb(0.25)).toBeCloseTo(-12.04, 2);
  });

  it("treats silence as silence rather than as a very small number", () => {
    expect(AMPLITUDE_CURVE.gainDb(0)).toBe(-Infinity);
  });
});

describe("listening level", () => {
  it("does not move when somebody compensates for a quieter mix", () => {
    /*
      The property the whole formula exists for.

      A viewer who turns up a film with quiet dialogue has not made the
      dialogue any louder at their ear than a normal mix at a normal
      setting. They have corrected for the material. If this figure rose
      every time somebody watched a badly mixed film, the product would
      spend its life accusing people of going deaf on the strength of
      the sound design, which is roughly the opposite of useful.
     */
    const normal = sitting({
      startedAt: "2026-01-01",
      programme: { id: "a", dialogueLufs: -27, speechSeconds: 1800 },
      volume: 0.5,
    });
    // Dialogue quieter by exactly the amount the volume went up. Half to
    // full is 6.02 dB rather than 6, and writing the round number here
    // is how this test failed the first time it ran.
    const quietMix = sitting({
      startedAt: "2026-01-02",
      programme: {
        id: "b",
        dialogueLufs: -27 + AMPLITUDE_CURVE.gainDb(0.5),
        speechSeconds: 1800,
      },
      volume: 1,
    });
    expect(listeningLevelDb(quietMix)).toBeCloseTo(listeningLevelDb(normal), 2);
  });

  it("does move when somebody reaches past what the material needed", () => {
    const enough = sitting({ startedAt: "2026-01-01", volume: 0.5 });
    const more = sitting({ startedAt: "2026-01-02", volume: 0.75 });
    expect(listeningLevelDb(more)).toBeGreaterThan(listeningLevelDb(enough));
  });
});

describe("which sittings count", () => {
  it("ignores a programme with almost no talking in it", () => {
    const options = defaultLevelOptions();
    const concert = sitting({
      startedAt: "2026-01-01",
      programme: { id: "c", dialogueLufs: -27, speechSeconds: 30 },
    });
    expect(qualifying([concert], options)).toHaveLength(0);
  });

  it("ignores somebody flicking through the menu for two minutes", () => {
    const options = defaultLevelOptions();
    const flick = sitting({ startedAt: "2026-01-01", watchedSeconds: 90 });
    expect(qualifying([flick], options)).toHaveLength(0);
  });

  it("puts them in order, whatever order they arrived in", () => {
    const out = qualifying(
      [sitting({ startedAt: "2026-03-01" }), sitting({ startedAt: "2026-01-01" })],
      defaultLevelOptions(),
    );
    expect(out.map((s) => s.startedAt)).toEqual(["2026-01-01", "2026-03-01"]);
  });
});

describe("the middle value", () => {
  it("shrugs at one loud evening", () => {
    // A mean would carry the outlier into the answer. This is the whole
    // reason the figure is a median.
    expect(median([1, 1, 1, 1, 40])).toBe(1);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(Number.isNaN(median([]))).toBe(true);
  });
});

describe("drift", () => {
  it("says nothing at all until there is a baseline to compare against", () => {
    // Inventing one would mean the first loud film anybody watches looks
    // like deterioration.
    expect(drift(run(4, () => ({})))).toBeNull();
    expect(drift([])).toBeNull();
  });

  it("finds nothing when nothing changed", () => {
    const d = drift(run(20, () => ({ volume: 0.5 })));
    expect(d).not.toBeNull();
    expect(Math.abs(d!.driftDb)).toBeLessThan(0.01);
  });

  it("finds a household that has crept upward", () => {
    // Half volume to full volume is six decibels.
    const d = drift(run(20, (i) => ({ volume: i < 10 ? 0.5 : 1 })));
    expect(d!.driftDb).toBeCloseTo(6.02, 1);
    expect(d!.spanDays).toBe(19);
  });

  it("is not fooled by one loud night in the middle of a quiet run", () => {
    const d = drift(run(20, (i) => ({ volume: i === 17 ? 1 : 0.5 })));
    expect(Math.abs(d!.driftDb)).toBeLessThan(0.01);
  });
});

describe("going back to hear a line again", () => {
  it("counts against hours of dialogue, not hours of programme", () => {
    /*
      A three hour film with twenty minutes of talking gives somebody far
      fewer chances to miss a line than a dialogue-heavy hour does.
      Dividing by programme length would make quiet films look like
      hearing problems and talkative ones look fine.
    */
    const talky = run(3, () => ({
      programme: { id: "t", dialogueLufs: -27, speechSeconds: 3600 },
      rehearSeeks: 4,
    }));
    const sparse = run(3, () => ({
      programme: { id: "s", dialogueLufs: -27, speechSeconds: 900 },
      rehearSeeks: 4,
    }));
    expect(rehearRatePerHour(talky)).toBeCloseTo(4, 5);
    expect(rehearRatePerHour(sparse)).toBeCloseTo(16, 5);
  });

  it("says nothing when there is nothing to divide by", () => {
    expect(rehearRatePerHour([])).toBeNull();
  });
});

describe("captions", () => {
  it("reports the share of recent sittings, not of all time", () => {
    // Somebody who used them years ago and stopped is not the signal.
    const sessions = run(20, (i) => ({ captionsOn: i >= 12 }));
    expect(captionShare(sessions)).toBe(1);
  });
});
