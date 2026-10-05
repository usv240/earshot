# Product feedback

Every tool, API and SDK Earshot uses, what it was used for, what worked,
what did not, how onboarding felt, and whether we would build with it
again.

---

## Amazon Transcribe

**Used for:** locating where the words are in a programme's audio, so
loudness can be measured over the dialogue and nowhere else. We never ask
what the words were; the transcript is read for `start_time` and
`end_time` and for nothing else.

**What worked well:** the best onboarding of anything here. It accepted
16 kHz mono WAV without argument, the job shape is obvious from the API
names alone, and the polling contract is clear. Crucially, word-level
timings are in the default response rather than behind a flag, so the
integration did not make us request the part we did not want in order to
get the part we did.

**What needs work:** nothing that bit us. The one thing we noticed is
that `TranscriptFileUri` is a presigned URL with its own lifetime, which
is sensible and worth a sentence in the quickstart, because the natural
thing to do with a job result is store it and fetch it later.

**Onboarding:** under an hour end to end including the S3 round trip.

**Would we build with it again:** yes, without hesitation.

---

## Amazon Polly

**Used for:** synthesising the eight spoken digits the hearing screen
presents.

**What worked well:** neural voices are clean enough for a test where
intelligibility is the measurement, which is a higher bar than most
synthesis use cases. Level consistency between words was better than we
expected, though we still level them ourselves because a two-decibel
difference would make the test partly about which digits came up.

**What needs work:** `OutputFormat: "pcm"` returns headerless raw
samples. The documentation says so, in a parameter description, but every
other format is a container and the code samples all use MP3. Anybody
choosing `pcm` is doing signal processing and will hand the bytes to a
decoder. Either a `pcm-wav` format or one line in the sample would cost
nothing. Friction log entry 3.

**Onboarding:** straightforward. The voice catalogue is easy to browse
and the engine parameter is well explained.

**Would we build with it again:** yes.

---

## Amazon S3

**Used for:** holding the extracted audio while Transcribe reads it.
Nothing else reads those objects and they can be deleted as soon as the
job finishes.

**What worked well:** it is S3. The interesting part is what we did not
have to think about.

**What needs work:** nothing for this use.

**Would we build with it again:** yes.

---

## Amazon DynamoDB

**Used for:** completed checks, append only, partitioned by household and
sorted by date. Nothing is overwritten and no aggregate is stored,
because the question people actually have is whether a threshold is
changing, and that cannot be answered by a number that was thrown away.

**What worked well:** the single-table shape fits this exactly, and
`ScanIndexForward: false` with a limit gives "the last five" without the
server sorting anything.

**What needs work:** nothing for this use.

**Would we build with it again:** yes.

---

## AWS Lambda and function URLs

**Used for:** hosting the MCP server.

**What worked well:** a function URL is the right amount of
infrastructure for an MCP endpoint. No gateway to configure, no stages.

**What needs work:** the CORS configuration on a function URL and any
CORS middleware inside the function will both emit
`Access-Control-Allow-Origin`, and a browser rejects a response carrying
two of them even when the values are identical. `curl` reports a clean
200 throughout. This has now bitten three projects in this hackathon and
the symptom always looks like an application bug. A warning in the
function URL CORS documentation, naming the framework middleware case,
would save people days.

**Would we build with it again:** yes.

---

## Model Context Protocol, revision 2025-11-25, over Streamable HTTP

**Used for:** the Alexa+ surface.

**What worked well:** the spec is unusually precise about the things that
actually break interoperability: session lifecycle, which status code
means what, which JSON-RPC error code belongs to an unparseable body. It
is a spec you can conform to rather than approximate.

**What needs work:** the DNS-rebinding guidance says to validate `Origin`
and describes what to keep out without saying what to let in. The obvious
reading is loopback only, which is correct for a server on a developer's
machine and wrong for a deployed one whose own website holds a session
with it. A loopback-only list refuses that site with a 403 while every
agent keeps working, because agents send no `Origin` header at all. The
failure is therefore invisible to every non-browser test. One paragraph
on the deployed case would be worth a lot.

**Would we build with it again:** yes.

---

## Fire TV and Fire OS

**Used for:** the primary track. A React Native TV app that runs the
screen on a remote control.

**What worked well:** the D-pad focus model in `react-native-tvos` is
sound, and `hasTVPreferredFocus` does the right thing on a fresh launch.
Building for Fire OS is building for Android, which means the whole
Android toolchain applies unchanged.

**What needs work:** two things, and the first matters more than anything
else in this document.

Fire TV ships Dialogue Boost, hearing-aid pairing and direct streaming to
cochlear implants. All of it is excellent and all of it is for people who
already know they need it. There is no developer API to query whether
Dialogue Boost is on, no documented intent to open that settings screen,
and no way to ask for it on a customer's behalf. Our product exists to
get somebody from "I have not noticed" to "here is help that is already
on this device", and the last step of that bridge cannot be built. Even a
read-only state query, the way Android exposes `CaptioningManager`, would
change what this product can do. Friction log entry 1.

Second, there is no audio mixing on React Native, so playing speech
against noise at a controlled ratio needs two players and accepts
imprecise gaps. Friction log entry 2.

Nor can React Native read the set's own volume. Forty lines of Kotlin
around `AudioManager` can, and this app now ships them, but a
television framework whose one physical control is a volume key could
carry that reading in the template.

Third, and found only when a machine drove the remote: after a screen
comes back from another screen, focus lands where the row was last
left, not on the button marked preferred. A person corrects without
noticing; an automated driver, or a viewer told the app prefers one
button, does not. Friction log entry 14.

**Onboarding:** the samples are good and the accessibility documentation
is better than most platforms'. The gap is between the documentation for
making your own app accessible and the absence of documentation for
interacting with the accessibility features the platform already has.

**Would we build with it again:** yes.

---

## react-native-tvos and react-native-video

**Used for:** the TV app and its audio playback.

**What worked well:** `react-native-tvos` tracks upstream closely enough
that ordinary React Native knowledge transfers. `react-native-video`
exposes `volume` and `repeat`, which is the whole reason the two-player
mixing workaround is possible at all.

**What needs work:** `react-native-video` is a video component doing
audio work, and it shows. There is no way to know when playback will
actually start, which is what makes the gap between digits variable.

**Would we build with it again:** yes, with a native audio module for
anything where timing is the measurement.

---

## ffmpeg

**Used for:** extracting audio, and measuring loudness gated to speech.

**What worked well:** `aselect` with `asetpts` does exactly what
dialogue-gated loudness needs, and `ebur128` reports what the standard
specifies.

**What needs work:** the generated-expression case. A feature film
produces thousands of regions and an expression far longer than a command
line will carry, and the failure does not look like a length problem.
`-filter_script` solves it and is not mentioned anywhere near the filters
that generate long expressions. Friction log entry 5.

**Would we build with it again:** yes.

---

## AWS CDK and Amazon CloudFront

**Used for:** the whole deployment as one stack: the S3 bucket behind a
CloudFront distribution for the site, the DynamoDB table, the Lambda
function URL for the MCP server, and the one value the server must be
told, its own site's origin, passed from the stack that knows it rather
than typed twice.

**What worked well:** one `cdk deploy` from a clean checkout builds the
site, uploads it, invalidates the cache and prints the two URLs. The
`BucketDeployment` construct made the static export a one-liner.
Function URLs meant no API Gateway to configure for an endpoint that
only ever speaks one protocol.

**What needs work:** esbuild bundling of an ESM Lambda needs a banner
that recreates `require` before `@fastify/aws-lambda` will load, and
the failure is a 502 with "Dynamic require of node:crypto" in the logs
rather than anything at synth time. CloudFront invalidations take a
minute or two to reach a viewer, which is fine in production and
confusing in a demo loop, where a fresh deploy and a stale page look
identical.

**Onboarding:** good. The construct library's types are the
documentation, and they were enough.

**Would we build with it again:** yes.

---

## Appstore Quality Central and the Android TV virtual device

**Used for:** testing during the build on an Android TV virtual device,
driven only by D-pad key events over ADB, and the Fire TV footage in the
demo video: the release APK uploaded to a Fire TV that Amazon hosts in
Appstore Quality Central (Live Device Interaction, a FOS 14 3P TV),
launched from its ADB shell box and driven with the console's remote,
filmed with the whole console in frame.

**What worked well:** Quality Central puts a real Fire TV in a browser
with no hardware, which is exactly what a team without a device needs.
The upload and ADB shell box on the dashboard were enough to install and
launch a sideloaded APK. On the emulator side, reading the screen
through `uiautomator` made a remote driven by a program reliable, which
is how the focus finding above was made at all.

**What needs work:** Quality Central lives behind a developer sign-in
and a browser session, so nothing in a build pipeline can reach it. The
stream stops updating without key presses, the device's first-run setup
ignores the remote, and a recording of the browser runs behind the clock.
A way to drive a Quality Central device from ADB, or a downloadable Fire
TV system image for the standard emulator, would let the footage be made
by the same script that makes the rest of the video, every time the app
changes.

**Onboarding:** the emulator path is Android's and needs nothing from
Amazon. Quality Central took one support case before devices were
available, and finding out whether it could be scripted took longer than
it should have, because the answer is not written down.

**Would we build with it again:** yes, and we would want the image.

---

## Playwright

**Used for:** recording the website half of the demo video at 4K from a
real browser, with the pointer, the address bar and the scroll driven
by a script that reads the same beat list as the narration.

**What worked well:** one program produces the same take every time,
which is what let a dozen framing faults be fixed one still at a time.

**What needs work:** the video recording starts a fraction of a second
before the script's own clock, by a different amount on each run, and
nothing reports the offset. Every cut was early until the recorder was
made to clap a black square and find it in the file. A timestamp for
the first recorded frame in the API would remove the workaround.

**Would we build with it again:** yes.

---

## Node, TypeScript, Vitest, Jest, Next.js

**Used for:** everything else.

**What worked well:** `exactOptionalPropertyTypes` and
`noUncheckedIndexedAccess` caught several real mistakes in the signal
processing, where an off-by-one in an array index is silent and produces
plausible numbers.

**What needs work:** nothing attributable to these tools. Our two worst
defects this week were guards that silently checked nothing, and neither
type system nor test runner can see that. Friction log entries 9 and 10.

**Would we build with them again:** yes.
