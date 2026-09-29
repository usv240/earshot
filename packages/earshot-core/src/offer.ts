import {
  captionShare,
  defaultLevelOptions,
  drift,
  qualifying,
  rehearRatePerHour,
  type LevelOptions,
} from "./level.js";
import type { Reason, Session } from "./types.js";

/**
 * When it is fair to interrupt somebody's film.
 *
 * This is the part of the product that can make it hateful. An
 * application that suggests a hearing test because one action film was
 * loud is an application that gets turned off, and the person it was
 * built for is exactly the person who will not turn it back on.
 *
 * So the rule is conservative, and every piece of it is a refusal rather
 * than a permission:
 *
 * It will not speak without a baseline, because "louder than usual"
 * needs a usual. It will not speak about a single evening, because
 * evenings differ for a hundred reasons that are not hearing. It will
 * not speak in the middle of a programme. It will not speak twice in a
 * season. And if somebody says no twice, it stops asking, permanently,
 * which is a product decision rather than a technical one and is the
 * only version of this that deserves to be in a living room.
 *
 * What it says when it does speak is the evidence, in a sentence, with
 * the number in it. Not a verdict about their hearing. This package does
 * not have one and is not entitled to one.
 */

export interface OfferHistory {
  /** ISO date of the last time we asked. */
  lastOfferedAt?: string;
  /** Times they said no. */
  declines: number;
  /** They have already taken the test. */
  completed: boolean;
}

export interface OfferOptions extends LevelOptions {
  /** Listening this much above their own baseline is the primary signal. */
  driftDb: number;
  /** Backward seeks into dialogue per hour of speech. */
  rehearPerHour: number;
  /** Captions on for this share of recent sittings, having not been. */
  captionShare: number;
  /** Days that must pass between one question and the next. */
  cooldownDays: number;
  /** After this many refusals it never asks again. */
  maxDeclines: number;
  /** Days the evidence must span, so one week cannot trigger it. */
  minSpanDays: number;
}

export function defaultOfferOptions(): OfferOptions {
  return {
    ...defaultLevelOptions(),
    driftDb: 4,
    rehearPerHour: 3,
    captionShare: 0.6,
    cooldownDays: 90,
    maxDeclines: 2,
    minSpanDays: 21,
  };
}

export interface OfferDecision {
  offer: boolean;
  /** The evidence, if there is any. Shown to the person, not hidden. */
  reasons: Reason[];
  /**
   * Why it stayed quiet. Not for the person, for whoever has to answer
   * "why did it never ask me", which is a question a health-adjacent
   * product has to be able to answer.
   */
  waitingFor: string[];
}

const daysBetween = (a: string, b: string) =>
  Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

/**
 * Should the television say something.
 *
 * `now` and `atBoundary` are passed in rather than read from the
 * environment, so the whole rule is a pure function of its inputs and a
 * test can ask it about any day, in any state, without waiting.
 */
export function shouldOffer(
  sessions: Session[],
  history: OfferHistory,
  now: string,
  atBoundary: boolean,
  options: OfferOptions = defaultOfferOptions(),
): OfferDecision {
  const waitingFor: string[] = [];

  if (history.declines >= options.maxDeclines) {
    return { offer: false, reasons: [], waitingFor: ["They have said no; we do not ask again."] };
  }
  if (history.completed) {
    return { offer: false, reasons: [], waitingFor: ["They have already taken the test."] };
  }
  if (history.lastOfferedAt && daysBetween(history.lastOfferedAt, now) < options.cooldownDays) {
    return { offer: false, reasons: [], waitingFor: ["Asked recently."] };
  }

  const usable = qualifying(sessions, options);
  const needed = options.baselineSessions + options.recentSessions;
  if (usable.length < needed) {
    waitingFor.push(
      `${usable.length} of ${needed} sittings with enough dialogue in them.`,
    );
  }

  const d = drift(sessions, options);
  if (d && d.spanDays < options.minSpanDays) {
    waitingFor.push(
      `evidence spans ${d.spanDays} days; it has to span ${options.minSpanDays}.`,
    );
  }

  // The evidence itself. Each of these is a sentence somebody could
  // disagree with out loud, which is the test for whether it is fair to
  // show them.
  const reasons: Reason[] = [];

  if (d && d.driftDb >= options.driftDb) {
    reasons.push({
      kind: "drift",
      value: Number(d.driftDb.toFixed(1)),
      sentence: `Over about ${d.spanDays} days you have been setting the volume roughly ${d.driftDb.toFixed(0)} dB higher than you used to for the same kind of programme.`,
    });
  }

  const rehear = rehearRatePerHour(sessions, options);
  if (rehear !== null && rehear >= options.rehearPerHour) {
    reasons.push({
      kind: "rehear",
      value: Number(rehear.toFixed(1)),
      sentence: `You go back to hear a line again about ${rehear.toFixed(0)} times in every hour of dialogue.`,
    });
  }

  const captions = captionShare(sessions, options);
  if (captions !== null && captions >= options.captionShare) {
    reasons.push({
      kind: "captions",
      value: Number(captions.toFixed(2)),
      sentence: `You have had subtitles on for most of what you watched recently.`,
    });
  }

  // Drift is the signal with physics behind it, so it can stand alone.
  // The behavioural ones are softer and have to agree with each other.
  const hasDrift = reasons.some((r) => r.kind === "drift");
  const behavioural = reasons.filter((r) => r.kind !== "drift").length;
  const enoughEvidence = hasDrift || behavioural >= 2;
  if (!enoughEvidence) {
    waitingFor.push(
      "no sustained change in how you are listening, which is the usual answer.",
    );
  }

  if (!atBoundary) waitingFor.push("something is playing.");

  return {
    offer: waitingFor.length === 0 && enoughEvidence,
    reasons,
    waitingFor,
  };
}

/**
 * What the television actually says.
 *
 * Written to be read once, by somebody who did not ask to be told
 * anything. It states what was noticed, says plainly that it is not a
 * judgement about them, and makes the offer small. A minute or two and a
 * remote is a small thing to ask; a conversation about their hearing is
 * not, and this is not that conversation.
 */
export function explain(reasons: Reason[]): string {
  if (reasons.length === 0) return "";
  const evidence = reasons.map((r) => r.sentence).join(" ");
  return (
    `${evidence} That can happen for all sorts of reasons, including the way ` +
    `programmes are mixed, and on its own it does not mean anything about you. ` +
    `There is a short check you can do from here with the remote, a minute or two, if you want to know more.`
  );
}
