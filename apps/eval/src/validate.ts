import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  defaultOptions,
  runScreen,
  sweep,
  type ListenerOptions,
} from "digits-in-noise";

/**
 * Measuring the hearing test.
 *
 * Every figure this project publishes about how well its screen works
 * comes out of this file, is written to results/validation.json, and is
 * read back by apps/eval/test/claims.test.ts. Nothing about accuracy is
 * typed into a README by hand, because a number nobody re-derives is a
 * number that was only true on the day it was written.
 *
 * The method is the one the validation literature uses, with simulated
 * listeners standing in for recruited ones. A simulated ear has a
 * threshold we chose, so the question "is the answer right" has an
 * answer. What we report is what those papers report: how far the
 * estimate sits from the truth, how much it moves when the same ear
 * takes the test again, and whether either gets worse at the edges of
 * the range or when the listener is careless.
 *
 * What this cannot tell us: whether our speech material behaves like
 * the recorded corpora the published thresholds came from. Simulation
 * validates the procedure, not the audio. That gap is stated in
 * docs/EVAL.md rather than papered over, and it is why the reference
 * bands in the library are labelled provisional.
 *
 * Reproduce: npm run validate
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");

/** The ear the headline figures describe: an ordinary adult. */
const REFERENCE: ListenerOptions = {
  trueSrtDb: -9,
  slopePerDb: 0.18,
  lapseRate: 0.02,
};

const RUNS = 2000;
const RANGE_RUNS = 500;

const round = (x: number, places = 3) => Number(x.toFixed(places));

function main(): void {
  const headline = sweep(REFERENCE, RUNS);

  // Across the span of hearing the screen is meant to sort. If bias
  // grows at one end, the screen would be systematically kind or
  // systematically alarming to exactly the people it exists for.
  const acrossRange = [-14, -12, -10, -9, -7, -5, -3].map((trueSrtDb) => {
    const s = sweep({ ...REFERENCE, trueSrtDb }, RANGE_RUNS);
    return {
      trueSrtDb,
      biasDb: round(s.biasDb),
      sdDb: round(s.sdDb),
      worstDb: round(s.worstDb, 2),
      rejected: s.rejected,
    };
  });

  // Nobody sits still for 24 trials. Some answers are lost to a
  // doorbell, a sneeze, a thumb on the wrong button.
  const carelessness = [0, 0.02, 0.05, 0.1].map((lapseRate) => {
    const s = sweep({ ...REFERENCE, lapseRate }, RANGE_RUNS);
    return { lapseRate, biasDb: round(s.biasDb), sdDb: round(s.sdDb) };
  });

  // A shallow psychometric slope means performance improves only
  // gradually with a better ratio, which is common in older listeners.
  // It is the condition under which any adaptive procedure degrades.
  const slopes = [0.1, 0.14, 0.18, 0.22].map((slopePerDb) => {
    const s = sweep({ ...REFERENCE, slopePerDb }, RANGE_RUNS);
    return { slopePerDb, biasDb: round(s.biasDb), sdDb: round(s.sdDb) };
  });

  // The two ways a run must fail rather than return a tidy number.
  const outOfRange = {
    betterThanRange: runScreen({ ...REFERENCE, trueSrtDb: -60 }, 1),
    worseThanRange: runScreen({ ...REFERENCE, trueSrtDb: 40 }, 1),
  };

  const results = {
    generatedAt: new Date().toISOString().slice(0, 10),
    method:
      "Simulated listeners with known speech reception thresholds answer the adaptive procedure. Bias is the mean estimate minus the truth; the standard deviation is test-retest spread for one unchanging ear.",
    procedure: defaultOptions(),
    referenceListener: REFERENCE,
    headline: {
      runs: headline.runs,
      biasDb: round(headline.biasDb),
      sdDb: round(headline.sdDb),
      worstDb: round(headline.worstDb, 2),
      rejected: headline.rejected,
    },
    acrossRange,
    carelessness,
    slopes,
    refusals: {
      betterThanRangeIsRejected: !outOfRange.betterThanRange.valid,
      worseThanRangeIsRejected: !outOfRange.worseThanRange.valid,
    },
    comparison: {
      publishedTestRetestSdDb: [0.7, 1.2],
      note:
        "Reported test-retest standard deviations for digits-in-noise screens sit in this range. Ours is a simulation of the procedure, not a trial with recruited listeners, and is not a substitute for one.",
    },
  };

  const out = path.join(repo, "apps/eval/results/validation.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(results, null, 2) + "\n", "utf8");

  console.log(`bias ${results.headline.biasDb} dB, test-retest sd ${results.headline.sdDb} dB, over ${RUNS} runs`);
  console.log(`worst single miss ${results.headline.worstDb} dB; ${results.headline.rejected} runs refused`);
  console.log(`written to ${path.relative(repo, out)}`);
}

main();
