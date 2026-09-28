import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The one measurement in this project taken from a real programme.
 *
 * Everything else about the pipeline is checked against fixtures, which
 * verifies the arithmetic and cannot verify that the arithmetic was ever
 * pointed at anything. Running it on two minutes of Sintel found three
 * defects in a row, none of which any fixture could have surfaced:
 *
 *   an ffmpeg option removed two major versions ago, so the loudness
 *   pass had never executed at all;
 *
 *   an extraction that averaged six channels to one, which in a
 *   surround mix divides the dialogue by six because the dialogue is a
 *   channel rather than a blend, and reported a film seventeen decibels
 *   below anything a broadcast would ship;
 *
 *   and then both figures measured from the centre channel, so the gate
 *   was being compared against audio that was already mostly speech.
 *
 * This file pins the output so the pipeline cannot quietly stop
 * producing it, and pins the properties that would indicate it had gone
 * wrong again in any of those three ways.
 *
 * Source: Sintel, Blender Foundation, CC BY 3.0.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
const file = path.join(repo, "apps/pipeline/analysis/sintel.analysis.json");

interface Analysis {
  id: string;
  durationSec: number;
  speechSeconds: number;
  speechShare: number;
  regions: number;
  dialogueLufs: number;
  programmeLufs: number;
  gatingDifferenceDb: number;
}

describe("the real programme that went through the pipeline", () => {
  it("exists, so the pipeline has been run on something other than a fixture", () => {
    expect(
      fs.existsSync(file),
      "no committed analysis; the pipeline has never been pointed at real content",
    ).toBe(true);
  });

  const analysis = fs.existsSync(file)
    ? (JSON.parse(fs.readFileSync(file, "utf8")) as Analysis)
    : null;

  it("found speech, and not all of it", () => {
    expect(analysis).toBeTruthy();
    expect(analysis!.regions).toBeGreaterThan(5);
    expect(analysis!.speechShare).toBeGreaterThan(0.05);
    // A programme that is 100% speech would mean the region merging had
    // swallowed the gaps, which is the failure mode of padding too hard.
    expect(analysis!.speechShare).toBeLessThan(0.9);
  });

  it("reports a dialogue level a real mix could plausibly have", () => {
    /*
      The guard against the channel bug coming back. Averaging a surround
      mix to mono buries the dialogue by about fifteen decibels, and the
      result looks like a number rather than like an error. Anything
      below -55 LUFS is not a programme, it is a downmix accident.
    */
    expect(analysis!.dialogueLufs).toBeLessThan(-5);
    expect(analysis!.dialogueLufs).toBeGreaterThan(-55);
  });

  it("measures the gate against the same audio it gated", () => {
    /*
      The guard against the second version of that bug. When dialogue
      was measured on the centre channel and the programme on a downmix,
      the difference came out at 10.5 dB and was almost entirely the
      downmix rather than the gate. Both now come from the delivered
      mix, so they cannot be more than a few decibels apart on any
      ordinary programme.
    */
    expect(Math.abs(analysis!.gatingDifferenceDb)).toBeLessThan(8);
    expect(analysis!.gatingDifferenceDb).toBeCloseTo(
      analysis!.dialogueLufs - analysis!.programmeLufs,
      1,
    );
  });

  it("does not claim the gate made more difference than it did", () => {
    // On this clip it was 0.4 dB. Any document that quotes a figure for
    // this programme has to quote that one.
    const docs = ["README.md", "docs/METHOD.md", "docs/SUBMISSION.md"]
      .map((f) => path.join(repo, f))
      .filter((f) => fs.existsSync(f))
      .map((f) => fs.readFileSync(f, "utf8"));

    for (const text of docs) {
      for (const m of text.matchAll(/gat(?:e|ing)[^.]{0,80}?([0-9]+\.[0-9]+)\s*dB/gi)) {
        expect(
          Number(m[1]),
          `a document quotes ${m[1]} dB for the gate; the measurement was ${analysis!.gatingDifferenceDb}`,
        ).toBeCloseTo(Math.abs(analysis!.gatingDifferenceDb), 1);
      }
    }
  });
});
