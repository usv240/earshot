/**
 * Earshot's listening model: what a player can see, and what it is
 * entitled to conclude from it.
 *
 * The boundary this package holds is the important part. It measures
 * listening, never hearing. It can say that a household is setting the
 * volume four decibels above where it used to for the same kind of
 * programme; it cannot say anything about their ears, and there is no
 * field anywhere in it that holds such a thing.
 *
 * The measurement is the digits-in-noise test in the sibling package.
 * This one decides when it is fair to offer it, and then gets out of
 * the way.
 */

export * from "./types.js";
export * from "./level.js";
export * from "./offer.js";
export * from "./record.js";
