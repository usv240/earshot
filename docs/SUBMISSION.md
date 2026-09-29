# Earshot: submission

## What it is

**You passed the hearing test and you still can't hear the television.**

In September 2024 the FDA authorised the first over-the-counter hearing
aid software, and AirPods Pro 2 now run a five-minute hearing test. It is
a good thing and it is pure-tone audiometry: tones in a quiet room. The
literature is blunt that the audiogram misses the complaint people
actually have. Normal pure-tone thresholds with poor speech-in-noise
performance is common enough to have a name, and diagnosing it needs
speech measured in noise rather than tones measured in silence.

So the person who cannot follow dialogue can take the best-funded hearing
test in the world and be told they are fine.

Earshot measures the other one, on the device where the complaint lives.

**It notices, and this half is a proposal rather than a shipped
feature.** The model compares how loud a programme's dialogue actually
is against the volume a household chose for it: not whether the set was
turned up, but how far past the programme somebody is listening, along
with subtitles going on and rewinding to hear a line again.

A third-party Fire TV app cannot do that, and we established why rather
than assuming it. Reading what another app is playing needs
`MEDIA_CONTENT_CONTROL`, which is signature-level and unavailable, or
notification-listener access, whose settings screen is not reliably
reachable on Fire OS and in practice needs ADB. System volume is
readable by any app; what is playing is not. So the one signal that
makes this product different from a hearing test you have to go looking
for can only be produced by the platform.

The model is built, tested and demonstrable against recorded sessions.
What it needs is an API that does not exist, which is
[FRICTION_LOG.md](../FRICTION_LOG.md) entry 12 and the feature request
this submission most wants read.

**It asks, rarely.** After months, never during a programme, never twice
in a season, and never again if somebody declines twice.

**It measures.** Ninety seconds with the remote. Three spoken digits in
noise, adaptive, producing a speech reception threshold in dB SNR. The
digits-in-noise test measures a ratio rather than a level, which is why
the World Health Organization put it rather than pure-tone audiometry
into a phone app, and why a living room is a viable place to run one.

**It helps.** It explains where Fire TV's Dialogue Boost lives, and
produces one page to take to a doctor.

## Why it matters

Around 80 percent of people with hearing loss do not know. Those who
notice wait roughly seven years before asking anyone and over ten before
being fitted. The 2024 Lancet standing Commission puts hearing loss level
with high LDL cholesterol as the largest modifiable risk factor for
dementia from midlife, at 7 percent of cases worldwide.

And the television already has the evidence. A paper in the Journal of
Laryngology and Otology validated television volume as a clinical marker:
someone who turns the set up has a 68 percent chance of already having
hearing loss of 25 dB or more, at 81 percent sensitivity. For news
programmes, where the content is nearly all speech, the average loss
among those viewers was 41 dB. The authors recommend it "in situations
where audiometry is unavailable".

They collected it by asking patients in a clinic. The television knows
the real number every night and has never been asked.

## Tracks and mini challenges

- **Primary track: Fire TV.** A React Native app on Fire OS: the passive
  listening model, the offer, and the screen driven entirely by a remote.
- **Alexa+:** an Agent Skill, which is the path the rules prioritise,
  at [skills/earshot/SKILL.md](../skills/earshot/SKILL.md), backed by a
  self-hosted MCP server implementing spec revision 2025-11-25 over
  Streamable HTTP with five tools. The skill is held to the same checks
  as every other document here: its figures are re-derived, it may not
  claim a first, and a test fails the build if it lists a tool the
  server does not implement or drops one it does.
- **Mini challenge: AWS Builder.** Amazon Transcribe, Amazon Polly,
  Amazon S3, Amazon DynamoDB, AWS Lambda, CloudFront. See
  [AWS.md](AWS.md) for exactly what each does and the minimum IAM policy.
- **Mini challenge: Open Source.** `digits-in-noise`, a new
  dependency-free TypeScript library, MIT.

## Pre-existing project

None of this existed before the submission window. The repository's first
commit is in it. The Fire TV build scaffolding was carried across from a
sibling project of ours in the same hackathon, which is stated in the
commit that did so; it is build configuration rather than product code,
and it encodes four friction-log entries' worth of Windows toolchain
fixes that were expensive to learn once.

## Open Source mini challenge

- **Repository:** https://github.com/usv240/earshot
- **GitHub username:** usv240
- **The contribution:** `packages/digits-in-noise`, published from this
  repository under MIT.
- **What it is:** the digits-in-noise hearing screen as a
  dependency-free TypeScript library. The adaptive one-up one-down track,
  triplet scoring, speech reception threshold estimation, the validity
  rules that decide when a run must be refused, and a simulated listener
  with a known threshold so the procedure itself can be measured.
- **Why it matters:** the existing open implementations of this test are
  a Java webapp and native mobile code. There was no TypeScript one, and
  the same engine needs to run in a browser, in a React Native app on a
  television, and in a validation harness answering its own trials. It is
  useful to anyone building hearing screening, speech-in-noise research
  tooling, or accessibility testing on the web.

## Every number, re-derived

A hearing screen cannot be checked against real listeners, because each
one gives a single number and there is nothing to compare it against. So
the procedure is run against simulated listeners whose thresholds were
chosen in advance, and the question becomes whether the number that comes
back is the number that went in.

Over 2000 runs against an ordinary adult ear the procedure reads a known
threshold with a bias of **0.037 dB** and a **0.748 dB** test-retest
spread. Published test-retest figures for this test sit between 0.7 and
1.2 dB. Bias stays under 0.07 dB at every threshold from -14 to -3 dB,
which matters more than the headline: a screen exists to sort people near
a cut-off, and those people are at the ends of the range.

These come out of `npm run validate`, are written to
`apps/eval/results/validation.json`, and are read back by
`apps/eval/test/claims.test.ts`. Nothing about accuracy is typed in by
hand. A test also refuses to let any document here claim the screen was
tried on human listeners, because it was not: it was measured against a
model of one. See [EVAL.md](EVAL.md).

## What we refuse to do

This is a health-adjacent product built by people who are not
clinicians, so the restraint is in the code rather than in the copy.

- **It is a screen, not a diagnosis.** A test walks every sentence the
  tool can produce and fails if any names a condition, promises an
  outcome, or turns a run that did not work into good news. That last
  direction is the dangerous one, because the person most likely to
  produce an unusable run is the one whose hearing is furthest outside
  the range we can present.
- **It never estimates hearing from how you watch.** Volume is 81 percent
  sensitive and 52 percent specific, which is a good reason to ask
  somebody a question and a terrible basis for telling them anything. The
  listening model has no field anywhere that holds a hearing estimate,
  and a test enforces that.
- **It refuses runs rather than reporting them.** A track that never
  settles produces a tidy average that is an artefact of the clamp.
- **The referral bands are labelled provisional.** Our digits are
  synthesised rather than drawn from a normed corpus, and speech material
  moves where a threshold falls.

## Privacy

There is no microphone anywhere in this project: not in the television
app, not on the website, not on the server. There is no camera. The only
audio that reaches AWS is a film's own soundtrack, sent to locate the
dialogue so its loudness can be measured, and the words it comes back
with are used for their timestamps and nothing else.

How a household watches television never leaves the device it was watched
on. The MCP server therefore cannot report it, and a test walks every
tool and fails if any of them ever returns a listening figure.

## What exists today, and what does not

**Working and verified:**

- The screen, in a browser, driven end to end in a real browser with nine
  checks and a full twenty-four trial run.
- The Fire TV app, with the listening model, the offer rule and the
  remote-driven screen.
- The MCP server, spec-conformant, with its session lifecycle, error
  codes and Origin handling tested.
- The pipeline: dialogue-gated loudness through Transcribe, and the test
  material through Polly, with the noise shaped to the speech and checked
  band by band.

**Honest gaps, all of them stated in the product itself rather than only
here:**

- The digits are real, synthesised with Amazon Polly and levelled so all
  eight sit within 0 dB of each other, with masking noise matched to
  their own spectrum to 1.12 dB mean across 100 Hz to 6 kHz. They are
  still not a normed corpus, so the referral bands stay provisional.
- The television's viewing history is **sample data**, and the app says
  so on its home screen. Two reasons, and the second is the important
  one. A household has to watch for months before the model has anything
  to say, which is correct behaviour and a poor demonstration. And a
  third-party app cannot collect the real thing from *other* apps on
  Fire TV, for the platform reason above.

  It can measure its own playback, and does. The app plays Sintel, whose
  dialogue loudness the pipeline measured at -40.6 LUFS over the 28
  seconds where somebody is speaking, and records a real sitting with
  the same code the model consumes: the level the viewer settled on, how
  long they watched, whether they reached for subtitles, and how often
  they went back eight seconds. Those sittings appear on the home screen
  alongside the sample ones and are labelled as the real ones.

  The player owns its own volume control, because a React Native app
  cannot read the system level the remote's volume keys set without a
  native module. For playback the app owns, that is the entire
  measurement and nothing is estimated. Sittings are kept on the
  television in `react-native-mmkv` and survive the app closing, which
  is what lets a history accumulate over the months the model needs.
  Nothing about them is uploaded anywhere.
- Fire TV exposes no way to turn Dialogue Boost on or to read whether it
  is on, so the app explains where the setting lives and cannot confirm
  anybody found it. Friction log entry 1.
- The demo MCP endpoint has **no authentication**. A household is a name
  somebody chose, so anybody who guesses it can read that history. That
  is a deliberate scope for a demonstration and would be indefensible in
  a product. What is stored carries no identity at all: a date, a
  threshold, whether the run settled, and its reference. A product would
  put it behind the household's existing Amazon identity.

## Deliverables

- **Repository:** https://github.com/usv240/earshot, MIT, all source and
  instructions.
- **Live site:** https://d29nbz7seeunuf.cloudfront.net
- **Live MCP endpoint:** https://inwrmblw32v4iyzsxkr5bfpidu0izuah.lambda-url.us-east-1.on.aws/mcp
- **Demo video:** add when published.
- **Friction log:** [FRICTION_LOG.md](../FRICTION_LOG.md), thirteen entries,
  two of them against us.
- **Product feedback:** [PRODUCT_FEEDBACK.md](../PRODUCT_FEEDBACK.md),
  every tool, API and SDK used.
- **Evidence:** [EVAL.md](EVAL.md) for what was measured and what it does
  not establish. [PRIOR_ART.md](PRIOR_ART.md) for what already exists,
  named before a judge has to find it.
- **AWS integration:** [AWS.md](AWS.md).

## Run it

```
npm install
npm test          # 204 tests
npm run validate
npm run web:dev
```

No AWS account is needed for any of that. The procedure, the threshold
estimation, the validity rules, the wording, the listening model, the
speech-region arithmetic and all of the signal processing are pure
functions with tests.
