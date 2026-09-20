import { describe, expect, it } from "vitest";
import {
  defaultRegionOptions,
  gateFilter,
  parseIntegratedLufs,
  speechRegions,
  speechSeconds,
  speechShare,
  type TranscribeItem,
} from "../src/speech.js";

const word = (start: number, end: number): TranscribeItem => ({
  type: "pronunciation",
  start_time: String(start),
  end_time: String(end),
});

const punctuation: TranscribeItem = { type: "punctuation" };

describe("finding the dialogue", () => {
  it("joins words into the sentence they came from", () => {
    // Left alone, a sentence becomes thirty regions with a gap at every
    // word boundary, and the quiet ends of words fall into the gaps.
    // Consonants live at those ends, and consonants are most of what
    // somebody with hearing loss cannot hear.
    const regions = speechRegions([word(1, 1.2), word(1.3, 1.5), word(1.55, 1.9)]);
    expect(regions).toHaveLength(1);
    expect(regions[0]!.start).toBeCloseTo(0.92, 2);
    expect(regions[0]!.end).toBeCloseTo(1.98, 2);
  });

  it("keeps a real pause as a real pause", () => {
    const regions = speechRegions([word(1, 2), word(8, 9)]);
    expect(regions).toHaveLength(2);
  });

  it("ignores punctuation, which has no time of its own", () => {
    const regions = speechRegions([word(1, 2), punctuation, word(1.1, 2.2)]);
    expect(regions).toHaveLength(1);
  });

  it("copes with words arriving out of order", () => {
    const regions = speechRegions([word(8, 9), word(1, 2)]);
    expect(regions.map((r) => Math.round(r.start))).toEqual([1, 8]);
  });

  it("never lets padding run past the end of the file", () => {
    const regions = speechRegions([word(9.5, 10)], defaultRegionOptions(), 10);
    expect(regions[0]!.end).toBe(10);
  });

  it("never lets padding run before the start of the file", () => {
    const regions = speechRegions([word(0.01, 0.5)]);
    expect(regions[0]!.start).toBe(0);
  });

  it("never returns two regions that overlap", () => {
    /*
      Padding can push neighbours into each other, and the gate filter
      sums its terms. Two overlapping ranges would count the same audio
      twice, quietly weighting part of the film in the measurement.
    */
    const regions = speechRegions([word(1, 2), word(2.5, 3)]);
    for (let i = 1; i < regions.length; i++) {
      expect(regions[i]!.start).toBeGreaterThan(regions[i - 1]!.end);
    }
  });

  it("never returns two regions that overlap, even when padding is generous", () => {
    /*
      The previous test cannot reach this. With the shipped options,
      anything close enough to overlap after padding was already merged
      before padding. It becomes reachable as soon as padding is more
      than half the merge gap, so that is the configuration under test.
    */
    const generous = { mergeGapSec: 0.1, padSec: 0.3, minRegionSec: 0.05 };
    const regions = speechRegions([word(1, 2), word(2.2, 3)], generous);
    expect(regions.length).toBeGreaterThan(0);
    for (let i = 1; i < regions.length; i++) {
      expect(regions[i]!.start).toBeGreaterThan(regions[i - 1]!.end);
    }
    // And the total cannot exceed the wall-clock span it came from.
    expect(speechSeconds(regions)).toBeLessThanOrEqual(3.3 - 0.7 + 0.001);
  });

  it("drops a cough", () => {
    expect(speechRegions([word(1, 1.02)])).toEqual([]);
  });

  it("returns nothing for a programme with nobody talking in it", () => {
    expect(speechRegions([])).toEqual([]);
    expect(speechRegions([punctuation])).toEqual([]);
  });
});

describe("how much talking there was", () => {
  it("adds the stretches up", () => {
    expect(speechSeconds([{ start: 1, end: 3 }, { start: 10, end: 11.5 }])).toBeCloseTo(3.5, 6);
  });

  it("reports a share that cannot exceed the programme", () => {
    expect(speechShare([{ start: 0, end: 60 }], 120)).toBeCloseTo(0.5, 6);
    expect(speechShare([{ start: 0, end: 200 }], 120)).toBe(1);
    expect(speechShare([], 0)).toBe(0);
  });
});

describe("the gate filter", () => {
  it("keeps everything inside any region and nothing else", () => {
    const filter = gateFilter([{ start: 1.5, end: 2.25 }, { start: 9, end: 10 }]);
    expect(filter).toContain("between(t,1.500,2.250)");
    expect(filter).toContain("between(t,9.000,10.000)");
    expect(filter).toContain("+");
  });

  it("restamps what survives, so the gaps do not come back as silence", () => {
    // Without asetpts the kept pieces keep their original timestamps,
    // ffmpeg fills the space between them, and the silence we removed
    // walks back into the measurement through the front door.
    expect(gateFilter([{ start: 0, end: 1 }])).toContain("asetpts=N/SR/TB");
  });

  it("refuses rather than measuring a programme with no speech in it", () => {
    expect(() => gateFilter([])).toThrow(/no speech/i);
  });
});

describe("reading the loudness back", () => {
  const summary = `
[Parsed_ebur128_1 @ 0000] t: 12.3   I: -19.4 LUFS
[Parsed_ebur128_1 @ 0000] Summary:

  Integrated loudness:
    I:         -23.7 LUFS
    Threshold: -34.1 LUFS
`;

  it("takes the figure from the summary, not from partway through", () => {
    // Running values are printed throughout with the same label. The
    // first one is a plausible number from twelve seconds in, and it is
    // not the answer.
    expect(parseIntegratedLufs(summary)).toBe(-23.7);
  });

  it("takes the last summary when a graph printed more than one", () => {
    // Two ebur128 instances in one filter graph print two summaries.
    // The one that belongs to the gated audio is the last.
    const two = `
  Integrated loudness:
    I:         -14.2 LUFS
  Integrated loudness:
    I:         -23.7 LUFS
`;
    expect(parseIntegratedLufs(two)).toBe(-23.7);
  });

  it("ignores the running values printed while it works", () => {
    const running = `
[Parsed_ebur128_1 @ 0000] t: 3.1   I: -11.1 LUFS
[Parsed_ebur128_1 @ 0000] t: 9.7   I: -12.9 LUFS
  Integrated loudness:
    I:         -23.7 LUFS
`;
    expect(parseIntegratedLufs(running)).toBe(-23.7);
  });

  it("refuses rather than inventing a number", () => {
    expect(() => parseIntegratedLufs("ffmpeg fell over")).toThrow(/no integrated loudness/i);
  });
});
