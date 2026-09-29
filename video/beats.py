"""The demo video as data, not prose.

One record per beat: the pause before it, what the recorder should do, and
the exact line Polly will say. Nothing else in the pipeline may invent a
timecode; every downstream step derives its timing from here, and after
recording, from where each beat actually landed.

The human-readable script is docs/VIDEO_SCRIPT.md, and it is written by
this file: `python beats.py --script` regenerates it, and a test fails
if the two ever disagree. This file is what the programs read; the
document is what a person reads; they cannot drift apart.

Two cameras
-----------
Most beats are the deployed website driven by a real browser at 4K. The
Fire TV beats are the release APK on a television, captured from the
device. `action` starting with `tv_` means device footage.

The Fire TV footage needs an Amazon developer sign-in that only a person
can do, so the assembler tolerates its absence: the web take is cut on
its own, and the TV beats are added when the footage arrives. The video
therefore exists today, rather than waiting on the one step nobody in
the pipeline can take.

The hard constraint
-------------------
Three minutes, and judges are not required to watch past it. `python
beats.py` prints the estimate and exits non-zero if the plan is already
over, so the script is checked before a frame is recorded.

What the order is for
---------------------
A judge who watches only the first fifteen seconds should leave with the
one sentence: a tone test in a quiet room cannot find the reason you
cannot follow the television. Everything after that is evidence for it,
in the order a sceptic would ask for it: the claim, the check itself,
what it refuses to say, the number behind the number, the television,
the agent, the honesty, and the line.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path

# Polly's Joanna at the rate narrate.py asks for, measured across this
# script: 423 words in 167 seconds of narration, 152 a minute. The
# estimate is only a gate before recording; the real clips decide the cut.
WORDS_PER_MINUTE = 152
CEILING_SECONDS = 180


@dataclass
class Beat:
    key: str
    say: str
    action: str
    shows: str = ""
    pause_before: float = 0.0
    min_hold: float = 0.0

    @property
    def is_tv(self) -> bool:
        return self.action.startswith("tv_")

    @property
    def speak_seconds(self) -> float:
        return len(self.say.split()) / WORDS_PER_MINUTE * 60

    @property
    def seconds(self) -> float:
        return max(self.pause_before + self.speak_seconds, self.min_hold)


BEATS: list[Beat] = [
    Beat(
        key="claim",
        shows="The front page: the claim on the left, the check on the right.",
        action="hero",
        pause_before=0.8,
        say=(
            "You passed the hearing test, and you still can't hear the television. "
            "The test on your phone plays tones in a quiet room. "
            "What you actually struggle with is speech with other sound behind it, "
            "and those are not the same measurement."
        ),
    ),
    Beat(
        key="stakes",
        shows="The three figures under the claim, pointed to in turn.",
        action="stats",
        say=(
            "Eighty percent of people with hearing loss don't know. "
            "The ones who notice wait about seven years. "
            "And last year's Lancet Commission put hearing loss level with cholesterol "
            "as the largest thing you can actually fix that leads to dementia."
        ),
    ),
    Beat(
        key="start",
        shows="Start pressed, eighteen rounds chosen, the volume step, Begin.",
        action="check_start",
        say=(
            "So Earshot measures the other thing. "
            "Three spoken digits, with noise behind them. "
            "You set the volume where you'd have the television, and begin."
        ),
    ),
    Beat(
        key="trials",
        shows="Rounds answered on the keypad in real time, no cuts inside a round.",
        action="check_trials",
        min_hold=14,
        say=(
            "It gets harder while you're right and easier when you're wrong, "
            "until it finds the ratio where you get half of them. "
            "That ratio is the measurement. "
            "Because it's a ratio and not a level, it works on a television nobody calibrated. "
            "That's why the World Health Organization put this test, and not tones, into a phone app."
        ),
    ),
    Beat(
        key="refused",
        action="check_refused",
        shows="The run answered without listening reaches its end, and the screen says why it cannot be scored.",
        say=(
            "And when a run cannot be scored, it says so, and says why, "
            "instead of guessing a number."
        ),
    ),
    Beat(
        key="outcomes",
        shows="The three cards: the whole vocabulary of a result.",
        action="outcomes",
        say=(
            "Whatever it finds, these are the only three things it can say. "
            "It never names a condition. "
            "There's a test in the repository that fails the build if any result ever does."
        ),
    ),
    Beat(
        key="measured",
        shows="The evidence section: measured here, read from the literature, nobody has done yet.",
        action="evidence",
        say=(
            "A hearing screen can't be checked against real listeners; "
            "each gives one number with nothing to compare it to. "
            "So this one is run against simulated listeners whose thresholds we chose. "
            "Two thousand runs: it reads a known threshold with a bias of four hundredths of a decibel, "
            "and repeats itself to three quarters of one. "
            "Published figures are point seven to one point two."
        ),
    ),
    Beat(
        key="baseline",
        shows="Volume-only against Earshot on the same two hundred households.",
        action="baseline",
        say=(
            "And against the obvious alternative, which is just tracking the volume. "
            "On two hundred households whose ears never changed, but who turned up a quieter mix, "
            "volume-only accuses every one of them. Earshot accuses none."
        ),
    ),
    Beat(
        key="tv-home",
        shows="A film playing on the set, the remote's volume key pressed, and the set's volume and the listening level moving together.",
        action="tv_home",
        min_hold=6,
        say=(
            "On Fire TV, the app does the half a web page can't. "
            "It plays a film whose dialogue loudness was measured, reads the set's own volume, "
            "and watches the level you settle on."
        ),
    ),
    Beat(
        key="tv-check",
        shows="The home screen with what it noticed and the offer, then the check on the D-pad: the volume step, Begin, a round.",
        action="tv_check",
        min_hold=9,
        say=(
            "Months later it has noticed, and offers the check. "
            "It runs on the remote. Sittings stay on the set. No microphone, no camera."
        ),
    ),
    Beat(
        key="agent",
        shows="A session held against the deployed MCP server from the page, every request timed, then the server's own answer.",
        action="agent",
        min_hold=9,
        say=(
            "For Alexa Plus, an MCP server, held to a real session from this page. "
            "It can explain what the television watches, and it cannot report how anybody watches, "
            "because that never leaves the device."
        ),
    ),
    Beat(
        key="honest",
        shows="The card that says no person has taken this test.",
        action="honest",
        say=(
            "What nobody has done yet is on the front page, in the same size as the numbers. "
            "No person has taken this test. That's stated, not hidden."
        ),
    ),
    Beat(
        key="close",
        shows="What it does not do.",
        action="close",
        min_hold=4,
        say=(
            "Your television can already help you hear. "
            "It just doesn't know you can't."
        ),
    ),
]


def sentences(line: str) -> list[str]:
    return [s for s in re.split(r"(?<=[.!?])\s+", line.strip()) if s]


def sentence_spans(line: str, total: float) -> list[tuple[float, float]]:
    """Where each sentence starts and ends, proportionally by word count."""
    parts = sentences(line)
    words = [len(s.split()) for s in parts]
    all_words = sum(words) or 1
    spans, at = [], 0.0
    for w in words:
        dur = total * w / all_words
        spans.append((at, at + dur))
        at += dur
    return spans


def script() -> str:
    """docs/VIDEO_SCRIPT.md, from the beats, so it cannot be stale."""
    out = [
        "# Demo video script",
        "",
        "Under three minutes, public, English. Judges are not required to watch",
        "past 3:00, so the strongest material is first and nothing is held back",
        "for a reveal.",
        "",
        "The one sentence this video has to land, in the first fifteen seconds:",
        "**a hearing test that plays tones in a quiet room cannot find the reason",
        "you cannot follow the television.**",
        "",
        "This file is written by `python video/beats.py --script` from the same",
        "data the recorders and the assembler read, and a test fails if the two",
        "ever disagree. Edit `video/beats.py`, not this file.",
        "",
        "---",
        "",
        "## Shot list",
        "",
    ]
    at = 0.0
    for b in BEATS:
        cam = "Fire TV, from the device" if b.is_tv else "the website, in a real browser"
        m, sec = divmod(int(at), 60)
        out.append(f"**{m}:{sec:02d}, {b.key}, {cam}**")
        out.append("")
        out.append(b.shows)
        out.append("")
        out.append("> " + b.say)
        out.append("")
        at += b.seconds
    m, sec = divmod(int(at), 60)
    out += [
        f"Estimated {m}:{sec:02d} of a 3:00 ceiling. The estimate is words at",
        f"{WORDS_PER_MINUTE} a minute plus holds; the real narration decides the",
        "final cut, and `python video/beats.py` exits non-zero if the plan is",
        "over before a frame is recorded.",
        "",
        "---",
        "",
        "## How it is made",
        "",
        "```",
        "cd video",
        "python beats.py          # the estimate, and a refusal if it is over",
        "python narrate.py        # Polly, one clip per beat",
        "python record_tv.py      # the Fire TV beats, from a television-shaped device",
        "python record.py         # the web beats, from a real browser at 4K",
        "python assemble.py       # cut both, lay the narration, normalise",
        "python subtitle.py       # burn the captions",
        "```",
        "",
        "Output: `video/build/earshot-demo-captioned.mp4`. `video/README.md` says",
        "what each program refuses to do and why. Nothing is sped up: a round",
        "that took eleven seconds looks like eleven seconds.",
        "",
        "## The Fire TV footage",
        "",
        "The rules say the video has to show the project running on a Fire TV",
        "device or the Fire TV simulator. The footage today is the release APK",
        "sideloaded onto an Android TV virtual device from the Android SDK,",
        "driven only by the D-pad, because Amazon's simulator sits inside",
        "Appstore Quality Central behind a developer sign-in that only a person",
        "can do. When that route is taken the footage drops into the same slot:",
        "",
        "1. Developer Console, Tools and Services, Appstore Quality Central",
        "2. Virtual Devices, Get Started, accept the terms",
        "3. Upload the release APK from the GitHub release",
        "4. Launch it, drive it with the D-pad, record the two television beats",
        "5. Save the recording as `video/build/tv.mp4` with a `tv-timings.json`",
        "   beside it saying where each beat begins, and run `assemble.py` again",
        "",
        "Either way the site and this file say which device the footage is.",
        "",
        "## What not to do",
        "",
        "Do not speed up a round. The pacing of the test is the product, and a",
        "sped-up run looks like a quiz.",
        "",
        "Do not read a threshold out as though it means something about the",
        "presenter. The run in the video is answered without listening, so it",
        "is refused, and the outcomes beat shows what results look like instead.",
        "",
    ]
    return "\n".join(out)


def main() -> int:
    if "--script" in sys.argv:
        dest = Path(__file__).parent.parent / "docs" / "VIDEO_SCRIPT.md"
        dest.write_text(script(), encoding="utf8")
        print(f"wrote {dest}")
        return 0
    total = 0.0
    for b in BEATS:
        cam = "TV " if b.is_tv else "web"
        print(f"  {b.key:10} {cam}  {b.seconds:5.1f}s  {b.say[:58]}...")
        total += b.seconds
    print(f"\nestimated {total:.0f}s of {CEILING_SECONDS}s, {CEILING_SECONDS - total:.0f}s headroom")
    return 0 if total <= CEILING_SECONDS else 1


if __name__ == "__main__":
    raise SystemExit(main())
