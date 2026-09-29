"""Cut both cameras into one timeline and lay the narration against it.

    python assemble.py

This video has two footage sources: the deployed website in a real
browser (`web.mp4`), and the release APK on a television (`tv.mp4`).
`beats.py` says which beat belongs to which. This program cuts each beat
out of its own source, joins them in script order, then builds the audio
against the result.

Why the audio is built from the video, and never the other way round
--------------------------------------------------------------------
Each beat is cut to its own narration length plus a little slack, and the
narration is then laid down at the second that beat actually begins in
the finished cut. The two tracks cannot drift, because the audio is
constructed from the picture rather than the picture being trimmed to fit
an audio plan made earlier.

Nothing is ever sped up. A step that genuinely took eleven seconds still
looks like eleven seconds. Screen recordings played fast are a lie about
how quick a product is, and this pipeline refuses to tell it: the only
thing removed is screen that has already settled with nothing being said
over it.

The frame rate problem
----------------------
The browser take is 25fps and the device take is 30fps, because the two
cameras are different tools. Concatenating them without normalising gives
a file whose timestamps drift at every cut, so every segment is
re-encoded to one rate here. That costs a generation on the browser
footage and is worth it.

The frame size problem
----------------------
The browser is captured at the frame size and is never scaled. The
television is captured at whatever the emulator window is, at most the
1920x1080 the virtual device renders, and is brought up to the frame
with one plain scale, letterboxed if the shape differs. Only the
television pieces go through that filter; the web pieces are cut and
nothing else.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

from beats import BEATS

OUT = Path(__file__).parent / "build"

# Seconds a beat may hold after its line ends. This removes settled
# screen only.
SLACK = 0.5
TAIL_KEEP = 1.5      # seconds held after the very last word
FPS = 30
CEILING = 180.0


def run(args: list[str]) -> None:
    proc = subprocess.run(args, capture_output=True, text=True)
    if proc.returncode != 0:
        raise SystemExit(f"{args[0]} failed:\n{proc.stderr[-1500:]}")


def probe(path: Path) -> float:
    return float(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)],
        check=True, capture_output=True, text=True).stdout.strip())


def silence(seconds: float, dest: Path) -> None:
    run(["ffmpeg", "-y", "-f", "lavfi", "-i",
         "anullsrc=channel_layout=stereo:sample_rate=44100",
         "-t", f"{max(seconds, 0.001):.3f}", "-c:a", "libmp3lame", "-q:a", "4",
         str(dest)])


def normalise(src: Path, dest: Path) -> None:
    """Bring the narration to broadcast speech loudness, in two passes.

    YouTube's normalisation is one-directional: it turns loud uploads
    down and never turns quiet ones up. A judge working through a list of
    submissions should not have to reach for the volume on this one.

    Two passes rather than one. A single pass guesses the gain from a
    running estimate and drifts on material with long silences, and this
    track is mostly silence between beats. The first pass measures, the
    second applies exactly what was measured, with a true-peak ceiling so
    the loudest syllable cannot clip after transcoding.
    """
    target = "I=-16:TP=-1.5:LRA=11"
    first = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(src),
         "-af", f"loudnorm={target}:print_format=json", "-f", "null", "-"],
        capture_output=True, text=True)
    blob = first.stderr[first.stderr.rfind("{"): first.stderr.rfind("}") + 1]
    try:
        m = json.loads(blob)
    except json.JSONDecodeError:
        raise SystemExit(f"could not measure loudness:\n{first.stderr[-800:]}")
    run(["ffmpeg", "-y", "-i", str(src), "-af",
         f"loudnorm={target}:measured_I={m['input_i']}:measured_TP={m['input_tp']}"
         f":measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}"
         f":offset={m['target_offset']}:linear=true",
         "-c:a", "libmp3lame", "-q:a", "2", str(dest)])
    print(f"  narration {float(m['input_i']):.1f} LUFS -> -16.0 target, "
          f"peak {float(m['input_tp']):.1f} dBTP")


def load(name: str) -> dict:
    p = OUT / name
    if not p.exists():
        raise SystemExit(f"no {name}: run the recorders first")
    return json.loads(p.read_text(encoding="utf8"))


def frame_of(timings: dict) -> tuple[int, int]:
    return int(timings["width"]), int(timings["height"])


def plan() -> tuple[list[dict], dict[str, float]]:
    """One cut per beat, in script order, from whichever camera shot it.

    A beat keeps its pause, its spoken line and SLACK. It is also capped
    at the moment the next beat from the same camera begins, because past
    that point the recorder had already moved the screen on.
    """
    web = load("web-timings.json")
    # The television footage comes from record_tv.py and a television-
    # shaped virtual device. Until it exists, its beats are dropped and
    # said so, rather than blocking the whole video on the other camera.
    # When tv-timings.json appears, they cut back in.
    if (OUT / "tv-timings.json").exists():
        tv = load("tv-timings.json")
    else:
        skipped = [b.key for b in BEATS if b.is_tv]
        print(f"no tv-timings.json: dropping {len(skipped)} television beats {skipped}")
        tv = {"video": 0.0, "beats": []}
    narr = {n["key"]: n["seconds"] for n in load("narration.json")}

    marks = {}
    for source, timings in (("web", web), ("tv", tv)):
        beats = timings["beats"]
        for i, b in enumerate(beats):
            nxt = beats[i + 1]["at"] if i + 1 < len(beats) else timings["video"]
            marks[b["key"]] = {"source": source, "at": b["at"], "until": nxt}

    # With no television take, its beats are expected to be absent and
    # are cut from the plan rather than reported as never recorded.
    planned = [b for b in BEATS if not (b.is_tv and not tv["beats"])]
    missing = [b.key for b in planned if b.key not in marks]
    if missing:
        raise SystemExit(
            f"these beats were never recorded: {missing}. "
            "Re-run record.py and record_tv.py."
        )
    if set(marks) != {b.key for b in planned}:
        extra = sorted(set(marks) - {b.key for b in planned})
        raise SystemExit(f"recorded beats that are not in the script: {extra}")

    cuts: list[dict] = []
    for i, beat in enumerate(planned):
        m = marks[beat.key]
        spoken = narr[beat.key]
        wanted = beat.pause_before + spoken + SLACK
        if i == len(BEATS) - 1:
            wanted += TAIL_KEEP
        end = min(m["at"] + max(wanted, beat.min_hold), m["until"])
        cuts.append({"key": beat.key, "source": m["source"],
                     "start": m["at"], "end": end,
                     "spoken": spoken, "pause": beat.pause_before})
    for c in cuts:
        c["frame"] = frame_of(web)
        c["size"] = frame_of(web if c["source"] == "web" else tv)
    return cuts, narr


def cut_segments(cuts: list[dict], work: Path) -> list[Path]:
    pieces: list[Path] = []
    for i, c in enumerate(cuts):
        length = c["end"] - c["start"]
        if length < 0.2:
            raise SystemExit(
                f"beat {c['key']!r} would be {length:.2f}s long. Its recording "
                "is shorter than its narration, so the take is unusable."
            )
        src = OUT / ("web.mp4" if c["source"] == "web" else "tv.mp4")
        piece = work / f"seg{i:02d}-{c['key']}.mp4"
        fit: list[str] = []
        if c["size"] != c["frame"]:
            w, h = c["frame"]
            fit = ["-vf",
                   f"scale={w}:{h}:force_original_aspect_ratio=decrease:flags=lanczos,"
                   f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black"]
        run(["ffmpeg", "-y", "-ss", f"{c['start']:.3f}", "-t", f"{length:.3f}",
             "-i", str(src), *fit,
             # -fps_mode, not -vsync: the latter was removed in ffmpeg 8
             # and fails the whole run with "Unrecognized option".
             "-r", str(FPS), "-fps_mode", "cfr",
             "-c:v", "libx264", "-crf", "18", "-preset", "medium",
             "-tune", "stillimage", "-pix_fmt", "yuv420p", "-an", str(piece)])
        pieces.append(piece)
        print(f"  {c['source']:3}  {c['key']:14} {length:5.1f}s")
    return pieces


def main() -> int:
    cuts, narr = plan()
    work = OUT / "work"
    work.mkdir(parents=True, exist_ok=True)
    for stale in work.glob("*"):
        stale.unlink()

    print("cutting")
    pieces = cut_segments(cuts, work)

    listing = work / "segments.txt"
    listing.write_text("".join(f"file '{p.as_posix()}'\n" for p in pieces),
                       encoding="utf8")
    joined = OUT / "joined.mp4"
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(listing),
         "-c", "copy", str(joined)])

    # Where each beat lands in the joined cut, measured from the pieces
    # rather than from the plan, because a piece can come out a frame or
    # two short of what was asked for.
    starts: dict[str, float] = {}
    clock = 0.0
    for c, piece in zip(cuts, pieces):
        starts[c["key"]] = clock
        clock += probe(piece)
    total = probe(joined)

    print("\nlaying the narration")
    parts: list[Path] = []
    audio_clock = 0.0
    placed: dict[str, float] = {}
    for i, c in enumerate(cuts):
        # The line starts after the beat's pause, not at the cut.
        target = starts[c["key"]] + c["pause"]
        gap = target - audio_clock
        if gap > 0.01:
            s = work / f"gap{i:02d}.mp3"
            silence(gap, s)
            parts.append(s)
            audio_clock += gap
        placed[c["key"]] = audio_clock
        parts.append(OUT / "audio" / f"{c['key']}.mp3")
        audio_clock += c["spoken"]
    if total - audio_clock > 0.01:
        s = work / "gap_end.mp3"
        silence(total - audio_clock, s)
        parts.append(s)

    alist = work / "audio.txt"
    alist.write_text("".join(f"file '{p.as_posix()}'\n" for p in parts),
                     encoding="utf8")
    narration = OUT / "narration.mp3"
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(alist),
         "-c:a", "libmp3lame", "-q:a", "2", str(narration)])

    drift = max(abs(placed[c["key"]] - (starts[c["key"]] + c["pause"])) for c in cuts)
    if drift > 0.5:
        print(f"  narration slips up to {drift:.1f}s behind its beat; "
              "subtitles follow the audio")

    loud = OUT / "narration-normalised.mp3"
    normalise(narration, loud)

    final = OUT / "earshot-demo.mp4"
    run(["ffmpeg", "-y", "-i", str(joined), "-i", str(loud),
         "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", str(final)])

    (OUT / "cues.json").write_text(json.dumps(
        {"duration": round(probe(final), 3),
         "beats": [{"key": c["key"], "at": round(placed[c["key"]], 3),
                    "seconds": c["spoken"], "source": c["source"],
                    "say": next(b.say for b in BEATS if b.key == c["key"])}
                   for c in cuts]},
        indent=1), encoding="utf8")

    dur = probe(final)
    tv_seconds = sum(probe(p) for c, p in zip(cuts, pieces) if c["source"] == "tv")
    print(f"\nfinal {int(dur // 60)}:{dur % 60:04.1f}  ({dur:.1f}s)")
    print(f"  {tv_seconds:.1f}s of it is Fire TV device footage")
    print("ceiling 3:00", "ok" if dur <= CEILING else "OVER")
    print(f"wrote {final.name} and cues.json")
    return 0 if dur <= CEILING else 1


if __name__ == "__main__":
    raise SystemExit(main())
