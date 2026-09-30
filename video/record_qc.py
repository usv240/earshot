"""Capture the Fire TV beats on an Amazon-hosted Fire TV, through the browser.

    python record_qc.py

Appstore Quality Central's virtual devices are Fire TV devices Amazon
hosts and streams to a browser tab, driven with the keyboard as the
remote: arrow keys are the D-pad and Enter is select. This is the
"Fire TV simulator" the rules name, and footage of the release APK
running on one is a direct answer to the track rule where an Android
TV virtual device is an argument about equivalence.

What only a person can do
-------------------------
Sign in. The Developer Console, the agreement for the device
programme, the Amazon account on the device itself, and the APK upload
are all behind a login this program must not have. So it opens a
Chrome window with its own profile, prints the steps, and waits. The
person signs in, connects a device, uploads the APK from the Dashboard
tab, installs it, launches Earshot so its home screen is on the stream,
and then says so. From that moment the program drives.

What it does from there
-----------------------
Finds the stream on the page, clicks it so key presses reach the
device, claps, and plays the same two beats as record_tv.py on the same
narration clock. It cannot read the device's screen, so it never
trusts where focus is: before every press that matters it walks left
to the end of the row and then right by a known count. Between beats
there is settling time for the stream's own latency.

Output
------
`build/tv.mp4`, cropped to the stream, plus `build/tv-timings.json`,
the same contract record_tv.py writes. `assemble.py` reads nothing
else, so the two television beats cut in unchanged.
"""

from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

from beats import BEATS
from record import CLAP_MS, find_clap

HERE = Path(__file__).parent
OUT = HERE / "build"
PROFILE = OUT / "qc-profile"
GO = OUT / "qc.go"
START_URL = "https://developer.amazon.com/apps-and-games/console/"

# The window has to fit the screen in headed mode. 16:9 inside a
# 1440x900 desktop.
WIDTH, HEIGHT = 1440, 810
FPS = 25
# Stream latency, key to picture, allowed for before every mark and
# after every press that changes the screen.
LAG = 1.2
# The film's first daylight scene; see record_tv.py.
FILM_LEAD = 72.0

# Row positions, counted from the left, for the walks below. The app's
# rows are fixed and short; this is what a person's thumb knows.
ROW = {
    "check": 0,     # Check it, Not now, Watch something
    "watch": 2,
    "louder": 1,    # Quieter, Louder, Hear that again, Subtitles, Stop watching
    "stop": 4,
    "begin": 2,     # Change length, Play it again, Begin
}
ROW_WIDTH = 6


def hold(seconds: float) -> None:
    time.sleep(max(seconds, 0))


def seconds_for(key_name: str, narration: dict[str, float]) -> float:
    beat = next(b for b in BEATS if b.key == key_name)
    spoken = narration.get(key_name, beat.speak_seconds)
    return max(beat.pause_before + spoken, beat.min_hold)


class Remote:
    def __init__(self, page: Page):
        self.page = page

    def press(self, key: str, gap: float = 0.45) -> None:
        self.page.keyboard.press(key)
        hold(gap)

    def walk_to(self, index: int) -> None:
        """Left to the end of the row, then right by a known count."""
        for _ in range(ROW_WIDTH):
            self.press("ArrowLeft", 0.35)
        for _ in range(index):
            self.press("ArrowRight", 0.45)

    def select(self) -> None:
        self.press("Enter", 0.3)


def stream_box(page: Page) -> dict:
    """The largest video or canvas on the page or in any of its frames:
    that is the device. Quality Central streams the device into a canvas
    inside a device-farm iframe, so the search walks frames, and the box
    comes back in page coordinates, which is what the crop and the click
    need. Playwright's bounding_box already reports frame content in
    page coordinates."""
    best = None
    for frame in page.frames:
        for tag in ("video", "canvas"):
            try:
                els = frame.locator(tag).all()
            except Exception:  # noqa: BLE001  a frame that is gone or cross-origin-locked
                continue
            for el in els:
                box = el.bounding_box()
                if not box or box["width"] < 300 or box["height"] < 200:
                    continue
                # The remote's own canvas is square; the screen is 16:9.
                if abs(box["width"] / box["height"] - 16 / 9) > 0.2:
                    continue
                if best is None or box["width"] * box["height"] > best["width"] * best["height"]:
                    best = box
    if best is None:
        raise SystemExit("no stream on the page: is a device connected and its screen showing?")
    return best


def record(page: Page, ctx, narration: dict[str, float]) -> int:
    """From a page whose stream shows Earshot's home screen: clap, play
    the two beats, close the context, and write tv.mp4 and
    tv-timings.json. The console work before this is a person's, or a
    driver's, and not this function's business."""
    box = stream_box(page)
    print(f"  stream at {box['x']:.0f},{box['y']:.0f} {box['width']:.0f}x{box['height']:.0f}", flush=True)
    page.mouse.click(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    hold(0.5)
    remote = Remote(page)

    # The clapperboard, in the corner of the stream so it survives
    # the crop. See record.py for why a take has to clap.
    page.evaluate(
        "([x, y]) => {var k=document.createElement('div');k.id='__clap';"
        "k.style.cssText='position:fixed;left:'+x+'px;top:'+y+'px;width:120px;height:120px;"
        "z-index:2147483647;background:#000';document.body.appendChild(k);}",
        [box["x"], box["y"]],
    )
    clap_at = time.monotonic()
    hold(CLAP_MS / 1000)
    page.evaluate("document.getElementById('__clap').remove()")
    hold(0.4)
    start = time.monotonic()
    clap_clock = clap_at - start
    marks: list[dict] = []

    def mark(key_name: str) -> None:
        at = time.monotonic() - start
        marks.append({"key": key_name, "at": round(at, 3)})
        print(f"  {at:6.1f}s  {key_name}", flush=True)

    # ---- Before the clock: open the film and let it reach daylight -
    remote.walk_to(ROW["watch"])
    remote.select()
    # The console's screen stream stops updating when no key arrives
    # for a while (take one froze for seventy seconds of film). Up is a
    # key the player ignores, so one every few seconds keeps the
    # picture flowing without touching the film or the level.
    lead_end = time.monotonic() + FILM_LEAD
    while time.monotonic() < lead_end - 5.0:
        hold(5.0)
        remote.press("ArrowUp", 0.0)
    hold(max(lead_end - time.monotonic(), 0))

    # ---- Beat 1: the film with the level live, then home ------------
    hold(LAG)
    mark("tv-home")
    budget = seconds_for("tv-home", narration)
    hold(1.5)
    remote.walk_to(ROW["louder"])
    remote.select()
    walk_cost = ROW_WIDTH * 0.35 + ROW["stop"] * 0.45 + 0.3
    hold(max(budget - 1.5 - (ROW_WIDTH * 0.35 + ROW["louder"] * 0.45 + 0.3) - walk_cost - 1.6, 3.0))
    remote.walk_to(ROW["stop"])
    remote.select()
    hold(1.6 + LAG)

    # ---- Beat 2: the check, on the remote ----------------------------
    remote.walk_to(ROW["check"])
    hold(LAG)
    mark("tv-check")
    check_end = time.monotonic() + seconds_for("tv-check", narration)
    hold(1.0)
    remote.select()
    hold(2.0 + LAG)
    remote.walk_to(ROW["begin"])
    remote.select()
    # Presses while a triplet plays are ignored by the app, and every
    # three that land while it is asking are an answer. A steady
    # rhythm therefore answers each round without reading the screen.
    while time.monotonic() < check_end - 0.8:
        remote.press("Enter", 0.5)
    hold(check_end - time.monotonic())
    hold(1.5)

    total = time.monotonic() - start
    video = page.video
    ctx.close()
    src = Path(video.path())

    raw = OUT / "tv-raw.mp4"
    dest = OUT / "tv.mp4"
    x, y, w, h = (int(box[k]) for k in ("x", "y", "width", "height"))
    w -= w % 2
    h -= h % 2
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(src),
         "-vf", f"crop={w}:{h}:{x}:{y}", "-r", str(FPS), "-fps_mode", "cfr",
         "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-pix_fmt", "yuv420p", "-an", str(dest)],
        check=True,
    )
    src.replace(raw)

    length = float(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(dest)],
        check=True, capture_output=True, text=True).stdout.strip())
    # The context has been recording since the console work began, so
    # the take is the tail of the file, and the clapperboard is black on
    # a black app. Align from the end instead: the file stops when the
    # context closes, which is `total` seconds after the clock started.
    offset = length - total
    if offset < 0:
        raise SystemExit(f"the file is shorter than the take ({length:.1f}s < {total:.1f}s), which is not credible")
    for m in marks:
        m["at"] = round(m["at"] + offset, 3)

    (OUT / "tv-timings.json").write_text(
        json.dumps({"video": round(length, 3), "width": w, "height": h,
                    "device": "Appstore Quality Central virtual Fire TV",
                    "clockOffset": round(offset, 3), "alignment": "from the end of the file", "crop_x": x, "crop_y": y, "beats": marks}, indent=1),
        encoding="utf8",
    )
    print(f"\nwrote {dest.name} ({dest.stat().st_size / 1048576:.1f} MB, {w}x{h}) and tv-timings.json", flush=True)
    print(f"{len(marks)} beats over {total:.1f}s of Fire TV footage; picture runs {offset:.2f}s ahead of the clock", flush=True)
    return 0


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = OUT / "narration.json"
    if not manifest.exists():
        raise SystemExit("no narration.json: run narrate.py first")
    narration = {n["key"]: n["seconds"] for n in json.loads(manifest.read_text(encoding="utf8"))}
    GO.unlink(missing_ok=True)
    for stale in OUT.glob("qc-raw/*.webm"):
        stale.unlink()

    with sync_playwright() as pw:
        try:
            ctx = pw.chromium.launch_persistent_context(
                str(PROFILE), channel="chrome", headless=False,
                viewport={"width": WIDTH, "height": HEIGHT},
                ignore_default_args=["--enable-automation"],
                record_video_dir=str(OUT / "qc-raw"),
                record_video_size={"width": WIDTH, "height": HEIGHT},
            )
        except Exception:
            ctx = pw.chromium.launch_persistent_context(
                str(PROFILE), headless=False,
                viewport={"width": WIDTH, "height": HEIGHT},
                ignore_default_args=["--enable-automation"],
                record_video_dir=str(OUT / "qc-raw"),
                record_video_size={"width": WIDTH, "height": HEIGHT},
            )
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto(START_URL, wait_until="domcontentloaded", timeout=120_000)

        print("A Chrome window is open. In it, and only in it:", flush=True)
        print("  1. Sign in to the Developer Console.", flush=True)
        print("  2. Tools and Services, Appstore Quality Central, Virtual Devices, Get Started; accept the agreement.", flush=True)
        print("  3. Connect a Fire TV device and sign in on it with your Amazon account.", flush=True)
        print("  4. Dashboard tab, App Upload: upload tv/android/app/build/outputs/apk/release/earshot-tv-v0.1.1.apk and install it.", flush=True)
        print("  5. Launch Earshot on the device so its home screen is on the stream, then say ready.", flush=True)
        print("waiting for build/qc.go ...", flush=True)
        while not GO.exists():
            time.sleep(1.0)
            if page.is_closed():
                raise SystemExit("the window was closed")

        return record(page, ctx, narration)


if __name__ == "__main__":
    sys.exit(main())
