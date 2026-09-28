# Friction log

Every entry is something that happened while building Earshot, with what
was tried, what was expected, what actually occurred, and what would have
helped. Two of them are against us rather than against anybody's tools,
and they are here because they were the expensive ones.

Severity is about the cost to a developer who hits it without knowing,
not about how hard it is to fix once you do.

---

## Entry 1: Fire TV ships the feature this product wants to turn on, and no way to turn it on (2026-09-20)

- **Task:** after a check suggests somebody is struggling with speech in noise, switch on Fire TV's Dialogue Boost for them, and afterwards measure whether it helped.
- **Steps:** searched the Fire TV developer documentation for Dialogue Boost, for an accessibility settings API, and for a deep link to the accessibility settings screen. Read `implement-accessibility-fire-os`, `assistive-technologies-fire-os`, and the 2025 accessibility guide.
- **Expected:** something equivalent to Android's `Settings.ACTION_ACCESSIBILITY_SETTINGS` intent at minimum, and ideally a read of whether Dialogue Boost is on, the way an app can read whether captions are enabled through `CaptioningManager`.
- **Actual:** Dialogue Boost is documented only as a customer-facing path, Settings then Accessibility then Dialogue Boost, with a level chosen by hand. Nothing in the developer documentation exposes its state or offers a route to it. An app that has just established that a viewer needs help with dialogue has to say "go to Settings" and hope.
- **Severity:** high for this product and, we think, for the platform. Amazon has built a genuinely good feature and the developer surface has no way to put it in front of the person who needs it at the moment they need it.
- **Workaround:** the app explains where the setting lives, in words, and cannot confirm the person found it. The before-and-after measurement we wanted to do is not possible.
- **Suggestion, in order of usefulness. First, a read-only query for accessibility feature state, the way `CaptioningManager.isEnabled()` works on Android, so an app can at least know whether to mention it. Second, a documented intent to open that settings screen directly. Third, and best, a scoped request API: an app asks to enable Dialogue Boost, the system asks the customer, the customer decides. That keeps the decision with the customer and removes the part where somebody who has just been told they might have a hearing problem is sent to find a menu.
- **Why it is in this log:** the whole product is a bridge from "you have not noticed" to "here is help that already exists on this device". The last step of that bridge is missing, and it is the only one we could not build.

---

## Entry 2: React Native has no way to mix two sounds (2026-09-20)

- **Task:** play three spoken digits against continuous noise at a precise signal-to-noise ratio, on Fire TV.
- **Steps:** looked for an audio graph in React Native and in `react-native-video`. Considered `Audio` APIs, the media session API, and pre-rendering.
- **Expected:** something like Web Audio, where the browser version of this app is four lines: one source for the noise, three for the digits, a gain node on each.
- **Actual:** there is no mixing graph, no sample-accurate scheduling, and no way to start a sound at a specified time. `react-native-video` exposes `volume` and `repeat`, which is enough to get two players running at a controlled ratio and nothing more.
- **Severity:** medium, and specific. Most apps want to play one thing at a time, so this is invisible until you want two. Anything doing audiology, language learning, music practice or accessibility testing wants two.
- **Workaround:** noise loops on one player at unity, digits play on a second whose volume is the ratio. Both files are levelled to the same figure by the pipeline, so that volume is exactly the ratio the procedure asked for. The cost is that the gap between digits is whatever the player takes to swap sources, which is a few tens of milliseconds and not constant. The published procedure does not require a fixed gap, so the measurement stands.
- **Suggestion:** a minimal mixing surface in the TV template, even just "play these buffers at these gains starting now", would open a category of app that currently cannot be built without writing a native module. Alternatively, documenting the recommended native-module approach for this would save everybody the same week.

---

## Entry 3: Amazon Polly returns PCM with no header, and says so only in passing (2026-09-20)

- **Task:** synthesise eight digits as uncompressed audio, so the masking noise can be shaped to their real spectrum rather than to an encoder's artefacts.
- **Steps:** `SynthesizeSpeech` with `OutputFormat: "pcm"` and `SampleRate: "16000"`, then handed the bytes to a WAV decoder.
- **Expected:** either a WAV file, or a clearly flagged raw stream.
- **Actual:** raw signed 16-bit little-endian samples with no RIFF header. The decoder failed on the first four bytes. The documentation does state this, but it is one line in a parameter description rather than anything you meet while following the quickstart, and every other output format is a container.
- **Severity:** low. Fifteen minutes, once.
- **Workaround:** wrap the bytes in a header before decoding.
- **Suggestion:** a sentence in the code sample, or a `pcm-wav` output format. The reason to use `pcm` at all is signal processing, and the people doing signal processing are the ones who will hand it straight to a decoder.

---

## Entry 4: EBU R128 removes silence from a loudness measurement but not music, which makes programme loudness the wrong number for dialogue (2026-09-20)

- **Task:** measure how loud a programme's dialogue is, so it can be compared against the volume a household chose.
- **Steps:** `ffmpeg -af ebur128` on the programme audio, expecting a figure representing what a viewer is listening to.
- **Expected:** something dominated by speech, since speech is what a viewer sets the volume for.
- **Actual:** integrated loudness is dominated by whatever is loudest in the programme, which for most film and television is music and effects. Two programmes can report the same integrated loudness with their dialogue fifteen decibels apart. The absolute gate at -70 LUFS and the relative gate ten units down remove silence, which is a different problem.
- **Severity:** medium, and it is a conceptual trap rather than a bug. The number looks right and is the wrong number, which is the worst kind.
- **Workaround:** Amazon Transcribe locates the words, and the loudness is measured over those stretches and nowhere else. Merging matters: left alone a sentence becomes thirty regions with a gap at every word boundary, and the quiet ends of words fall into the gaps. Consonants live at those ends and consonants are most of what a person with hearing loss is missing.
- **Suggestion:** this is feedback for the loudness ecosystem rather than for one tool, but a dialogue-gated mode in `ebur128` would be widely useful. Broadcasters already care about this; ATSC A/85 is explicitly about anchor elements, which in practice means dialogue, and there is no easy way to measure it.

---

## Entry 5: the filter expression for a feature film is longer than a command line (2026-09-20)

- **Task:** measure loudness over a few thousand stretches of speech in a ninety-minute programme.
- **Steps:** built an `aselect` expression summing `between(t,a,b)` terms and passed it as `-af`.
- **Expected:** a long argument.
- **Actual:** hundreds of kilobytes, far past what a shell will carry, and the failure is not obviously about length.
- **Severity:** low once known.
- **Workaround:** `-filter_script:a` with the expression in a file, which is exactly what it is for.
- **Suggestion:** the `aselect` documentation's examples are all short. One line pointing at `-filter_script` for the generated-expression case would land it where people meet the problem.

---

## Entry 6: Amazon Transcribe's first run was genuinely good (2026-09-20, positive)

- **Task:** get word-level timings for a programme's audio.
- **Steps:** upload to S3, `StartTranscriptionJob`, poll, fetch the transcript.
- **Expected:** based on previous experience with speech APIs, a day of wrestling with audio format requirements.
- **Actual:** it accepted 16 kHz mono WAV without complaint, the job shape is obvious, the polling contract is clear, and the transcript carries `start_time` and `end_time` on every pronunciation with no extra flag to request them. The whole integration was under an hour including the S3 round trip.
- **Severity:** none. This is here because a friction log with no positive entries is a complaint list, and because the thing that made this easy is worth naming: timings are in the default response rather than behind an option. We never ask what the words are, only when they were, and the API did not make us pay for the part we did not want.

---

## Entry 7: Gradle 9 needs JVM 17 and takes whatever `java` is first on the path (2026-09-20)

- **Task:** build the Fire TV release APK on Windows.
- **Steps:** `gradlew assembleRelease`.
- **Expected:** a build, or a clear statement of what to install.
- **Actual:** "Gradle requires JVM 17 or later to run. Your build is currently configured to use JVM 8." The machine had JDK 17 and JDK 21 installed; `JAVA_HOME` was unset, so an old JRE on the path won. The message is clear once read, but it arrives after a daemon start, and nothing in the React Native TV setup documentation mentions setting `JAVA_HOME`.
- **Severity:** low, and annoying in proportion to how far into the build you are when it appears.
- **Workaround:** set `JAVA_HOME` explicitly before building, and write it down in the app's own README rather than leaving it in a shell history.
- **Suggestion:** the React Native for TV setup guide could name the JDK requirement and the environment variable together. It currently implies that installing Android Studio is sufficient, which it is unless something older is also installed.

---

## Entry 8: npm workspaces cannot say "install this, but do not hoist it" (2026-09-20)

- **Task:** keep the Fire TV app in the same repository as the shared packages.
- **Steps:** tried the app as a workspace.
- **Expected:** one install for the repository.
- **Actual:** Metro and Gradle both resolve from the app directory, and hoisting breaks both. Yarn 1 had `nohoist`; npm has no equivalent. The result is that every React Native monorepo ends up with a detached app directory and an install step nobody remembers.
- **Severity:** medium, because of what it leads to rather than what it is. A detached app is an app the root `npm test` does not run and the root `npm install` does not install, and the failure appears at the end of a long green run as "jest is not recognized", which reads like a missing global tool.
- **Workaround:** a `postinstall` that installs the app, and two assertions that the documented command still reaches its suite.
- **Suggestion:** a per-workspace `hoist: false`. Failing that, `npm ci` could warn when a root script references a directory it did not install.

---

## Entry 9: a health result written by a machine needs its wording tested, not reviewed (2026-09-20, ours not theirs)

- **Task:** make sure nothing this product says to somebody about their body can be read as a diagnosis.
- **Steps:** wrote a test that walks every sentence the interpretation layer can produce and fails on a condition name, a promise, or good news from a run that did not work.
- **Expected:** that to be the whole surface.
- **Actual:** it was not. The reasons a run is refused come from a different module and were never looked at, and two of them read "Hearing was better than this test can measure" and "Hearing was outside the range this test can measure". Both are statements about a listener, drawn from a run the procedure had just declared unusable. A run pins at the top because somebody could not hear it, or because they were pressing buttons without listening, and nothing in the code can tell those apart. It was found by taking a screenshot of the result screen, not by any test.
- **Severity:** high. This is the failure mode that matters most in a health-adjacent product, and the guard that was supposed to prevent it was pointed at the wrong half of the output.
- **Workaround:** the new check collects every refusal reason by causing it rather than by listing the strings, so a new one cannot be added without being seen.
- **Why it is in this log:** the lesson generalises past this project. A wording guard has to enumerate its inputs by construction, because the strings it does not know about are exactly the ones nobody reviewed.

---

## Entry 10: two guards in a row were born dead (2026-09-20, ours not theirs)

- **Task:** pin that the project never claims to be the first hearing test on a consumer device, and that every document it points at exists.
- **Steps:** wrote both checks as regular expressions over the tracked files.
- **Expected:** them to fail when the thing they guard against is introduced.
- **Actual:** neither ever matched anything. Tooling between the editor and the disk collapsed a doubled backslash, and the file that ended up on disk had word boundaries replaced by literal backspace characters. The tests passed, which is what an inert guard always does. The same corruption had previously eaten a documented build command in a sibling project, where it survived because people build from memory rather than from the page.
- **Severity:** high, and the shape is what makes it so. A test that checks nothing is worse than no test, because the absence of a test is visible and a green one is not.
- **Workaround:** every such check now counts its matches and fails if it found none, and a separate test walks all tracked files for control characters that only appear when an escape has been eaten.
- **Why it is in this log:** the second of the two was written in the file whose entire purpose is catching inert guards.

## Entry 11: bundling a CommonJS dependency into an ES module Lambda fails at cold start, and the message names neither the package nor the reason (2026-09-28)

- **Task:** deploy the MCP server as a Node 22 Lambda behind a function URL, bundled by CDK's `NodejsFunction` with `format: OutputFormat.ESM`.
- **Steps:** `cdk deploy`, then `curl` the function URL.
- **Expected:** the same server that had just answered nine spec checks on localhost.
- **Actual:** every request 502. The log says `Dynamic require of "node:crypto" is not supported`, with a stack that points at `/var/task/index.mjs` and nothing else. `@fastify/aws-lambda` is CommonJS and calls `require`, which has no meaning once esbuild has bundled it into an ES module.
- **Severity:** high, because of where it is discovered. The bundle builds, the stack deploys, CloudFormation reports success, and every in-process test passes. There is no signal anywhere until the first real request, and the message identifies neither the offending dependency nor the fact that the output format caused it.
- **Workaround:** an esbuild banner that reconstructs `require` from `createRequire`. One line, once you know.
- **Suggestion:** `NodejsFunction` knows it is being asked for ESM output. When a bundled dependency contains a `require` call that esbuild has turned into the dynamic-require shim, the construct could warn at synth time, or add the banner itself, which is what every project that hits this ends up doing by hand. Failing that, the CDK documentation for `OutputFormat.ESM` could name the problem: it is the single most likely thing to go wrong with that option and it cannot be caught before deployment.
- **Why it is in this log:** it is the fourth time this week that a server passed every test it had and was wrong in production, and the only thing that found any of them was speaking real HTTP to the deployed thing.

## Entry 12: a Fire TV app cannot see what the television is playing, which makes the most useful half of this product a platform feature (2026-09-28)

- **Task:** on Fire TV, observe how far past a programme's dialogue a household is choosing to listen. That means knowing two things at once: the volume, and what is playing so its dialogue loudness can be measured.
- **Steps:** looked for a way to read the active media session from a third-party app. `MediaSessionManager.getActiveSessions()`; `AudioManager` for stream volume; the Fire TV multimedia and audio-focus documentation.
- **Expected:** something read-only and permissioned, the way an app can read whether captions are enabled with `CaptioningManager`. The information is not sensitive in itself and the use is obviously in the customer's interest.
- **Actual:** `getActiveSessions()` requires `MEDIA_CONTENT_CONTROL`, which is signature-level and not available to third parties, or notification-listener access. The notification-access settings screen is not reliably reachable on Fire OS and `ACTION_NOTIFICATION_LISTENER_SETTINGS` may not resolve, so granting it in practice means ADB, which no shipped app can ask of a customer. `AudioManager.getStreamVolume` works and gives the volume, and the volume alone is not the signal: a viewer who turns up a quietly mixed film has not changed how loud the dialogue is at their ear, and reporting that as deterioration would accuse people on the strength of the sound design.
- **Severity:** high, and it is not a defect. It is a boundary, and the right one for most purposes. But it means the part of this product that no phone and no pair of earbuds can replicate can only be built by Amazon.
- **Workaround:** none that is honest. The app therefore contains no video player and records no sessions, and says so on its own home screen, because there is nothing it could truthfully record. The listening model is built and tested against recorded sessions; what it lacks is an input.
- **Suggestion, and this is the feature request this submission most wants read.** A read-only, permissioned signal of **dialogue-referenced listening level**: for the programme currently playing, the difference between its dialogue loudness and the level the customer has chosen. One number, no content, no metadata, no title, nothing about what anybody is watching. It is strictly less information than the media session API already exposes to a notification listener, and it is the difference between a hearing screen somebody has to go looking for and one that arrives because the television noticed. Failing that, dialogue loudness of the current stream alone would be enough, since volume is already readable.
- **Why it is in this log:** the product feedback here is not that something was hard. It is that the most valuable thing we could build, we could not build, and the reason is a platform decision rather than an oversight. Entry 1 is the same shape from the other end: Fire TV ships Dialogue Boost and will not let an app read or request it. Both are places where the device knows something about a customer's hearing and no app can act on it.

## Entry 13: the standard React Native storage module does not build against react-native-tvos, and React Native ships no alternative (2026-09-28)

- **Task:** keep a household's recorded sittings on the television between launches. The listening model needs months of history before it will say anything, so a store that forgets on restart is a product that can never reach its own threshold.
- **Steps:** `@react-native-async-storage/async-storage`, which is the answer everywhere this question is asked. Built with `assembleRelease` against react-native-tvos 0.83 with the new architecture enabled, on JDK 17 and then JDK 21.
- **Expected:** a key-value store. This is the most ordinary requirement an application can have.
- **Actual:** `:react-native-async-storage_async-storage:kspReleaseKotlin` fails. Under JDK 17 the message is "JVM is incompatible"; under JDK 21 the real one appears, `e: Wrong plugin option format: null, should be plugin:<pluginId>:<optionName>=<value>`, which is an incompatibility inside that package's own KSP configuration rather than anything configurable from the app. Version 3.1.1 is what npm resolves; pinning back to 2.x fails to install against the react-native-tvos peer range.
- **Severity:** high, and it is the platform rather than the package. React Native has shipped no storage of its own since AsyncStorage was extracted in 2019, so every application needs a community native module for its most basic persistent need, and on the TV fork that module does not build.
- **Workaround:** none that is honest. The store keeps sittings for the life of the process, the interface and all of its logic are the parts that will still be right when a module works, and the app says on its home screen that it forgets, rather than appearing to work. Swapping two method bodies is the whole change when one is available.
- **Suggestion:** the react-native-tvos template would be substantially more useful with one verified storage option, tested in CI against each release, the way the template already verifies the video and safe-area packages by including them. Failing that, a compatibility table would turn a day of build archaeology into a lookup.
- **Why it is in this log:** this is the third native module this app has tried and the second that would not build, after react-native-safe-area-context failed codegen. A TV app that cannot save anything is a narrow kind of app, and the constraint is not obvious from anywhere in the documentation.

<!-- Add new entries above this line as they happen. -->
