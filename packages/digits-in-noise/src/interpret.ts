import type { ScreenResult } from "./types.js";

/**
 * Turning a threshold into something a person should do.
 *
 * This is the part of a screening tool that can hurt somebody, so it is
 * the part with the most rules.
 *
 * A screen sorts people into "probably fine" and "worth getting
 * checked". It does not say what is wrong, how bad it is, or whether
 * anything can be done, because a ratio measured through a television
 * cannot know any of those things. Every string this file produces is
 * written to survive being read by somebody alone in a living room who
 * is frightened, and by a clinician who is unimpressed.
 *
 * The cut-offs are not constants in the code. They live in a named
 * reference with a source attached, because a threshold in decibels only
 * means something relative to the speech material it was measured with.
 * Change the recordings and the numbers move. A project that hard-codes
 * somebody else's cut-off next to its own audio is quoting a figure it
 * has not earned.
 */

export interface NormativeReference {
  /** Short name, shown wherever a number from it is shown. */
  label: string;
  /** Where the distribution came from, in enough detail to look up. */
  source: string;
  /** At or below this ratio, performance is within the expected range. */
  clearAtOrBelowDb: number;
  /** Above this ratio, the screen suggests seeing somebody. */
  referAboveDb: number;
}

/**
 * The reference this project ships with.
 *
 * Diotic digit triplets, meaning the same signal to both ears, which is
 * what a television plays. That detail is not incidental: antiphasic
 * presentation, where the signal is inverted in one ear, produces
 * thresholds about six decibels lower, so a cut-point borrowed from an
 * antiphasic study would refer almost nobody.
 *
 * The numbers below were invented in an earlier version of this file.
 * They sat at -9 and -7 dB because adult diotic thresholds are often
 * described as clustering near -9, which is a statement about where
 * people score rather than about where a screen should draw a line. The
 * published categories draw it three and a half decibels away, and on a
 * screening tool that difference is the difference between telling
 * somebody to see a doctor and telling them they are fine.
 *
 * So the cut-points are now the published ones, cited, and still
 * labelled provisional: our speech material is synthesised rather than
 * the corpus those thresholds were measured with, and speech material
 * moves where a threshold falls. Norming our own needs people. Anything
 * published about a person's hearing has to name which reference
 * produced it.
 */
export const PROVISIONAL_DIOTIC: NormativeReference = {
  label: "Published diotic cut-points, provisionally adopted",
  source:
    "Diotic digits-in-noise categories from the published literature: normal auditory performance at or below -5.55 dB SNR, insufficient between -5.55 and -3.80, poor above -3.80. Close to the UK Biobank cut-points of -5.5 and -3.5. Adopted provisionally because this project's speech material is synthesised rather than the corpus those thresholds were measured with, and material moves where a threshold falls. See docs/METHOD.md.",
  clearAtOrBelowDb: -5.55,
  referAboveDb: -3.8,
};

export type Band = "clear" | "borderline" | "refer" | "unmeasured";

export interface Interpretation {
  band: Band;
  /** One sentence, for the person who just took the test. */
  headline: string;
  /** What to do next, if anything. */
  nextStep: string;
  /** The reference these bands came from, for attribution. */
  reference: NormativeReference;
}

/**
 * What a completed run means.
 *
 * An invalid run is `unmeasured`, never `clear`. Silently upgrading a
 * failed test to good news is the single worst thing this file could do,
 * because the person most likely to produce an unusable run is the
 * person whose hearing is furthest outside the range we can present.
 */
export function interpret(
  result: ScreenResult,
  reference: NormativeReference = PROVISIONAL_DIOTIC,
): Interpretation {
  if (!result.valid) {
    return {
      band: "unmeasured",
      headline: "This test did not produce a usable result.",
      // Advice, never a repeat of the reasons. The reasons belong to the
      // result and a screen that shows both printed the first one twice,
      // which a screenshot caught and no test would have.
      nextStep:
        "Try it again somewhere quiet, with the room as it usually is when you watch. If it keeps coming out like this, that is worth mentioning to a doctor by itself.",
      reference,
    };
  }

  if (result.srtDb <= reference.clearAtOrBelowDb) {
    return {
      band: "clear",
      headline: "You picked out speech in noise about as well as most adults do.",
      nextStep:
        "Nothing to do. If following television still takes effort, that is worth mentioning to a doctor anyway, because this test only looks at one part of hearing.",
      reference,
    };
  }

  if (result.srtDb <= reference.referAboveDb) {
    return {
      band: "borderline",
      headline: "You needed speech a little louder than the noise than most adults do.",
      nextStep:
        "Worth repeating in a week. If it comes out the same, a hearing check is a reasonable thing to ask for at your next appointment.",
      reference,
    };
  }

  return {
    band: "refer",
    headline: "You needed speech much louder than the noise than most adults do.",
    nextStep:
      "This is a good reason to book a hearing test. A screen like this cannot say what is causing it, and some causes are straightforward to treat.",
    reference,
  };
}

/**
 * Every sentence this module can produce, for the tests to inspect.
 *
 * Wording is a safety property here in the way a bounds check is a
 * safety property elsewhere, so it is checked rather than reviewed. A
 * test walks this list and fails if anything in it diagnoses, promises,
 * or tells somebody they are fine when the test did not work.
 */
export function allMessages(
  reference: NormativeReference = PROVISIONAL_DIOTIC,
): string[] {
  const bands: ScreenResult[] = [
    { srtDb: -20, answers: [], reversals: 9, valid: true, problems: [] },
    { srtDb: -8, answers: [], reversals: 9, valid: true, problems: [] },
    { srtDb: 0, answers: [], reversals: 9, valid: true, problems: [] },
    { srtDb: Number.NaN, answers: [], reversals: 0, valid: false, problems: [] },
  ];
  return bands.flatMap((r) => {
    const i = interpret(r, reference);
    return [i.headline, i.nextStep];
  });
}
