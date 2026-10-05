# The procedure, against the literature it came from

Nobody has taken this test. That is a real gap and this document does not
pretend to close it, so it is worth saying at the top exactly what
research can and cannot stand in for.

**Research can establish that the method works.** The digits-in-noise
paradigm has been measured on thousands of people across a dozen
languages. Its reliability, its relationship to pure-tone thresholds, and
its cut-points are published. None of that has to be rediscovered here,
and claiming to have rediscovered it would be worse than useless.

**Research cannot establish that our implementation is that method.** So
the first half of this document is a parameter-by-parameter comparison,
with a source against each row, and an honest column for where we differ.

**And research cannot tell you whether a person can use it.** Whether the
instruction makes sense, whether the volume-setting step works in a real
room, whether somebody gives up at trial nine. No citation covers that.
It needs people, it is usability rather than accuracy, and it is listed
at the bottom as outstanding.

## The procedure

| Parameter | Published | Earshot | Same? |
|---|---|---|---|
| Stimulus | Digit triplets in speech-shaped noise | Digit triplets in speech-shaped noise | yes |
| Adaptive rule | One-up one-down | One-up one-down | yes |
| Step size | 2 dB | 2 dB | yes |
| Trials per list | 24 | 24 | yes |
| Scoring | Whole triplet, no partial credit | Whole triplet, no partial credit | yes |
| Settling point | Stable SNR reached after the first four presentations | `settleAfter: 4` | yes |
| Threshold estimate | Mean SNR of trials 5 to 25, which is 21 values including the notional next presentation | Mean of presented ratios from trial 5, plus the ratio that would have come next | yes |
| Presentation | Diotic or antiphasic; they differ by about 6 dB | Diotic, because that is what a television plays | yes, and stated |
| Digit set | 0 to 9 | 1 to 9 excluding 7 | **no, see below** |
| Approach to threshold | Constant 2 dB from the start | 4 dB for the first four trials, then 2 dB | **no, see below** |
| Speech material | Recorded corpus, level-corrected per digit | Synthesised, level-corrected per digit | **no, see below** |
| Training list | One, for naive listeners | None | **no, see below** |

## Where we differ, and why

**The digit set.** We use 1 to 9 without 7. Zero and seven are the only
two-syllable digits in English, and a listener who catches a second
syllable has information the other digits do not give them. Published
English versions generally keep 0 to 9, so this is a deliberate departure
rather than an oversight, and it is one of the reasons the cut-points
below stay provisional: removing two items changes the test slightly.

**The approach to threshold.** The standard procedure uses 2 dB steps
throughout from a fixed start. The literature notes the problem this
creates directly: from a 0 dB start with 2 dB steps a listener cannot
reach below -10 dB SNR within the first five trials, so a good listener
is still descending when the averaging window opens. We use 4 dB for the
first four trials, which reaches -16 dB in four, and then 2 dB. The
validation run measures whether this biases the estimate, and it does
not: 0.037 dB over 2000 runs, with bias under 0.07 dB at every threshold
from -14 to -3.

**The speech material.** Ours is synthesised with Amazon Polly rather
than a recorded, normed corpus. This is the difference that matters most
and it is why every cut-point here is labelled provisional. What we can
check, we do: the eight digits arrive 4.37 dB apart and are levelled to
within 0 dB of each other, and the masking noise is built from those
recordings rather than borrowed, matching their long-term spectrum to
1.12 dB mean across 100 Hz to 6 kHz. Those are the properties the
literature specifies for the material. They are not the same as having
normed it.

**The training list.** Published protocols give naive listeners one
practice list, because performance improves over the first few trials as
somebody learns the task. We do not, which means our first trials carry
some learning effect. The coarse opening absorbs part of it by treating
the first four trials as approach rather than measurement, and the
threshold estimate discards them. It is not equivalent, and it is the
cheapest of the outstanding items to fix.

## The cut-points

Published diotic categories:

- **at or below -5.55 dB SNR**: normal auditory performance
- **above -5.55 up to -3.80**: insufficient
- **above -3.80**: poor

These are close to the cut-points derived from UK Biobank data, which
sit at -5.5 and -3.5.

Earlier versions of this project used -9 and -7. Those numbers came from
the observation that adult diotic thresholds often cluster near -9 dB,
which is a statement about where people score rather than about where a
screen should draw a line, and nothing supported them. On a screening
tool a three and a half decibel error in the cut-point is the difference
between telling somebody to see a doctor and telling them they are fine.

They are still labelled provisional, because our material is not the
material those categories were measured with.

## What the literature says about reliability, and what we measured

The two columns below measure different things and should not be read as
one validating the other. The published figures come from people taking
the test twice. Ours come from a model of a listener answering the
procedure two thousand times. They agree, which is reassuring about the
implementation and is not evidence about anybody's ears.

| | Published | Earshot, simulated |
|---|---|---|
| Measurement error | 0.7 dB | 0.748 dB test-retest spread |
| Test-retest bias | 0.45 dB in a clinical follow-up study | 0.037 dB |
| Limits of agreement | +2.63 and -3.54 dB | worst single miss 3.29 dB |
| Correlation between repeats | r = 0.9 | not applicable to a fixed-threshold model |

That the simulated spread lands within a twentieth of a decibel of the
published measurement error is the single most useful corroboration
available without recruiting anybody. It says the procedure as
implemented behaves like the procedure as described.

## What the cut-point does to a person

Sensitivity and specificity need a population, and inventing a
plausible-looking distribution of thresholds would be making up the
exact thing the numbers are supposed to come from. So this reports the
operating characteristic instead, which needs no such assumption: given
a listener whose true threshold really is X, how often does the screen
refer them. It is a property of the procedure, its measurement noise,
and where the line sits.

Cut-point -3.8 dB. 500 runs at each threshold, from `npm run validate`.

| True threshold | Distance from cut | Referred |
|---|---|---|
| -10.0 dB | 6.2 dB better | 0.0% |
| -8.0 dB | 4.2 dB better | 0.0% |
| -6.0 dB | 2.2 dB better | 0.2% |
| -5.0 dB | 1.2 dB better | 4.6% |
| -4.0 dB | 0.2 dB better | 34.2% |
| -3.0 dB | 0.8 dB worse | 83.8% |
| -2.0 dB | 1.8 dB worse | 99.4% |
| -1.0 dB | 2.8 dB worse | 100.0% |

Two things are worth reading off that table.

**Somebody comfortably inside the normal range is essentially never
referred.** Two decibels better than the cut-point, it happens twice in a
thousand. That is the property that decides whether this is tolerable to
put in a living room at all: a screen that refers healthy people teaches
them to ignore it, and the person who then ignores it is the same person
it exists for.

**Somebody clearly struggling is almost always caught.** Two decibels
worse, 99.4 percent.

Between those, around the cut-point itself, the answer is close to a coin
toss, and it has to be. A threshold measured with 0.75 dB of noise cannot
resolve a line drawn 0.2 dB away, and no amount of arithmetic changes
that. It is the reason the borderline band exists and says to repeat the
check in a week rather than offering a verdict.

## The evidence ladder

Stated plainly so that nothing here has to be inferred from how
confidently it is written.

**Measured, in this repository, reproducible with `npm run validate`:**
the procedure's bias and test-retest spread against known thresholds; its
behaviour at the ends of the range; its behaviour under careless
answering and shallow psychometric slopes; the level spread of the digits
before and after correction; the spectral match of the noise to the
speech.

**Modelled:** everything above uses a simulated listener with a logistic
psychometric function. Real listeners learn, tire, and attend in
structured ways that no model reproduces.

**Cited:** the paradigm, the procedure parameters, the reliability
figures, the cut-points, and the clinical significance of speech-in-noise
difficulty. Sources at the foot of this document and in the README.

**Outstanding, and needing people rather than reading:**

1. Whether anybody can complete it unaided. Completion rate, time taken,
   whether the volume-setting instruction lands.
2. Whether our synthesised material produces thresholds comparable to the
   published cut-points, which is what norming means.
3. A training list, and whether it changes the result.

The first of those is an evening's work with five people and would
produce a number this project does not currently have. The second is a
study. The third is an afternoon.

## Sources

- Procedure, step size, trial count, settling and averaging window: [*The digits-in-noise test: Assessing auditory speech recognition abilities in noise*](https://pubs.aip.org/asa/jasa/article/133/3/1693/913552/The-digits-in-noise-test-Assessing-auditory-speech), J. Acoust. Soc. Am.
- The one-up one-down procedure and its standard error: [*The one-up one-down adaptive (staircase) procedure in speech-in-noise testing*](https://pubs.aip.org/asa/jasa/article/152/4/2357/2839490/The-one-up-one-down-adaptive-staircase-procedure), J. Acoust. Soc. Am.
- Cut-points and hearing categories: [*Discrimination of degrees of auditory performance from the digits-in-noise test based on hearing status*](https://www.tandfonline.com/doi/full/10.1080/14992027.2020.1787531), International Journal of Audiology.
- Clinical test-retest and limits of agreement: [*The Feasibility and Reliability of a Digits-in-Noise Test in the Clinical Follow-Up of Children With Mild to Profound Hearing Loss*](https://pmc.ncbi.nlm.nih.gov/articles/PMC8221724/).
- Online and onsite implementations, and the approach-to-threshold problem: [*Digits-in-Noise test implementations for onsite and online testing with normal-hearing adults*](https://acta-acustica.edpsciences.org/articles/aacus/full_html/2025/01/aacus240120/aacus240120.html), Acta Acustica.
- Synthesised speech in a digits-in-noise test: [*Digits-In-Noise Hearing Test Using Text-to-Speech and Automatic Speech Recognition*](https://pmc.ncbi.nlm.nih.gov/articles/PMC12489207/).
- Speech-in-noise testing generally: [*Speech-in-Noise Testing: An Introduction for Audiologists*](https://pmc.ncbi.nlm.nih.gov/articles/PMC10872656/).
