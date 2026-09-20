/**
 * Playing a triplet at a given signal-to-noise ratio.
 *
 * The ratio is the measurement, so the mixing is the part that has to be
 * right. Two rules decide how it is done.
 *
 * The noise stays at a fixed gain and the digits move. The alternative,
 * holding the speech and raising the noise, sounds identical and clips:
 * at a threshold of -9 dB the noise would need almost three times the
 * amplitude, and everything above it in the track would be worse. A
 * listener who hears distortion is being asked a different question.
 *
 * And the noise starts before the digits and ends after them. Noise that
 * begins with the speech gives away exactly when to listen, which turns
 * a test of hearing into a test of reaction. The lead-in also lets the
 * ear settle, which is what makes the first trial of a run usable rather
 * than a warm-up somebody has to waste.
 */

export interface DigitManifest {
  placeholder?: boolean;
  sampleRate: number;
  voice: string;
  digits: { digit: number; word: string; file: string; levelDbfs: number }[];
  noise: { file: string; seconds: number; levelDbfs: number };
  levelling: { spreadBeforeDb: number; spreadAfterDb: number };
  noiseMatch: { meanDb: number; maxDb: number; band: string };
  provenance: string;
}

/** Seconds of noise before the first digit and after the last. */
const LEAD_IN = 0.9;
const LEAD_OUT = 0.5;
/** Silence between digits in a triplet. */
const GAP = 0.12;

export class TripletPlayer {
  private context: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private readonly digits = new Map<number, AudioBuffer>();
  private output: GainNode | null = null;
  private playing: AudioBufferSourceNode[] = [];

  constructor(
    readonly manifest: DigitManifest,
    private readonly base = "/audio",
  ) {}

  /**
   * Set up the audio graph.
   *
   * Must be called from a click. Browsers will not start an AudioContext
   * any other way, and one created before a gesture arrives suspended
   * and plays nothing, silently.
   */
  async prepare(): Promise<void> {
    if (this.context) {
      if (this.context.state === "suspended") await this.context.resume();
      return;
    }
    const context = new AudioContext({ sampleRate: this.manifest.sampleRate });
    const output = context.createGain();
    output.gain.value = 1;
    output.connect(context.destination);

    const load = async (file: string): Promise<AudioBuffer> => {
      const response = await fetch(`${this.base}/${file}`);
      if (!response.ok) throw new Error(`could not load ${file}: HTTP ${response.status}`);
      return context.decodeAudioData(await response.arrayBuffer());
    };

    const [noise, ...digits] = await Promise.all([
      load(this.manifest.noise.file),
      ...this.manifest.digits.map((d) => load(d.file)),
    ]);
    this.manifest.digits.forEach((d, i) => this.digits.set(d.digit, digits[i]!));
    this.context = context;
    this.noise = noise;
    this.output = output;
  }

  get ready(): boolean {
    return this.context !== null;
  }

  /** Noise on its own, for setting a comfortable level before starting. */
  playNoise(seconds = 4): void {
    const { context, noise, output } = this.assertReady();
    this.stop();
    const source = context.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    source.connect(output);
    source.start();
    source.stop(context.currentTime + seconds);
    this.playing.push(source);
  }

  /**
   * Play one triplet, and resolve when the noise has finished.
   *
   * Resolving early would let the interface accept an answer while the
   * last digit is still sounding, and a listener who answers over the
   * top of the audio is answering a different question from the one the
   * track thinks it asked.
   */
  async playTriplet(digits: number[], snrDb: number): Promise<void> {
    const { context, noise, output } = this.assertReady();
    this.stop();

    const buffers = digits.map((d) => {
      const buffer = this.digits.get(d);
      if (!buffer) throw new Error(`no audio for digit ${d}`);
      return buffer;
    });

    const speech = buffers.reduce((total, b) => total + b.duration, 0) + GAP * (buffers.length - 1);
    const total = LEAD_IN + speech + LEAD_OUT;
    const start = context.currentTime + 0.08;

    const noiseGain = context.createGain();
    noiseGain.gain.value = 1;
    noiseGain.connect(output);
    const noiseSource = context.createBufferSource();
    noiseSource.buffer = noise;
    noiseSource.loop = true;
    noiseSource.connect(noiseGain);
    noiseSource.start(start);
    noiseSource.stop(start + total);
    this.playing.push(noiseSource);

    // The speech moves, not the noise. Both files are levelled to the
    // same figure, so the ratio is exactly this gain.
    const speechGain = context.createGain();
    speechGain.gain.value = Math.pow(10, snrDb / 20);
    speechGain.connect(output);

    let at = start + LEAD_IN;
    for (const buffer of buffers) {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(speechGain);
      source.start(at);
      this.playing.push(source);
      at += buffer.duration + GAP;
    }

    await new Promise<void>((done) => {
      noiseSource.onended = () => done();
    });
    this.playing = [];
  }

  stop(): void {
    for (const source of this.playing) {
      try {
        source.onended = null;
        source.stop();
      } catch {
        /* already finished */
      }
    }
    this.playing = [];
  }

  close(): void {
    this.stop();
    void this.context?.close();
    this.context = null;
  }

  private assertReady() {
    if (!this.context || !this.noise || !this.output) {
      throw new Error("the player was used before prepare() finished");
    }
    return { context: this.context, noise: this.noise, output: this.output };
  }
}
