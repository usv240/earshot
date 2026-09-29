import { describe, expect, it } from "vitest";
import {
  defaultOfferOptions,
  explain,
  shouldOffer,
  type OfferHistory,
  type Session,
} from "../src/index.js";

/**
 * The rule that decides whether a television says something about your
 * hearing while you are trying to watch a film.
 *
 * Getting this wrong does not produce a wrong number, it produces a
 * product people switch off, and the person most likely to switch it off
 * is the one it was built for. So almost every test here checks that it
 * stayed quiet.
 */

function run(
  n: number,
  over: (i: number) => Partial<Session>,
  everyDays = 2,
  from = "2026-01-01",
): Session[] {
  const start = Date.parse(from);
  return Array.from({ length: n }, (_, i) => ({
    startedAt: new Date(start + i * everyDays * 86_400_000).toISOString().slice(0, 10),
    programme: { id: "p", dialogueLufs: -27, speechSeconds: 1800 },
    volume: 0.5,
    watchedSeconds: 3600,
    captionsOn: false,
    rehearSeeks: 0,
    ...over(i),
  }));
}

const fresh: OfferHistory = { declines: 0, completed: false };
const LATER = "2026-06-01";

/** Enough evidence that only the rule under test can be stopping it. */
const crept = () => run(20, (i) => ({ volume: i < 10 ? 0.5 : 1 }));

describe("staying quiet", () => {
  it("says nothing before there is a baseline to compare against", () => {
    const d = shouldOffer(run(6, () => ({})), fresh, LATER, true);
    expect(d.offer).toBe(false);
    expect(d.waitingFor.join(" ")).toMatch(/sittings with enough dialogue/);
  });

  it("says nothing in the middle of a programme", () => {
    const d = shouldOffer(crept(), fresh, LATER, false);
    expect(d.offer).toBe(false);
    expect(d.waitingFor).toContain("something is playing.");
  });

  it("says nothing about a fortnight, however loud it was", () => {
    // Three weeks is the floor. Evenings differ for a hundred reasons
    // that are not hearing, and a run of them is not a trend.
    const short = run(20, (i) => ({ volume: i < 10 ? 0.5 : 1 }), 1);
    const d = shouldOffer(short, fresh, LATER, true);
    expect(d.offer).toBe(false);
    expect(d.waitingFor.join(" ")).toMatch(/spans 19 days/);
  });

  it("says nothing when nothing changed, which is the usual answer", () => {
    const d = shouldOffer(run(20, () => ({ volume: 0.5 })), fresh, LATER, true);
    expect(d.offer).toBe(false);
    expect(d.reasons).toEqual([]);
    expect(d.waitingFor.join(" ")).toMatch(/no sustained change/);
  });

  it("does not ask twice in a season", () => {
    const d = shouldOffer(
      crept(),
      { ...fresh, lastOfferedAt: "2026-05-20" },
      "2026-06-01",
      true,
    );
    expect(d.offer).toBe(false);
    expect(d.waitingFor).toContain("Asked recently.");
  });

  it("never asks again once somebody has said no twice", () => {
    /*
      The product promise, tested rather than intended.

      Overwhelming evidence, a year gone by, and it still does not ask.
      A health prompt that keeps coming back after being refused is not
      persistent, it is a thing people learn to dread, and this is the
      only version of it that belongs in somebody's living room.
    */
    const shouting = run(40, (i) => ({
      volume: i < 20 ? 0.3 : 1,
      captionsOn: i >= 20,
      rehearSeeks: i >= 20 ? 20 : 0,
    }));
    for (const now of ["2026-06-01", "2027-01-01", "2030-01-01"]) {
      const d = shouldOffer(shouting, { declines: 2, completed: false }, now, true);
      expect(d.offer, `still asking on ${now}`).toBe(false);
      expect(d.reasons).toEqual([]);
    }
  });

  it("stops once they have taken the test", () => {
    const d = shouldOffer(crept(), { declines: 0, completed: true }, LATER, true);
    expect(d.offer).toBe(false);
  });
});

describe("speaking up", () => {
  it("offers when a household has crept upward over months", () => {
    const d = shouldOffer(crept(), fresh, LATER, true);
    expect(d.offer).toBe(true);
    expect(d.waitingFor).toEqual([]);
    const drift = d.reasons.find((r) => r.kind === "drift");
    expect(drift).toBeTruthy();
    expect(drift!.value).toBeCloseTo(6, 0);
  });

  it("will not act on one soft signal by itself", () => {
    // Subtitles alone are not evidence of anything. Plenty of people
    // watch everything with them on and hear perfectly well.
    const captionsOnly = run(20, () => ({ volume: 0.5, captionsOn: true }));
    const d = shouldOffer(captionsOnly, fresh, LATER, true);
    expect(d.offer).toBe(false);
    expect(d.reasons.map((r) => r.kind)).toEqual(["captions"]);
  });

  it("acts when two soft signals agree, with no change in volume at all", () => {
    /*
      This is the case the volume paper cannot see and a player can.
      Somebody whose set is already as loud as they want it has nowhere
      left to go, so they turn on subtitles and rewind instead. The
      ceiling hides exactly the people furthest along.
    */
    const stuck = run(20, () => ({ volume: 0.5, captionsOn: true, rehearSeeks: 6 }));
    const d = shouldOffer(stuck, fresh, LATER, true);
    expect(d.offer).toBe(true);
    expect(d.reasons.map((r) => r.kind).sort()).toEqual(["captions", "rehear"]);
  });

  it("quotes the number behind every sentence it shows", () => {
    // Nothing is asserted at a person without the figure that produced
    // it, so they can disagree with it out loud.
    const d = shouldOffer(crept(), fresh, LATER, true);
    for (const reason of d.reasons) {
      expect(Number.isFinite(reason.value)).toBe(true);
      expect(reason.sentence).toMatch(/[0-9]/);
    }
  });
});

describe("what it says", () => {
  const options = defaultOfferOptions();

  it("says nothing when there is nothing to say", () => {
    expect(explain([])).toBe("");
  });

  it("never claims anything about the person's hearing", () => {
    /*
      The boundary this package exists to hold. It measures listening.
      The measurement of hearing is the test, and until somebody takes
      it there is no such measurement to report.
    */
    const d = shouldOffer(crept(), fresh, LATER, true);
    const text = explain(d.reasons);
    for (const forbidden of [
      /\bhearing loss\b/i,
      /\bdeaf\b/i,
      // Not a blanket ban on the word "you". The sentences are supposed
      // to be about what somebody did, so "you have been setting the
      // volume" is exactly right and "you have hearing loss" is not.
      // The first version of this banned both and failed on its own
      // correct output.
      /\byou (?:have|are)\b[^.]{0,30}\b(?:hearing loss|deaf|impair|condition|damage)\b/i,
      /\byour hearing (?:is|has|was)\b/i,
      /\bdiagnos/i,
      /\byour hearing is\b/i,
    ]) {
      expect(forbidden.test(text), `${forbidden} matched: ${text}`).toBe(false);
    }
  });

  it("offers an explanation that is not about the person", () => {
    // Programmes really are mixed badly. Saying so first is both true
    // and the difference between an offer and an accusation.
    const text = explain(shouldOffer(crept(), fresh, LATER, true).reasons);
    expect(text).toMatch(/mixed/i);
    expect(text).toMatch(/does not mean anything about you/i);
  });

  it("keeps the ask small", () => {
    const text = explain(shouldOffer(crept(), fresh, LATER, true).reasons);
    expect(text).toMatch(/a minute or two/);
    expect(text).toMatch(/if you want/i);
  });

  it("has no setting that would let it nag", () => {
    // A cooldown of a few days, or unlimited refusals, would each turn
    // this into something else. They are defaults somebody could change,
    // so the shipped values are pinned.
    expect(options.cooldownDays).toBeGreaterThanOrEqual(60);
    expect(options.maxDeclines).toBeLessThanOrEqual(2);
    expect(options.minSpanDays).toBeGreaterThanOrEqual(21);
  });
});
