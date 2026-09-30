import { interpret, PROVISIONAL_DIOTIC, type NormativeReference } from "./interpret.js";
import type { ScreenResult } from "./types.js";

/**
 * One page for the doctor.
 *
 * The site's first sentence promises it, so it has to exist, and it has
 * to be the same object whether the run was scored or refused: a
 * refusal with its reasons is as useful to a clinician as a number,
 * and more honest than a number with a caveat. The page is data, not
 * markup, so the television, the browser and a test can all render it,
 * and so every sentence on it passes through the same wording checks
 * as a result on screen: it never names a condition, never promises an
 * outcome, and never turns a run that did not work into good news.
 */

export interface DoctorPage {
  title: string;
  /** ISO date of the run, as given. */
  date: string;
  /** Label and value pairs, in the order a clinician would read them. */
  facts: { label: string; value: string }[];
  /** What the screen said to the person, verbatim. */
  headline: string;
  nextStep: string;
  /** Why a run was refused, if it was. Empty when it was scored. */
  refusals: string[];
  /** What this page is and is not. Fixed, and tested. */
  scope: string[];
  /** The reference the bands came from. */
  reference: string;
}

export const SCOPE: string[] = [
  "This is a speech-in-noise screen, the digits-in-noise procedure, taken at home on a television or a computer without calibrated equipment. It measures the signal-to-noise ratio at which the listener repeats half of three-digit strings correctly. Because it is a ratio, the playback level does not change it.",
  "It is not a hearing test, not a measure of the ear, and not an assessment of any kind. It says nothing about cause. It is one number and the conditions it was taken under, so that a professional can decide whether a proper test is worth doing.",
  "The procedure has been checked against simulated listeners with known thresholds. It has not been validated against a clinic on any person, and this page says so.",
];

export function doctorPage(
  result: ScreenResult,
  opts: { date: string; rounds: number; device: string },
  reference: NormativeReference = PROVISIONAL_DIOTIC,
): DoctorPage {
  const reading = interpret(result, reference);
  const facts: { label: string; value: string }[] = [
    { label: "Taken on", value: opts.date },
    { label: "Where", value: opts.device },
    { label: "Rounds", value: String(opts.rounds) },
    {
      label: "Result",
      value: result.valid
        ? `${result.srtDb.toFixed(1)} dB signal to noise, speech reception threshold`
        : "Not scored",
    },
  ];
  if (result.valid) {
    facts.push({ label: "Reversals reached", value: String(result.reversals) });
  }
  return {
    title: "Earshot: one page for your doctor",
    date: opts.date,
    facts,
    headline: reading.headline,
    nextStep: reading.nextStep,
    refusals: result.valid ? [] : [...result.problems],
    scope: SCOPE,
    reference: `${reading.reference.label}. ${reading.reference.source}`,
  };
}

/** Every sentence a doctor page can carry, for the wording tests. */
export function allDoctorPageText(reference: NormativeReference = PROVISIONAL_DIOTIC): string[] {
  const runs: ScreenResult[] = [
    { srtDb: -20, answers: [], reversals: 9, valid: true, problems: [] },
    { srtDb: -8, answers: [], reversals: 9, valid: true, problems: [] },
    { srtDb: 0, answers: [], reversals: 9, valid: true, problems: [] },
    { srtDb: Number.NaN, answers: [], reversals: 0, valid: false, problems: ["the track never settled"] },
  ];
  const opts = { date: "2026-09-30", rounds: 24, device: "a computer" };
  return runs.flatMap((r) => {
    const p = doctorPage(r, opts, reference);
    return [p.title, p.headline, p.nextStep, ...p.refusals, ...p.scope, p.reference, ...p.facts.map((f) => `${f.label}: ${f.value}`)];
  });
}
