import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Every number this project says out loud, checked against the run that
 * produced it.
 *
 * A figure in a README is a claim. A figure a test re-derives from
 * committed output is a fact, and it cannot drift quietly: change the
 * headline without re-running the validation, or re-run it and get a
 * different answer, and this file fails.
 *
 * One claim matters more than the others. This is a health screen, and
 * the number that decides whether somebody is told to see a doctor is
 * the threshold. If the procedure reads thresholds with a bias, then
 * every person near the cut-off is sorted by our arithmetic rather than
 * by their hearing, in one direction, forever. So bias is asserted as a
 * near-zero rather than a bound, and it is checked at both ends of the
 * range, not just in the middle where it is easiest.
 *
 * Reproduce the underlying run: npm run validate
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");

const results = JSON.parse(
  fs.readFileSync(path.join(repo, "apps/eval/results/validation.json"), "utf8"),
) as {
  headline: { runs: number; biasDb: number; sdDb: number; worstDb: number; rejected: number };
  acrossRange: { trueSrtDb: number; biasDb: number; sdDb: number }[];
  carelessness: { lapseRate: number; biasDb: number; sdDb: number }[];
  slopes: { slopePerDb: number; biasDb: number; sdDb: number }[];
  refusals: { betterThanRangeIsRejected: boolean; worseThanRangeIsRejected: boolean };
  comparison: { publishedTestRetestSdDb: number[] };
};

/**
 * Public text: the README and every document, found rather than listed.
 *
 * A hand-written list has to be edited whenever a document is added, and
 * it will not be, so the newest document is the one nothing checks. This
 * list also carried a name that did not exist yet, which the hygiene
 * suite caught: a forward reference that was invisible because the list
 * filtered out anything missing before looking at it.
 *
 * Reading the directory means a document is covered by every check below
 * from the moment it is written.
 */
const PUBLIC_TEXT = [
  "README.md",
  ...fs
    .readdirSync(path.join(repo, "docs"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => `docs/${f}`),
]
  .map((f) => ({ file: f, full: path.join(repo, f) }))
  .filter((d) => fs.existsSync(d.full))
  .map((d) => ({ file: d.file, text: fs.readFileSync(d.full, "utf8") }));

describe("what the validation run measured", () => {
  it("was a run big enough to mean something", () => {
    expect(results.headline.runs).toBeGreaterThanOrEqual(1000);
    expect(results.headline.rejected).toBe(0);
  });

  it("reads a known threshold without a systematic offset", () => {
    expect(Math.abs(results.headline.biasDb)).toBeLessThan(0.1);
  });

  it("repeats itself at least as closely as the published test", () => {
    const [best, worst] = results.comparison.publishedTestRetestSdDb as [number, number];
    expect(worst).toBeGreaterThan(best);
    expect(results.headline.sdDb).toBeLessThanOrEqual(worst);
  });

  it("has no systematic offset at either end of the range", () => {
    // The middle is the easy part. People near the cut-off are the whole
    // point of a screen, and they live at the ends.
    for (const row of results.acrossRange) {
      expect(
        Math.abs(row.biasDb),
        `at a true threshold of ${row.trueSrtDb} dB the estimate is off by ${row.biasDb} dB`,
      ).toBeLessThan(0.2);
    }
    expect(results.acrossRange.length).toBeGreaterThanOrEqual(5);
  });

  it("does not fall apart when the listener is careless", () => {
    const careless = results.carelessness.find((c) => c.lapseRate === 0.1);
    expect(careless).toBeTruthy();
    expect(Math.abs(careless!.biasDb)).toBeLessThan(1);
  });

  it("gets noisier with a shallow slope, and says so rather than hiding it", () => {
    // A listener whose performance improves only gradually is harder to
    // pin down. That is a property of the method, not a defect, and the
    // honest thing is to show it moving in the direction it must.
    const shallow = results.slopes.find((s) => s.slopePerDb === 0.1);
    const steep = results.slopes.find((s) => s.slopePerDb === 0.22);
    expect(shallow && steep).toBeTruthy();
    expect(shallow!.sdDb).toBeGreaterThan(steep!.sdDb);
  });

  it("refuses to report a threshold it could not reach", () => {
    // Both of these are exact. A screen that returns a plausible number
    // for an ear outside its range is worse than one that returns
    // nothing, because the number is what gets believed.
    expect(results.refusals.betterThanRangeIsRejected).toBe(true);
    expect(results.refusals.worseThanRangeIsRejected).toBe(true);
  });
});

describe("what the project says in public", () => {
  /*
    Matching a figure to its label, rather than to the nearest number.

    The first version of this looked for a decimal followed by "dB" with
    the words "test-retest" somewhere in the next forty characters. In a
    sentence that reads "bias 0.037 dB, test-retest spread 0.748 dB" it
    found the bias and compared it against the spread. The pin was loose
    in exactly the direction that makes a pin useless: it matched
    something, so it looked alive, and what it matched was wrong.
  */
  const SD_PATTERNS = [
    /test-retest (?:spread|standard deviation)(?: of)? \*{0,2}([0-9]+\.[0-9]+)\s*dB/gi,
    /\*{0,2}([0-9]+\.[0-9]+)\s*dB\*{0,2}\s+test-retest/gi,
  ];
  const BIAS_PATTERNS = [/bias(?: of)? \*{0,2}([0-9]+\.[0-9]+)\s*dB/gi];

  const stated = (text: string, patterns: RegExp[]): number[] =>
    patterns.flatMap((p) => [...text.matchAll(p)].map((m) => Number(m[1])));

  it("states the measured test-retest figure, not a rounded memory of it", () => {
    let found = 0;
    for (const d of PUBLIC_TEXT) {
      for (const value of stated(d.text, SD_PATTERNS)) {
        found++;
        expect(
          value,
          `${d.file} states ${value} dB test-retest; the run measured ${results.headline.sdDb} dB`,
        ).toBeCloseTo(results.headline.sdDb, 3);
      }
    }
    // Without this the whole check passes by matching nothing at all.
    expect(found, "no document states the test-retest figure").toBeGreaterThan(0);
  });

  it("states the measured bias, and does not confuse it with the spread", () => {
    let found = 0;
    for (const d of PUBLIC_TEXT) {
      for (const value of stated(d.text, BIAS_PATTERNS)) {
        found++;
        expect(
          value,
          `${d.file} states a bias of ${value} dB; the run measured ${results.headline.biasDb} dB`,
        ).toBeCloseTo(results.headline.biasDb, 3);
      }
    }
    expect(found, "no document states the bias").toBeGreaterThan(0);
  });

  it("never claims to be the first hearing test on a consumer device", () => {
    /*
      Apple shipped one in September 2024, with FDA authorisation, as a
      free update to hardware millions of people already own. Any
      sentence here implying otherwise is false, and it is the kind of
      false that a judge finds in thirty seconds.

      The interesting claim was never that one. It is that the audiogram
      measures tones in quiet and misses the complaint people actually
      have, which is speech in noise. So this is checked rather than
      remembered, in both directions: nothing may claim the first, and
      the prior art has to keep naming what exists.
    */
    for (const d of PUBLIC_TEXT) {
      expect(
        /\bfirst\b[^.]{0,60}\bhearing (?:test|screen)\b/i.test(d.text),
        `${d.file} claims to be the first hearing test somewhere`,
      ).toBe(false);
      expect(
        /\b(?:nobody|no one|no-one) has\b[^.]{0,60}\bhearing (?:test|screen)\b/i.test(d.text),
        `${d.file} claims nobody has built a hearing test`,
      ).toBe(false);
    }
  });

  it("keeps naming the prior art rather than quietly dropping it", () => {
    const priorArt = PUBLIC_TEXT.find((d) => d.file === "docs/PRIOR_ART.md");
    expect(priorArt, "the prior art audit is missing").toBeTruthy();
    for (const competitor of ["Apple", "Intel", "FDA"]) {
      expect(priorArt!.text).toContain(competitor);
    }
    // And the README has to point at it, or it is a file nobody opens.
    const readme = PUBLIC_TEXT.find((d) => d.file === "README.md");
    expect(readme!.text).toContain("PRIOR_ART.md");
  });

  it("does not claim the screen was validated on people", () => {
    // It was validated on a model. Saying otherwise about a health tool
    // is the kind of overclaim that should be impossible to make by
    // accident, so it is checked rather than remembered.
    for (const d of PUBLIC_TEXT) {
      expect(
        /validated (?:on|with|against) (?:real |recruited |human )?(?:listeners|patients|participants|people)/i.test(d.text),
        `${d.file} claims validation on people`,
      ).toBe(false);
    }
  });
});
