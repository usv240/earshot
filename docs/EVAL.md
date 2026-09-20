# How the screen was measured, and what that does not cover

## The problem with evaluating a hearing test

Every real listener gives you one number, once. There is nothing to compare it
against without a clinical audiogram beside it, which is exactly the thing a
screen exists to avoid needing. So a hearing screen can be confidently wrong for
its entire life and nobody finds out.

The way round it is to run the procedure against listeners whose thresholds were
chosen in advance. A simulated ear has a known answer, so "is the number right"
becomes a question with a reply.

## The model

The chance of repeating a triplet correctly rises smoothly with the ratio of
speech to noise, passing through one half at that listener's threshold. Three
parameters: the threshold, how sharply performance improves either side of it,
and how often the listener gets one wrong for reasons unrelated to hearing.

One detail is worth stating because getting it wrong would quietly corrupt every
figure below. The curve's midpoint is shifted so that the configured threshold
really is the half-right point even when lapses cap the curve below one.
Without that, a listener defined with a 2 percent lapse rate has a true
threshold a fraction of a decibel from the number we set, and every bias
measurement inherits an error we introduced ourselves. There is a test for it.

## What was measured

Regenerate with `npm run validate`. Written to `apps/eval/results/validation.json`
and read back by `apps/eval/test/claims.test.ts`.

**Headline, 2000 runs against an ordinary adult ear at -9 dB:** bias 0.037 dB,
test-retest spread 0.748 dB, worst single miss 3.29 dB, no runs refused.
Published test-retest standard deviations for digits-in-noise screens sit
between 0.7 and 1.2 dB.

**Across the range**, 500 runs at each of -14, -12, -10, -9, -7, -5 and -3 dB:
bias stays below 0.07 dB throughout. This matters more than the headline. A
screen exists to sort people near a cut-off, and those people are at the ends of
the range, not in the comfortable middle. A procedure that is unbiased at -9 and
half a decibel off at -5 would sort everybody near the referral line by our
arithmetic rather than by their hearing, in one direction, permanently.

**Carelessness**, at lapse rates of 0, 2, 5 and 10 percent: bias stays under
1 dB even when one answer in ten is thrown away for reasons that have nothing to
do with hearing. Nobody sits still for 24 trials in a living room.

**Shallow slopes**, from 0.10 to 0.22 per dB: the spread grows as the slope
flattens, and the test asserts that it does. A listener whose performance
improves only gradually is genuinely harder to pin down, which is a property of
the method rather than a defect, and hiding it would be the dishonest choice.

**Refusals**, asserted as exact: an ear better than the quietest ratio the test
can present, and an ear worse than the loudest, are both rejected rather than
reported. Those runs produce a tidy-looking average that is an artefact of the
clamp. A screening tool that returns a number no matter what is worse than one
that declines, because the number is what gets believed, and the person most
likely to produce an unusable run is the one whose hearing is furthest outside
the range.

## What this does not establish

It measures the **procedure**, using a model of a listener. It is not a clinical
trial and is not a substitute for one.

Specifically, it says nothing about our audio. The published thresholds this
project quotes were measured with recorded digit corpora that were normed on
people. Ours are synthesised. Speech material changes where the threshold falls,
so the referral bands shipped in `packages/digits-in-noise` are labelled
provisional, carry their source with them, and are configurable rather than
hard-coded. Norming our own material means measuring a distribution on people,
and until that exists the bands are a starting point that the code says is a
starting point.

The model is also a model. Real listeners have attention that wanders in
structured ways, learn the task as they go, and occasionally answer from memory
rather than hearing. A simulation gets none of that. What it does give is the
one thing a field trial cannot: a known answer, thousands of times, at every
threshold in the range.

## Sources

- *Evaluating a smartphone digits-in-noise test as part of the audiometric test battery*. <https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5968873/>
- *Remote self-report and speech-in-noise measures predict clinical audiometric thresholds*. <https://pmc.ncbi.nlm.nih.gov/articles/PMC12951638/>
- *The multilingual digits-in-noise (DIN) test: development and evaluation*, International Journal of Audiology. <https://www.tandfonline.com/doi/full/10.1080/14992027.2024.2397068>
- Prior open implementation, in Java: <https://github.com/nzilbb/digit-triplets-test>
