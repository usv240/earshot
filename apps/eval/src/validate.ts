import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import {
  defaultOptions,
  interpret,
  PROVISIONAL_DIOTIC,
  runScreen,
  sweep,
  type ListenerOptions,
} from "digits-in-noise";
import {
  AMPLITUDE_CURVE,
  compareAgainstVolumeOnly,
  defaultLevelOptions,
  defaultOfferOptions,
  type Session,
} from "@earshot/core";

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

  /*
    What the decision rule does to a listener at a given true threshold.

    This is the analysis a screening paper reports, and it needs no
    assumption about how common anything is. Sensitivity and specificity
    require a population, and inventing a plausible-looking distribution
    of thresholds would be making up the very thing the numbers are
    supposed to come from. Referral probability as a function of the
    truth does not: it is a property of the procedure, its measurement
    noise, and where the cut-point sits.

    Read it as the answer to "if somebody really is this bad, how often
    does this screen say so", and the mirror, "if somebody really is
    fine, how often does it bother them anyway".
  */
  const cut = PROVISIONAL_DIOTIC.referAboveDb;
  const referralCurve = [-10, -8, -6, -5, -4, -3, -2, -1, 0].map((trueSrtDb) => {
    let referred = 0;
    let usable = 0;
    for (let i = 0; i < RANGE_RUNS; i++) {
      const result = runScreen({ ...REFERENCE, trueSrtDb }, 90_000 + i);
      if (!result.valid) continue;
      usable++;
      if (interpret(result).band === "refer") referred++;
    }
    return {
      trueSrtDb,
      /** Distance from the cut-point. Negative is better hearing. */
      relativeToCutDb: round(trueSrtDb - cut, 2),
      referredPercent: usable ? round((referred / usable) * 100, 1) : Number.NaN,
      runs: usable,
    };
  });

  /*
    The obvious alternative, beaten with a number.

    Anybody asked to notice somebody turning the television up would
    track the volume setting. That is the reasonable engineer's first
    design and it is what the 2010 paper and the Intel patent both do.
    Earshot adds one term, the programme's own dialogue loudness, and
    this measures what that term is worth.

    Two hundred households of each kind. Compensating: the viewer's ears
    never change, but the second half of what they watch is mixed
    quieter and they turn it up by exactly the difference. A model that
    fires on them is accusing somebody of going deaf on the strength of
    the sound design. Creeping: the mixing never changes and the viewer
    really does drift upward. Both models should catch these.
  */
  const DAY = 86_400_000;
  const makeHousehold = (kind: "compensating" | "creeping", seed: number): Session[] => {
    const start = Date.parse("2026-01-01") + (seed % 7) * DAY;
    return Array.from({ length: 20 }, (_, i) => {
      const late = i >= 10;
      // Compensating: the later programmes are 6 dB quieter and the viewer
      // matches it exactly. Creeping: same programmes, viewer goes up 6 dB.
      // Quieter by exactly what half-to-full volume adds: 6.02 dB, not 6.
      const dialogueLufs = kind === "compensating" && late ? -27 + AMPLITUDE_CURVE.gainDb(0.5) : -27;
      const volume = late ? 1 : 0.5;
      return {
        startedAt: new Date(start + i * 4 * DAY).toISOString().slice(0, 10),
        programme: { id: `p${i}`, dialogueLufs, speechSeconds: 1800 },
        volume,
        watchedSeconds: 3600,
        captionsOn: false,
        rehearSeeks: 0,
      };
    });
  };
  const levelOptions = { ...defaultLevelOptions(), curve: AMPLITUDE_CURVE };
  const baseline = compareAgainstVolumeOnly(
    makeHousehold,
    levelOptions,
    defaultOfferOptions().driftDb,
    200,
  );

  /*
    What each length of test costs.

    The answer to "why twenty-four trials" and "can it be shorter", with
    a number rather than an opinion. A clearly-fine listener sits 2.2 dB
    inside the cut-off; a clearly-struggling one sits 1.8 dB outside it.
    The columns are how often each length refuses to answer, wrongly
    refers the fine one, and catches the struggling one.
  */
  const lengthCost = [6, 12, 18, 24].map((trials) => {
    const s = sweep(REFERENCE, 1000, { trials });
    let fineReferred = 0;
    let strugglingCaught = 0;
    for (let i = 0; i < RANGE_RUNS; i++) {
      const fine = runScreen({ ...REFERENCE, trueSrtDb: -6 }, 70_000 + i, { trials });
      if (fine.valid && interpret(fine).band === "refer") fineReferred++;
      const bad = runScreen({ ...REFERENCE, trueSrtDb: -2 }, 90_000 + i, { trials });
      if (bad.valid && interpret(bad).band === "refer") strugglingCaught++;
    }
    return {
      trials,
      sdDb: Number.isFinite(s.sdDb) ? round(s.sdDb) : null,
      refusedOf1000: s.rejected,
      fineWronglyReferredPercent: round((fineReferred / RANGE_RUNS) * 100, 1),
      strugglingCaughtPercent: round((strugglingCaught / RANGE_RUNS) * 100, 1),
    };
  });

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
    cutPointDb: cut,
    baseline,
    lengthCost,
    referralCurve,
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
  const atCut = referralCurve.find((r) => r.trueSrtDb === -4);
  const clearlyFine = referralCurve.find((r) => r.trueSrtDb === -8);
  console.log(
    `referral rule at ${cut} dB: a listener at -4 dB is referred ` +
      `${atCut?.referredPercent}% of the time, one at -8 dB ${clearlyFine?.referredPercent}%`,
  );
  console.log(
    `volume-only baseline: ${baseline.compensating.volumeOnlyFalseAlarms}/${baseline.households} false alarms on compensating households; ` +
      `dialogue-referenced: ${baseline.compensating.dialogueReferencedFalseAlarms}/${baseline.households}`,
  );
  console.log(`written to ${path.relative(repo, out)}`);
}

main();
