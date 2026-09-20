import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultOptions } from "digits-in-noise";
import {
  activeRms,
  averageSpectrum,
  concat,
  dbfs,
  encodeWav,
  normaliseTo,
  speechShapedNoise,
  spectrumDifferenceDb,
  type Audio,
} from "./dsp.js";

/**
 * Stand-in audio, so the whole product can be built and driven without
 * an AWS account, and so nobody mistakes it for the real thing.
 *
 * These are not spoken digits. They are shaped tone bursts, one per
 * digit, that a person can tell apart. Everything downstream of the
 * audio is exercised by them: the adaptive track, the mixing, the
 * scoring, the validity rules, the interpretation, the interface. What
 * they cannot produce is a threshold that means anything about anyone's
 * hearing, because the thing being recognised is not speech.
 *
 * So the manifest they write says `placeholder: true`, the site reads
 * that flag, and there is a test that the warning appears whenever it is
 * set. A demonstration that quietly looks like a hearing test while
 * playing beeps would be the single most dishonest thing this project
 * could ship, and it is the kind of dishonesty that happens by accident
 * when a placeholder outlives the hurry that produced it.
 *
 *   npm run digits:placeholder
 */

const SAMPLE_RATE = 16000;
const DIGIT_DBFS = -26;
const NOISE_DBFS = -26;
const NOISE_SECONDS = 20;

/**
 * A burst with a few harmonics and an envelope, roughly where a voice
 * sits. Enough structure that the shaped noise has something to shape
 * to, and enough difference between digits to be told apart.
 */
function burst(digit: number, index: number, total: number): Audio {
  const seconds = 0.45;
  const n = Math.round(seconds * SAMPLE_RATE);
  const samples = new Float32Array(n);
  // Spread the fundamentals across the range a voice uses.
  const f0 = 140 + (index / Math.max(1, total - 1)) * 120;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    // Attack and decay, so there is an onset rather than a click.
    const envelope =
      Math.min(1, t / 0.04) * Math.min(1, (seconds - t) / 0.12) * (t < seconds ? 1 : 0);
    let value = 0;
    for (let harmonic = 1; harmonic <= 12; harmonic++) {
      // Falling spectrum, the way voiced speech does.
      value += Math.sin(2 * Math.PI * f0 * harmonic * t) / (harmonic * harmonic);
    }
    samples[i] = value * envelope * 0.5;
  }
  return { sampleRate: SAMPLE_RATE, samples };
}

function main(): void {
  const argv = process.argv.slice(2);
  const at = argv.indexOf("--out");
  // Defaults resolve against the repository, not against whatever
  // directory npm happened to run the workspace script from. The first
  // run of this wrote its files into apps/pipeline/apps/web/public.
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const out = at >= 0 ? argv[at + 1]! : path.join(repo, "apps/web/public/audio");
  fs.mkdirSync(out, { recursive: true });

  const digits = defaultOptions().digitSet;
  const levelled = digits.map((digit, i) => ({
    digit,
    audio: normaliseTo(burst(digit, i, digits.length), DIGIT_DBFS),
  }));

  const speech = concat(levelled.map((d) => d.audio.samples));
  const noise = speechShapedNoise(speech, SAMPLE_RATE, NOISE_SECONDS, NOISE_DBFS, 17);
  const match = spectrumDifferenceDb(
    averageSpectrum(speech),
    averageSpectrum(noise.samples),
    SAMPLE_RATE,
  );

  for (const { digit, audio } of levelled) {
    fs.writeFileSync(path.join(out, `digit-${digit}.wav`), encodeWav(audio));
  }
  fs.writeFileSync(path.join(out, "noise.wav"), encodeWav(noise));

  const levels = levelled.map((d) => dbfs(activeRms(d.audio.samples)));
  const manifest = {
    builtAt: new Date().toISOString().slice(0, 10),
    placeholder: true,
    voice: "none: shaped tone bursts, not speech",
    engine: "local",
    sampleRate: SAMPLE_RATE,
    digits: levelled.map(({ digit }, i) => ({
      digit,
      word: String(digit),
      file: `digit-${digit}.wav`,
      levelDbfs: Number(levels[i]!.toFixed(2)),
    })),
    noise: { file: "noise.wav", seconds: NOISE_SECONDS, levelDbfs: NOISE_DBFS },
    levelling: {
      spreadBeforeDb: 0,
      spreadAfterDb: Number((Math.max(...levels) - Math.min(...levels)).toFixed(2)),
    },
    noiseMatch: {
      meanDb: Number(match.meanDb.toFixed(2)),
      maxDb: Number(match.maxDb.toFixed(2)),
      band: "100 Hz to 6 kHz",
    },
    provenance:
      "Placeholder audio generated locally. These are tone bursts, not spoken digits, so a threshold measured with them says nothing about anybody's hearing. Run npm run digits to build the real material with Amazon Polly.",
  };
  fs.writeFileSync(
    path.join(out, "digits.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );

  process.stdout.write(
    `placeholder audio: ${digits.length} bursts and ${NOISE_SECONDS}s of noise in ${out}\n` +
      `noise matches to ${match.meanDb.toFixed(2)} dB mean\n` +
      `this is not speech, and digits.json says so\n`,
  );
}

main();
