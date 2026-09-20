# What already exists, and what is left

Written before the second commit, because an idea that has not been
collision-checked is a guess. Everything below was found by searching, read,
and is linked so it can be checked rather than taken on trust.

The short version: this exists in pieces, owned by different people, and has
never been assembled on a television. Two of the three layers have real prior
art. One of them is shipped by Apple at enormous scale.

## The hearing test on consumer hardware: shipped

In September 2024 the FDA
[authorised the first over-the-counter hearing aid software](https://www.fda.gov/news-events/press-announcements/fda-authorizes-first-over-counter-hearing-aid-software).
AirPods Pro 2 with an iPhone now run a five-minute hearing test, build a
personal hearing profile, and act as a hearing aid, as a free software update.

This is the strongest thing standing in front of this project and it deserves
to be named first rather than discovered by a judge. Any claim that this has never been done on a consumer device before is
simply false.

Two things it does not do, and both are the point of this project.

**It is pure-tone audiometry, in quiet.** The audiogram is the wrong instrument
for the complaint that brings people here. People with normal pure-tone
thresholds routinely cannot follow speech in noise, which the literature calls
hidden hearing loss, with central auditory processing disorder and cochlear
synaptopathy as the two leading explanations. The American Speech-Language-Hearing
Association describes it as
["difficulty recognizing speech in noise despite normal pure-tone thresholds"](https://leader.pubs.asha.org/doi/10.1044/leader.FMP.23032018.6),
and a [2025 systematic review](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11940875/)
concludes that diagnosis needs speech-perception-in-noise measurement rather
than pure-tone audiometry alone.

So somebody who cannot follow television dialogue can take the best-funded
hearing test in the world and be told they are fine.

**It has to be chosen.** A test you must decide to take only reaches people who
already suspect. Around 80 percent of people with hearing loss do not know, so
they never decide, and the ones who do notice wait roughly seven years.

There is also a reach argument worth stating plainly. AirPods Pro 2 and an
iPhone is an expensive household. The people who wait longest skew older and
poorer. A Fire TV Stick is about thirty dollars and is already under the
television.

## Passive detection from volume behaviour: patented, not shipped

Intel holds [US11688515B2](https://patents.google.com/patent/US11688515B2/en),
"Mobile device based techniques for detection and prevention of hearing loss",
filed March 2020, granted June 2023, in force until 2037. It covers collecting
hearing indicators including ambient noise, speech volume and **device volume
settings**, clustering them by context, identifying trends over weeks and
months, and producing a report with a hearing loss estimate.

That is close to the noticing layer here and it would be dishonest to pretend
otherwise. Three differences are real rather than cosmetic.

It is **passive only**. The patent explicitly does not cover administering a
hearing test, which is the half that turns a suspicion into something a
clinician can act on.

Its reference is **the room**: ambient noise captured by a microphone, plus
location for context. Ours is **the programme**: how loud this film's dialogue
actually is, measured from the audio itself. That is a different measurement and
a better one for this purpose, because it answers "how far past this programme
are you listening" rather than "is it noisy where you are". It also needs no
microphone and no location, and nothing has to leave the device.

No product implementing it appears to exist.

## On a television: nothing

No television platform, set-top box or streaming device runs a hearing screen.
What televisions have is accommodation for people who already know:

- Fire TV: [Dialogue Boost](https://www.hearingtracker.com/news/new-accessibility-features-for-fire-tv), hearing-aid pairing, and [direct streaming to Cochlear implants](https://www.cochlear.com/us/en/corporate/media-center/media-releases/2023/cochlear-announces-audio-streaming-from-amazon-fire-tv-devices-for-hearing-implant-users)
- Samsung and LG: voice-enhancement equalisation, simultaneous speaker and headphone output
- Third-party hardware: wireless TV listening devices sold directly to people who have already worked out that they need one

Every one of those is downstream of a realisation nobody helps you have.

One patent title looked like a direct hit and was not.
[US12382135B2](https://patents.google.com/patent/US12382135B2/en), "Television
use assessment system", turns out to be camera-based assessment of motor and
cognitive performance while operating a remote control. Unrelated to hearing.

## What is left

1. The noticing, on the device where the evidence actually is, referenced
   against the programme rather than the room.
2. A **speech-in-noise** screen rather than a pure-tone one, aimed at the
   failure mode the audiogram misses.
3. Triggered by evidence rather than by a decision to be tested.
4. On hardware that is already under the television.

## Honest notes

The patent is a consideration for a product, not for this. It is recorded here
because a project that publishes its own accuracy figures should not be quiet
about who got somewhere first.

There is one claim this project may never make in any document, and there is a
test that enforces it: that nothing like this existed on a consumer device
before. It did, at enormous scale, and the interesting question was never that
one.
