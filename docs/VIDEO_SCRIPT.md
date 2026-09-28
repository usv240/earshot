# Demo video script

Under three minutes, public, English. Judges are not required to watch
past 3:00, so the strongest material is first and nothing is held back
for a reveal.

The one sentence this video has to land, in the first fifteen seconds:
**a hearing test that plays tones in a quiet room cannot find the reason
you can't follow the television.**

---

## Shot list

**0:00 to 0:18 — the claim, over the television**

Fire TV, Earshot's home screen, in a real living room if possible.

> "This is a hearing test on a phone. It plays tones, in a quiet room,
> and millions of people pass it and still can't follow the dialogue on
> their own television. Those are two different measurements, and only
> one of them is the problem people actually have."

**0:18 to 0:42 — what the television noticed**

The home screen, reading the panel on camera. Let the sentence with the
number in it sit on screen long enough to read.

> "Earshot runs on Fire TV. It compares how loud a programme's dialogue
> actually is against the volume this household chose for it. Not
> whether you turned it up. How far past the programme you're listening.
> This household has crept about six decibels over three months. Nobody
> notices that happening."
>
> "There's no microphone in this app. No camera. And none of this leaves
> the television."

**0:42 to 1:25 — take the test, on the remote**

Press the button. Show the level-setting step, then three or four
trials, D-pad and select. Real time, no cuts inside a trial.

> "Three digits, with noise behind them. It gets harder while you're
> right and easier while you're wrong, until it finds the ratio where
> you get half of them. That ratio is the measurement, and because it's
> a ratio rather than a level, it works on a television nobody
> calibrated. It's why the World Health Organization put this test, and
> not tones, into a phone app."

Then the result screen.

**1:25 to 1:50 — what it refuses to say**

> "It's a screen, not a diagnosis. There's a test in this repository
> that walks every sentence this tool can produce and fails the build if
> any of them names a condition, promises anything, or turns a run that
> didn't work into good news. That last one is the dangerous direction:
> the person most likely to produce an unusable run is the person whose
> hearing is furthest outside the range."

Cut to the terminal, that test passing, briefly.

**1:50 to 2:15 — the number behind the number**

Terminal: `npm run validate`.

> "A hearing screen can't be checked against real listeners, because
> each one gives you a single number with nothing to compare it to. So
> this one is run against simulated listeners whose thresholds we chose
> in advance. Two thousand runs: it reads a known threshold with a bias
> of four hundredths of a decibel and repeats itself to three quarters
> of one. Published figures for this test are between 0.7 and 1.2."
>
> "Every number on the website comes out of that file and is read back
> by a test. None of them are typed in."

**2:15 to 2:35 — the agent**

The MCP panel or a terminal session against the deployed endpoint.

> "For Alexa+, an MCP server. It can explain what the television watches
> and talk about checks that were taken. It cannot tell you how anybody
> watches television, because that never left the device, and there's a
> test that walks every tool and fails if one of them ever returns a
> listening figure."

**2:35 to 2:55 — why it matters**

Back to the television.

> "Eighty percent of people with hearing loss don't know. The ones who
> notice wait about seven years. And last year's Lancet Commission put
> hearing loss level with cholesterol as the largest thing you can
> actually fix that leads to dementia."
>
> "Fire TV already has Dialogue Boost, hearing aid pairing, and
> streaming straight to cochlear implants. All of it is for people who
> already know. Nobody built the part that tells you."

**2:55 to 3:00 — the line**

> "Your television can already help you hear. It just doesn't know you
> can't."

---

## Before recording

```
npm install
npm test                              # 182 tests
npm run validate                      # regenerate the figures on screen
npm run digits                        # real spoken digits, needs AWS
npm --prefix tv run bundle            # before any release build
```

**Run `npm run digits` first.** Without it the audio is placeholder tone
bursts and both the site and the television say so on screen, which is
correct and is not what you want in the video. The banner disappears by
itself once the manifest says the audio is real.

## The one requirement to get right

The rules say the demo video has to show the project running on **an
actual Fire TV device or the Fire TV simulator**. An Android TV virtual
device is a substitute and a judge reading strictly can mark it down.

1. Developer Console, Tools and Services, Appstore Quality Central
2. Virtual Devices, Get Started, accept the terms
3. Upload the release APK
4. Launch it, drive it with the D-pad, screen record the test being taken

If that is not reachable on the account, say what the footage is, in one
clause, out loud. Do not let a judge discover it from the documentation.

## Tabs, in order

1. The site, already loaded, at the test
2. The Fire TV recording, ready to cut to
3. A terminal in the repository root

## What not to do

Do not speed up a trial. The pacing of the test is the product, and a
sped-up run looks like a quiz.

Do not read the threshold out as though it means something about the
presenter. It is placeholder audio unless step one was run, and it is a
screen either way.
