import { execFileSync, spawnSync } from "node:child_process";

/**
 * The bits that talk to things outside this process.
 *
 * Kept apart from the arithmetic on purpose. Everything in `speech.ts`
 * and `dsp.ts` is a pure function with a test; everything here needs
 * ffmpeg on the path or credentials in the environment, and can only be
 * verified by running it. Mixing the two would mean the parts that can
 * be checked cheaply could only be checked expensively.
 *
 * The other rule in this file is that failures are loud. A pipeline
 * that shrugs and carries on produces an output file that looks fine
 * and contains a number nobody can account for, which is worse than no
 * output at all, because the number gets used.
 */

export class ToolMissing extends Error {
  constructor(tool: string, install: string) {
    super(`${tool} is not on the path. ${install}`);
    this.name = "ToolMissing";
  }
}

/** Run a command, capturing both streams, and throw with the output. */
export function run(command: string, args: string[], label: string): string {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    const err = error as { code?: string; stderr?: string; stdout?: string; message: string };
    if (err.code === "ENOENT") {
      throw new ToolMissing(
        command,
        command.startsWith("ff")
          ? "Install ffmpeg and make sure ffmpeg and ffprobe are both reachable."
          : "",
      );
    }
    // ffmpeg writes everything to stderr, including the numbers we want,
    // so a non-zero exit is the only way to know it actually failed.
    const detail = [err.stderr, err.stdout].filter(Boolean).join("\n").trim();
    throw new Error(`${label} failed.\n${detail || err.message}`);
  }
}

/**
 * Everything ffmpeg printed, whether or not it was upset.
 *
 * With `-f null -` ffmpeg exits zero and the measurement is in the
 * report it writes to stderr, so the success path has to read stderr
 * too. execFileSync only hands back stdout on success, which is why
 * this one reaches for spawnSync instead.
 */
export function ffmpegMeasure(args: string[]): string {
  const out = spawnSync("ffmpeg", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (out.error && (out.error as NodeJS.ErrnoException).code === "ENOENT") {
    throw new ToolMissing("ffmpeg", "Install ffmpeg and make sure it is on the path.");
  }
  if ((out.status ?? 1) !== 0) {
    throw new Error(`ffmpeg failed.
${(out.stderr ?? "").slice(-4000)}`);
  }
  return out.stderr ?? "";
}

/** Length of a media file, in seconds. */
export function durationSec(file: string): number {
  const out = run(
    "ffprobe",
    [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      file,
    ],
    "ffprobe",
  );
  const seconds = Number(out.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`ffprobe gave no usable duration for ${file}: ${JSON.stringify(out)}`);
  }
  return seconds;
}

/**
 * Speech audio, at the rate Transcribe wants and no better.
 *
 * Mono, 16 kHz, because that is what the recogniser uses internally and
 * anything more is bytes uploaded for nothing. Only the audio is sent:
 * a film is gigabytes and its soundtrack is tens of megabytes, and the
 * picture is no business of a hearing project.
 */
export function extractAudio(input: string, output: string): void {
  run(
    "ffmpeg",
    ["-y", "-i", input, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", output],
    "extracting audio",
  );
}

export function requireRegion(): string {
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION;
  if (!region) {
    throw new Error(
      "No AWS region. Set AWS_REGION, and make sure credentials are configured. " +
        "See docs/AWS.md for exactly which permissions this needs.",
    );
  }
  return region;
}

export const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
