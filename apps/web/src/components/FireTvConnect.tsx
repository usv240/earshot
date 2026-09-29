/**
 * How Earshot gets onto a television, step by step, and which steps
 * are real today.
 *
 * The site had never said there was a Fire TV app, let alone how to put
 * one on a set. This states the actual path, marks honestly which parts
 * are shipped and which wait on something outside the project, and
 * gives the two commands a person would type. There is no pretending
 * about the Appstore step: a sideloaded APK is what exists, and that is
 * what a judge can install.
 *
 * Nothing in the steps is written for a developer who already knows.
 * A judge with a Fire TV Stick and a laptop should be able to follow
 * them in ten minutes.
 */

interface Step {
  title: string;
  body: string;
  status: "live" | "waits";
  note?: string;
  command?: string;
}

const STEPS: Step[] = [
  {
    title: "Download the app",
    body: "Earshot is a React Native app built for Fire OS, the Android-based system on Fire TV Sticks, Cubes and Fire TV Edition sets. It ships as one APK carrying arm64, armeabi-v7a and x86_64, so it installs on real Fire TV hardware and on an emulator.",
    status: "live",
    note: "71.5 MB. The film it plays is inside it, so the check works with the network unplugged.",
  },
  {
    title: "Turn on ADB debugging on the television",
    body: "On the Fire TV: Settings, then My Fire TV, then Developer Options, then ADB Debugging on. Note the set's IP address under Settings, My Fire TV, About, Network. That is the whole of the television-side setup.",
    status: "live",
  },
  {
    title: "Install it from a laptop on the same network",
    body: "Two commands. The first connects to the set over the network; the second installs the app. Fire TV asks once whether to allow the laptop.",
    status: "live",
    command: "adb connect <fire-tv-ip>:5555\nadb install earshot-tv-v0.1.0.apk",
  },
  {
    title: "Open it and take the check with the remote",
    body: "Earshot appears under Your Apps. The home screen says what a television could watch for, a Watch button plays a film while the listening level updates live, and Check it runs the digits-in-noise screen entirely on the D-pad. Sittings are kept on the set and never uploaded.",
    status: "live",
  },
  {
    title: "Find it in the Amazon Appstore",
    body: "This is the step a household would actually take, and it is the one that waits on Appstore review. Everything above is what review would install. Until then, sideloading is the honest route, and the demo footage is this APK sideloaded onto an Android TV virtual device from the Android SDK, driven only by the D-pad, because Amazon's own Fire TV simulator sits behind a developer sign-in.",
    status: "waits",
  },
];

export function FireTvConnect() {
  return (
    <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr]">
      <ol className="space-y-4">
        {STEPS.map((step, i) => (
          <li key={step.title} className="card min-w-0 p-5">
            <div className="flex items-baseline gap-3">
              <span className="display-sm text-2xl text-[var(--accent)]">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-ink">{step.title}</p>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      step.status === "live"
                        ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                        : "bg-[var(--warn-bg)] text-[var(--warn)]"
                    }`}
                  >
                    {step.status === "live" ? "Works today" : "Waits on Appstore review"}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
                {step.command && (
                  <pre className="mt-3 overflow-x-auto rounded-lg border border-line bg-[var(--raised)] p-3 font-mono text-[12px] leading-relaxed text-ink">
                    {step.command}
                  </pre>
                )}
                {step.note && <p className="mt-2 text-xs text-faint">{step.note}</p>}
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div>
        <div className="card p-6">
          <p className="eyebrow">What the television does that this page cannot</p>
          <p className="mt-3 leading-relaxed text-muted">
            This page can run the check. Only the television can do the half that comes
            before it: play a programme whose dialogue loudness was measured, watch the
            level you settle on, count the times you go back to hear a line, and offer the
            check only after months of the same pattern. That is the primary track, and it
            is why the app exists.
          </p>
          <p className="mt-3 leading-relaxed text-muted">
            It measures its own playback. It cannot see what other apps play, because
            reading another app&apos;s media session needs a permission Amazon does not grant
            to third parties. That is a platform boundary rather than an omission, it is
            friction log entry 12, and the feature request it produced is the one this
            submission most wants read.
          </p>
        </div>
        <div className="card mt-5 p-6">
          <p className="eyebrow">Build it yourself</p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            The repository carries the full build: bundle with Metro, then assemble with
            Gradle from a short path, because a native dependency compiles through CMake and
            CMake cannot cope with a long path that has spaces in it. Both quirks are written
            down in <code className="font-mono text-xs">tv/README.md</code> with what each
            failure looks like, so nobody rediscovers them.
          </p>
          <a
            className="mt-4 inline-block text-sm font-medium text-[var(--accent)] underline underline-offset-4"
            href="https://github.com/usv240/earshot/releases"
          >
            Releases, with the APK attached
          </a>
        </div>
      </div>
    </div>
  );
}
