# Earshot

**Live:** <https://d29nbz7seeunuf.cloudfront.net> — take the check yourself.
**Agent endpoint:** <https://inwrmblw32v4iyzsxkr5bfpidu0izuah.lambda-url.us-east-1.on.aws/mcp>

**You passed the hearing test and you still can't hear the television.**

That sentence describes a real and very common situation, and it is the one this
project is built around.

In September 2024 the FDA authorised the first over-the-counter hearing aid
software, and AirPods Pro 2 now run a five-minute hearing test. It is a genuinely
good thing and it is pure-tone audiometry: tones in quiet. The literature is
blunt that the audiogram misses the complaint people actually have. Normal
pure-tone thresholds with poor speech-in-noise performance is common enough to
have its own name, and diagnosing it needs speech measured in noise rather than
tones measured in silence.

So the person who cannot follow dialogue can take the best-funded hearing test in
the world and be told they are fine.

Earshot measures the other thing, on the device where the complaint lives.

## Why the television

Because it already has the evidence, and because it is where the problem shows up
first.

A paper in the Journal of Laryngology and Otology validated television volume as
a clinical marker. Someone who turns the set up has a 68 percent chance of
already having hearing loss of 25 dB or more, at 81 percent sensitivity. For news
programmes, where the content is nearly all speech, the average loss among those
viewers was 41 dB. The authors recommend it "in situations where audiometry is
unavailable".

They collected it by asking patients in a clinic. The television knows the real
number every night and has never been asked. It can also do better than the paper
could, because it knows how loud the programme's dialogue was, so the signal is
not "did you turn it up" but **how far past this programme are you listening**.

Why it is worth catching: around 80 percent of people with hearing loss do not
know, those who notice wait about seven years to ask anyone and over ten to be
fitted, and the 2024 Lancet standing Commission puts hearing loss level with high
LDL cholesterol as the largest modifiable risk factor for dementia from midlife,
at 7 percent of cases worldwide.

## What it does

**Notices.** Compares the dialogue loudness of what is playing against the volume
this household chose, and watches for captions going on and for rewinding to hear
a line again. No microphone. No camera. Nothing leaves the device.

**Asks.** When the pattern persists, offers 90 seconds with the remote. Three
spoken digits in noise, getting harder, until it finds the ratio at which you get
half of them right. That ratio is the speech reception threshold, and it is the
measurement the audiogram cannot substitute for.

**Helps.** Fire TV already ships Dialogue Boost, hearing-aid pairing and direct
streaming to cochlear implants. All of it is for people who already know. Earshot
turns the first one on, measures whether it helped, and produces one page to take
to a doctor.

## Why a digit test works on a television

It measures a **ratio**, not a level, so it survives hardware nobody calibrated.
That is why the World Health Organization put this test rather than pure-tone
audiometry into a phone app, and it is why a living room is a viable place to run
one.

The response is three digits. No reading, no language beyond counting, no
touchscreen. For this measurement a remote control is a better input device than
a phone, and it is already in the right hand, in the right room, pointed at the
thing that caused the complaint.

## Every number here is a test

A hearing screen cannot be checked against real listeners, because each one gives
a single number and there is nothing to compare it against. So the procedure is
run against simulated listeners whose thresholds were chosen in advance, and the
question becomes whether the number that comes back is the number that went in.

Over 2000 runs against an ordinary adult ear, the procedure reads a known
threshold with a bias of **0.037 dB** and a **0.748 dB** test-retest spread.
Published test-retest figures for this test sit between 0.7 and 1.2 dB.

Bias stays under 0.07 dB at every threshold from -14 to -3 dB, which matters more
than the headline. A screen exists to sort people near a cut-off, and those people
are at the ends of the range, not in the comfortable middle.

These come out of `npm run validate`, are written to
`apps/eval/results/validation.json`, and are read back by
`apps/eval/test/claims.test.ts`. Nothing about accuracy is typed in by hand.

To be explicit about what that establishes: it measures the **procedure**, using
a model of a listener. It is not a clinical trial and does not stand in for one.
Our digit audio is synthesised rather than drawn from a normed corpus, so the
referral bands in the library are labelled provisional until our own material has
been normed. See [docs/EVAL.md](docs/EVAL.md).

## What already exists

Most of the interesting objections to this project are about prior art, so they
are answered in one place rather than avoided: [docs/PRIOR_ART.md](docs/PRIOR_ART.md).
Apple ships a hearing test. Intel holds a patent on passive detection from device
volume. No television does either, and the audiogram misses the failure mode this
is aimed at.

## Run it

```
npm install
npm test                 # 171 tests: the engine, the wording, the listening
                         # model, the agent, and every published number
npm run validate         # regenerate the validation results
npm run web:dev          # the site, and the check you can take yourself
```

`npm install` installs the Fire TV app too, and `npm test` runs its suite.
The app is outside the npm workspaces because Metro and Gradle both resolve
from the app directory and hoisting breaks them, so without those two lines
a clean clone gets a long green run that never touched this project's
primary track.

## What this is not

A screen, not a diagnosis. It can say something is worth getting checked. It
cannot say what is wrong, how bad it is, or whether anything can be done, and the
wording is tested to make sure it never tries. That test walks every sentence the
tool can produce and fails if any of them names a condition, promises an outcome,
or turns a test that did not work into good news.

## Licence

MIT. `packages/digits-in-noise` is published separately as a dependency-free
library, because the only open implementations of this test are in Java and
native mobile code and the ecosystem should have one that runs anywhere.

## Sources

- Hidden hearing loss: [ASHA Leader](https://leader.pubs.asha.org/doi/10.1044/leader.FMP.23032018.6) and a [2025 systematic review](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11940875/)
- Television volume as a marker: [*Validation of self-reported hearing loss using television volume*](https://pubmed.ncbi.nlm.nih.gov/20831845/), Journal of Laryngology and Otology
- Dementia risk: [Livingston et al., Lancet standing Commission, 2024](https://www.thelancet.com/article/S0140-6736(24)01296-0/abstract)
- Delay and undiagnosed rates: [ASHA, *Untreated Hearing Loss in Adults*](https://www.asha.org/Articles/Untreated-Hearing-Loss-in-Adults/)
- The test: [*Evaluating a smartphone digits-in-noise test as part of the audiometric test battery*](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5968873/)
- Remote self-administration: [*Remote self-report and speech-in-noise measures predict clinical audiometric thresholds*](https://pmc.ncbi.nlm.nih.gov/articles/PMC12951638/)
- OTC hearing aid software: [FDA, September 2024](https://www.fda.gov/news-events/press-announcements/fda-authorizes-first-over-counter-hearing-aid-software)
- Prior open implementation, in Java: [nzilbb/digit-triplets-test](https://github.com/nzilbb/digit-triplets-test)
