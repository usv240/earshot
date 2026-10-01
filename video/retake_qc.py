"""The Fire TV beats in one take, with the whole console in frame.

Called by drive_qc.py's `retake` command once the console shows
Earshot's home screen on the hosted Fire TV. Differs from
record_qc.record in three ways, each for the same reason, that a judge
should be able to see where the footage came from on every frame:

- Nothing is cropped. The frame is the whole Appstore Quality Central
  page, under an address bar showing the console's real address, the
  same bar the web beats carry. The device stream takes about two
  thirds of it.
- The context records at 2.4x device scale into a 3840x2160 file, so
  the console is captured at the video's own resolution rather than
  scaled up from 942x530.
- The doctor page on the set is part of the same take: after the check
  beat the recorder keeps answering on the remote until the result
  screen is on the stream, which it recognises by the wide blue button
  in the bottom band of the picture, then opens the page.

Marks align from the end of the file, as record_qc does, because the
context has been recording since the console work began.
"""

from __future__ import annotations

import io as _io
import json
import subprocess
import time
from pathlib import Path

from PIL import Image

import record_qc as qc

FULL_W, FULL_H = 3840, 2160
CONSOLE_URL = "developer.amazon.com/apps-and-games/console/app-quality-central?Tab=LiveDeviceInteraction"

URL_BAR_JS = """
(() => {
  if (document.getElementById('__bar')) return;
  var H = 56;
  var b = document.createElement('div');
  b.id = '__bar';
  b.style.cssText = ['position:fixed','top:0','left:0','right:0','height:'+H+'px',
    'z-index:2147483646','background:#f3f1ec','border-bottom:1px solid #d9d3c7',
    'display:flex','align-items:center','padding:0 18px','gap:10px',
    'font:14px/1 Inter,system-ui,sans-serif','color:#1c1a17'].join(';');
  var lock = document.createElement('span');
  lock.textContent = '\\u{1F512}';
  lock.style.cssText = 'font-size:14px;line-height:1;opacity:0.85';
  var url = document.createElement('span');
  url.textContent = '%s';
  url.style.cssText = ['background:#fff','border:1px solid #d9d3c7','border-radius:10px',
    'padding:8px 14px','flex:1','max-width:760px','white-space:nowrap','overflow:hidden','text-overflow:ellipsis'].join(';');
  b.appendChild(lock); b.appendChild(url);
  document.body.appendChild(b);
  document.body.style.paddingTop = H + 'px';
})();
""" % CONSOLE_URL


def result_on_stream(page, box: dict) -> bool:
    """The result screen's button row is the only wide blue band in the
    bottom tenth of the picture; the answer keypad sits higher."""
    clip = {"x": box["x"], "y": box["y"] + box["height"] * 0.84, "width": box["width"] * 0.45, "height": box["height"] * 0.1}
    png = page.screenshot(clip=clip)
    im = Image.open(_io.BytesIO(png)).convert("RGB")
    px = im.getdata()
    blue = sum(1 for r, g, b in px if b > 200 and 90 < r < 170 and 130 < g < 200)
    return blue > 0.08 * len(px)


BAR_CSS_H = 56


def render_bar(page) -> Path:
    """The address bar, drawn by the same browser at the same device
    scale, then taken off the page again: the console's layout is left
    exactly as Amazon ships it, and the bar is composited above it, so
    the whole page and the whole device stream stay in frame."""
    page.evaluate(URL_BAR_JS)
    qc.hold(0.6)
    dest = qc.OUT / "qc-bar.png"
    page.screenshot(path=str(dest), clip={"x": 0, "y": 0, "width": page.viewport_size["width"], "height": BAR_CSS_H}, scale="device")
    page.evaluate("(() => { var b = document.getElementById('__bar'); if (b) b.remove(); document.body.style.paddingTop = ''; })()")
    qc.hold(0.6)
    return dest


def retake(page, ctx, narration: dict[str, float]) -> int:
    page.evaluate("window.scrollTo(0, 0)")
    bar = render_bar(page)
    box = qc.stream_box(page)
    print(f"  stream at {box['x']:.0f},{box['y']:.0f} {box['width']:.0f}x{box['height']:.0f} (css px)", flush=True)
    page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    qc.hold(0.5)
    remote = qc.Remote(page)
    start = time.monotonic()
    marks: list[dict] = []

    def mark(key: str) -> None:
        at = time.monotonic() - start
        marks.append({"key": key, "at": round(at, 3)})
        print(f"  {at:6.1f}s  {key}", flush=True)

    # Before the clock: open the film, keep the stream awake to daylight.
    remote.walk_to(qc.ROW["watch"])
    remote.select()
    lead_end = time.monotonic() + qc.FILM_LEAD
    while time.monotonic() < lead_end - 5.0:
        qc.hold(5.0)
        remote.press("ArrowUp", 0.0)
    qc.hold(max(lead_end - time.monotonic(), 0))

    # Beat 1: the film with the level live, one step louder, then home.
    qc.hold(qc.LAG)
    mark("tv-home")
    budget = qc.seconds_for("tv-home", narration)
    qc.hold(1.5)
    remote.walk_to(qc.ROW["louder"])
    remote.select()
    walk_cost = qc.ROW_WIDTH * 0.35 + qc.ROW["stop"] * 0.45 + 0.3
    qc.hold(max(budget - 1.5 - (qc.ROW_WIDTH * 0.35 + qc.ROW["louder"] * 0.45 + 0.3) - walk_cost - 1.6, 3.0))
    remote.walk_to(qc.ROW["stop"])
    remote.select()
    qc.hold(1.6 + qc.LAG)

    # Beat 2: the offer and the check.
    remote.walk_to(qc.ROW["check"])
    qc.hold(qc.LAG)
    mark("tv-check")
    check_end = time.monotonic() + qc.seconds_for("tv-check", narration)
    qc.hold(1.0)
    remote.select()
    qc.hold(2.0 + qc.LAG)
    remote.walk_to(qc.ROW["begin"])
    remote.select()
    while time.monotonic() < check_end - 0.8:
        remote.press("Enter", 0.5)
    qc.hold(max(check_end - time.monotonic(), 0))

    # Off the clock: answer to the end of the run, looking for the result.
    deadline = time.monotonic() + 300
    seen = False
    while time.monotonic() < deadline:
        for _ in range(3):
            remote.press("Enter", 0.5)
        if result_on_stream(page, box):
            seen = True
            break
    if not seen:
        raise SystemExit("the result screen never appeared on the stream")
    qc.hold(qc.LAG + 1.5)

    # Beat 3: the result, then the page, opened with the remote.
    mark("tv-page")
    qc.hold(2.0)
    remote.select()
    qc.hold(max(qc.seconds_for("tv-page", narration) + 6.0, 10.0))

    total = time.monotonic() - start
    page_css_h = page.viewport_size["height"]
    video = page.video
    ctx.close()
    src = Path(video.path())

    dest = qc.OUT / "tv.mp4"
    bar_h = round(BAR_CSS_H * FULL_H / page_css_h)
    page_h = FULL_H - bar_h
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(src), "-i", str(bar),
         "-filter_complex",
         f"[0:v]scale=-2:{page_h}:flags=lanczos[p];[1:v]scale={FULL_W}:{bar_h}[b];"
         f"[p]pad={FULL_W}:{FULL_H}:(ow-iw)/2:{bar_h}:color=0xf3f1ec[pp];[pp][b]overlay=0:0[v]",
         "-map", "[v]", "-r", str(qc.FPS), "-fps_mode", "cfr",
         "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-pix_fmt", "yuv420p", "-an", str(dest)],
        check=True,
    )
    src.replace(qc.OUT / "tv-raw-full.webm")
    length = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(dest)],
                                  check=True, capture_output=True, text=True).stdout.strip())
    offset = length - total
    if offset < 0:
        raise SystemExit(f"the file is shorter than the take ({length:.1f}s < {total:.1f}s)")
    for m in marks:
        m["at"] = round(m["at"] + offset, 3)
    (qc.OUT / "tv-timings.json").write_text(json.dumps({
        "video": round(length, 3), "width": FULL_W, "height": FULL_H,
        "device": "Appstore Quality Central virtual Fire TV (FOS 14 3P TV), release APK v0.1.2",
        "framing": "the whole console window under an address bar showing its URL, recorded at 2.4x device scale",
        "clockOffset": round(offset, 3), "alignment": "from the end of the file", "beats": marks}, indent=1), encoding="utf8")
    print(f"\nwrote tv.mp4 ({FULL_W}x{FULL_H}) and tv-timings.json: {len(marks)} beats over {total:.1f}s", flush=True)
    return 0
