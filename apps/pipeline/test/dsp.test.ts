import { describe, expect, it } from "vitest";
import {
  activeRms,
  averageSpectrum,
  convolve,
  dbfs,
  decodeWav,
  designFir,
  encodeWav,
  fft,
  normaliseTo,
  rms,
  concat,
  speechShapedNoise,
  spectrumDifferenceDb,
  trimSilence,
  whiteNoise,
  type Audio,
} from "../src/dsp.js";

const SR = 16000;

function tone(hz: number, seconds: number, amplitude = 0.5): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR));
  for (let i = 0; i < out.length; i++) {
    out[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / SR);
  }
  return out;
}

/**
 * Something with the rough shape of speech: energy concentrated low,
 * falling away above a couple of kilohertz, with the pauses a word has.
 */
function speechLike(seconds: number, seed = 5): Float32Array {
  const noise = whiteNoise(Math.round(seconds * SR), seed);
  const out = new Float32Array(noise.length);
  let low = 0;
  for (let i = 0; i < noise.length; i++) {
    low = low * 0.85 + noise[i]! * 0.15;
    // Syllable-rate envelope, and silence between "words".
    const t = i / SR;
    const envelope = Math.max(0, Math.sin(2 * Math.PI * 3 * t)) * (t % 1 < 0.6 ? 1 : 0);
    out[i] = low * envelope * 4;
  }
  return out;
}

describe("the transform", () => {
  it("comes back to where it started", () => {
    const n = 256;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.sin(i / 3) + 0.25 * Math.cos(i / 7);
    const original = Float64Array.from(re);
    fft(re, im);
    fft(re, im, true);
    for (let i = 0; i < n; i++) expect(re[i]).toBeCloseTo(original[i]!, 9);
  });

  it("refuses a length it cannot handle rather than returning nonsense", () => {
    expect(() => fft(new Float64Array(100), new Float64Array(100))).toThrow(/power-of-two/);
  });

  it("puts a pure tone in the bin it belongs in", () => {
    const spectrum = averageSpectrum(tone(1000, 0.5));
    let peak = 0;
    for (let k = 1; k < spectrum.length; k++) if (spectrum[k]! > spectrum[peak]!) peak = k;
    const hz = (peak / (spectrum.length - 1)) * (SR / 2);
    expect(Math.abs(hz - 1000)).toBeLessThan(SR / 1024);
  });
});

describe("wav files", () => {
  it("survives a round trip", () => {
    const audio: Audio = { sampleRate: SR, samples: tone(440, 0.05) };
    const back = decodeWav(encodeWav(audio));
    expect(back.sampleRate).toBe(SR);
    expect(back.samples.length).toBe(audio.samples.length);
    for (let i = 0; i < back.samples.length; i += 37) {
      expect(back.samples[i]).toBeCloseTo(audio.samples[i]!, 3);
    }
  });

  it("says so rather than guessing when the file is not one", () => {
    expect(() => decodeWav(Buffer.from("this is not audio"))).toThrow(/RIFF/);
  });
});

describe("levelling the digits", () => {
  it("ignores the padding Polly leaves around a word", () => {
    /*
      A digit recording is mostly silence. Plain RMS over the whole file
      measures how much padding there was, so levelling on it would make
      the digits with the longest tails the loudest in the test, and a
      listener's threshold would move with the draw.
    */
    const word = tone(500, 0.2, 0.5);
    const padded = new Float32Array(SR * 2);
    padded.set(word, SR);

    expect(rms(padded)).toBeLessThan(rms(word) / 2);
    // Stated as the engineering requirement rather than as a float
    // tolerance: digit levels have to agree well inside a decibel, or
    // the draw moves the threshold. The frames at the edges of the word
    // are part padding, so the two are close rather than identical.
    const difference = Math.abs(dbfs(activeRms(padded)) - dbfs(activeRms(word)));
    expect(difference).toBeLessThan(0.5);
  });

  it("brings different words to the same level", () => {
    const quiet = { sampleRate: SR, samples: tone(500, 0.3, 0.05) };
    const loud = { sampleRate: SR, samples: tone(800, 0.3, 0.9) };
    const a = normaliseTo(quiet, -20);
    const b = normaliseTo(loud, -20);
    expect(dbfs(activeRms(a.samples))).toBeCloseTo(-20, 1);
    expect(dbfs(activeRms(b.samples))).toBeCloseTo(-20, 1);
  });

  it("levels a padded recording by its word, not by its padding", () => {
    /*
      The case that actually arrives. Polly returns a word surrounded by
      silence, and how much silence differs by word. Levelling on the
      whole file would set the level by the length of the pause, so the
      digits with the longest tails would come out loudest and a
      listener's threshold would move with the draw.

      The test above checks the measurement in isolation; this one
      checks that normalisation uses it.
    */
    const word = tone(500, 0.2, 0.5);
    const little = new Float32Array(Math.round(SR * 0.4));
    little.set(word, Math.round(SR * 0.1));
    const lots = new Float32Array(SR * 3);
    lots.set(word, SR);

    const a = normaliseTo({ sampleRate: SR, samples: little }, -20);
    const b = normaliseTo({ sampleRate: SR, samples: lots }, -20);

    expect(dbfs(activeRms(a.samples))).toBeCloseTo(-20, 1);
    expect(dbfs(activeRms(b.samples))).toBeCloseTo(-20, 1);
  });

  it("leaves silence alone rather than amplifying it to the target", () => {
    const silence = { sampleRate: SR, samples: new Float32Array(1000) };
    expect(rms(normaliseTo(silence, -20).samples)).toBe(0);
  });
});

describe("trimming a word", () => {
  it("takes the padding off both ends", () => {
    const word = tone(500, 0.2, 0.5);
    const padded = new Float32Array(SR * 2);
    padded.set(word, Math.round(SR * 0.9));
    const trimmed = trimSilence({ sampleRate: SR, samples: padded });
    expect(trimmed.samples.length).toBeLessThan(padded.length / 2);
    expect(trimmed.samples.length).toBeGreaterThan(word.length);
  });

  it("keeps a margin, because the onset of a word is part of the word", () => {
    // Cutting to the first sample over the floor removes the quietest
    // part of the attack. Consonants live there and consonants are what
    // a listener with hearing loss is missing, so a hard cut would make
    // the test easier in the one dimension that matters.
    const word = tone(500, 0.2, 0.5);
    const padded = new Float32Array(SR);
    padded.set(word, Math.round(SR * 0.4));
    const trimmed = trimSilence({ sampleRate: SR, samples: padded }, -45, 0.02);
    expect(trimmed.samples.length).toBeGreaterThanOrEqual(word.length + Math.round(0.03 * SR));
  });

  it("leaves a clip of pure silence alone rather than emptying it", () => {
    const silence = { sampleRate: SR, samples: new Float32Array(500) };
    expect(trimSilence(silence).samples.length).toBe(500);
  });

  it("does not change the level of the word it kept", () => {
    const word = tone(500, 0.2, 0.5);
    const padded = new Float32Array(SR * 2);
    padded.set(word, SR);
    const before = activeRms(padded);
    const after = activeRms(trimSilence({ sampleRate: SR, samples: padded }).samples);
    expect(Math.abs(dbfs(after) - dbfs(before))).toBeLessThan(0.5);
  });
});

describe("joining clips", () => {
  it("puts them end to end without losing any", () => {
    const joined = concat([tone(400, 0.1), tone(800, 0.2)]);
    expect(joined.length).toBe(Math.round(0.1 * SR) + Math.round(0.2 * SR));
  });

  it("handles nothing at all", () => {
    expect(concat([]).length).toBe(0);
  });
});

describe("the noise", () => {
  it("repeats exactly, so a rebuild produces the same file", () => {
    expect(Array.from(whiteNoise(16, 7))).toEqual(Array.from(whiteNoise(16, 7)));
    expect(Array.from(whiteNoise(16, 7))).not.toEqual(Array.from(whiteNoise(16, 8)));
  });

  it("takes the shape of the speech it will be played against", () => {
    /*
      The claim this whole module exists to support. Noise that does not
      match the speech masks the wrong frequencies, and the test then
      measures a listener's hearing in one band rather than their ability
      to pull speech out of competition.

      Checked band by band rather than assumed.
    */
    const speech = speechLike(6);
    const noise = speechShapedNoise(speech, SR, 6, -24, 3);

    const want = averageSpectrum(speech);
    const got = averageSpectrum(noise.samples);
    const { maxDb, meanDb } = spectrumDifferenceDb(want, got, SR);

    expect(meanDb).toBeLessThan(2);
    expect(maxDb).toBeLessThan(6);
  });

  it("is meaningfully closer than noise that was not shaped at all", () => {
    /*
      The check above has to be capable of failing, or it is decoration.
      So the same comparison runs against flat white noise, and what is
      asserted is the ratio: shaping has to buy a real improvement, not
      an improvement that could be measurement wobble.

      A fixed threshold was the first attempt and it was the wrong shape
      of test, because it depended on how far this particular synthetic
      speech happens to sit from flat.
    */
    const speech = speechLike(6);
    const want = averageSpectrum(speech);

    const shaped = speechShapedNoise(speech, SR, 6, -24, 3);
    const flat = { sampleRate: SR, samples: whiteNoise(6 * SR, 11) };

    const shapedError = spectrumDifferenceDb(want, averageSpectrum(shaped.samples), SR).meanDb;
    const flatError = spectrumDifferenceDb(want, averageSpectrum(flat.samples), SR).meanDb;

    expect(flatError).toBeGreaterThan(shapedError * 2);
  });

  it("compares only the band it says it compares", () => {
    /*
      The bounds used to round outward, so a band documented as 100 Hz
      to 6 kHz was measured from 94 Hz. That bin is below the
      fundamental of most speech, it is where a smooth filter has least
      to work with, and it alone produced a 12 dB worst case in a
      manifest claiming a 100 Hz floor.
    */
    const flat = new Float64Array(513).fill(1);
    const bumped = Float64Array.from(flat);
    // A large deviation just below the band. It must not be counted.
    const below = Math.floor((90 / (SR / 2)) * 512);
    bumped[below] = 40;
    expect(spectrumDifferenceDb(flat, bumped, SR, 100, 6000).maxDb).toBeLessThan(1);

    // The same deviation inside the band must be counted.
    const inside = Math.round((1000 / (SR / 2)) * 512);
    const within = Float64Array.from(flat);
    within[inside] = 40;
    expect(spectrumDifferenceDb(flat, within, SR, 100, 6000).maxDb).toBeGreaterThan(10);
  });

  it("comes out at the level it was asked for", () => {
    const noise = speechShapedNoise(speechLike(3), SR, 3, -26, 2);
    expect(dbfs(activeRms(noise.samples))).toBeCloseTo(-26, 1);
  });

  it("stays inside what a 16-bit file can hold", () => {
    const noise = speechShapedNoise(speechLike(3), SR, 3, -20, 4);
    const peak = Math.max(...Array.from(noise.samples).map(Math.abs));
    expect(peak).toBeLessThan(1);
  });
});

describe("the filter", () => {
  it("passes a flat spectrum through roughly unchanged", () => {
    const flat = new Float64Array(513).fill(1);
    const fir = designFir(flat);
    const input = whiteNoise(4096, 9);
    const out = convolve(input, fir);
    const before = averageSpectrum(input);
    const after = averageSpectrum(out);
    expect(spectrumDifferenceDb(before, after, SR).meanDb).toBeLessThan(2);
  });
});
