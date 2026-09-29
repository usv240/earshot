"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_LENGTH,
  interpret,
  LENGTHS,
  Screen,
  type Interpretation,
  type ScreenResult,
} from "digits-in-noise";
import { TripletPlayer, type DigitManifest } from "../lib/audio";

/**
 * The test, in a browser.
 *
 * This is the part of the site that matters. Everything else can be
 * read; this is the thing a visitor can do, and having done it they know
 * something they did not know before, which no amount of copy achieves.
 *
 * It runs the same engine the television app runs, unchanged. The
 * package has no idea whether it is being driven by a remote control, a
 * keypad, or a simulated listener in a validation harness, which is the
 * reason the numbers measured against the simulation describe this too.
 *
 * Three things about the design are deliberate and none of them are
 * decoration.
 *
 * The level is set by the listener, first, against the noise on its own.
 * The test measures a ratio, so the absolute level does not change the
 * answer, but it has to be audible and not painful for the answer to
 * mean anything. Asking somebody to set it where their television sits
 * is both the most familiar instruction available and the one that puts
 * them in the situation the result is about.
 *
 * Answers cannot be entered while audio is playing. A listener who
 * answers over the top of the last digit is answering a different
 * question from the one the track thinks it asked.
 *
 * And a run that does not settle reports nothing. There is no partial
 * credit, no best guess, and no number with a caveat under it.
 */

/*
  "Two minutes", not "ninety seconds".

  The site said ninety in three places and the television said it out
  loud. A timed run in a browser took 123 seconds: each trial is a
  steady 3.8 seconds of audio, noise lead-in, three digits, lead-out,
  and twenty-four of those is 91 seconds before a person's answering
  time is counted at all. Ninety was a promise the product could not
  keep, sitting in the hero card of a project whose whole argument is
  not overclaiming. Found by timing it rather than by reading it.
*/
type Stage = "idle" | "loading" | "level" | "playing" | "answering" | "done" | "failed";

interface Props {
  manifest: DigitManifest;
}

export function HearingTest({ manifest }: Props) {
  const [stage, setStage] = useState<Stage>("idle");
  const [entered, setEntered] = useState<number[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<ScreenResult | null>(null);
  const [reading, setReading] = useState<Interpretation | null>(null);
  const [problem, setProblem] = useState<string>("");
  const [trials, setTrials] = useState<number>(DEFAULT_LENGTH);

  const screen = useRef<Screen | null>(null);
  const player = useRef<TripletPlayer | null>(null);

  useEffect(() => () => player.current?.close(), []);

  const present = useCallback(async () => {
    const run = screen.current;
    const audio = player.current;
    if (!run || !audio) return;
    if (run.finished) {
      const finished = run.result();
      setResult(finished);
      setReading(interpret(finished));
      setStage("done");
      return;
    }
    setStage("playing");
    setEntered([]);
    const trial = run.current();
    setProgress(run.progress);
    try {
      await audio.playTriplet(trial.digits, trial.snrDb);
      setStage("answering");
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
      setStage("failed");
    }
  }, []);

  const begin = useCallback(async () => {
    setStage("loading");
    setProblem("");
    try {
      const audio = new TripletPlayer(manifest);
      await audio.prepare();
      player.current = audio;
      setStage("level");
      audio.playNoise();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
      setStage("failed");
    }
  }, [manifest]);

  const startRun = useCallback(async () => {
    player.current?.stop();
    screen.current = new Screen({ trials }, Date.now() % 100000);
    setResult(null);
    setReading(null);
    await present();
  }, [present, trials]);

  const submit = useCallback(
    async (answer: number[]) => {
      const run = screen.current;
      if (!run || run.finished) return;
      run.submit(answer);
      await present();
    },
    [present],
  );

  const press = useCallback(
    (digit: number) => {
      if (stage !== "answering") return;
      setEntered((current) => (current.length >= 3 ? current : [...current, digit]));
    },
    [stage],
  );

  /*
    Submitting is a consequence of the third digit arriving, not part of
    recording it. It used to be called from inside the state updater,
    which is a side effect in a function React is entitled to run more
    than once, and would have submitted the same answer twice the first
    time anybody turned on a mode that does that.
  */
  useEffect(() => {
    if (stage !== "answering" || entered.length !== 3) return;
    void submit(entered);
  }, [stage, entered, submit]);

  // A keyboard is faster than a mouse and some people only have one.
  useEffect(() => {
    if (stage !== "answering") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Backspace") {
        event.preventDefault();
        setEntered((current) => current.slice(0, -1));
        return;
      }
      const digit = Number(event.key);
      if (manifest.digits.some((d) => d.digit === digit)) press(digit);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, press, manifest.digits]);

  const keypad = manifest.digits.map((d) => d.digit);

  return (
    <div className="card card-lift p-6 sm:p-9">
      {manifest.placeholder && (
        <p
          data-testid="placeholder-warning"
          className="mb-6 rounded-xl border border-[var(--warn)] bg-[var(--warn-bg)] p-4 text-sm leading-relaxed text-ink"
        >
          <span className="font-semibold">This is not a hearing test yet.</span>{" "}
          The audio here is tone bursts rather than spoken digits, so a
          result from it says nothing about anybody&apos;s hearing. Everything
          else is real: the same adaptive procedure, the same scoring, the
          same rules about what counts as a usable run. Building the spoken
          material needs Amazon Polly, and until it is built this page is a
          demonstration of the mechanism rather than a measurement.
        </p>
      )}

      {stage === "idle" && (
        <div>
          <p className="eyebrow">The check</p>
          <h3 className="display-sm mt-2 text-3xl text-ink">A minute or two, with your own speakers</h3>
          <p className="mt-3 max-w-[60ch] leading-relaxed text-muted">
            You will hear three digits at a time with noise behind them, and
            type back what you heard. It gets harder while
            you are getting them right and easier when you are not, until it
            finds the point where you get about half of them.
          </p>
          <p className="mt-3 max-w-[60ch] leading-relaxed text-muted">
            Use whatever you normally listen with, in the room you normally
            sit in. The test measures a ratio rather than a level, so it does
            not need calibrated equipment, but it does need to be somewhere
            you can hear.
          </p>
          <button type="button" onClick={() => void begin()} className="mt-6 primary">
            Start
          </button>
        </div>
      )}

      {stage === "loading" && <p className="text-muted">Loading the audio ...</p>}

      {stage === "level" && (
        <div>
          <p className="eyebrow">Step one of two</p>
          <h3 className="display-sm mt-2 text-3xl text-ink">Set the volume</h3>
          <p className="mt-3 max-w-[60ch] leading-relaxed text-muted">
            That is the background noise on its own. Set your volume so it is
            about as loud as you would have the television. Comfortable, not
            quiet, and nowhere near uncomfortable.
          </p>
          {/*
            Every length, with its cost, and the engine says which can be
            chosen. Six and twelve are shown and disabled with the reason,
            so a person can see the short option exists and why it is
            not offered, rather than wondering. Twenty-four is marked as
            the recommendation because it is the published protocol.
          */}
          <fieldset className="mt-6">
            <legend className="text-sm font-semibold text-ink">How many rounds</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {LENGTHS.map((l) => (
                <label
                  key={l.trials}
                  className={`rounded-xl border p-3 text-sm ${
                    !l.offered
                      ? "cursor-not-allowed border-line opacity-60"
                      : trials === l.trials
                        ? "cursor-pointer border-[var(--accent)] bg-[var(--accent-soft)]"
                        : "cursor-pointer border-line"
                  }`}
                >
                  <input
                    type="radio"
                    name="length"
                    value={l.trials}
                    checked={trials === l.trials}
                    disabled={!l.offered}
                    onChange={() => setTrials(l.trials)}
                    className="mr-2 accent-[var(--accent)]"
                  />
                  <span className="font-semibold text-ink">
                    {l.trials} rounds
                    {l.recommended ? " (recommended)" : ""}
                  </span>
                  <span className="block text-muted">{l.offered ? l.minutes : l.reason}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => player.current?.playNoise()}
              className="secondary"
            >
              Play it again
            </button>
            <button type="button" onClick={() => void startRun()} className="primary">
              That is comfortable, begin
            </button>
          </div>
        </div>
      )}

      {(stage === "playing" || stage === "answering") && (
        <div>
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="display-sm text-3xl text-ink">
              {stage === "playing" ? "Listen" : "What did you hear?"}
            </h3>
            <p className="text-sm text-muted">
              {progress.done + 1} of {progress.total}
            </p>
          </div>

          <div className="progress-track mt-5">
            <div
              className="progress-fill"
              style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
            />
          </div>

          <div
            className="mt-6 flex justify-center gap-3"
            aria-live="polite"
            aria-label={`${entered.length} of three digits entered`}
          >
            {[0, 1, 2].map((slot) => (
              <div
                key={slot}
                className={`slot ${stage === "answering" && entered.length === slot ? "slot-active" : ""}`}
              >
                {entered[slot] ?? ""}
              </div>
            ))}
          </div>

          <div className="mt-7 grid grid-cols-4 gap-3">
            {keypad.map((digit) => (
              <button
                key={digit}
                type="button"
                disabled={stage !== "answering"}
                onClick={() => press(digit)}
                className="key"
              >
                {digit}
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={stage !== "answering" || entered.length === 0}
              onClick={() => setEntered((c) => c.slice(0, -1))}
              className="secondary"
            >
              Undo
            </button>
            <p className="text-sm text-muted">
              {stage === "playing"
                ? "Wait for the noise to finish."
                : "Guess if you are not sure. Guessing is part of how it works."}
            </p>
          </div>
        </div>
      )}

      {stage === "done" && result && reading && (
        <div>
          <p className="eyebrow">Your result</p>
          <h3 className="display-sm mt-2 max-w-[24ch] text-3xl text-ink">{reading.headline}</h3>

          {result.valid ? (
            <p className="mt-5 flex items-baseline gap-3">
              <span className="display text-5xl text-ink">{result.srtDb.toFixed(1)}</span>
              <span className="text-sm text-muted">dB signal to noise, your speech reception threshold</span>
            </p>
          ) : (
            <ul className="mt-3 list-inside list-disc text-sm text-muted">
              {result.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}

          <p className="mt-4 max-w-[60ch] leading-relaxed text-muted">{reading.nextStep}</p>
          <p className="mt-3 text-sm text-muted">
            {trials} rounds.
            {trials < DEFAULT_LENGTH
              ? ` The ${DEFAULT_LENGTH}-round check is a little more precise; if this result is close to the line, take that one.`
              : ""}
          </p>

          <p className="mt-4 max-w-[60ch] text-sm leading-relaxed text-muted">
            Compared against: {reading.reference.label}. {reading.reference.source}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={() => void startRun()} className="primary">
              Again
            </button>
            <button
              type="button"
              onClick={() => {
                player.current?.close();
                player.current = null;
                setStage("idle");
              }}
              className="secondary"
            >
              Finish
            </button>
          </div>
        </div>
      )}

      {stage === "failed" && (
        <div>
          <h3 className="display-sm text-3xl text-ink">That did not work</h3>
          <p className="mt-3 max-w-[60ch] leading-relaxed text-muted">{problem}</p>
          <button type="button" onClick={() => void begin()} className="mt-6 secondary">
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
