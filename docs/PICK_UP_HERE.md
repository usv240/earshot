# Pick up here: the Fire TV footage

Written 2026-09-29. Everything in the Earshot submission is finished
except the two television beats of the demo video, which are recorded
on an Android TV virtual device and should be recorded on a Fire TV
that Amazon hosts before the video is uploaded. This file is the whole
of what is needed to do that, so nobody has to remember it.

## Where things stand

- Repository: main at `fc0c3af`, CI green, 214 tests.
- Site: https://d29nbz7seeunuf.cloudfront.net, deployed from that commit.
- Fire TV app: release v0.1.1, https://github.com/usv240/earshot/releases/tag/v0.1.1,
  the APK to sideload onto the simulator.
- Video: `video/build/earshot-demo-captioned.mp4`, 3840x2160, 2:54.7,
  thirteen beats, captions burned in. Complete and correct; only its
  two television beats (`tv-home`, `tv-check`) are stand-in footage.
- `build/` is not tracked, so on a fresh machine run `narrate.py` and
  `record.py` first (about ten minutes) to recreate the web take.

## The blocker

Appstore Quality Central, Live Device Interaction, Virtual Devices
showed 20 devices, 0 usable, 0 busy, every tile disabled, on
2026-09-29 from 12:43 IST. Amazon's docs say the virtual farm is open
to all developers and give no reason for this state. A support case
was filed under Testing Tool for App, Appstore Quality Central, Live
Device Interaction. Its number: _(add when known)_.

Check once a day: Developer Console, Tools and Services, Appstore
Quality Central, Live Device Interaction. Usable above zero, or tiles
no longer grey, means go.

## When the pool opens

1. In `earshot/video`, run `python -u record_qc.py`. It opens a Chrome
   window with its own profile and prints five steps.
2. In that window, and only that window: sign in to the Developer
   Console; Tools and Services, Appstore Quality Central, Live Device
   Interaction, click a usable Fire TV image; sign in on the device
   with the Amazon account (the sign-in-with-code route at
   amazon.com/code in a second tab of the same window is easiest);
   Dashboard tab, App Upload, upload
   `tv/android/app/build/outputs/apk/release/earshot-tv-v0.1.1.apk`
   (or the file from the release) and install; launch Earshot with the
   Dashboard's Shell box:
   `shell monkey -p com.earshottv -c android.intent.category.LEANBACK_LAUNCHER 1`
   (or Settings, Applications, Manage Installed Applications, Earshot,
   Launch). The stream should show "Something worth a minute".
3. Hands off the keyboard, then create the go-signal:
   `type nul > video\build\qc.go` in cmd, or `touch video/build/qc.go`
   in Git Bash. The recorder clicks the stream, claps, walks the remote
   through the film with the volume key and then the check, and writes
   `build/tv.mp4` and `build/tv-timings.json` with
   `"device": "Appstore Quality Central virtual Fire TV"`.
4. `python assemble.py`, then `python subtitle.py`. Pull stills at the
   `tv-home` and `tv-check` cue times from `build/cues.json` and look at
   them. Duration must be under 180 s (it will be about 2:55).
5. Upload `build/earshot-demo-captioned.mp4` to YouTube, public. Do not
   upload the `.srt` as well.
6. Put the URL in `docs/SUBMISSION.md` under Demo video, and in the
   three sibling projects' submission docs if they share the link.
7. Change the sentence on the site's Fire TV section and in
   `docs/VIDEO_SCRIPT.md` that says the footage is an Android TV
   virtual device to say it is an Amazon-hosted Fire TV in Appstore
   Quality Central: `apps/web/src/components/FireTvConnect.tsx` step 5,
   and the "The Fire TV footage" section written by `video/beats.py
   --script`. Then `npm test`, commit, push, `npm run deploy`.

`record_qc.py` has not run against a live session yet. Its first run
will find something to fix; the likely places are the stream element it
looks for (it takes the largest `video` or `canvas` on the page) and
the walk counts in `ROW`, which assume the app's button rows as of
v0.1.1. The audio on virtual devices is listed by Amazon as not fully
supported; the picture is what the video needs.

## If the pool is still closed on 2026-10-09

Two weeks before the deadline, stop waiting. Put a Fire TV Stick on the
same network as the laptop, turn on ADB debugging (Settings, My Fire
TV, Developer Options), note its IP under About, Network, and run
`python record_tv.py --device <ip>`. The set records its own screen,
the file is pulled and made constant-rate, and the same two files land
in `build/`. Then steps 4 to 7 above, with the sentence in step 7
saying it is an actual Fire TV device.

## Independent of all this

- Five people take the check on the live site, one sentence each on
  what confused them, for the front page's honesty card.
- `cd packages/digits-in-noise && npm login && npm publish`, because the
  submission says it is published.
- The Amazon Appstore listing, so "Find it in the Appstore" can say
  "in review": assets and answers are the next thing to prepare.
- The Nightlight video URL into every submission doc.
