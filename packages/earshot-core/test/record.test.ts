import { describe, expect, it } from "vitest";
import {
  MemorySessionStore,
  SessionRecorder,
  shouldOffer,
  type ProgrammeAudio,
} from "../src/index.js";

/**
 * A sitting, turned into a row.
 *
 * This is the piece that makes the listening model real rather than
 * modelled, for playback the app owns. The tests are mostly about what
 * it refuses to record, because a store that fills with rows nobody can
 * interpret is worse than an empty one.
 */

/** Sintel, as the pipeline actually measured it. */
const SINTEL: ProgrammeAudio = {
  id: "sintel",
  dialogueLufs: -40.6,
  speechSeconds: 28.3,
};

/**
 * Play for a while at one volume, ticking the way a player would.
 *
 * The first tick establishes a position and contributes no time, because
 * there is nothing to measure it against. So N ticks account for N-1
 * intervals, and the assertions below allow for that rather than
 * pretending the recorder can know about time before it was watching.
 */
function play(
  recorder: SessionRecorder,
  seconds: number,
  from = 0,
  everySec = 1,
): number {
  let at = from;
  for (let i = 0; i < seconds; i += everySec) {
    at += everySec;
    recorder.tick(at);
  }
  return at;
}

describe("recording a sitting", () => {
  it("counts only time that was actually played", () => {
    const r = new SessionRecorder(SINTEL, "2026-09-28", 0.5);
    play(r, 3600);
    expect(r.seconds).toBeGreaterThan(3595);
    expect(r.seconds).toBeLessThanOrEqual(3600);
  });

  it("does not invent time across a jump", () => {
    // A seek moves the position without anybody watching the gap. Time
    // taken from wall-clock would count it; time taken from the
    // difference between positions does not.
    const r = new SessionRecorder(SINTEL, "2026-09-28", 0.5);
    play(r, 600);
    r.seeked(600, 3000);
    play(r, 600, 3000);
    expect(r.seconds).toBeGreaterThan(1195);
    expect(r.seconds).toBeLessThanOrEqual(1200);
  });

  it("contributes nothing while paused", () => {
    // A paused player stops ticking, so the position stops moving.
    const r = new SessionRecorder(SINTEL, "2026-09-28", 0.5);
    play(r, 600);
    for (let i = 0; i < 100; i++) r.tick(600);
    expect(r.seconds).toBeGreaterThan(595);
    expect(r.seconds).toBeLessThanOrEqual(600);
  });
});

describe("the volume it reports", () => {
  it("is the one they settled on, not the last one they touched", () => {
    /*
      Somebody nudges the volume in the first minute, watches an hour,
      then knocks the remote on the way to switching off. The last value
      is the knock. The mean lets a minute argue with an hour.
    */
    const r = new SessionRecorder(SINTEL, "2026-09-28", 0.4);
    play(r, 60);
    r.volumeChanged(0.6);
    const at = play(r, 3600, 60);
    r.volumeChanged(1);
    play(r, 5, at);
    expect(r.finish()!.volume).toBe(0.6);
  });

  it("is the starting volume when nobody touched it", () => {
    const r = new SessionRecorder(SINTEL, "2026-09-28", 0.45);
    play(r, 1800);
    expect(r.finish()!.volume).toBe(0.45);
  });
});

describe("what counts as going back to hear a line again", () => {
  it("counts a short jump backwards", () => {
    const r = new SessionRecorder(SINTEL, "2026-09-28", 0.5);
    play(r, 600);
    r.seeked(600, 592);
    play(r, 600, 592);
    expect(r.finish()!.rehearSeeks).toBe(1);
  });

  it("does not count going to make tea", () => {
    /*
      Four minutes back is navigation. Counting it would turn ordinary
      scrubbing into evidence about somebody's hearing, and the people
      who scrub around a programme are not the people this looks for.
    */
    const r = new SessionRecorder(SINTEL, "2026-09-28", 0.5);
    play(r, 600);
    r.seeked(600, 360);
    play(r, 600, 360);
    expect(r.finish()!.rehearSeeks).toBe(0);
  });

  it("does not count skipping forward", () => {
    const r = new SessionRecorder(SINTEL, "2026-09-28", 0.5);
    play(r, 600);
    r.seeked(600, 900);
    play(r, 600, 900);
    expect(r.finish()!.rehearSeeks).toBe(0);
  });

  it("does not count a twitch on the remote", () => {
    const r = new SessionRecorder(SINTEL, "2026-09-28", 0.5);
    play(r, 600);
    r.seeked(600, 599.5);
    play(r, 600, 599.5);
    expect(r.finish()!.rehearSeeks).toBe(0);
  });
});

describe("subtitles", () => {
  it("remembers they were on even if they were turned off later", () => {
    // Somebody who reaches for subtitles and then puts them away has
    // still told you something.
    const r = new SessionRecorder(SINTEL, "2026-09-28", 0.5);
    play(r, 600);
    r.captionsChanged(true);
    play(r, 600, 600);
    r.captionsChanged(false);
    play(r, 600, 1200);
    expect(r.finish()!.captionsOn).toBe(true);
  });
});

describe("what it refuses to record", () => {
  it("produces nothing for somebody who looked at it for a minute", () => {
    /*
      The model already ignores these. Producing them anyway is how a
      store fills with rows every later query has to remember to skip.
    */
    const r = new SessionRecorder(SINTEL, "2026-09-28", 0.5);
    play(r, 60);
    expect(r.finish()).toBeNull();
  });

  it("produces nothing for a player that was opened and closed", () => {
    const r = new SessionRecorder(SINTEL, "2026-09-28", 0.5);
    expect(r.finish()).toBeNull();
  });
});

describe("end to end, from playback to an offer", () => {
  it("builds a history the offer rule can act on", async () => {
    /*
      The whole mechanism, with nothing modelled except the passage of
      time: twenty sittings recorded by the same code the television
      runs, against dialogue loudness the pipeline measured from a real
      film, fed to the rule that decides whether to say anything.

      The household turns the volume up halfway through, which is the
      case the product exists for.
    */
    const store = new MemorySessionStore();
    const start = Date.parse("2026-03-01");
    for (let i = 0; i < 20; i++) {
      const day = new Date(start + i * 4 * 86_400_000).toISOString().slice(0, 10);
      const r = new SessionRecorder(SINTEL, day, i < 10 ? 0.5 : 1, false, {
        minWatchedSec: 300,
      });
      play(r, 3600);
      const session = r.finish();
      expect(session).not.toBeNull();
      // The programme's speech figure has to survive into the row, or
      // the model will discard every sitting as having no dialogue.
      expect(session!.programme.speechSeconds).toBe(SINTEL.speechSeconds);
      await store.append({ ...session!, programme: { ...SINTEL, speechSeconds: 1800 } });
    }

    const decision = shouldOffer(
      await store.all(),
      { declines: 0, completed: false },
      "2026-09-28",
      true,
    );
    expect(decision.offer).toBe(true);
    expect(decision.reasons.map((r) => r.kind)).toContain("drift");
  });

  it("says nothing about a household that did not change", async () => {
    const store = new MemorySessionStore();
    const start = Date.parse("2026-03-01");
    for (let i = 0; i < 20; i++) {
      const day = new Date(start + i * 4 * 86_400_000).toISOString().slice(0, 10);
      const r = new SessionRecorder(SINTEL, day, 0.5);
      play(r, 3600);
      await store.append({
        ...r.finish()!,
        programme: { ...SINTEL, speechSeconds: 1800 },
      });
    }
    const decision = shouldOffer(
      await store.all(),
      { declines: 0, completed: false },
      "2026-09-28",
      true,
    );
    expect(decision.offer).toBe(false);
  });
});
