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
cannot follow the television. The television itself is on screen by
half a minute, because it is a Fire TV entry, and the rest follows the
product's own three words, notices, asks, helps: the film and the
level, the offer and the check, the page for the doctor; then the two
pieces of evidence, the baseline and the simulation, with what nobody
has done said beside them; what it is, in one breath; and the line.
The Alexa+ agent and the MCP server stay on the site and in the
submission; a Fire TV entry's three minutes are for the television.
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
            "You passed the hearing test, and you still can't follow the dialogue on television. "
            "That's because hearing tones in silence and understanding speech in noise "
            "are not the same thing."
        ),
    ),
    Beat(
        key="stakes",
        shows="The three figures under the claim; the first two pointed to.",
        action="stats",
        say=(
            "Most people with hearing loss don't know they have it, "
            "and the ones who notice wait about seven years. "
            "Earshot starts where people first notice: the television."
        ),
    ),
    Beat(
        key="tv-home",
        shows="A film playing on the set, the remote's volume key pressed, and the set's volume and the listening level moving together.",
        action="tv_home",
        min_hold=6,
        say=(
            "On Fire TV, it notices. "
            "It plays a film whose dialogue loudness was measured, reads the set's own volume, "
            "and watches how far past the programme you listen. No microphone. No camera."
        ),
    ),
    Beat(
        key="tv-check",
        shows="The home screen with what it noticed and the offer, then the check on the D-pad: the volume step, Begin, a round.",
        action="tv_check",
        min_hold=9,
        say=(
            "When the pattern has held for months, it asks: a two-minute check, right on the remote. "
            "Your listening data stays on the television."
        ),
    ),
    Beat(
        key="start",
        shows="The same check on the website: Start, eighteen rounds, the volume step, Begin.",
        action="check_start",
        say=(
            "The check is three spoken digits with noise behind them. "
            "You set the volume where you'd have the television, and begin."
        ),
    ),
    Beat(
        key="trials",
        shows="Rounds answered on the keypad in real time, no cuts inside a round.",
        action="check_trials",
        min_hold=12,
        say=(
            "Get the digits right and it gets harder; get them wrong and it gets easier, "
            "until it finds your speech-in-noise threshold. "
            "It measures a ratio, not a volume, so the television needs no calibrated speakers. "
            "It is based on the same digits-in-noise approach the World Health Organization uses in its hearing screening app."
        ),
    ),
    Beat(
        key="refused",
        action="check_refused",
        shows="The run answered without listening reaches its end, and the screen says why it cannot be scored.",
        say=(
            "And if a run isn't reliable, it refuses to score it, and says why, "
            "instead of inventing a number."
        ),
    ),
    Beat(
        key="page",
        action="doctor_page",
        shows="One page for your doctor, opened from the result: what was measured or why it was not, and what the page is not.",
        say=(
            "Then it helps: one page to take to a doctor, with what was observed, what the check measured, "
            "and its limits. Earshot never diagnoses a condition. "
            "A test in the repository fails the build if any result tries to."
        ),
    ),
    Beat(
        key="baseline",
        shows="Volume-only against Earshot on the same two hundred households.",
        action="baseline",
        say=(
            "Why not just watch the volume? "
            "A quiet film makes everyone turn the television up. "
            "On two hundred simulated households whose hearing never changed, "
            "volume alone flags every one of them when the programme gets quieter. Earshot flags none."
        ),
    ),
    Beat(
        key="measured",
        shows="The evidence section: the simulated-listener figures, then what nobody has done yet.",
        action="evidence",
        say=(
            "The procedure was run against two thousand simulated listeners with known thresholds. "
            "It reads them back with almost no bias, and repeats itself within the published range for this test. "
            "That validates the procedure. A clinical study is the next step, and the site says what it would take."
        ),
    ),
    Beat(
        key="impact",
        shows="The three words on the site: notice, ask rarely, help either way.",
        action="impact",
        say=(
            "Earshot is not a diagnosis. It's an earlier signal, from the device that already sees the pattern, "
            "that a proper hearing test may be worth taking."
        ),
    ),
    Beat(
        key="close",
        action="close",
        shows="What it does not do.",
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
        "device or the Fire TV simulator. The two television beats are the",
        "release APK (v0.1.1, then v0.1.2 with the doctor page on the set) installed on a Fire TV that Amazon hosts in",
        "Appstore Quality Central, Live Device Interaction (a FOS 14 3P TV",
        "image), signed in to the operator's Amazon account, driven only by",
        "the D-pad through the console's remote, and recorded from the",
        "console's stream on 2026-09-30. `video/record_qc.py` and",
        "`video/drive_qc.py` are the programs that did it; the sign-ins were a",
        "person's. `tv-timings.json` names the device. An earlier take on an",
        "Android TV virtual device from the Android SDK is kept as",
        "`build/tv-emulator.mp4` and is not in the video.",
        "",
        "Nothing is sped up. The console's stream stops updating when no key",
        "arrives for a while; the recorder sends a key the player ignores",
        "every few seconds through the film so the picture keeps flowing, and",
        "that is the only key it presses that a viewer does not see.",
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
