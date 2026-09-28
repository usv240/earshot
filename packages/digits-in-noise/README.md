# digits-in-noise

The digits-in-noise hearing screen, as a dependency-free TypeScript
library.

A listener hears three spoken digits buried in noise and types back what
they heard. Get all three right and the next triplet is quieter relative
to the noise; get one wrong and it is louder. The track converges on the
ratio at which they get half of them right, and that ratio is the
result: the **speech reception threshold**, in decibels of signal to
noise, usually negative, where lower is better hearing.

```
npm install digits-in-noise
```

## Why this test

Two properties make it unusual.

**It measures a ratio, not a level**, so it survives hardware nobody
calibrated. That is why the World Health Organization put this test
rather than pure-tone audiometry into a phone app, and why it can run on
a television, a laptop, or anything else with a speaker.

**The response is three digits**, so it needs no reading, no language
beyond counting, and no touchscreen. A remote control is enough.

It also measures the thing a pure-tone test does not. Difficulty
following speech with other sound behind it is common in people with
entirely ordinary pure-tone thresholds, and diagnosing it needs speech
measured in noise rather than tones measured in silence.

## Use

```ts
import { Screen, interpret } from "digits-in-noise";

const screen = new Screen();

while (!screen.finished) {
  const trial = screen.current();
  // Play trial.digits at trial.snrDb against your noise, then:
  screen.submit(await whatTheListenerTyped());
}

const result = screen.result();
if (result.valid) {
  console.log(result.srtDb, interpret(result).nextStep);
} else {
  console.log(result.problems);
}
```

The engine knows nothing about audio, the DOM, or any framework. It is
arithmetic over a sequence of right and wrong answers, which is what
lets the same code run in a browser, in a React Native app, and in a
harness that answers its own trials.

## Measuring the measurement

A hearing screen cannot be checked against real listeners, because each
one gives a single number and there is nothing to compare it against. So
this package ships a simulated ear with a threshold you choose.

```ts
import { sweep } from "digits-in-noise";

sweep({ trueSrtDb: -9, slopePerDb: 0.18, lapseRate: 0.02 }, 2000);
// { runs: 2000, biasDb: 0.037, sdDb: 0.748, worstDb: 3.29, rejected: 0 }
```

Over 2000 runs the procedure reads a known threshold with a bias of
**0.037 dB** and a **0.748 dB** test-retest spread. The published
measurement error for this test is 0.7 dB. Those measure different
things and neither validates the other, but an implementation behaving
like its description is the most useful check available without
recruiting anybody.

## What it refuses to do

A screening tool that returns a number no matter what is worse than one
that declines, because the number gets believed.

`assessValidity` rejects a run where the track never changed direction,
where the threshold is pinned against an end of the presentable range,
or where the answers were the wrong length often enough to suggest
somebody was fighting the remote rather than listening. `interpret`
reports those as `unmeasured`, never as good news, at every threshold
they could have produced.

`interpret` also never names a condition, never promises an outcome, and
carries the reference its bands came from. A threshold in decibels means
nothing without the speech material it was measured with.

## The procedure

Defaults follow the published one: digit triplets in speech-shaped
noise, a one-up one-down track with a 2 dB step, 24 trials, scored on
the whole triplet, with the threshold taken as the mean of the presented
ratios once the track has settled plus the one that would have come
next. That last term matters more than it looks: without it the final
answer changes nothing and every run is biased half a step toward the
last mistake.

Every parameter is named and documented, because changing any of them
changes what the number means.

One deliberate departure: the digit set omits zero and seven, the only
two-syllable digits in English, and the first four trials use a larger
step. The second is because a 2 dB staircase from a 0 dB start cannot
reach a good listener's threshold before the averaging window opens.

## What this is not

It is not a diagnosis, and it is not a substitute for an audiologist. It
produces a threshold and a judgement about whether that threshold is
worth taking to somebody qualified to interpret it.

You must also supply the audio. The thresholds a screen produces depend
on the speech material it was measured with, so a corpus you have normed
is worth more than one you have not.

## Licence

MIT. Built for [Earshot](https://github.com/usv240/earshot), a hearing
screen that runs on a television.
