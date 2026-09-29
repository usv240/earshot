import { drift, listeningLevelDb, median, qualifying, type LevelOptions } from "./level.js";
import type { Session } from "./types.js";

/**
 * The obvious alternative, measured rather than dismissed.
 *
 * Anybody asked to build "notice when somebody is turning the television
 * up" would track the volume setting. That is what the 2010 laryngology
 * paper did by asking patients, and what the Intel patent claims for a
 * device. It is the reasonable engineer's first design, so it is the
 * baseline this project has to beat, with a number.
 *
 * The difference between the two is one term. Earshot adds the
 * programme's own dialogue loudness, so a viewer who turns up a quietly
 * mixed film registers no change: they corrected for the material, not
 * for their ears. Volume-only cannot see the material, so it reads that
 * correction as decline.
 *
 * Which model is right is not a matter of taste. It is a false-alarm
 * rate, and it can be measured on sittings.
 */

/** Volume-only drift, the baseline: the same arithmetic with no programme term. */
export function volumeOnlyDriftDb(
  sessions: Session[],
  options: LevelOptions,
): number | null {
  const usable = qualifying(sessions, options);
  const needed = options.baselineSessions + options.recentSessions;
  if (usable.length < needed) return null;
  const levels = usable.map((s) => options.curve.gainDb(s.volume));
  const baseline = median(levels.slice(0, options.baselineSessions));
  const recent = median(levels.slice(-options.recentSessions));
  return recent - baseline;
}

/** Earshot's drift, for the same sittings, through the same code the offer rule uses. */
export function dialogueReferencedDriftDb(
  sessions: Session[],
  options: LevelOptions,
): number | null {
  return drift(sessions, options)?.driftDb ?? null;
}

export interface BaselineComparison {
  /** How many synthetic households were scored. */
  households: number;
  /**
   * Households whose viewers only ever compensated for a change in the
   * programmes' mixing. Their ears did not change. A model that fires on
   * them is wrong, and this is how often each one does.
   */
  compensating: {
    volumeOnlyFalseAlarms: number;
    dialogueReferencedFalseAlarms: number;
  };
  /**
   * Households whose viewers really did creep upward for the same kind
   * of programme. A model that stays quiet on them is missing the case
   * the product exists for.
   */
  creeping: {
    volumeOnlyDetections: number;
    dialogueReferencedDetections: number;
  };
  thresholdDb: number;
}

/**
 * Score both models on households whose truth is known by construction.
 *
 * Two kinds of household, same number of each. In the first, the viewer's
 * ears never change but the second half of what they watch is mixed
 * quieter, and they turn it up by exactly the difference. In the second,
 * the mixing never changes and the viewer creeps upward. The first is a
 * trap for a volume-only model. The second is what both should catch.
 *
 * The listening levels are chosen so each household's true change is
 * unambiguous relative to the threshold, so the count is a property of
 * the model rather than of the noise.
 */
export function compareAgainstVolumeOnly(
  make: (kind: "compensating" | "creeping", seed: number) => Session[],
  options: LevelOptions,
  thresholdDb: number,
  households = 200,
): BaselineComparison {
  let volumeOnlyFalse = 0;
  let dialogueFalse = 0;
  let volumeOnlyHit = 0;
  let dialogueHit = 0;

  for (let seed = 0; seed < households; seed++) {
    const compensating = make("compensating", seed);
    if ((volumeOnlyDriftDb(compensating, options) ?? 0) >= thresholdDb) volumeOnlyFalse++;
    if ((dialogueReferencedDriftDb(compensating, options) ?? 0) >= thresholdDb) dialogueFalse++;

    const creeping = make("creeping", seed);
    if ((volumeOnlyDriftDb(creeping, options) ?? 0) >= thresholdDb) volumeOnlyHit++;
    if ((dialogueReferencedDriftDb(creeping, options) ?? 0) >= thresholdDb) dialogueHit++;
  }

  return {
    households,
    compensating: {
      volumeOnlyFalseAlarms: volumeOnlyFalse,
      dialogueReferencedFalseAlarms: dialogueFalse,
    },
    creeping: {
      volumeOnlyDetections: volumeOnlyHit,
      dialogueReferencedDetections: dialogueHit,
    },
    thresholdDb,
  };
}

/** Re-exported so a caller can show the level it compared. */
export { listeningLevelDb };
