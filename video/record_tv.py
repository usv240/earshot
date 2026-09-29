"""Capture the Fire TV beats from the device itself.

    python record_tv.py

The Fire TV track rule is specific: the demo video has to show the
project *running* on a Fire TV device or simulator. So this footage is
not a browser pretending to be a television, and it is not a mockup. It
is the release APK, installed on a television-shaped Android device,
driven only by the D-pad, and captured in real time from the host.

What the device is, stated rather than implied
----------------------------------------------
An Android TV virtual device from the Android SDK, 1920x1080, which is
the surface a Fire TV renders apps at. It is not Amazon's Fire TV
simulator: that runs inside Appstore Quality Central behind a developer
sign-in that only a person can do, and when that footage exists it goes
in the same slot through the same `tv-timings.json`. Until then the
narration is truthful either way, because it says "on Fire TV" of an
app built for Fire OS, and the site says which route the footage took.

Why a separate program from record.py
-------------------------------------
Nothing about this camera is like the browser one. There is no DOM to
query and the only input channel is a remote control. The two recorders
share `beats.py` and nothing else. What this one can do is read the
screen's accessibility tree through uiautomator, so it never presses a
button on a guess: it looks for the words on the button first.

Why the host records, and not the device
----------------------------------------
`adb shell screenrecord` encodes a frame only when the screen changes,
so a static shot produces almost nothing and the holds are squeezed out
of the file. That is time compression, which makes the television look
faster than it is, and this pipeline never speeds anything up. So the
host captures the emulator window with ffmpeg's gdigrab at a constant
thirty frames a second, which is real time by construction. The emulator
must therefore run with `-gpu swiftshader_indirect`: with hardware
rendering the window is a GPU surface and a window grab comes back grey.

What it does, in order
----------------------
Boots the virtual device if it is not already up, installs the release
APK, clears its stored sittings so every take starts from the same home
screen, launches it through the leanback launcher the way a Fire TV
home screen would, then records one continuous take while driving the
remote on a clock derived from the real narration lengths.

One take, not two
-----------------
Both television beats are cut from a single unbroken recording, so a
viewer sees one device being used rather than two clips that might each
be a different build. The sitting recorded in the first beat is the one
on the home screen in the second, because there was no cut between.

Why the film is already playing when the first beat begins
----------------------------------------------------------
The bundled film opens on a title card, four seconds of black, and then
a night scene that stays near black for most of a minute. A beat that
pressed Watch on its own clock showed a bright frame, then black, for
the whole line about a film whose dialogue was measured. So Watch is
pressed before the clock starts and the film is given time to reach
daylight; the beat then holds on the picture with the level panel live,
turns the volume up one step so the level is seen to move, stops
watching through the button row, and lands on the home screen carrying
the sitting it just made. The second beat opens on that home screen and
takes the check.

Output
------
`build/tv.mp4` plus `build/tv-timings.json`, which says where each beat
begins inside that file and how big the picture is. `assemble.py` reads
the second to cut and scale the first.
"""

from __future__ import annotations

import configparser
import json
import os
import re
import subprocess
import time
from pathlib import Path
from xml.etree import ElementTree

from beats import BEATS

HERE = Path(__file__).parent
OUT = HERE / "build"
REPO = HERE.parent
APK = REPO / "tv/android/app/build/outputs/apk/release/app-release.apk"

SDK = Path(
    os.environ.get("ANDROID_HOME")
    or os.environ.get("ANDROID_SDK_ROOT")
    or str(Path(os.environ.get("LOCALAPPDATA", "")) / "Android/Sdk")
)
ADB = SDK / "platform-tools/adb.exe"
EMULATOR = SDK / "emulator/emulator.exe"

PACKAGE = "com.earshottv"
FPS = 30
# Seconds of capture before the beat clock starts. Every beat mark is
# relative to the clock, so this is the offset into the file.
PREROLL = 2.0
# Seconds the film runs before the first beat begins; see the docstring.
# Measured on the bundled film: its first fifty seconds are a title, a
# fade and a night scene whose mean brightness sits under 30 of 255, and
# the daylight it opens into runs from about the sixty-sixth second. The
# player starts a second or two late under software rendering.
FILM_LEAD = 70.0

# What the app says on each screen, so the remote is driven by reading
# rather than by counting presses and hoping.
OFFER = "Check it, a minute or two"
WATCH = "Watch something"
CHECK_ANYWAY = "Check my hearing anyway"
STOP = "Stop watching"
LEVEL = "Set the volume"
ANSWER = "What did you hear?"


def adb(*args: str, check: bool = True, timeout: int = 120) -> str:
    proc = subprocess.run([str(ADB), *args], capture_output=True, text=True, timeout=timeout)
    if check and proc.returncode != 0:
        raise SystemExit(f"adb {' '.join(args)} failed:\n{proc.stderr[-600:]}")
    return proc.stdout.strip()


def key(name: str) -> None:
    adb("shell", "input", "keyevent", name)


def hold(seconds: float) -> None:
    """Dead time, with the screen left alone.

    Deliberately not `time.sleep` everywhere else in this file: a hold is
    part of the shot and is named as such so the plan reads like a plan.
    """
    time.sleep(max(seconds, 0))


def screen_text() -> str:
    """Every string on screen, from the accessibility tree.

    React Native's Text components are TextViews underneath, so the dump
    carries the words a viewer sees. This is the only way the recorder
    can tell which home screen it is looking at, since the app shows a
    different one depending on what the sample history says today.
    """
    adb("shell", "uiautomator", "dump", "/sdcard/earshot-ui.xml", check=False, timeout=30)
    xml = adb("shell", "cat", "/sdcard/earshot-ui.xml", check=False, timeout=30)
    return " ".join(re.findall(r'text="([^"]*)"', xml))


def on_screen(text: str) -> bool:
    return text in screen_text()


def focused_text() -> str:
    """The words on whatever the remote would press.

    Focus is a fact about the device, not about the recorder's count of
    presses. Coming back from the film, focus did not land on the button
    the app prefers; it sat where the previous screen's row had left
    it, and a press on the wrong button produced a take that waited ten
    seconds for a screen that never came. So the recorder reads.
    """
    adb("shell", "uiautomator", "dump", "/sdcard/earshot-ui.xml", check=False, timeout=30)
    xml = adb("shell", "cat", "/sdcard/earshot-ui.xml", check=False, timeout=30)
    try:
        root = ElementTree.fromstring(xml)
    except ElementTree.ParseError:
        return ""
    for node in root.iter("node"):
        if node.get("focused") == "true":
            return " ".join(n.get("text", "") for n in node.iter("node") if n.get("text")).strip()
    return ""


def focus_on(label: str, width: int = 6) -> None:
    """Walk the focused row until `label` is under the remote.

    Left to the end of the row first, then right until the label shows,
    so the pointer arrives the same way whatever it started on. Slow
    enough that the focus ring is seen to travel: that is the only
    evidence in the video that nothing here is a mouse.
    """
    if label in focused_text():
        return
    for _ in range(width):
        key("DPAD_LEFT")
        hold(0.45)
    for _ in range(width):
        if label in focused_text():
            return
        key("DPAD_RIGHT")
        hold(0.45)
    raise SystemExit(f"could not put focus on {label!r}; it is not in the focused row")


def wait_for(text: str, timeout: float) -> None:
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if on_screen(text):
            return
        time.sleep(0.4)
    raise SystemExit(f"the screen never showed {text!r} within {timeout:.0f}s")


def pick_avd() -> str:
    """A television-shaped virtual device, by its tag rather than its name.

    EARSHOT_AVD names one explicitly. Otherwise the first AVD whose
    config says android-tv is used, whatever a sibling project called it
    when it was made: the device is the device.
    """
    if os.environ.get("EARSHOT_AVD"):
        return os.environ["EARSHOT_AVD"]
    if not EMULATOR.exists():
        raise SystemExit(f"no emulator at {EMULATOR}; is the Android SDK installed?")
    names = subprocess.run([str(EMULATOR), "-list-avds"], capture_output=True, text=True).stdout.split()
    home = Path(os.environ.get("ANDROID_AVD_HOME") or str(Path.home() / ".android/avd"))
    for name in names:
        ini = home / f"{name}.avd/config.ini"
        if not ini.exists():
            continue
        cfg = configparser.ConfigParser()
        cfg.read_string("[avd]\n" + ini.read_text(encoding="utf8"))
        if cfg["avd"].get("tag.id", "").strip() == "android-tv":
            return name
    raise SystemExit(
        "no Android TV virtual device. Make one in Android Studio's Device "
        "Manager (category TV, 1080p) or set EARSHOT_AVD."
    )


def booted() -> bool:
    try:
        return adb("shell", "getprop", "sys.boot_completed", check=False, timeout=20) == "1"
    except Exception:
        return False


def ensure_device(avd: str) -> None:
    if booted():
        print("  device already up")
        return
    print(f"  booting {avd} ...")
    subprocess.Popen(
        [str(EMULATOR), "-avd", avd, "-no-snapshot-load", "-no-boot-anim",
         # Software rendering, so the window is an ordinary bitmap that
         # gdigrab can read. With the default GPU path the capture is a
         # uniform grey rectangle and every other check still passes.
         "-gpu", "swiftshader_indirect"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    for _ in range(72):
        if booted():
            print("  booted")
            time.sleep(6)  # let the launcher settle before installing
            return
        time.sleep(5)
    raise SystemExit("the device never finished booting")


def install() -> None:
    if not APK.exists():
        raise SystemExit(
            f"no APK at {APK}.\n"
            "Build it first: npm run bundle in tv/, then gradlew assembleRelease "
            "from the short path, as tv/README.md explains."
        )
    age = time.time() - APK.stat().st_mtime
    print(f"  installing {APK.name} ({APK.stat().st_size / 1048576:.1f} MB, "
          f"built {age / 3600:.1f} hours ago)")
    adb("install", "-r", str(APK), timeout=600)
    # Every take starts from the same home screen. Sittings persist on the
    # device by design, and a take that inherited the last take's sitting
    # would show a count the viewer never saw being made.
    adb("shell", "pm", "clear", PACKAGE)


def seconds_for(key_name: str, narration: dict[str, float]) -> float:
    beat = next(b for b in BEATS if b.key == key_name)
    spoken = narration.get(key_name, beat.speak_seconds)
    return max(beat.pause_before + spoken, beat.min_hold)


def probe_size(path: Path) -> tuple[int, int]:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=width,height", "-of", "csv=p=0", str(path)],
        check=True, capture_output=True, text=True).stdout.strip()
    w, h = (int(x) for x in out.split(",")[:2])
    return w, h


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = OUT / "narration.json"
    if not manifest.exists():
        raise SystemExit("no narration.json: run narrate.py first")
    narration = {n["key"]: n["seconds"] for n in json.loads(manifest.read_text(encoding="utf8"))}

    print("Fire TV capture")
    avd = pick_avd()
    ensure_device(avd)
    install()

    # Launch the way a Fire TV home screen does, through the leanback
    # category, rather than by activity name. If the manifest ever loses
    # LEANBACK_LAUNCHER this fails here instead of on a judge's device.
    adb("shell", "monkey", "-p", PACKAGE, "-c",
        "android.intent.category.LEANBACK_LAUNCHER", "1")
    wait_for("Earshot", 40)
    time.sleep(2.5)
    offered = on_screen(OFFER)
    print("  home screen: " + ("the check is being offered" if offered else "nothing to report"))

    dest = OUT / "tv.mp4"
    dest.unlink(missing_ok=True)
    window = f"Android Emulator - {avd}:5554"
    rec = subprocess.Popen(
        ["ffmpeg", "-y", "-v", "error",
         "-f", "gdigrab", "-framerate", str(FPS), "-i", f"title={window}",
         "-c:v", "libx264", "-crf", "18", "-preset", "veryfast",
         "-pix_fmt", "yuv420p", "-an", str(dest)],
        stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
    )
    print(f"  capturing the emulator window at {FPS}fps")
    time.sleep(PREROLL)  # let ffmpeg open the window and settle
    if rec.poll() is not None:
        raise SystemExit(
            "ffmpeg could not capture the emulator window. Is it running, "
            f"and is its title exactly {window!r}?"
        )
    # A take that fails part way must still let go of the file, or the
    # next take cannot open it: the capture process outlives a raised
    # SystemExit and keeps tv.mp4 locked until somebody notices.
    try:
        start = time.monotonic()
        marks: list[dict] = []

        def mark(key_name: str) -> None:
            at = time.monotonic() - start
            # Offsets are into the file, so they carry the pre-roll.
            marks.append({"key": key_name, "at": round(at + PREROLL, 3)})
            print(f"  {at:6.1f}s  {key_name}")

        # ---- Before the clock: open the film and let it reach a scene ------
        focus_on(WATCH)
        key("DPAD_CENTER")
        # Software rendering starts the player a few seconds late, and the
        # film's own opening is a title and then black. Twelve seconds lands
        # inside its first scene with the level panel already counting.
        hold(FILM_LEAD)

        # ---- Beat 1: the film with the level live, then home ---------------
        mark("tv-home")
        budget = seconds_for("tv-home", narration)
        # Stop watching through the button row rather than Back, so the row
        # is seen on the way out, and hold on the home screen with the
        # sitting it just recorded.
        exit_cost = 3 * 0.45 + 0.2 + 1.4
        # One step louder, on the button focus starts on, so the volume
        # and the listening level are seen to change rather than
        # described.
        hold(2.0)
        key("DPAD_CENTER")
        hold(max(budget - 2.0 - exit_cost, 3.0))
        for _ in range(3):
            key("DPAD_RIGHT")
            hold(0.45)
        key("DPAD_CENTER")
        hold(1.4)

        # ---- Beat 2: the check, on the remote -------------------------------
        # The home screen is re-read rather than assumed, because the sitting
        # just recorded joins the history the offer is decided from, and
        # focus is put on the check by reading rather than by counting.
        offered = on_screen(OFFER)
        focus_on(OFFER if offered else CHECK_ANYWAY)
        mark("tv-check")
        check_end = time.monotonic() + seconds_for("tv-check", narration)
        hold(1.0)  # the offer, read for a moment, before it is taken up
        key("DPAD_CENTER")
        wait_for(LEVEL, 10)
        hold(2.4)  # the noise on its own, and the length it will run
        key("DPAD_CENTER")  # Begin has preferred focus
        while time.monotonic() < check_end - 1.2:
            try:
                wait_for(ANSWER, 12)
            except SystemExit:
                break
            # Answers are the key focus starts on. The digits are not read
            # off the screen, so the run is genuine rather than scripted; the
            # cut comes long before any result.
            for _ in range(3):
                key("DPAD_CENTER")
                hold(0.35)
        hold(check_end - time.monotonic())
        hold(1.5)  # a tail, so the last cut is not on the final syllable

    except BaseException:
        rec.kill()
        raise
    total = time.monotonic() - start

    # 'q' on stdin is ffmpeg's clean stop: it flushes and writes the moov
    # atom. Killing it instead leaves a file that will not seek.
    try:
        rec.communicate(input=b"q", timeout=40)
    except subprocess.TimeoutExpired:
        rec.kill()
        raise SystemExit("ffmpeg would not stop; the take is unusable")

    if not dest.exists() or dest.stat().st_size < 100_000:
        raise SystemExit("the recording is missing or too small to be real")

    # The whole reason this recorder exists: real time, or it is a lie
    # about how fast the product is.
    captured = float(subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(dest)],
        check=True, capture_output=True, text=True).stdout.strip())
    expected = total + PREROLL
    print(f"  {total:.1f}s driven, {captured:.1f}s captured "
          f"(expected about {expected:.1f}s)")
    if captured < expected - 1.0:
        raise SystemExit(
            f"the capture is {expected - captured:.1f}s short of the take. "
            "Frames were dropped; do not ship time-compressed footage."
        )
    if captured > expected + 5.0:
        raise SystemExit(
            f"the capture ran {captured - expected:.1f}s long, so the beat "
            "marks will not line up with the picture."
        )

    width, height = probe_size(dest)
    (OUT / "tv-timings.json").write_text(
        json.dumps({"video": round(captured, 3), "width": width, "height": height,
                    "beats": marks}, indent=1),
        encoding="utf8",
    )
    print(f"\nwrote {dest.name} ({dest.stat().st_size / 1048576:.1f} MB, {width}x{height}) "
          f"and tv-timings.json")
    print(f"{len(marks)} beats over {total:.1f}s of device footage")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
