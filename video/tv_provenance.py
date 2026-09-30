"""Show where the Fire TV footage came from, for a moment, then the set.

    python tv_provenance.py

record_qc.py crops the take to the device stream, because the picture
is the product. A judge checking the rule that the footage is a Fire TV
device or Amazon's simulator cannot tell a cropped stream from an
emulator, so this rewrites build/tv.mp4 to open its first beat on the
whole console window for a few seconds: the Amazon Developer header,
the device's name, the on-screen remote, the stream inside it. Then it
cuts to the crop and stays there. The raw window recording is what
record_qc.py kept as build/tv-raw.mp4; the crop box and the beat marks
are read from tv-timings.json and are not changed, so the assembler's
cut is the same to the frame.

It is idempotent: it always starts from tv-raw.mp4.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE / "build"
PROVENANCE_SECONDS = 2.5
FPS = 25


def main() -> int:
    raw = OUT / "tv-raw.mp4"
    timings_path = OUT / "tv-timings.json"
    if not raw.exists() or not timings_path.exists():
        print("need build/tv-raw.mp4 and build/tv-timings.json from record_qc.py", file=sys.stderr)
        return 2
    t = json.loads(timings_path.read_text(encoding="utf8"))
    if "console" in t.get("device", "") and t.get("provenance_seconds"):
        pass  # rewriting from raw anyway
    w, h = t["width"], t["height"]
    first = min(b["at"] for b in t["beats"])
    # The crop box was not stored; recover it from the raw frame: the
    # stream's box is the one the recorder printed, and record_qc.py
    # stores its size. The x, y are stored from this run on.
    x, y = t.get("crop_x"), t.get("crop_y")
    if x is None or y is None:
        print("tv-timings.json has no crop_x/crop_y; rerun record_qc.py (it stores them now)", file=sys.stderr)
        return 2
    start, end = first, first + PROVENANCE_SECONDS
    # Two streams from one input: the whole window scaled to the crop's
    # size, and the crop; the overlay shows the window only in the
    # provenance seconds. Same size in, same size out, so nothing
    # downstream moves.
    filt = (
        f"[0:v]split=2[a][b];"
        f"[a]crop={w}:{h}:{x}:{y}[stream];"
        f"[b]scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=#12151b[window];"
        f"[stream][window]overlay=0:0:enable='between(t,{start:.3f},{end:.3f})'[v]"
    )
    dest = OUT / "tv.mp4"
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(raw), "-filter_complex", filt, "-map", "[v]",
         "-r", str(FPS), "-fps_mode", "cfr", "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-an", str(dest)],
        check=True,
    )
    t["provenance_seconds"] = PROVENANCE_SECONDS
    t["provenance"] = "the first beat opens on the whole Appstore Quality Central console window, then cuts to the device stream"
    timings_path.write_text(json.dumps(t, indent=1), encoding="utf8")
    print(f"wrote tv.mp4 with {PROVENANCE_SECONDS}s of the console at {start:.1f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
