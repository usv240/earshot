/**
 * digits-in-noise: the adaptive hearing screen, as a library.
 *
 * The digits-in-noise test asks a listener to repeat three spoken digits
 * buried in noise, and adapts how hard that is until it finds the ratio
 * at which they get half of them right. That ratio, the speech reception
 * threshold, is what the test reports.
 *
 * It is the instrument behind most self-administered hearing screens,
 * including the one the World Health Organization ships, for two
 * reasons. It measures a ratio rather than a level, so it survives
 * hardware nobody calibrated. And the response is three digits, so it
 * needs no reading, no language beyond counting, and no touchscreen.
 *
 * There are good implementations of this in Java and in native mobile
 * apps. There was not one in TypeScript, which is why this package
 * exists: the same engine has to run in a browser, in a React Native app
 * on a television, and in a validation harness answering its own trials.
 *
 * What this package is not: a diagnosis. It produces a threshold and a
 * judgement about whether that threshold is worth taking to a clinician.
 * Deciding what is wrong with somebody's ears is a different job, done
 * by someone qualified to do it.
 */

export * from "./types.js";
export * from "./procedure.js";
export * from "./listener.js";
export * from "./interpret.js";
