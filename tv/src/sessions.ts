import type {Session} from '@earshot/core';

/**
 * What the player recorded.
 *
 * In a shipped app these are written by the app's own video player, one
 * row per sitting: the programme's dialogue loudness from the analysis
 * the pipeline produced, the volume the household chose, whether the
 * subtitles were on, and how often somebody went back to hear a line
 * again. Nothing leaves the device.
 *
 * The rows below are a sample, marked as one, so the screens can be
 * built and demonstrated before there is a real history to draw on. A
 * household has to watch for months before this product has anything to
 * say, which is correct behaviour and a poor demonstration.
 *
 * They describe one specific situation, and it is the one worth showing:
 * a household whose volume has crept up about six decibels over three
 * months for the same kind of programme. Nothing dramatic, nothing
 * anybody would notice happening, which is exactly why it is worth a
 * television noticing.
 */

export const SAMPLE = true;

const DAY = 86_400_000;

function sitting(dayOffset: number, volume: number, extra: Partial<Session> = {}): Session {
  return {
    startedAt: new Date(Date.parse('2026-06-01') + dayOffset * DAY)
      .toISOString()
      .slice(0, 10),
    programme: {
      id: `programme-${dayOffset}`,
      // Broadcast drama sits near here once the music is gated out.
      dialogueLufs: -27,
      speechSeconds: 1800,
    },
    volume,
    watchedSeconds: 3600,
    captionsOn: false,
    rehearSeeks: 0,
    ...extra,
  };
}

/**
 * Twenty sittings across about three months, with the volume creeping.
 *
 * The first ten sit at half volume, the last ten at full, which is a
 * little over six decibels. That is the size of change this product
 * exists to catch: far too small to notice happening, far too gradual to
 * remember, and quite large enough to be worth a question.
 */
export const HISTORY: Session[] = [
  ...Array.from({length: 10}, (_, i) => sitting(i * 4, 0.5)),
  ...Array.from({length: 10}, (_, i) => sitting(40 + i * 4, 1)),
];

/** A household with nothing going on, for the other screen. */
export const STEADY: Session[] = Array.from({length: 20}, (_, i) =>
  sitting(i * 4, 0.5),
);
