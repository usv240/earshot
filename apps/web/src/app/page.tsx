import * as fs from "node:fs";
import * as path from "node:path";
import { Evidence } from "../components/Evidence";
import { HearingTest } from "../components/HearingTest";
import type { DigitManifest } from "../lib/audio";

/**
 * The page.
 *
 * It leads with the sentence the whole project turns on, and the test is
 * above everything except that sentence. A visitor who reads nothing
 * should still be able to take it, and a visitor who takes it has learned
 * something no amount of copy would have told them.
 *
 * The manifest is read at build time rather than fetched, so the page
 * knows before it renders whether the audio is the real material or the
 * placeholder, and the warning cannot appear a second late.
 */

function readManifest(): DigitManifest {
  const file = path.join(process.cwd(), "public/audio/digits.json");
  return JSON.parse(fs.readFileSync(file, "utf8")) as DigitManifest;
}

export default function Home() {
  const manifest = readManifest();

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-[900px] items-center justify-between px-5 pt-8">
        <p className="text-xl font-semibold tracking-tight">Earshot</p>
        <nav aria-label="Sections" className="flex gap-5 text-sm text-muted">
          <a href="#test" className="font-medium text-[var(--primary)] hover:underline">
            Take the check
          </a>
          <a href="#how" className="hover:text-ink">How</a>
          <a href="#evidence" className="hover:text-ink">Evidence</a>
          <a href="#privacy" className="hover:text-ink">Privacy</a>
        </nav>
      </header>

      <main className="mx-auto max-w-[900px] px-5 pb-24">
        <section className="pt-12">
          <h1 className="max-w-[18ch] text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
            You passed the hearing test and you still can&apos;t hear the television.
          </h1>
          <p className="mt-6 max-w-[62ch] text-lg leading-relaxed text-muted">
            The hearing test on your phone plays tones in a quiet room. The
            thing you actually struggle with is speech with other sound
            behind it, and those are not the same measurement. People with
            perfectly ordinary results on the first one routinely cannot
            follow dialogue, which is common enough to have a name.
          </p>
          <p className="mt-4 max-w-[62ch] text-lg leading-relaxed text-muted">
            Earshot measures the other one, on the device where you noticed
            the problem.
          </p>

          {/*
            Three numbers rather than a chart, because three numbers are
            not a shape. They are the whole case for why this is worth
            catching at all, and they were four paragraphs down in prose
            where a reader skimming the page would never reach them.
          */}
          <dl className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              {
                figure: "80%",
                label: "of people with hearing loss do not know they have it",
              },
              {
                figure: "7 years",
                label: "the wait between noticing and asking anybody",
              },
              {
                figure: "No. 1",
                label:
                  "modifiable risk factor for dementia from midlife, tied with cholesterol (Lancet, 2024)",
              },
            ].map((stat) => (
              <div
                key={stat.figure}
                className="min-w-0 rounded-2xl border border-line bg-surface p-5"
              >
                <dt className="text-3xl font-semibold tracking-tight text-ink">
                  {stat.figure}
                </dt>
                <dd className="mt-2 text-sm leading-relaxed text-muted">
                  {stat.label}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="test" className="mt-12 scroll-mt-8">
          <HearingTest manifest={manifest} />
        </section>

        <section id="how" className="mt-20 scroll-mt-8">
          <h2 className="text-2xl font-semibold tracking-tight">How it works on a television</h2>
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            <div className="min-w-0 rounded-2xl border border-line bg-surface p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--primary)]">
                It would notice
              </p>
              <p className="mt-3 leading-relaxed text-muted">
                Comparing how loud a programme&apos;s dialogue actually is
                against the volume you chose for it. Not whether you turned it
                up, but how far past the programme you are listening.
              </p>
              <p className="mt-3 leading-relaxed text-muted">
                <span className="font-semibold text-ink">
                  No app on Fire TV can do this, including ours.
                </span>{" "}
                Reading what another app is playing needs a permission Amazon
                does not grant to third parties. System volume is readable;
                what is playing is not. The model is built and tested, and it
                is waiting on an API only the platform can provide.
              </p>
            </div>
            <div className="min-w-0 rounded-2xl border border-line bg-surface p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--primary)]">
                It asks, rarely
              </p>
              <p className="mt-3 leading-relaxed text-muted">
                Only after months, never mid-programme, never twice in a
                season, and if you say no twice it never asks again. A health
                prompt that keeps coming back is a thing people learn to
                dread.
              </p>
            </div>
            <div className="min-w-0 rounded-2xl border border-line bg-surface p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--primary)]">
                It helps either way
              </p>
              <p className="mt-3 leading-relaxed text-muted">
                Fire TV already ships Dialogue Boost, hearing-aid pairing and
                direct streaming to cochlear implants. All of it is for people
                who already know. Earshot turns the first one on and gives you
                one page to take to a doctor.
              </p>
            </div>
          </div>
        </section>

        <section id="evidence" className="mt-20 scroll-mt-8">
          <h2 className="text-2xl font-semibold tracking-tight">Why a television</h2>
          <p className="mt-5 max-w-[68ch] leading-relaxed text-muted">
            Because it already has the evidence. A paper in the Journal of
            Laryngology and Otology validated television volume as a clinical
            marker: someone who turns the set up has a{" "}
            <span className="font-semibold text-ink">68 percent chance</span> of
            already having hearing loss of 25 dB or more, at 81 percent
            sensitivity. For news programmes, where the content is nearly all
            speech, the average loss among those viewers was 41 dB. The authors
            recommend it where audiometry is unavailable.
          </p>
          <p className="mt-4 max-w-[68ch] leading-relaxed text-muted">
            They collected it by asking patients in a clinic. The television
            knows the real number every night and has never been asked.
          </p>
          <p className="mt-4 max-w-[68ch] leading-relaxed text-muted">
            Why it is worth catching: about 80 percent of people with hearing
            loss do not know, those who notice wait roughly seven years before
            asking anyone, and the 2024 Lancet standing Commission puts hearing
            loss level with high cholesterol as the largest modifiable risk
            factor for dementia from midlife.
          </p>

          <div className="mt-10">
            <h3 className="text-xl font-semibold tracking-tight text-ink">
              What we measured, what we read, and what nobody has done yet
            </h3>
            <p className="mt-3 max-w-[70ch] leading-relaxed text-muted">
              Written for somebody who came here to find the weak point. The
              three are kept apart on purpose, because a project that calls
              everything measured either is not one or has not looked.
            </p>
            <div className="mt-6">
              <Evidence />
            </div>
          </div>

        </section>

        <section id="privacy" className="mt-20 scroll-mt-8">
          <h2 className="text-2xl font-semibold tracking-tight">What it does not do</h2>
          <ul className="mt-5 max-w-[68ch] space-y-3 leading-relaxed text-muted">
            <li>
              <span className="font-semibold text-ink">There is no microphone.</span>{" "}
              Not in the television app, not on this page, not anywhere in the
              project. The only audio that goes to a server is a film&apos;s own
              soundtrack, sent to locate the dialogue so its loudness can be
              measured.
            </li>
            <li>
              <span className="font-semibold text-ink">There is no camera.</span>
            </li>
            <li>
              <span className="font-semibold text-ink">
                Nothing here is a diagnosis.
              </span>{" "}
              A screen can say something is worth getting checked. It cannot say
              what is wrong, how bad it is, or whether anything can be done, and
              the wording is tested so it never tries.
            </li>
            <li>
              <span className="font-semibold text-ink">
                It never estimates your hearing from how you watch.
              </span>{" "}
              Volume is a reason to ask a question. The answer is the test.
            </li>
          </ul>
        </section>

        <footer className="mt-20 border-t border-line pt-8 text-sm leading-relaxed text-muted">
          <p>
            Open source, MIT.{" "}
            <a
              className="text-[var(--primary)] underline underline-offset-2"
              href="https://github.com/usv240/earshot"
            >
              The repository
            </a>{" "}
            carries the evidence, the prior art audit, and every number on this
            page as a test.
          </p>
          <p className="mt-3">
            Audio: {manifest.voice}. Digits levelled to within{" "}
            {manifest.levelling.spreadAfterDb} dB of each other; masking noise
            matched to their spectrum to {manifest.noiseMatch.meanDb} dB mean
            across {manifest.noiseMatch.band}.
          </p>
        </footer>
      </main>
    </div>
  );
}
