# Demo video script

Under three minutes, public, English. Judges are not required to watch
past 3:00, so the strongest material is first and nothing is held back
for a reveal.

The one sentence this video has to land, in the first fifteen seconds:
**a hearing test that plays tones in a quiet room cannot find the reason
you cannot follow the television.**

This file is written by `python video/beats.py --script` from the same
data the recorders and the assembler read, and a test fails if the two
ever disagree. Edit `video/beats.py`, not this file.

---

## Shot list

**0:00, claim, the website, in a real browser**

The front page: the claim on the left, the check on the right.

> You passed the hearing test, and you still can't follow the dialogue on television. That's because hearing tones in silence and understanding speech in noise are not the same thing.

**0:12, stakes, the website, in a real browser**

The three figures under the claim; the first two pointed to.

> Most people with hearing loss don't know they have it, and the ones who notice wait about seven years. Earshot starts where people first notice: the television.

**0:23, tv-home, Fire TV, from the device**

A film playing on the set, the remote's volume key pressed, and the set's volume and the listening level moving together.

> On Fire TV, it notices. It plays a film whose dialogue loudness was measured, reads the set's own volume, and watches how far past the programme you listen. No microphone. No camera.

**0:35, tv-check, Fire TV, from the device**

The home screen with what it noticed and the offer, then the check on the D-pad: the volume step, Begin, a round.

> When the pattern has held for months, it asks: a two-minute check, right on the remote. Your listening data stays on the television.

**0:45, start, the website, in a real browser**

The same check on the website: Start, eighteen rounds, the volume step, Begin.

> The check is three spoken digits with noise behind them. You set the volume where you'd have the television, and begin.

**0:53, trials, the website, in a real browser**

Rounds answered on the keypad in real time, no cuts inside a round.

> Get the digits right and it gets harder; get them wrong and it gets easier, until it finds your speech-in-noise threshold. It measures a ratio, not a volume, so the television needs no calibrated speakers. It is based on the same digits-in-noise approach the World Health Organization uses in its hearing screening app.

**1:14, refused, the website, in a real browser**

The run answered without listening reaches its end, and the screen says why it cannot be scored.

> And if a run isn't reliable, it refuses to score it, and says why, instead of inventing a number.

**1:21, page, the website, in a real browser**

One page for your doctor, opened from the result: what was measured or why it was not, and what the page is not.

> Then it helps: one page to take to a doctor, with what was observed, what the check measured, and its limits. Earshot never diagnoses a condition. A test in the repository fails the build if any result tries to.

**1:37, baseline, the website, in a real browser**

Volume-only against Earshot on the same two hundred households.

> Why not just watch the volume? A quiet film makes everyone turn the television up. On two hundred simulated households whose hearing never changed, volume alone flags every one of them when the programme gets quieter. Earshot flags none.

**1:52, measured, the website, in a real browser**

The evidence section: the simulated-listener figures, then what nobody has done yet.

> The procedure was run against two thousand simulated listeners with known thresholds. It reads them back with almost no bias, and repeats itself within the published range for this test. That validates the procedure. A clinical study is the next step, and the site says what it would take.

**2:11, impact, the website, in a real browser**

The three words on the site: notice, ask rarely, help either way.

> Earshot is not a diagnosis. It's an earlier signal, from the device that already sees the pattern, that a proper hearing test may be worth taking.

**2:22, close, the website, in a real browser**

What it does not do.

> Your television can already help you hear. It just doesn't know you can't.

Estimated 2:27 of a 3:00 ceiling. The estimate is words at
152 a minute plus holds; the real narration decides the
final cut, and `python video/beats.py` exits non-zero if the plan is
over before a frame is recorded.

---

## How it is made

```
cd video
python beats.py          # the estimate, and a refusal if it is over
python narrate.py        # Polly, one clip per beat
python record_tv.py      # the Fire TV beats, from a television-shaped device
python record.py         # the web beats, from a real browser at 4K
python assemble.py       # cut both, lay the narration, normalise
python subtitle.py       # burn the captions
```

Output: `video/build/earshot-demo-captioned.mp4`. `video/README.md` says
what each program refuses to do and why. Nothing is sped up: a round
that took eleven seconds looks like eleven seconds.

## The Fire TV footage

The rules say the video has to show the project running on a Fire TV
device or the Fire TV simulator. The two television beats are the
release APK (v0.1.1, then v0.1.2 with the doctor page on the set) installed on a Fire TV that Amazon hosts in
Appstore Quality Central, Live Device Interaction (a FOS 14 3P TV
image), signed in to the operator's Amazon account, driven only by
the D-pad through the console's remote, and recorded from the
console's stream on 2026-09-30. `video/record_qc.py` and
`video/drive_qc.py` are the programs that did it; the sign-ins were a
person's. `tv-timings.json` names the device. An earlier take on an
Android TV virtual device from the Android SDK is kept as
`build/tv-emulator.mp4` and is not in the video.

Nothing is sped up. The console's stream stops updating when no key
arrives for a while; the recorder sends a key the player ignores
every few seconds through the film so the picture keeps flowing, and
that is the only key it presses that a viewer does not see.

## What not to do

Do not speed up a round. The pacing of the test is the product, and a
sped-up run looks like a quiz.

Do not read a threshold out as though it means something about the
presenter. The run in the video is answered without listening, so it
is refused, and the outcomes beat shows what results look like instead.
