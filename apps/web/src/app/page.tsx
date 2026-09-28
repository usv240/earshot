import * as fs from "node:fs";
import * as path from "node:path";
import { Evidence } from "../components/Evidence";
import { HearingTest } from "../components/HearingTest";
import { ThemeToggle } from "../components/ThemeToggle";
import type { DigitManifest } from "../lib/audio";

/**
 * The page.
 *
 * One argument, made once, and the check right beside it. A visitor who
 * reads nothing should still land on the button; a visitor who takes it
 * learns something no paragraph could tell them.
 *
 * The rhythm is deliberate: a serif line for the claim, a sans body for
 * the reasoning, a card for the one thing that can be done, and rules
 * between sections rather than boxes around every paragraph. Every
 * figure that appears here is read at build time from the same files
 * the tests read, so the page cannot drift from the evidence.
 */

function readManifest(): DigitManifest {
  const file = path.join(process.cwd(), "public/audio/digits.json");
  return JSON.parse(fs.readFileSync(file, "utf8")) as DigitManifest;
}

const STATS = [
  { figure: "80%", label: "of people with hearing loss do not know they have it" },
  { figure: "7 years", label: "the wait between noticing and asking anybody" },
  {
    figure: "No. 1",
    label: "modifiable risk factor for dementia from midlife, tied with cholesterol (Lancet, 2024)",
  },
];

export default function Home() {
  const manifest = readManifest();

  return (
    <div className="min-h-screen">
      <a href="#test" className="skip-link">
        Skip to the check
      </a>

      <header className="mx-auto flex max-w-[1120px] items-center justify-between px-5 pt-6 sm:px-8">
        <a href="#top" className="display-sm text-2xl text-ink">
          Earshot
        </a>
        <nav aria-label="Sections" className="flex items-center gap-1 sm:gap-2">
          <a href="#how" className="ghost hidden px-3 py-2 text-sm text-muted hover:text-ink sm:inline">
            How it works
          </a>
          <a href="#evidence" className="ghost hidden px-3 py-2 text-sm text-muted hover:text-ink sm:inline">
            Evidence
          </a>
          <a href="#privacy" className="ghost hidden px-3 py-2 text-sm text-muted hover:text-ink sm:inline">
            Privacy
          </a>
          <ThemeToggle />
          <a
            href="#test"
            className="ml-2 rounded-[0.85rem] bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-ink)] transition-transform hover:-translate-y-px"
          >
            Take the check
          </a>
        </nav>
      </header>

      <main id="top" className="mx-auto max-w-[1120px] px-5 pb-28 sm:px-8">
        {/* Hero: the claim on the left, the check on the right, above the fold on a laptop. */}
        <section className="grid items-start gap-10 pt-14 lg:grid-cols-[1.1fr_1fr] lg:gap-14 lg:pt-20">
          <div>
            <p className="eyebrow">A hearing check for the living room</p>
            <h1 className="display mt-4 max-w-[16ch] text-[2.6rem] text-ink sm:text-[3.4rem] lg:text-[3.8rem]">
              You passed the hearing test and you still can&apos;t hear the television.
            </h1>
            <p className="mt-7 max-w-[56ch] text-lg leading-relaxed text-muted">
              The test on your phone plays tones in a quiet room. What you actually struggle
              with is speech with other sound behind it, and those are not the same
              measurement. People with ordinary results on the first one routinely cannot
              follow dialogue.
            </p>
            <p className="mt-4 max-w-[56ch] text-lg leading-relaxed text-muted">
              Earshot measures the other one, on the device where you noticed the problem.
            </p>

            <dl className="mt-10 grid gap-3 sm:grid-cols-3">
              {STATS.map((stat) => (
                <div key={stat.figure} className="min-w-0 border-l-2 border-[var(--accent)] pl-4">
                  <dt className="display-sm text-[1.9rem] text-ink">{stat.figure}</dt>
                  <dd className="mt-1 text-sm leading-snug text-muted">{stat.label}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div id="test" className="scroll-mt-24">
            <HearingTest manifest={manifest} />
          </div>
        </section>

        <div className="rule my-20" />

        {/* How it works: three columns, no boxes, one rule above. */}
        <section id="how" className="scroll-mt-24">
          <p className="eyebrow">How it works on a television</p>
          <h2 className="display-sm mt-3 max-w-[22ch] text-3xl text-ink sm:text-4xl">
            Notice, ask rarely, and help either way.
          </h2>
          <div className="mt-10 grid gap-10 md:grid-cols-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">It would notice</p>
              <p className="mt-3 leading-relaxed text-muted">
                Comparing how loud a programme&apos;s dialogue actually is against the volume you
                chose for it. Not whether you turned it up, but how far past the programme you
                are listening.
              </p>
              <p className="mt-3 leading-relaxed text-muted">
                <span className="font-semibold text-ink">
                  No app on Fire TV can do this for other apps, including ours.
                </span>{" "}
                Reading what another app is playing needs a permission Amazon does not grant to
                third parties. So Earshot measures the programmes it plays itself, and the model
                is built, tested, and waiting on an API only the platform can provide.
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">It asks, rarely</p>
              <p className="mt-3 leading-relaxed text-muted">
                Only after months, never mid-programme, never twice in a season, and if you say
                no twice it never asks again. A health prompt that keeps coming back is a thing
                people learn to dread.
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">It helps either way</p>
              <p className="mt-3 leading-relaxed text-muted">
                Fire TV already ships Dialogue Boost, hearing-aid pairing and direct streaming
                to cochlear implants. All of it is for people who already know. Earshot points
                at the first one and gives you one page to take to a doctor.
              </p>
            </div>
          </div>
        </section>

        <div className="rule my-20" />

        {/* Why a television: the paper, in a pull-quote treatment. */}
        <section id="why" className="scroll-mt-24">
          <p className="eyebrow">Why a television</p>
          <h2 className="display-sm mt-3 max-w-[22ch] text-3xl text-ink sm:text-4xl">
            Because it already has the evidence.
          </h2>
          <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_1.2fr]">
            <blockquote className="card p-7">
              <p className="display-sm text-2xl leading-snug text-ink">
                Someone who turns the set up has a 68 percent chance of already having hearing
                loss of 25 dB or more.
              </p>
              <footer className="mt-5 text-sm text-muted">
                Journal of Laryngology and Otology, validating television volume as a clinical
                marker. 81 percent sensitivity. The authors recommend it where audiometry is
                unavailable.
              </footer>
            </blockquote>
            <div>
              <p className="leading-relaxed text-muted">
                For news programmes, where the content is nearly all speech, the average loss
                among those viewers was 41 dB. They collected it by asking patients in a clinic.
                The television knows the real number every night and has never been asked.
              </p>
              <p className="mt-4 leading-relaxed text-muted">
                Why it is worth catching: about 80 percent of people with hearing loss do not
                know, those who notice wait roughly seven years before asking anyone, and the
                2024 Lancet standing Commission puts hearing loss level with high cholesterol
                as the largest modifiable risk factor for dementia from midlife.
              </p>
            </div>
          </div>
        </section>

        <div className="rule my-20" />

        {/* Evidence: what we measured, what we read, what nobody has done yet. */}
        <section id="evidence" className="scroll-mt-24">
          <p className="eyebrow">Evidence</p>
          <h2 className="display-sm mt-3 max-w-[24ch] text-3xl text-ink sm:text-4xl">
            What we measured, what we read, and what nobody has done yet.
          </h2>
          <p className="mt-4 max-w-[70ch] leading-relaxed text-muted">
            Written for somebody who came here to find the weak point. The three are kept apart
            on purpose, because a project that calls everything measured either is not one or
            has not looked.
          </p>
          <div className="mt-10">
            <Evidence />
          </div>
        </section>

        <div className="rule my-20" />

        {/* Privacy: four plain statements. */}
        <section id="privacy" className="scroll-mt-24">
          <p className="eyebrow">Privacy</p>
          <h2 className="display-sm mt-3 max-w-[22ch] text-3xl text-ink sm:text-4xl">
            What it does not do.
          </h2>
          <ul className="mt-10 grid gap-6 md:grid-cols-2">
            {[
              [
                "There is no microphone.",
                "Not in the television app, not on this page, not anywhere in the project. The only audio that goes to a server is a film's own soundtrack, sent to locate the dialogue so its loudness can be measured.",
              ],
              ["There is no camera.", "Nothing watches the room."],
              [
                "Nothing here is a diagnosis.",
                "A screen can say something is worth getting checked. It cannot say what is wrong, how bad it is, or whether anything can be done, and the wording is tested so it never tries.",
              ],
              [
                "It never estimates your hearing from how you watch.",
                "Volume is a reason to ask a question. The answer is the check.",
              ],
            ].map(([head, body]) => (
              <li key={head} className="min-w-0 border-t border-line pt-5">
                <p className="font-semibold text-ink">{head}</p>
                <p className="mt-2 leading-relaxed text-muted">{body}</p>
              </li>
            ))}
          </ul>
        </section>

        <footer className="mt-24 border-t border-line pt-8 text-sm leading-relaxed text-muted">
          <p>
            Open source, MIT.{" "}
            <a
              className="text-[var(--accent)] underline underline-offset-4"
              href="https://github.com/usv240/earshot"
            >
              The repository
            </a>{" "}
            carries the evidence, the prior art audit, and every number on this page as a test.
          </p>
          <p className="mt-3 text-faint">
            Audio: {manifest.voice}. Digits levelled to within {manifest.levelling.spreadAfterDb}{" "}
            dB of each other; masking noise matched to their spectrum to{" "}
            {manifest.noiseMatch.meanDb} dB mean across {manifest.noiseMatch.band}.
          </p>
        </footer>
      </main>
    </div>
  );
}
