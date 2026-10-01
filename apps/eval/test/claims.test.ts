import { describe, expect, it } from "vitest";
import { DEFAULT_LENGTH, LENGTHS } from "digits-in-noise";
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
  cutPointDb: number;
  lengthCost: {
    trials: number;
    sdDb: number | null;
    refusedOf1000: number;
    fineWronglyReferredPercent: number;
    strugglingCaughtPercent: number;
  }[];
  baseline: {
    households: number;
    compensating: { volumeOnlyFalseAlarms: number; dialogueReferencedFalseAlarms: number };
    creeping: { volumeOnlyDetections: number; dialogueReferencedDetections: number };
  };
  referralCurve: { trueSrtDb: number; relativeToCutDb: number; referredPercent: number }[];
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
  // A skill is read by an agent and quoted at a person, which makes it
  // the least supervised surface here. Every check below applies to it.
  ...fs
    .readdirSync(path.join(repo, "skills"))
    .map((d) => `skills/${d}/SKILL.md`)
    .filter((f) => fs.existsSync(path.join(repo, f))),
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

  it("draws its cut-point from the literature rather than from us", () => {
    /*
      An earlier version used -9 and -7 dB, which came from the
      observation that adult diotic thresholds cluster near -9. That is
      a statement about where people score, not about where a screen
      should draw a line, and on a screening tool the difference is
      whether somebody is told to see a doctor.

      The published diotic categories put normal at or below -5.55 and
      poor above -3.80.
    */
    expect(results.cutPointDb).toBeCloseTo(-3.8, 2);
  });

  it("does not bother people who are clearly fine", () => {
    // The property that decides whether this is tolerable to ship. A
    // screen that refers healthy people teaches them to ignore it.
    const clearlyFine = results.referralCurve.filter((r) => r.relativeToCutDb <= -2);
    expect(clearlyFine.length).toBeGreaterThan(2);
    for (const row of clearlyFine) {
      expect(
        row.referredPercent,
        `a listener ${-row.relativeToCutDb} dB better than the cut-point was referred ${row.referredPercent}% of the time`,
      ).toBeLessThan(1);
    }
  });

  it("does catch people who are clearly struggling", () => {
    const struggling = results.referralCurve.filter((r) => r.relativeToCutDb >= 1.5);
    expect(struggling.length).toBeGreaterThan(1);
    for (const row of struggling) {
      expect(row.referredPercent).toBeGreaterThan(95);
    }
  });

  it("never gets less likely to refer as hearing gets worse", () => {
    // Monotonic. A dip anywhere here would mean some band of listeners
    // is protected from referral by arithmetic.
    let previous = -1;
    for (const row of results.referralCurve) {
      expect(row.referredPercent).toBeGreaterThanOrEqual(previous - 0.001);
      previous = row.referredPercent;
    }
  });

  it("offers only lengths that still catch a struggling listener", () => {
    /*
      Every length is shown to a person with its cost, and the engine
      decides which can be chosen. This is the rule it decides by, and
      it has to hold in the committed run: an offered length catches a
      listener 1.8 dB outside the cut-off at least 95 percent of the
      time and refuses fewer than one run in twenty. A length that is
      not offered has to fail that bar, or hiding it would be arbitrary.
    */
    const byTrials = new Map(results.lengthCost.map((r) => [r.trials, r]));
    for (const length of LENGTHS) {
      const row = byTrials.get(length.trials);
      expect(row, `no measurement for the ${length.trials}-round length`).toBeTruthy();
      const clears = row!.strugglingCaughtPercent >= 95 && row!.refusedOf1000 < 50;
      expect(
        clears,
        `${length.trials} rounds is ${length.offered ? "offered" : "not offered"} but ${clears ? "clears" : "fails"} the bar`,
      ).toBe(length.offered);
      if (!length.offered) expect(length.reason, "a rejected length has to say why").toBeTruthy();
    }
    expect(LENGTHS.filter((l) => l.recommended)).toHaveLength(1);
    expect(LENGTHS.find((l) => l.recommended)!.trials).toBe(DEFAULT_LENGTH);
  });

  it("beats the obvious alternative, and says by how much", () => {
    /*
      The reasonable engineer's first design is to track the volume
      setting. It is what the 2010 paper did by asking, and what the
      Intel patent claims. Earshot adds one term, the programme's own
      dialogue loudness, and this is what that term is worth.

      On households whose ears never changed but who turned up a quieter
      mix, volume-only accuses every one of them. Dialogue-referenced
      accuses none. And on households who really did creep, both catch
      them, so the improvement is not bought by going quiet.
    */
    const b = results.baseline;
    expect(b.households).toBeGreaterThanOrEqual(100);
    expect(b.compensating.dialogueReferencedFalseAlarms).toBe(0);
    expect(b.compensating.volumeOnlyFalseAlarms).toBe(b.households);
    expect(b.creeping.dialogueReferencedDetections).toBe(b.households);
    expect(b.creeping.volumeOnlyDetections).toBe(b.households);
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
    /*
      "first" has to be modifying the thing, not merely near it.

      The loose version allowed sixty characters of anything between,
      which swept up "in the first fifteen seconds: a hearing test" in
      the shooting script. That is the third time this week a phrase ban
      has caught innocent prose, and the first two were fixed by
      rewording. A guard that makes ordinary sentences unwriteable gets
      worked around, and a guard that gets worked around is worse than
      none, so this one was tightened to mean what it says.
    */
    const CLAIMS_A_FIRST = /\bfirst\b(?:\s+\w+){0,2}\s+hearing (?:test|screen)\b/i;
    const CLAIMS_NOBODY = /\b(?:nobody|no one|no-one) has\b(?:\s+\w+){0,6}\s+hearing (?:test|screen)\b/i;

    for (const d of PUBLIC_TEXT) {
      expect(
        CLAIMS_A_FIRST.test(d.text),
        `${d.file} claims to be the first hearing test somewhere`,
      ).toBe(false);
      expect(
        CLAIMS_NOBODY.test(d.text),
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

  it("describes exactly the tools the server implements", () => {
    /*
      A skill is a description of a server, kept in a different file from
      the server. Nothing makes them agree, and the failure is quiet: an
      agent reads the skill, calls a tool that was renamed, and the
      person asking gets an error instead of an answer.
    */
    const skill = PUBLIC_TEXT.find((d) => d.file.startsWith("skills/"));
    expect(skill, "no skill found").toBeTruthy();

    const server = fs.readFileSync(
      path.join(repo, "apps/mcp/src/mcp.ts"),
      "utf8",
    );
    const implemented = [...server.matchAll(/^\s*name: "([a-z_]+)",$/gm)].map((m) => m[1]!);
    expect(implemented.length).toBeGreaterThan(3);

    // Deliberately checked against the tools section rather than the
    // whole file. Every name also appears in the "when to use" table,
    // so a mention anywhere is satisfied by a tool that was dropped
    // from the list an agent actually reads to know what it can call.
    const section = skill!.text.split("## The tools")[1] ?? "";
    for (const tool of implemented) {
      expect(
        section.includes(tool),
        `the server implements ${tool} and the skill does not list it`,
      ).toBe(true);
    }

    /*
      And nothing invented. Matched on the name that opens each bullet,
      not on every backticked name in the section.

      Two earlier versions failed on srt_db. It is an argument to
      record_screen_result, it is correctly named in the prose
      describing that tool, and a guard that cannot tell an argument
      from a tool would force the documentation to stop naming
      arguments. That is the wrong thing to give up to keep a check
      happy.
    */
    const toolsSection = skill!.text.split("## The tools")[1] ?? "";
    expect(toolsSection.length, "the skill has no tools section").toBeGreaterThan(100);
    const listed = [...toolsSection.matchAll(/^- \*\*`([a-z_]+)`/gm)].map((m) => m[1]!);
    expect(listed.length, "the tools section lists nothing").toBeGreaterThan(3);
    for (const tool of listed) {
      expect(
        implemented.includes(tool),
        `the skill lists ${tool} as a tool and the server does not implement it`,
      ).toBe(true);
    }
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

describe("the video script is the one the programs read", () => {
  /*
    The demo is cut by programs that read video/beats.py, and a person
    reads docs/VIDEO_SCRIPT.md. The document is generated from the
    beats, so this checks the generation was run: every spoken line in
    the code appears verbatim in the document. A script that drifted
    from the video would be the one public text here nobody could
    reproduce.
  */
  const beats = fs.readFileSync(path.join(repo, "video/beats.py"), "utf8");
  const doc = fs.readFileSync(path.join(repo, "docs/VIDEO_SCRIPT.md"), "utf8");

  // Each say=( ... ) block is adjacent string literals; join them.
  const lines = beats
    .split("say=(")
    .slice(1)
    .map((chunk) => chunk.split(/\n\s*\),/)[0] ?? "")
    .map((block) => [...block.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]!.replace(/\\"/g, '"')).join(""));

  it("finds the spoken lines in the code at all", () => {
    expect(lines.length).toBeGreaterThanOrEqual(10);
    for (const line of lines) expect(line.split(" ").length).toBeGreaterThan(5);
  });

  it("has every spoken line in the document, word for word", () => {
    for (const line of lines) {
      expect(doc.includes(line), `docs/VIDEO_SCRIPT.md lacks: ${line.slice(0, 60)}`).toBe(true);
    }
  });

  it("says which device the television footage is", () => {
    // The footage is Amazon's hosted Fire TV; the script must name it and
    // the device image, and must say the console is in frame.
    expect(/Appstore Quality\s+Central/.test(doc)).toBe(true);
    expect(/FOS 14 3P TV/.test(doc)).toBe(true);
    expect(/whole console page/.test(doc)).toBe(true);
  });
});
