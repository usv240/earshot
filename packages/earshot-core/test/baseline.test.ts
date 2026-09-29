import { describe, expect, it } from "vitest";
import {
  AMPLITUDE_CURVE,
  compareAgainstVolumeOnly,
  defaultLevelOptions,
  dialogueReferencedDriftDb,
  volumeOnlyDriftDb,
  type Session,
} from "../src/index.js";

/**
 * The baseline exists to be beaten, and this checks the beating is real.
 *
 * The trap for a volume-only model is a viewer who compensates for a
 * quieter mix: they turned it up, their ears did not change. The trap
 * for any improved model is that it could pass by never firing. So both
 * cases are tested, and the improved model has to catch the real creep
 * as well as ignore the compensation.
 */

const DAY = 86_400_000;
const opts = { ...defaultLevelOptions(), curve: AMPLITUDE_CURVE };

function household(kind: "compensating" | "creeping"): Session[] {
  const start = Date.parse("2026-01-01");
  return Array.from({ length: 20 }, (_, i) => ({
    startedAt: new Date(start + i * 4 * DAY).toISOString().slice(0, 10),
    programme: {
      id: `p${i}`,
      // Quieter by exactly what half-to-full volume adds: 6.02 dB, not 6.
      dialogueLufs: kind === "compensating" && i >= 10 ? -27 + AMPLITUDE_CURVE.gainDb(0.5) : -27,
      speechSeconds: 1800,
    },
    volume: i >= 10 ? 1 : 0.5,
    watchedSeconds: 3600,
    captionsOn: false,
    rehearSeeks: 0,
  }));
}

describe("volume-only, the reasonable engineer's first design", () => {
  it("reads a viewer compensating for a quieter mix as decline", () => {
    // Six decibels of volume, exactly matching six decibels of quieter
    // dialogue. Nothing changed at the ear. Volume-only says it did.
    expect(volumeOnlyDriftDb(household("compensating"), opts)).toBeCloseTo(6.02, 1);
  });

  it("does catch a real creep, so it is not a strawman", () => {
    expect(volumeOnlyDriftDb(household("creeping"), opts)).toBeCloseTo(6.02, 1);
  });
});

describe("dialogue-referenced, what Earshot does", () => {
  it("sees no change in the compensating household", () => {
    const d = dialogueReferencedDriftDb(household("compensating"), opts);
    expect(d).not.toBeNull();
    expect(Math.abs(d!)).toBeLessThan(0.01);
  });

  it("still catches the real creep", () => {
    expect(dialogueReferencedDriftDb(household("creeping"), opts)).toBeCloseTo(6.02, 1);
  });
});

describe("the comparison", () => {
  it("scores both models on both kinds of household", () => {
    const c = compareAgainstVolumeOnly((kind) => household(kind), opts, 4, 50);
    expect(c.households).toBe(50);
    expect(c.compensating.volumeOnlyFalseAlarms).toBe(50);
    expect(c.compensating.dialogueReferencedFalseAlarms).toBe(0);
    expect(c.creeping.volumeOnlyDetections).toBe(50);
    expect(c.creeping.dialogueReferencedDetections).toBe(50);
  });
});
