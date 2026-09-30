"""Drive the Quality Central console from commands in a file, then record.

    python drive_qc.py

Opens the same Chrome profile record_qc.py uses (so the Developer
Console sign-in persists), then polls build/qc-cmd.txt once a second.
Each line is one command; after each, a screenshot lands at
build/qc-state.png and the outcome is appended to build/qc-drive.log,
so whoever is driving can look before the next step. The sign-ins are
still a person's: this only clicks what a signed-in console shows.

Commands:
    goto <url>
    click <text>            first visible element whose text matches
    clickat <x> <y>         page coordinates
    press <key>
    type <text>             into the focused element, then Enter
    shell <command>         into the Dashboard's ADB Shell box
    shot                    screenshot only
    record                  hand the page to record_qc.record()
    quit
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

import record_qc as qc

CMD = qc.OUT / "qc-cmd.txt"
SHOT = qc.OUT / "qc-state.png"
LOG = qc.OUT / "qc-drive.log"


def log(msg: str) -> None:
    with LOG.open("a", encoding="utf8") as fh:
        fh.write(msg + "\n")
    print(msg, flush=True)


def main() -> int:
    qc.OUT.mkdir(parents=True, exist_ok=True)
    narration = {n["key"]: n["seconds"] for n in json.loads((qc.OUT / "narration.json").read_text(encoding="utf8"))}
    CMD.unlink(missing_ok=True)
    LOG.write_text("", encoding="utf8")
    for stale in qc.OUT.glob("qc-raw/*.webm"):
        try:
            stale.unlink()
        except PermissionError:
            pass  # a closing browser still holds it; the recorder reads page.video, not the directory
    with sync_playwright() as pw:
        kwargs = dict(headless=False, viewport={"width": qc.WIDTH, "height": qc.HEIGHT},
                      ignore_default_args=["--enable-automation"],
                      record_video_dir=str(qc.OUT / "qc-raw"), record_video_size={"width": qc.WIDTH, "height": qc.HEIGHT})
        try:
            ctx = pw.chromium.launch_persistent_context(str(qc.PROFILE), channel="chrome", **kwargs)
        except Exception:
            ctx = pw.chromium.launch_persistent_context(str(qc.PROFILE), **kwargs)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto(qc.START_URL, wait_until="domcontentloaded", timeout=120_000)
        page.screenshot(path=str(SHOT))
        log("ready; waiting for commands")
        while True:
            time.sleep(1.0)
            if page.is_closed():
                log("window closed")
                return 1
            if not CMD.exists():
                continue
            line = CMD.read_text(encoding="utf8").strip()
            CMD.unlink()
            if not line:
                continue
            verb, _, rest = line.partition(" ")
            try:
                if verb == "goto":
                    page.goto(rest, wait_until="domcontentloaded", timeout=120_000)
                    time.sleep(3)
                elif verb == "click":
                    page.get_by_text(rest, exact=False).first.click(timeout=15_000)
                    time.sleep(2)
                elif verb == "clickat":
                    x, y = (float(v) for v in rest.split())
                    page.mouse.click(x, y)
                    time.sleep(2)
                elif verb == "press":
                    page.keyboard.press(rest)
                    time.sleep(1.5)
                elif verb == "type":
                    page.keyboard.type(rest)
                    page.keyboard.press("Enter")
                    time.sleep(2)
                elif verb == "shell":
                    box = page.get_by_placeholder("ADB Shell").first if page.get_by_placeholder("ADB Shell").count() else page.locator("input, textarea").last
                    box.click()
                    box.fill(rest)
                    page.keyboard.press("Enter")
                    time.sleep(4)
                elif verb == "shot":
                    pass
                elif verb == "scroll":
                    page.evaluate(f"window.scrollTo(0, {int(rest)})")
                    time.sleep(1.5)
                elif verb == "fclick":
                    # Click text in whichever frame has it.
                    done = False
                    for fr in page.frames:
                        loc = fr.get_by_text(rest, exact=False)
                        try:
                            if loc.count():
                                loc.first.click(timeout=8_000)
                                done = True
                                break
                        except Exception:  # noqa: BLE001
                            continue
                    if not done:
                        raise RuntimeError(f"no frame has text {rest!r}")
                    time.sleep(3)
                elif verb == "upload":
                    # upload <path>: the first file input in any frame.
                    done = False
                    for fr in page.frames:
                        loc = fr.locator("input[type=file]")
                        try:
                            if loc.count():
                                loc.first.set_input_files(rest)
                                done = True
                                break
                        except Exception:  # noqa: BLE001
                            continue
                    if not done:
                        raise RuntimeError("no file input in any frame")
                    time.sleep(3)
                elif verb == "ftext":
                    # Dump visible text of every frame, trimmed, to the log.
                    for fr in page.frames:
                        try:
                            t = fr.evaluate("() => document.body ? document.body.innerText.replace(/\s+/g,' ').slice(0, 900) : ''")
                        except Exception as e:  # noqa: BLE001
                            t = str(e)[:60]
                        log(f"  [{fr.url[:50]}] {t}")
                elif verb == "frames":
                    for fr in page.frames:
                        try:
                            found = fr.evaluate("""() => Array.from(document.querySelectorAll('video,canvas,img'))
                                .map(e => { const r = e.getBoundingClientRect(); return {tag: e.tagName, id: e.id, w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y)}; })
                                .filter(e => e.w >= 200).slice(0, 6)""")
                        except Exception as e:  # noqa: BLE001
                            found = str(e)[:80]
                        log(f"  frame {fr.name!r} {fr.url[:70]}: {found}")
                elif verb == "probe":
                    # The largest elements on the page, by tag, so the stream can be named.
                    found = page.evaluate("""() => Array.from(document.querySelectorAll('video,canvas,img,iframe,div'))
                        .map(e => { const r = e.getBoundingClientRect(); return {tag: e.tagName, id: e.id, cls: (e.className||'').toString().slice(0,60), w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), src: (e.src||'').slice(0,60)}; })
                        .filter(e => e.w >= 300 && e.h >= 200 && e.w < 1300).sort((a,b) => b.w*b.h - a.w*a.h).slice(0, 12)""")
                    for f in found:
                        log(f"  {f}")
                elif verb == "record":
                    log("recording")
                    page.screenshot(path=str(SHOT))
                    rc = qc.record(page, ctx, narration)
                    log(f"record returned {rc}")
                    return rc
                elif verb == "quit":
                    ctx.close()
                    return 0
                else:
                    log(f"unknown: {line}")
                    continue
                page.screenshot(path=str(SHOT))
                log(f"ok: {line}  ({page.url[:80]})")
            except Exception as err:  # noqa: BLE001
                try:
                    page.screenshot(path=str(SHOT))
                except Exception:  # noqa: BLE001
                    pass
                log(f"failed: {line}: {type(err).__name__}: {str(err)[:200]}")


if __name__ == "__main__":
    sys.exit(main())
