/**
 * The signal processing behind the test material.
 *
 * Two things have to be true of a digits-in-noise test before any
 * threshold it produces means anything, and both of them are built here
 * rather than assumed.
 *
 * **Every digit has to be equally audible.** If "six" is two decibels
 * quieter than "four", the test partly measures which digits came up,
 * and a listener's threshold moves with the draw. Published versions of
 * this test level-equalise their recordings for exactly this reason.
 *
 * **The noise has to have the spectrum of the speech.** Noise that is
 * flat, or that is somebody else's speech-shaped noise, masks the wrong
 * frequencies. The point of speech-shaped noise is that it hides every
 * part of the speech equally, so the test measures a listener's ability
 * to pull speech out of competition rather than their ability to hear
 * one particular band.
 *
 * So the noise is built from the digits that will actually be played:
 * measure their long-term average spectrum, design a filter with that
 * shape, and run white noise through it. There is a test that checks
 * the result matches, band by band, rather than trusting that it did.
 */

// ---------------------------------------------------------------- FFT

/**
 * In-place radix-2 Cooley-Tukey. Length must be a power of two.
 *
 * Written out rather than pulled in because it is forty lines, it needs
 * to run identically in a test and in a build step, and a dependency
 * here would be a dependency in the published package's toolchain.
 */
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  if (n !== im.length || (n & (n - 1)) !== 0) {
    throw new Error("fft needs two equal buffers with a power-of-two length");
  }

  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const angle = (inverse ? 2 : -2) * Math.PI / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k++) {
        const aRe = re[i + k]!;
        const aIm = im[i + k]!;
        const bRe = re[i + k + len / 2]! * curRe - im[i + k + len / 2]! * curIm;
        const bIm = re[i + k + len / 2]! * curIm + im[i + k + len / 2]! * curRe;
        re[i + k] = aRe + bRe;
        im[i + k] = aIm + bIm;
        re[i + k + len / 2] = aRe - bRe;
        im[i + k + len / 2] = aIm - bIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }

  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] = re[i]! / n;
      im[i] = im[i]! / n;
    }
  }
}

// ----------------------------------------------------------- WAV files

export interface Audio {
  sampleRate: number;
  samples: Float32Array;
}

/** 16-bit PCM, mono. What Polly returns and what the apps play. */
export function decodeWav(buffer: Buffer): Audio {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("not a RIFF WAVE file");
  }
  let offset = 12;
  let sampleRate = 0;
  let channels = 1;
  let bits = 16;
  let data: Buffer | null = null;

  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = buffer.subarray(offset + 8, offset + 8 + size);
    if (id === "fmt ") {
      channels = body.readUInt16LE(2);
      sampleRate = body.readUInt32LE(4);
      bits = body.readUInt16LE(14);
    } else if (id === "data") {
      data = body;
    }
    // Chunks are word-aligned; an odd size is followed by a pad byte.
    offset += 8 + size + (size % 2);
  }

  if (!data || !sampleRate) throw new Error("wav file has no fmt or data chunk");
  if (bits !== 16) throw new Error(`only 16-bit audio is supported, got ${bits}`);

  const frames = Math.floor(data.length / 2 / channels);
  const samples = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    // Downmix by averaging, so a stereo prompt does not arrive 3 dB hot.
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += data.readInt16LE((i * channels + c) * 2);
    samples[i] = sum / channels / 32768;
  }
  return { sampleRate, samples };
}

export function encodeWav({ sampleRate, samples }: Audio): Buffer {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const clipped = Math.max(-1, Math.min(1, samples[i]!));
    data.writeInt16LE(Math.round(clipped * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

// ------------------------------------------------------------- levels

export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const s of samples) sum += s * s;
  return Math.sqrt(sum / samples.length);
}

export const dbfs = (amplitude: number) => 20 * Math.log10(Math.max(amplitude, 1e-12));

/**
 * Level over the parts that are actually speech.
 *
 * A digit recording is mostly silence: Polly pads the front and back,
 * and plain RMS over the whole file therefore measures how much padding
 * there was. Levelling on that figure would make the digits with the
 * longest tails the loudest ones in the test.
 *
 * So the level is taken over frames that are within a window of the
 * loudest frame, which is the same idea as the relative gate in EBU
 * R128, at a scale that suits a single word.
 */
export function activeRms(samples: Float32Array, gateDb = -25, frame = 256): number {
  const frames: number[] = [];
  for (let i = 0; i + frame <= samples.length; i += frame) {
    frames.push(rms(samples.subarray(i, i + frame)));
  }
  if (frames.length === 0) return rms(samples);
  const loudest = Math.max(...frames);
  if (loudest <= 0) return 0;
  const floor = loudest * Math.pow(10, gateDb / 20);
  const kept = frames.filter((f) => f >= floor);
  if (kept.length === 0) return loudest;
  return Math.sqrt(kept.reduce((sum, f) => sum + f * f, 0) / kept.length);
}

/**
 * Cut the silence off either end of a word.
 *
 * Polly pads what it returns, and by different amounts for different
 * words. Left alone, one digit starts a fifth of a second later than
 * another, which makes some of them feel slower rather than quieter and
 * gives a listener a cue that has nothing to do with hearing.
 *
 * A margin is kept rather than cutting to the first sample above the
 * floor, because the onset of a word carries information and a hard cut
 * at the threshold removes the quietest part of it. Consonants are
 * exactly what a listener with hearing loss is missing, so trimming them
 * would make the test easier in the one dimension that matters.
 */
export function trimSilence(audio: Audio, floorDb = -45, marginSec = 0.02): Audio {
  const { samples, sampleRate } = audio;
  const peak = Math.max(...Array.from(samples, Math.abs));
  if (peak <= 0) return audio;
  const floor = peak * Math.pow(10, floorDb / 20);

  let first = 0;
  while (first < samples.length && Math.abs(samples[first]!) < floor) first++;
  let last = samples.length - 1;
  while (last > first && Math.abs(samples[last]!) < floor) last--;
  if (first >= last) return audio;

  const margin = Math.round(marginSec * sampleRate);
  const from = Math.max(0, first - margin);
  const to = Math.min(samples.length, last + margin + 1);
  return { sampleRate, samples: samples.slice(from, to) };
}

/** Everything one after another, for measuring a shared spectrum. */
export function concat(clips: Float32Array[]): Float32Array {
  const total = clips.reduce((n, c) => n + c.length, 0);
  const out = new Float32Array(total);
  let at = 0;
  for (const clip of clips) {
    out.set(clip, at);
    at += clip.length;
  }
  return out;
}

/** Scale so the speech in this clip sits at a chosen level. */
export function normaliseTo(audio: Audio, targetDbfs: number): Audio {
  const level = activeRms(audio.samples);
  if (level <= 0) return audio;
  const gain = Math.pow(10, targetDbfs / 20) / level;
  const out = new Float32Array(audio.samples.length);
  for (let i = 0; i < out.length; i++) out[i] = audio.samples[i]! * gain;
  return { sampleRate: audio.sampleRate, samples: out };
}

// ----------------------------------------------------------- spectrum

/**
 * Long-term average magnitude spectrum, by Welch's method.
 *
 * Overlapping Hann-windowed frames, averaged in power. One long
 * transform would give a spectrum of this particular recording, spikes
 * and all; averaging short ones gives the shape of the speech, which is
 * what the noise needs to copy.
 */
export function averageSpectrum(samples: Float32Array, size = 1024, hop = 512): Float64Array {
  const bins = size / 2 + 1;
  const power = new Float64Array(bins);
  const window = new Float64Array(size);
  for (let i = 0; i < size; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);

  let frames = 0;
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let start = 0; start + size <= samples.length; start += hop) {
    for (let i = 0; i < size; i++) {
      re[i] = samples[start + i]! * window[i]!;
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < bins; k++) power[k] = power[k]! + re[k]! * re[k]! + im[k]! * im[k]!;
    frames++;
  }
  if (frames === 0) return power;
  for (let k = 0; k < bins; k++) power[k] = Math.sqrt(power[k]! / frames);
  return power;
}

/**
 * A filter with the shape of a given spectrum.
 *
 * Frequency sampling: treat the target magnitudes as a zero-phase
 * spectrum, transform back to get an impulse response, rotate it so it
 * is centred rather than split across the wrap point, and window it to
 * stop the truncation ringing.
 */
export function designFir(target: Float64Array, taps = 257): Float64Array {
  const size = (target.length - 1) * 2;
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let k = 0; k < target.length; k++) {
    re[k] = target[k]!;
    if (k > 0 && k < target.length - 1) re[size - k] = target[k]!;
  }
  fft(re, im, true);

  const half = (taps - 1) / 2;
  const fir = new Float64Array(taps);
  for (let i = 0; i < taps; i++) {
    const from = (i - half + size) % size;
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (taps - 1));
    fir[i] = re[from]! * hann;
  }
  return fir;
}

export function convolve(input: Float32Array, fir: Float64Array): Float32Array {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    let sum = 0;
    const from = Math.min(fir.length - 1, i);
    for (let k = 0; k <= from; k++) sum += fir[k]! * input[i - k]!;
    out[i] = sum;
  }
  return out;
}

/** Repeatable white noise, so a rebuild produces the same file. */
export function whiteNoise(length: number, seed = 1): Float32Array {
  let a = seed >>> 0;
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    out[i] = (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  }
  return out;
}

/**
 * Noise shaped like the speech it will be played against.
 *
 * Built from the recordings that will actually be used, not from a
 * published average of a different language's talkers.
 */
export function speechShapedNoise(
  speech: Float32Array,
  sampleRate: number,
  seconds: number,
  targetDbfs: number,
  seed = 1,
): Audio {
  const spectrum = averageSpectrum(speech);
  const fir = designFir(spectrum);
  const shaped = convolve(whiteNoise(Math.round(seconds * sampleRate), seed), fir);
  return normaliseTo({ sampleRate, samples: shaped }, targetDbfs);
}

/**
 * How closely two spectra agree, in decibels, over a frequency range.
 *
 * The comparison is made after removing each spectrum's own mean level,
 * because only the shape matters here. The noise gets its level set
 * separately, and including it would report a difference that is just
 * the gain.
 */
export function spectrumDifferenceDb(
  a: Float64Array,
  b: Float64Array,
  sampleRate: number,
  fromHz = 100,
  toHz = 6000,
): { maxDb: number; meanDb: number } {
  const bins = a.length;
  const nyquist = sampleRate / 2;
  // ceil, not floor. floor picks the bin below the requested frequency,
  // so a band documented as starting at 100 Hz was actually measured
  // from 94 Hz. That bin sits under the fundamental of most speech and
  // is where a smooth filter has least to work with, so it contributed
  // a 12 dB worst-case figure to a manifest that claimed a 100 Hz
  // floor. The stated band and the measured band have to be the same
  // band.
  const first = Math.max(1, Math.ceil((fromHz / nyquist) * (bins - 1)));
  const last = Math.min(bins - 1, Math.floor((toHz / nyquist) * (bins - 1)));

  const aDb: number[] = [];
  const bDb: number[] = [];
  for (let k = first; k <= last; k++) {
    aDb.push(dbfs(a[k]!));
    bDb.push(dbfs(b[k]!));
  }
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const offset = mean(aDb) - mean(bDb);

  let maxDb = 0;
  let total = 0;
  for (let i = 0; i < aDb.length; i++) {
    const diff = Math.abs(aDb[i]! - (bDb[i]! + offset));
    maxDb = Math.max(maxDb, diff);
    total += diff;
  }
  return { maxDb, meanDb: total / aDb.length };
}
