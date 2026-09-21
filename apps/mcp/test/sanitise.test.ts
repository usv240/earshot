import { describe, expect, it } from "vitest";
import { sanitiseModelText } from "../src/sanitise";

/**
 * The house style, enforced rather than requested.
 *
 * Every system prompt in these projects says to use no dashes as
 * punctuation. The model agrees and then uses them anyway. That was found
 * live on a sibling project's dashboard, in a note read by someone who
 * had just been told something about their own speech.
 */
describe("model text is cleaned before anyone reads it", () => {
  it("turns a bracketing pair into commas", () => {
    expect(
      sanitiseModelText("It found nine features\u2014including filler rate\u2014that differ."),
    ).toBe("It found nine features, including filler rate, that differ.");
  });

  it("turns a spaced dash into a comma", () => {
    expect(sanitiseModelText("A quiet night \u2014 nobody was woken.")).toBe(
      "A quiet night, nobody was woken.",
    );
  });

  it("keeps a numeric range meaning a range", () => {
    // A comma here would turn "3 to 5" into a list of two numbers.
    expect(sanitiseModelText("A range of 3\u20135 nights.")).toBe("A range of 3 to 5 nights.");
  });

  it("leaves clean text exactly as it is", () => {
    const clean = "Good morning. Everything was quiet.";
    expect(sanitiseModelText(clean)).toBe(clean);
  });

  it("never leaves a doubled comma behind", () => {
    const out = sanitiseModelText("A\u2014B\u2014C");
    expect(out).not.toContain(",,");
    expect(out).not.toContain(", ,");
  });

  it("collapses stray whitespace without eating words", () => {
    expect(sanitiseModelText("Two   spaces  collapse.")).toBe("Two spaces collapse.");
  });
});
