"""Subtitle the finished cut, then burn the captions in.

    python subtitle.py

Cues come from `cues.json`, which records where each beat truly landed
after the dead air was removed. Generating them from the plan instead
would put every cue a few seconds out by the third beat.

Splitting
---------
A beat is ten to twenty seconds of speech and is unreadable as one
subtitle. Each is split at sentence boundaries and the beat's speaking
time shared between the cues in proportion to their length. Frame-accurate
word alignment is not needed: every cue starts and ends on a real sentence
boundary, and the error inside a sentence is tenths of a second.

One line per cue, never two, at most 58 characters. A second line is a
second thing to find with your eyes while something is happening on
screen. A sentence longer than that is split on a clause boundary, and
only on whitespace if it has no commas to give.

The opening and the sign-off are subtitled like everything else. A muted
viewer should get "Hi everyone, I am Ujwal." and "Thank you.", not just
the middle.

Gotcha
------
ffmpeg's subtitles filter parses its own argument string, so a Windows
path containing a drive colon breaks the parse. The .srt is copied next to
the video and passed as a bare filename from that working directory.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path

OUT = Path(__file__).parent / "build"
MAX_CHARS = 58


def sentences(line: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", line.strip())
    return [p.strip() for p in parts if p.strip()]


def wrap(sentence: str) -> list[str]:
    """Break a long sentence without ever producing a two line cue."""
    if len(sentence) <= MAX_CHARS:
        return [sentence]
    # Prefer a clause boundary; a comma is a place a reader already pauses.
    chunks, current = [], ""
    for piece in re.split(r"(?<=,)\s+", sentence):
        candidate = f"{current} {piece}".strip()
        if len(candidate) <= MAX_CHARS:
            current = candidate
        else:
            if current:
                chunks.append(current)
            current = piece
    if current:
        chunks.append(current)

    # Anything still too long has no commas to give, so fall back to words.
    out: list[str] = []
    for chunk in chunks:
        if len(chunk) <= MAX_CHARS:
            out.append(chunk)
            continue
        line = ""
        for word in chunk.split():
            candidate = f"{line} {word}".strip()
            if len(candidate) <= MAX_CHARS:
                line = candidate
            else:
                out.append(line)
                line = word
        if line:
            out.append(line)
    return out


def stamp(seconds: float) -> str:
    ms = int(round(seconds * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def build_srt(cues: dict) -> str:
    lines: list[str] = []
    index = 1
    for beat in cues["beats"]:
        pieces: list[str] = []
        for sentence in sentences(beat["say"]):
            pieces.extend(wrap(sentence))
        if not pieces:
            continue
        # Share the beat's speaking time by length, so a short sentence
        # does not sit on screen as long as a long one.
        total_chars = sum(len(p) for p in pieces)
        clock = beat["at"]
        for piece in pieces:
            span = beat["seconds"] * (len(piece) / total_chars)
            lines.append(str(index))
            lines.append(f"{stamp(clock)} --> {stamp(clock + span)}")
            lines.append(piece)
            lines.append("")
            index += 1
            clock += span
    return "\n".join(lines)


def main() -> int:
    cues = json.loads((OUT / "cues.json").read_text(encoding="utf8"))
    srt = OUT / "earshot-demo.srt"
    srt.write_text(build_srt(cues), encoding="utf8")
    count = sum(1 for line in srt.read_text(encoding="utf8").splitlines()
                if "-->" in line)
    longest = max(
        (len(l) for l in srt.read_text(encoding="utf8").splitlines()
         if l and "-->" not in l and not l.isdigit()), default=0)
    print(f"{count} cues, longest line {longest} characters")

    # The subtitles filter parses its own arguments, and a Windows drive
    # colon breaks that parse. Work from the directory and pass a bare name.
    local = OUT / "subs.srt"
    shutil.copyfile(srt, local)
    burned = OUT / "earshot-demo-captioned.mp4"
    # ASS font sizes are in script units, and libass scales them against
    # the video height. At 1080p a size of 21 rendered as a banner wide
    # enough to cover a third of the frame, which is a caption competing
    # with the product rather than supporting it. PlayResY pins the
    # reference height so the size below means what it looks like.
    #
    # The box alpha is the first byte of &HAABBGGRR, and it runs backwards:
    # 00 is fully opaque, FF fully transparent. C0 was tried first and left
    # the text unreadable over the evidence cards, then 14 was effectively
    # solid and sat on the page like a bar of tape. 80 percent opaque is
    # 20 percent of 255, which is 0x33: the page still reads through it,
    # the words still read over it.
    # PlayResY was described in the comment above and was never actually
    # in the style, so at 4K libass scaled the margin against 2160 lines
    # and the caption band landed on top of the stat tiles. Pinning the
    # reference height to 1080 makes every size and margin below mean
    # what they were tuned to mean, and libass scales the whole band up
    # for the taller frame. The font is doubled to match: at 15 with the
    # reference pinned, libass drew the caption at 1080p size on a 2160
    # frame and it was a sliver nobody could read. The margin is close to
    # the 1080p value: raising it was tried as a fix for a shot whose
    # bottom strip was full of content, and the right fix was the shot.
    style = (
        "PlayResY=1080,FontName=Segoe UI,FontSize=30,PrimaryColour=&H00FFFFFF,"
        "OutlineColour=&H33000000,BorderStyle=3,Outline=1,Shadow=0,"
        "MarginV=40,Alignment=2"
    )
    proc = subprocess.run(
        ["ffmpeg", "-y", "-i", "earshot-demo.mp4",
         "-vf", f"subtitles=subs.srt:force_style='{style}'",
         "-c:v", "libx264", "-crf", "19", "-preset", "medium",
         "-tune", "stillimage",
         "-pix_fmt", "yuv420p", "-c:a", "copy", burned.name],
        cwd=OUT, capture_output=True, text=True,
    )
    if proc.returncode != 0:
        raise SystemExit(f"burn-in failed:\n{proc.stderr[-1500:]}")
    local.unlink()

    dur = float(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(burned)],
        check=True, capture_output=True, text=True).stdout.strip())
    print(f"wrote {burned.name}  ({int(dur // 60)}:{dur % 60:04.1f})")
    print("\nUpload the captioned mp4. Do NOT also upload the .srt to")
    print("YouTube: a viewer enabling CC would see two stacked sets.")
    print("The .srt ships in the repo for anyone who wants the text.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
