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

> You passed the hearing test, and you still can't hear the television. The test on your phone plays tones in a quiet room. What you actually struggle with is speech with other sound behind it, and those are not the same measurement.

**0:17, stakes, the website, in a real browser**

The three figures under the claim, pointed to in turn.

> Eighty percent of people with hearing loss don't know. The ones who notice wait about seven years. And last year's Lancet Commission put hearing loss level with cholesterol as the largest thing you can actually fix that leads to dementia.

**0:33, start, the website, in a real browser**

Start pressed, eighteen rounds chosen, the volume step, Begin.

> So Earshot measures the other thing. Three spoken digits, with noise behind them. You set the volume where you'd have the television, and begin.

**0:43, trials, the website, in a real browser**

Rounds answered on the keypad in real time, no cuts inside a round.

> It gets harder while you're right and easier when you're wrong, until it finds the ratio where you get half of them. That ratio is the measurement. Because it's a ratio and not a level, it works on a television nobody calibrated. That's why the World Health Organization put this test, and not tones, into a phone app.

**1:06, refused, the website, in a real browser**

The run answered without listening reaches its end, and the screen says why it cannot be scored.

> And when a run cannot be scored, it says so, and says why, instead of guessing a number.

**1:13, outcomes, the website, in a real browser**

The three cards: the whole vocabulary of a result.

> Whatever it finds, these are the only three things it can say. It never names a condition. There's a test in the repository that fails the build if any result ever does.

**1:26, measured, the website, in a real browser**

The evidence section: measured here, read from the literature, nobody has done yet.

> A hearing screen can't be checked against real listeners, because each one gives you a single number with nothing to compare it to. So this one is run against simulated listeners whose thresholds we chose. Two thousand runs. It reads a known threshold with a bias of four hundredths of a decibel, and repeats itself to three quarters of one. Published figures for this test are between point seven and one point two.

**1:55, baseline, the website, in a real browser**

Volume-only against Earshot on the same two hundred households.

> And against the obvious alternative, which is just tracking the volume. On two hundred households whose ears never changed, but who turned up a quieter mix, volume-only accuses every one of them. Earshot accuses none.

**2:09, tv-home, Fire TV, from the device**

The Fire TV home screen, then a film playing with the listening level live beside it.

> On Fire TV, the app does the half a web page can't. It plays a film whose dialogue loudness was measured, and watches the level you settle on.

**2:20, tv-check, Fire TV, from the device**

The check on the D-pad: the volume step, Begin, a round or two.

> And the check runs entirely on the remote. Sittings stay on the set. There is no microphone, and no camera.

**2:29, agent, the website, in a real browser**

A session held against the deployed MCP server from the page, every request timed, then the server's own answer.

> For Alexa Plus, an MCP server, held to a real session from this page. It can explain what the television watches, and it cannot report how anybody watches, because that never leaves the device.

**2:43, honest, the website, in a real browser**

The card that says no person has taken this test.

> What nobody has done yet is on the front page, in the same size as the numbers. No person has taken this test. That's stated, not hidden.

**2:54, close, the website, in a real browser**

What it does not do.

> Your television can already help you hear. It just doesn't know you can't.

Estimated 2:59 of a 3:00 ceiling. The estimate is words at
150 a minute plus holds; the real narration decides the
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
device or the Fire TV simulator. The footage today is the release APK
sideloaded onto an Android TV virtual device from the Android SDK,
driven only by the D-pad, because Amazon's simulator sits inside
Appstore Quality Central behind a developer sign-in that only a person
can do. When that route is taken the footage drops into the same slot:

1. Developer Console, Tools and Services, Appstore Quality Central
2. Virtual Devices, Get Started, accept the terms
3. Upload the release APK from the GitHub release
4. Launch it, drive it with the D-pad, record the two television beats
5. Save the recording as `video/build/tv.mp4` with a `tv-timings.json`
   beside it saying where each beat begins, and run `assemble.py` again

Either way the site and this file say which device the footage is.

## What not to do

Do not speed up a round. The pacing of the test is the product, and a
sped-up run looks like a quiz.

Do not read a threshold out as though it means something about the
presenter. The run in the video is answered without listening, so it
is refused, and the outcomes beat shows what results look like instead.
