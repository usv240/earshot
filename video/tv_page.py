"""The doctor page on the set, appended to the Fire TV footage.

    python tv_page.py [session.webm]

The console session that installed v0.1.2 on the hosted Fire TV, ran
the check on the remote and opened "One page for your doctor" was
recorded by drive_qc.py (its context records everything it drives).
This takes twelve seconds of that recording, the result screen with
the new button focused and then the page appearing on the set, crops
them to the device stream exactly as record_qc.py crops a take, and
appends them to build/tv.mp4 with a `tv-page` mark in tv-timings.json.
Nothing is sped up or re-timed; the window is fixed below and was
found by the frame the white page first appears on.

It runs tv_provenance.py first, so it always starts from the raw take
and can be run any number of times.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import tv_provenance

HERE = Path(__file__).parent
OUT = HERE / "build"

# Seconds into the recorded session. The page appears at 1312.4; the
# page was scrolled at 1323.9, so the window ends before the crop moves.
START, END = 1310.4, 1322.4
# The stream's box before that scroll. The canvas runs 16 px below the
# 810 px window, so the crop is 514 tall and padded with the app's own
# background to the take's 530.
X, Y, W, H_VISIBLE, H = 38, 296, 942, 514, 530
APP_BG = "0x0f1015"
FPS = 25


def main() -> int:
    session = Path(sys.argv[1]) if len(sys.argv) > 1 else next(iter(sorted((OUT / "qc-raw").glob("*.webm"))), None)
    if session is None or not session.exists():
        print("no recorded console session in build/qc-raw", file=sys.stderr)
        return 2
    if tv_provenance.main() != 0:
        return 1
    timings_path = OUT / "tv-timings.json"
    t = json.loads(timings_path.read_text(encoding="utf8"))
    tv = OUT / "tv.mp4"
    base_len = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(tv)],
                                    check=True, capture_output=True, text=True).stdout.strip())
    clip = OUT / "tv-page-clip.mp4"
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-ss", f"{START}", "-to", f"{END}", "-i", str(session),
         "-vf", f"crop={W}:{H_VISIBLE}:{X}:{Y},pad={W}:{H}:0:0:color={APP_BG}",
         "-r", str(FPS), "-fps_mode", "cfr", "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-an", str(clip)],
        check=True,
    )
    joined = OUT / "tv-joined.mp4"
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(tv), "-i", str(clip),
         "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]", "-map", "[v]",
         "-r", str(FPS), "-fps_mode", "cfr", "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", str(joined)],
        check=True,
    )
    joined.replace(tv)
    length = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(tv)],
                                  check=True, capture_output=True, text=True).stdout.strip())
    t["beats"] = [b for b in t["beats"] if b["key"] != "tv-page"] + [{"key": "tv-page", "at": round(base_len, 3)}]
    t["video"] = round(length, 3)
    t["tv_page_source"] = f"{session.name}, {START} to {END} s, v0.1.2 on the same hosted FOS 14 3P TV"
    timings_path.write_text(json.dumps(t, indent=1), encoding="utf8")
    print(f"appended {END - START:.1f}s of the doctor page on the set at {base_len:.1f}s; tv.mp4 is {length:.1f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
