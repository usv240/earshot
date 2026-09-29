"use client";

import { useId, useState } from "react";

/**
 * A small (i) beside a term a newcomer will not know.
 *
 * Not hover-only. A third of the people this page is for will be on a
 * touchscreen, and some of the rest use a keyboard, so the explanation
 * opens on click, on Enter, and on focus, and closes on Escape. It is a
 * real button with a real label rather than a title attribute, because
 * title attributes are invisible to touch and to screen readers.
 *
 * The explanation is written once, here, so the same term reads the same
 * everywhere it appears.
 */

export const TERMS = {
  snr: {
    label: "signal-to-noise ratio",
    text: "How much louder the speech is than the noise behind it, in decibels. Zero means equal. Minus six means the speech is six decibels quieter than the noise. Lower is harder.",
  },
  srt: {
    label: "speech reception threshold",
    text: "The signal-to-noise ratio at which you get half the digits right. It is the one number this check produces. A lower number means you can pull speech out of noise better.",
  },
  retest: {
    label: "test-retest spread",
    text: "How much the result moves if the same person takes the test again. Ours is 0.748 dB over 2000 simulated runs; published figures for this test are 0.7 to 1.2 dB. Two results closer together than that are the same result.",
  },
  cutoff: {
    label: "the cut-off",
    text: "Minus 3.8 dB, from published categories for this test rather than from us. Above it, the check suggests seeing somebody. It is labelled provisional because our recordings are not the ones those categories were measured with.",
  },
  dialogueBoost: {
    label: "Dialogue Boost",
    text: "A setting Fire TV already has that makes speech louder than the music and effects. It is under Settings, Accessibility. Earshot cannot switch it on for you; no app can, which is friction log entry 1.",
  },
  diotic: {
    label: "diotic",
    text: "The same sound in both ears, which is what a television does. The other way, with the signal flipped in one ear, gives thresholds about six decibels lower, so cut-offs from one cannot be used for the other.",
  },
  gating: {
    label: "dialogue-gated loudness",
    text: "The loudness of a programme measured only over the stretches where somebody is speaking, ignoring the music and the effects. Amazon Transcribe finds where the words are; ffmpeg measures the loudness there and nowhere else.",
  },
  mcp: {
    label: "MCP server",
    text: "The way an assistant like Alexa+ talks to Earshot. It can explain what the television watches and look up checks that were taken. It cannot report how anybody watches television, because that never leaves the device.",
  },
} as const;

export type Term = keyof typeof TERMS;

export function Info({ term }: { term: Term }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const { label, text } = TERMS[term];

  return (
    <span className="relative inline-block align-baseline">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        aria-expanded={open}
        aria-controls={id}
        aria-label={`What does ${label} mean`}
        className="info-btn"
      >
        i
      </button>
      {open && (
        <span
          id={id}
          role="note"
          className="info-pop card-lift"
          onClick={() => setOpen(false)}
        >
          <span className="block text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
            {label}
          </span>
          <span className="mt-1 block text-sm leading-relaxed text-ink">{text}</span>
        </span>
      )}
    </span>
  );
}
