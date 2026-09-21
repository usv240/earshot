import {
  captionShare,
  defaultOfferOptions,
  drift,
  explain,
  qualifying,
  shouldOffer,
} from '@earshot/core';
import {HISTORY, SAMPLE, STEADY} from '../src/sessions';

/**
 * The sample history has to describe the situation it claims to.
 *
 * It is the thing on the television's home screen and the thing a demo
 * shows, so a drift of the wrong size or a history too short to qualify
 * would put a number on screen that the engine would never have
 * produced from real viewing. That is the sort of gap that survives
 * right up until somebody asks a question about it.
 */

const TODAY = '2026-09-20';

describe('the sample viewing history', () => {
  it('is marked as a sample, so the screen can say so', () => {
    expect(SAMPLE).toBe(true);
  });

  it('has enough sittings for the engine to say anything at all', () => {
    const options = defaultOfferOptions();
    const usable = qualifying(HISTORY, options);
    expect(usable.length).toBeGreaterThanOrEqual(
      options.baselineSessions + options.recentSessions,
    );
  });

  it('spans long enough that a fortnight of loud evenings cannot explain it', () => {
    const d = drift(HISTORY);
    expect(d).not.toBeNull();
    expect(d!.spanDays).toBeGreaterThanOrEqual(defaultOfferOptions().minSpanDays);
  });

  it('describes a creep of about six decibels, not a dramatic one', () => {
    // Half volume to full. Small enough that nobody would notice it
    // happening, which is the entire reason it is worth catching.
    const d = drift(HISTORY);
    expect(d!.driftDb).toBeGreaterThan(5);
    expect(d!.driftDb).toBeLessThan(7);
  });

  it('gets an offer out of the engine rather than out of the screen', () => {
    const decision = shouldOffer(
      HISTORY,
      {declines: 0, completed: false},
      TODAY,
      true,
    );
    expect(decision.offer).toBe(true);
    expect(decision.reasons.map(r => r.kind)).toContain('drift');
  });

  it('turns that into a sentence with the number in it', () => {
    const decision = shouldOffer(
      HISTORY,
      {declines: 0, completed: false},
      TODAY,
      true,
    );
    const text = explain(decision.reasons);
    expect(text).toMatch(/[0-9]/);
    expect(text).toMatch(/does not mean anything about you/i);
  });

  it('never claims anything about hearing on the home screen', () => {
    const text = explain(
      shouldOffer(HISTORY, {declines: 0, completed: false}, TODAY, true).reasons,
    );
    for (const forbidden of [/\bhearing loss\b/i, /\bdeaf\b/i, /\byour hearing\b/i]) {
      expect(forbidden.test(text)).toBe(false);
    }
  });

  it('does not use subtitles or rewinds to manufacture a second reason', () => {
    // The household in the sample only turned the volume up. If the
    // fixture quietly also set captions on, the offer would be resting
    // on evidence the story does not describe.
    expect(captionShare(HISTORY)).toBe(0);
    expect(HISTORY.every(s => s.rehearSeeks === 0)).toBe(true);
  });
});

describe('the household with nothing going on', () => {
  it('produces no offer, which is the usual answer', () => {
    const decision = shouldOffer(
      STEADY,
      {declines: 0, completed: false},
      TODAY,
      true,
    );
    expect(decision.offer).toBe(false);
    expect(decision.reasons).toEqual([]);
  });

  it('still has a measurable baseline, so silence is a decision not a gap', () => {
    const d = drift(STEADY);
    expect(d).not.toBeNull();
    expect(Math.abs(d!.driftDb)).toBeLessThan(0.01);
  });
});
