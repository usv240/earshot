import {DeviceSessionStore, PERSISTENCE_AVAILABLE} from '../src/store';
import type {Session} from '@earshot/core';

/**
 * The history has to survive the television being switched off.
 *
 * This is not persistence as a nicety. The model needs months of
 * sittings before it will say anything, so a store that forgets on
 * restart is a product that can never reach its own threshold, and the
 * app would sit there reporting nothing forever while appearing to
 * work.
 *
 * It does forget, today. React Native ships no storage and the standard
 * module for it does not build against react-native-tvos 0.83, which is
 * friction log entry 13. What is tested here is everything that will
 * still be right when one does: appending, capping, and refusing to
 * hand a malformed row to the model.
 */

const sitting = (over: Partial<Session> = {}): Session => ({
  startedAt: '2026-09-28',
  programme: {id: 'sintel', dialogueLufs: -40.6, speechSeconds: 1800},
  volume: 0.5,
  watchedSeconds: 3600,
  captionsOn: false,
  rehearSeeks: 0,
  ...over,
});

test('says plainly that sittings do not yet survive a restart', () => {
  /*
    A flag rather than a comment, because the home screen reads it and
    tells the household. A store that silently forgets, in a product
    whose whole model needs months, would be the most damaging quiet
    failure available here.
  */
  expect(PERSISTENCE_AVAILABLE).toBe(false);
});

test('a sitting is there for the rest of the session', async () => {
  const store = new DeviceSessionStore();
  await store.clear();
  await store.append(sitting({volume: 0.65}));
  const rows = await store.all();
  expect(rows).toHaveLength(1);
  expect(rows[0]!.volume).toBe(0.65);
});

test('sittings accumulate in the order they happened', async () => {
  const store = new DeviceSessionStore();
  await store.clear();
  for (const day of ['2026-01-01', '2026-02-01', '2026-03-01']) {
    await store.append(sitting({startedAt: day}));
  }
  expect((await store.all()).map(s => s.startedAt)).toEqual([
    '2026-01-01',
    '2026-02-01',
    '2026-03-01',
  ]);
});

test('an empty store reports nothing rather than failing', async () => {
  const store = new DeviceSessionStore();
  await store.clear();
  expect(await store.all()).toEqual([]);
});

test('a malformed row is dropped rather than fed to the model', async () => {
  /*
    A half-finished write, or a row from an older version of the app.
    Handing it to the drift calculation would produce a figure nobody
    could account for, which is worse than having one fewer sitting.
  */
  const store = new DeviceSessionStore();
  await store.clear();
  await store.append(sitting());

  const rows0 = await store.all();
  await store.writeRawForTest(
    JSON.stringify([...rows0, {startedAt: '2026-04-01', volume: 'loud'}]),
  );

  const rows = await store.all();
  expect(rows).toHaveLength(1);
  expect(rows[0]!.startedAt).toBe('2026-09-28');
});

test('corrupt storage reports an empty history rather than throwing', async () => {
  const store = new DeviceSessionStore();
  await store.writeRawForTest('not json at all');
  expect(await store.all()).toEqual([]);
});

test('a household that watches for years does not grow without limit', async () => {
  // The drift figure uses the earliest and latest handful. Everything
  // between only has to establish that the span is real.
  const store = new DeviceSessionStore();
  await store.clear();
  for (let i = 0; i < 450; i++) {
    await store.append(sitting({startedAt: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`}));
  }
  expect((await store.all()).length).toBeLessThanOrEqual(400);
});
