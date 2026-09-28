import * as fs from "node:fs";
import * as path from "node:path";

/**
 * What we measured, what we read, and what nobody has done yet.
 *
 * This is the section a sceptical reader goes looking for, so it is
 * written to be read by one. Every figure is read out of the committed
 * validation run at build time rather than typed here, which means this
 * component cannot drift from the file that produced the numbers, and
 * the honest part is stated in the same voice and the same size as the
 * flattering part.
 *
 * The three tiers matter more than any single number. A project that
 * says "measured" for everything is either lying or has not looked
 * hard enough at what it actually knows, and a judge who has read a few
 * of these can tell in a paragraph.
 */

interface Validation {
  headline: { runs: number; biasDb: number; sdDb: number; worstDb: number };
  cutPointDb: number;
  referralCurve: {
    trueSrtDb: number;
    relativeToCutDb: number;
    referredPercent: number;
    runs: number;
  }[];
  comparison: { publishedTestRetestSdDb: number[] };
}

function readValidation(): Validation {
  const file = path.join(process.cwd(), "../../apps/eval/results/validation.json");
  return JSON.parse(fs.readFileSync(file, "utf8")) as Validation;
}

export function Evidence() {
  const v = readValidation();
  const [bestPublished, worstPublished] = v.comparison.publishedTestRetestSdDb as [
    number,
    number,
  ];

  return (
    <div className="space-y-10">
      <div className="grid gap-5 md:grid-cols-3">
        <div className="min-w-0 rounded-2xl border border-line bg-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--primary)]">
            Measured here
          </p>
          <p className="mt-3 leading-relaxed text-muted">
            The procedure run against simulated listeners whose thresholds we
            chose in advance. Over {v.headline.runs.toLocaleString()} runs it
            reads a known threshold with a bias of{" "}
            <span className="font-semibold text-ink">{v.headline.biasDb} dB</span>{" "}
            and a{" "}
            <span className="font-semibold text-ink">{v.headline.sdDb} dB</span>{" "}
            test-retest spread. Reproduce with <code>npm run validate</code>.
          </p>
        </div>

        <div className="min-w-0 rounded-2xl border border-line bg-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--primary)]">
            Read from the literature
          </p>
          <p className="mt-3 leading-relaxed text-muted">
            The paradigm, the procedure parameters, the reliability figures and
            the cut-points. Published test-retest for this test is{" "}
            {bestPublished} to {worstPublished} dB, so the number above is the
            implementation behaving like the description rather than a result
            about anybody&apos;s ears.
          </p>
        </div>

        <div className="min-w-0 rounded-2xl border border-[var(--warn)] bg-surface p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--warn)]">
            Nobody has done yet
          </p>
          <p className="mt-3 leading-relaxed text-muted">
            No person has taken this test. Whether the instructions land,
            whether the volume step works in a real room, whether anybody gives
            up at trial nine: none of that is known, no paper covers it, and it
            is about this interface rather than the method.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <h3 className="text-lg font-semibold text-ink">
          What the cut-off does to a person
        </h3>
        <p className="mt-3 max-w-[70ch] leading-relaxed text-muted">
          Sensitivity and specificity need a population, and inventing a
          plausible spread of thresholds would be making up the very thing the
          numbers are supposed to come from. So this is the other question,
          which needs no such assumption: if somebody really is this hard of
          hearing, how often does the screen say so.
        </p>

        {/*
          A bar table rather than a plot. One series, nine ordered rows, and
          the value on every row, so the chart and the table view are the
          same object and identity is never carried by colour alone. Bars
          are drawn with a token validated against both surfaces rather
          than reusing the link colour, which fails the lightness band on
          the dark surface.
        */}
        <table className="mt-6 w-full border-collapse text-sm">
          <caption className="sr-only">
            Percentage of runs referred, by the listener&apos;s true speech
            reception threshold, at a cut-off of {v.cutPointDb} dB.
          </caption>
          <thead>
            <tr className="text-left text-muted">
              <th scope="col" className="pb-2 font-medium">
                True threshold
              </th>
              <th scope="col" className="pb-2 font-medium">
                Against the cut-off
              </th>
              <th scope="col" className="pb-2 font-medium">
                Referred
              </th>
            </tr>
          </thead>
          <tbody>
            {v.referralCurve.map((row) => (
              <tr key={row.trueSrtDb} className="border-t border-line">
                <td className="py-2 font-mono tabular-nums text-ink">
                  {row.trueSrtDb.toFixed(1)} dB
                </td>
                <td className="py-2 text-muted">
                  {row.relativeToCutDb === 0
                    ? "on the line"
                    : `${Math.abs(row.relativeToCutDb).toFixed(1)} dB ${
                        row.relativeToCutDb < 0 ? "better" : "worse"
                      }`}
                </td>
                <td className="py-2">
                  <span
                    className="flex items-center gap-3"
                    title={`${row.referredPercent}% of ${row.runs} usable runs`}
                  >
                    <span className="ew-track">
                      {/*
                        Zero gets no mark at all. The minimum width
                        exists so two tenths of a percent is still
                        visible, and applying it to zero as well made
                        "never" and "almost never" look identical, which
                        are different claims about a screening tool.
                      */}
                      {row.referredPercent > 0 && (
                        <span
                          className="ew-bar"
                          style={{ width: `${row.referredPercent}%` }}
                        />
                      )}
                    </span>
                    <span className="w-14 shrink-0 text-right font-mono tabular-nums text-ink">
                      {row.referredPercent.toFixed(1)}%
                    </span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-6 max-w-[70ch] leading-relaxed text-muted">
          The top of that table is the row that decides whether this belongs in
          a living room. Somebody comfortably inside the normal range is
          referred about twice in a thousand. A screen that bothers healthy
          people teaches them to ignore it, and the person who learns to ignore
          it is the person it exists for.
        </p>
        <p className="mt-3 max-w-[70ch] leading-relaxed text-muted">
          Around the line itself it is close to a coin toss, and it has to be. A
          threshold measured with {v.headline.sdDb} dB of noise cannot resolve a
          line drawn a fraction of a decibel away. That is why there is a
          borderline band that says to try again in a week rather than offering
          a verdict.
        </p>
      </div>
    </div>
  );
}
