# Earshot

**Your Fire TV can already help you hear. It just doesn't know you can't.**

Fire TV ships Dialogue Boost, hearing-aid pairing, direct streaming to cochlear
implants, and captions. Every one of those helps a person who already knows.
Around 80 percent of people with hearing loss do not, and those who do notice
wait about seven years before asking anyone, and over ten before being fitted.

That wait is not a small thing. The 2024 Lancet standing Commission puts hearing
loss level with high LDL cholesterol as the largest modifiable risk factor for
dementia from midlife, at 7 percent of cases worldwide.

Earshot is the part nobody built: the bit that notices.

## The evidence the television already has

There is a paper from the Journal of Laryngology and Otology that validated
television volume as a clinical marker. Someone who turns the television up has
a 68 percent chance of already having hearing loss of 25 dB or more, at 81
percent sensitivity. For news programmes, where the content is almost all
speech, the average loss among those viewers was 41 dB. The authors conclude it
is useful "in situations where audiometry is unavailable".

They collected it by asking patients in a clinic.

The television knows the actual number, every night, and has never been asked.
It can do better than the paper could, because it also knows how loud the
programme's dialogue was, so the signal is not "did you turn it up" but "how far
past this programme are you listening".

## What it does

**Notices.** Compares the dialogue loudness of what is playing against the
volume this household chose, and watches for captions going on and for rewinding
to hear a line again. No microphone. No camera. Nothing leaves the device.

**Asks.** When the pattern persists, offers 90 seconds with the remote. Three
spoken digits in noise, getting harder, until it finds the ratio at which you
get half of them right. That ratio is the speech reception threshold.

**Helps.** Turns on Dialogue Boost and measures whether it helped, then produces
one page to take to a doctor.

## Why a digit test, and why it works on a television

The digits-in-noise test measures a **ratio**, not a level, so it survives
hardware nobody calibrated. That is why the World Health Organization put this
test rather than pure-tone audiometry into a phone app, and it is why a living
room is a viable place to run it.

The response is three digits. No reading, no language beyond counting, no
touchscreen. A remote control is a better input device for this than a phone.

## Every number here is a test

The screen is measured against simulated listeners whose thresholds were chosen
in advance, because a real listener gives one number once and there is nothing
to check it against. Over 2000 runs against an ordinary adult ear, the procedure
reads a known threshold with a bias of **0.037 dB** and a **0.748 dB**
test-retest spread. Published test-retest figures for this test sit between 0.7
and 1.2 dB.

Bias stays under 0.07 dB at every threshold from -14 to -3 dB, which matters
more than the headline: people near the referral cut-off are the entire point of
a screen, and they live at the ends of the range, not the middle.

These figures come out of `npm run validate`, are written to
`apps/eval/results/validation.json`, and are read back by
`apps/eval/test/claims.test.ts`. Nothing about accuracy is typed in by hand.

To be explicit about what that does and does not establish: this measures the
**procedure**, using a model of a listener. It is not a clinical trial and does
not stand in for one. Our digit audio is synthesised rather than drawn from a
normed corpus, so the referral bands in the library are labelled provisional
until our own material has been normed. See [docs/EVAL.md](docs/EVAL.md).

## Run it

```
npm install
npm test                 # the engine, the wording, and every published number
npm run validate         # regenerate the validation results
```

## What this is not

It is a screen, not a diagnosis. It can say that something is worth getting
checked. It cannot say what is wrong, how bad it is, or whether anything can be
done, and the wording is tested to make sure it never tries. That test walks
every sentence the tool can produce and fails if any of them names a condition,
promises an outcome, or turns a test that did not work into good news.

## Licence

MIT. `packages/digits-in-noise` is published separately as a dependency-free
library, because the only open implementations of this test are in Java and
native mobile code and the ecosystem should have one that runs anywhere.

## Sources

- Dementia risk: Livingston et al., *Dementia prevention, intervention, and care: 2024 report of the Lancet standing Commission*, The Lancet, 2024. <https://www.thelancet.com/article/S0140-6736(24)01296-0/abstract>
- Television volume as a marker: *Validation of self-reported hearing loss using television volume*, Journal of Laryngology and Otology. <https://pubmed.ncbi.nlm.nih.gov/20831845/>
- Delay and undiagnosed rates: American Speech-Language-Hearing Association, *Untreated Hearing Loss in Adults*. <https://www.asha.org/Articles/Untreated-Hearing-Loss-in-Adults/>
- The test: *Evaluating a smartphone digits-in-noise test as part of the audiometric test battery*. <https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5968873/>
- Self-administered and remote use: *Remote self-report and speech-in-noise measures predict clinical audiometric thresholds*. <https://pmc.ncbi.nlm.nih.gov/articles/PMC12951638/>
- Prior open implementation, in Java: <https://github.com/nzilbb/digit-triplets-test>
