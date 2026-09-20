import * as fs from "node:fs";
import * as path from "node:path";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { defaultOptions } from "digits-in-noise";
import { requireRegion } from "./aws.js";
import {
  activeRms,
  averageSpectrum,
  concat,
  dbfs,
  decodeWav,
  encodeWav,
  normaliseTo,
  speechShapedNoise,
  spectrumDifferenceDb,
  trimSilence,
  type Audio,
} from "./dsp.js";

/**
 * Building the test material.
 *
 * A digits-in-noise threshold is only meaningful if two things are true
 * of the audio, and neither is true by default.
 *
 * Every digit has to be equally audible. Polly returns each word at
 * whatever level the voice produced, and the differences are not small.
 * If "six" sits two decibels under "four" then the test partly measures
 * which digits came up, and the same listener gets a different threshold
 * depending on the draw.
 *
 * And the noise has to have the spectrum of the speech. Flat noise
 * masks the wrong frequencies, and noise borrowed from another corpus
 * masks another talker's frequencies. The point of speech-shaped noise
 * is that it hides every part of the speech by the same amount, so what
 * is measured is the ability to pull speech out of competition rather
 * than hearing in one particular band.
 *
 * So the noise here is made from the recordings that will actually be
 * played, and the result is checked against the speech band by band
 * rather than assumed.
 *
 * The one thing this cannot fix is that synthesised digits are not the
 * recorded corpora the published thresholds came from. Speech material
 * moves where a threshold falls. That is why the referral bands in the
 * library are labelled provisional and why docs/EVAL.md says what would
 * be needed to earn a number of our own.
 *
 *   npm run digits -- --out apps/web/public/audio
 */

/** A clear, widely available neutral voice. Overridable. */
const VOICE = process.env.EARSHOT_VOICE ?? "Joanna";
const SAMPLE_RATE = 16000;

/** Where every digit is levelled to, with headroom for the mix. */
const DIGIT_DBFS = -26;
const NOISE_DBFS = -26;
/** Seconds of noise. Long enough that a listener never hears it loop. */
const NOISE_SECONDS = 45;

const WORDS: Record<number, string> = {
  1: "one", 2: "two", 3: "three", 4: "four",
  5: "five", 6: "six", 8: "eight", 9: "nine",
};

async function synthesise(polly: PollyClient, digit: number): Promise<Audio> {
  const word = WORDS[digit];
  if (!word) throw new Error(`No word for digit ${digit}.`);
  const response = await polly.send(
    new SynthesizeSpeechCommand({
      Text: word,
      VoiceId: VOICE as never,
      Engine: "neural",
      // Raw PCM rather than MP3: a lossy codec would put its own
      // artefacts into the spectrum that the noise is then shaped to
      // match, so the noise would be masking the encoder as well as
      // the speech.
      OutputFormat: "pcm",
      SampleRate: String(SAMPLE_RATE),
    }),
  );
  if (!response.AudioStream) throw new Error(`Polly returned no audio for "${word}".`);
  const pcm = Buffer.from(await response.AudioStream.transformToByteArray());
  // Polly's pcm output is headerless signed 16-bit little-endian.
  return decodeWav(encodeWav({ sampleRate: SAMPLE_RATE, samples: pcmToFloat(pcm) }));
}

function pcmToFloat(pcm: Buffer): Float32Array {
  const samples = new Float32Array(Math.floor(pcm.length / 2));
  for (let i = 0; i < samples.length; i++) samples[i] = pcm.readInt16LE(i * 2) / 32768;
  return samples;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const at = argv.indexOf("--out");
  const out = at >= 0 ? argv[at + 1]! : "apps/web/public/audio";
  const region = requireRegion();
  fs.mkdirSync(out, { recursive: true });

  const digits = defaultOptions().digitSet;
  const polly = new PollyClient({ region });

  const raw: { digit: number; audio: Audio }[] = [];
  for (const digit of digits) {
    process.stdout.write(`synthesising "${WORDS[digit]}" ... `);
    raw.push({ digit, audio: trimSilence(await synthesise(polly, digit)) });
    process.stdout.write("done\n");
  }

  // What the voice gave us, before anything was done about it. This is
  // the figure that justifies the levelling step existing.
  const before = raw.map((r) => dbfs(activeRms(r.audio.samples)));
  const spreadBefore = Math.max(...before) - Math.min(...before);

  const levelled = raw.map((r) => ({
    digit: r.digit,
    audio: normaliseTo(r.audio, DIGIT_DBFS),
  }));
  const after = levelled.map((r) => dbfs(activeRms(r.audio.samples)));
  const spreadAfter = Math.max(...after) - Math.min(...after);

  const speech = concat(levelled.map((r) => r.audio.samples));
  const noise = speechShapedNoise(speech, SAMPLE_RATE, NOISE_SECONDS, NOISE_DBFS);

  // Whether the noise really took the shape of these recordings.
  const match = spectrumDifferenceDb(
    averageSpectrum(speech),
    averageSpectrum(noise.samples),
    SAMPLE_RATE,
  );

  for (const { digit, audio } of levelled) {
    fs.writeFileSync(path.join(out, `digit-${digit}.wav`), encodeWav(audio));
  }
  fs.writeFileSync(path.join(out, "noise.wav"), encodeWav(noise));

  const manifest = {
    builtAt: new Date().toISOString().slice(0, 10),
    voice: VOICE,
    engine: "neural",
    sampleRate: SAMPLE_RATE,
    digits: levelled.map(({ digit }, i) => ({
      digit,
      word: WORDS[digit],
      file: `digit-${digit}.wav`,
      levelDbfs: Number(after[i]!.toFixed(2)),
    })),
    noise: { file: "noise.wav", seconds: NOISE_SECONDS, levelDbfs: NOISE_DBFS },
    levelling: {
      spreadBeforeDb: Number(spreadBefore.toFixed(2)),
      spreadAfterDb: Number(spreadAfter.toFixed(2)),
    },
    noiseMatch: {
      meanDb: Number(match.meanDb.toFixed(2)),
      maxDb: Number(match.maxDb.toFixed(2)),
      band: "100 Hz to 6 kHz",
    },
    provenance:
      "Synthesised with Amazon Polly. Not a normed corpus, so thresholds from this material are provisional; see docs/EVAL.md.",
  };
  fs.writeFileSync(
    path.join(out, "digits.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8",
  );

  process.stdout.write(
    `\nlevels spread ${spreadBefore.toFixed(2)} dB before, ${spreadAfter.toFixed(2)} dB after\n` +
      `noise matches the speech to ${match.meanDb.toFixed(2)} dB mean, ${match.maxDb.toFixed(2)} dB worst\n` +
      `${digits.length} digits and ${NOISE_SECONDS}s of noise written to ${out}\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`\n${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
