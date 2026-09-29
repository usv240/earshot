# The demo video

Two cameras, one timeline, three minutes.

```
python beats.py          # check the script fits the ceiling first
python narrate.py        # Polly, one clip per beat
python record_tv.py      # the Fire TV beats, from the device
python record.py         # the web beats, from a real browser
python assemble.py       # cut both, lay the narration, normalise
python subtitle.py       # burn the captions
```

Output: `build/earshot-demo-captioned.mp4`. Upload that one. The `.srt`
ships beside it for anyone who wants the text, but do not also upload it
to YouTube or a viewer enabling CC sees two stacked sets of captions.

## Why there are two recorders

The Fire TV track rule says the video has to show the project *running*
on a Fire TV device or simulator. So the television beats are the release
APK on a television-shaped device, driven only by the D-pad and the
remote's media keys. The rest is the deployed website in a real browser.
`beats.py` decides which camera a beat belongs to; anything whose action
starts with `tv_` is device footage.

The browser is captured at 3840x2160, the size of the finished frame,
and is never scaled. The television is captured at whatever the emulator
window is, at most the 1920x1080 the virtual device renders, and
`assemble.py` brings those pieces up to the frame with one plain scale.
Nothing else is resized, and nothing is ever sped up.

The television footage today is an Android TV virtual device from the
Android SDK, because Amazon's Fire TV simulator sits behind a developer
sign-in that only a person can do. When that footage exists it drops
into the same slot through the same `tv-timings.json`. `record_tv.py`
says on its first page which device it is recording, and so does the
site.

## Three traps, all of which cost a take

**`adb shell screenrecord` compresses time.** It encodes a frame when the
screen *changes*, so a static shot produces almost nothing: fifteen
seconds resting on the home screen came back as a single frame, and a
thirty-seven second take came back as a twenty-six second file with the
holds squeezed out. The footage would have played roughly forty percent
fast. The host captures the emulator window with ffmpeg's gdigrab at a
constant thirty frames a second instead, and `record_tv.py` fails the run
if the captured duration is shorter than the take.

**The emulator must run with `-gpu swiftshader_indirect`.** With hardware
rendering the window is a GPU surface and a window grab returns a flat
grey rectangle, while every other check still passes. `record_tv.py`
launches it correctly; if the device is already up by other means, that
flag is on you.

**Playwright pads, it does not upscale.** A `record_video_size` larger
than the viewport gives a correct-looking recording with a grey border.
The viewport and the capture size are the same constant here, and
`assert_full_frame` refuses anything else.

## Nothing is ever sped up

`assemble.py` removes only screen that has already settled with nothing
being said over it. A step that genuinely took eleven seconds still looks
like eleven seconds, because a screen recording played fast is a lie
about how quick the product is.

The audio is built from the picture, never the other way round: each beat
is cut to its own narration length, and the narration is then laid at the
second that beat actually begins in the finished cut. The two tracks
cannot drift.
