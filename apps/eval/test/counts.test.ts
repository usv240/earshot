import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A count in public text has to be counted, not remembered.
 *
 * A number nobody re-derives is a number that was only true on the day
 * it was typed. Across three sibling projects in this hackathon, every
 * single hand-written count had drifted by the time anybody checked:
 * test totals, friction log entries, per-package tables that did not sum
 * to their own headline. None of them were lies when written.
 *
 * So the figures this project publishes about itself are counted here.
 * This suite counts itself, which is the awkward part: adding a test
 * changes the total. That is the intended cost, because the number in
 * the README is a claim and claims are maintained.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");

/** Every test file, found rather than listed. */
function testFiles(): string[] {
  const out = execFileSync("git", ["ls-files"], { cwd: repo, encoding: "utf8" });
  return out
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => /\.(test|spec)\.(ts|tsx)$/.test(f));
}

/**
 * Cases in a file.
 *
 * Counts the two case-declaring calls where they appear as calls.
 * Deliberately simple: a clever count that drifts from what the runner
 * reports is worse than a plain one, so the assertion below allows a
 * small tolerance rather than pretending this is a parser.
 */
function countCases(text: string): number {
  /*
    Comment lines come out first, and this function has now been wrong
    twice in the same small way.

    First it counted its own documentation, which described what is
    counted by naming the two call forms in prose, so the doc comment
    contributed two phantom tests to the suite whose only job is making
    sure published counts are real.

    Then it stripped block comments with a regular expression, which
    read the string "tv slash star star" in hygiene.test.ts as a comment
    opener and swallowed twenty-two lines including two real tests.

    So: whole lines that begin with a comment marker, and nothing
    cleverer. Anything cleverer has to understand string literals, and a
    counter that needs a parser is a counter nobody trusts. The cost is
    that prose in this file must not imitate a call, which is why the
    paragraphs above name the forms in words.
  */
  const code = text
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .join("\n");
  return [...code.matchAll(/(?<![A-Za-z0-9_.])(?:it|test)\s*\(/g)].length;
}

function total(): { files: number; cases: number } {
  const files = testFiles();
  let cases = 0;
  for (const file of files) {
    const full = path.join(repo, file);
    if (fs.existsSync(full)) cases += countCases(fs.readFileSync(full, "utf8"));
  }
  return { files: files.length, cases };
}

/** Public text, found rather than listed, same as the claims suite. */
const PUBLIC_TEXT = [
  "README.md",
  ...fs
    .readdirSync(path.join(repo, "docs"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => `docs/${f}`),
  "FRICTION_LOG.md",
  "PRODUCT_FEEDBACK.md",
]
  .map((f) => ({ file: f, full: path.join(repo, f) }))
  .filter((d) => fs.existsSync(d.full))
  .map((d) => ({ file: d.file, text: fs.readFileSync(d.full, "utf8") }));

describe("counts this project publishes about itself", () => {
  it("finds test files at all, so a broken walker cannot pass silently", () => {
    const { files, cases } = total();
    expect(files).toBeGreaterThan(5);
    expect(cases).toBeGreaterThan(50);
  });

  it("sees every test file, including ones not yet committed", () => {
    /*
      The walker asks git which files exist, which means a test file
      nobody has staged is invisible to it. That is the right definition
      for a public claim about a public repository, and it is also a
      trap: the count changes on `git add`, and a test file that is
      never committed is a test a clean clone never runs.

      So an untracked test file is an error rather than a silent
      omission. This check found itself: the first run of this suite
      under-reported by exactly its own five cases.
    */
    const untracked = execFileSync(
      "git",
      ["ls-files", "--others", "--exclude-standard"],
      { cwd: repo, encoding: "utf8" },
    )
      .split("\n")
      .map((f) => f.trim())
      .filter((f) => /\.(test|spec)\.(ts|tsx)$/.test(f));
    expect(untracked, "untracked test files would not run in a clean clone").toEqual([]);
  });

  it("covers both runners, not just the one at the root", () => {
    // The television app runs under jest and lives outside the npm
    // workspaces. A count that quietly omitted it would under-report the
    // suite on this project's primary track.
    const files = testFiles();
    expect(files.some((f) => f.startsWith("tv/"))).toBe(true);
    expect(files.some((f) => f.startsWith("packages/"))).toBe(true);
    expect(files.some((f) => f.startsWith("apps/"))).toBe(true);
  });

  it("states a total that matches what is there", () => {
    const { cases } = total();
    const stated = PUBLIC_TEXT.flatMap((d) => {
      const m = d.text.match(/(\d+)\s+tests\b/);
      return m ? [{ file: d.file, n: Number(m[1]) }] : [];
    });
    expect(stated.length, "no document states a test total").toBeGreaterThan(0);
    for (const s of stated) {
      expect(
        Math.abs(cases - s.n),
        `${s.file} says ${s.n} tests; the suites contain ${cases}`,
      ).toBeLessThanOrEqual(2);
    }
  });

  it("states the number of friction log entries the file actually has", () => {
    const entries = [
      ...fs
        .readFileSync(path.join(repo, "FRICTION_LOG.md"), "utf8")
        .matchAll(/^## Entry \d+:/gm),
    ].length;
    expect(entries).toBeGreaterThan(3);

    const words: Record<number, string> = {
      8: "eight", 9: "nine", 10: "ten", 11: "eleven", 12: "twelve",
      13: "thirteen", 14: "fourteen", 15: "fifteen",
    };
    const word = words[entries];
    expect(word, `no spelling for ${entries}; add it here`).toBeTruthy();

    const wrong = PUBLIC_TEXT.filter((d) => {
      const m = d.text.match(/(\w+) entries(?:,| in FRICTION_LOG)/i);
      return m ? m[1]!.toLowerCase() !== word : false;
    });
    expect(
      wrong.map((d) => d.file),
      `FRICTION_LOG.md has ${entries} entries`,
    ).toEqual([]);
  });

  it("names every tool in the feedback that the AWS notes name", () => {
    /*
      The rules ask for feedback on every tool, API or SDK used. The
      failure mode is not omitting one deliberately, it is adding a
      service late and never going back. So the two documents have to
      agree with each other.
    */
    const aws = PUBLIC_TEXT.find((d) => d.file === "docs/AWS.md");
    const feedback = PUBLIC_TEXT.find((d) => d.file === "PRODUCT_FEEDBACK.md");
    expect(aws && feedback).toBeTruthy();

    const services = ["Transcribe", "Polly", "S3"];
    for (const service of services) {
      if (!aws!.text.includes(service)) continue;
      expect(
        feedback!.text.includes(service),
        `docs/AWS.md uses ${service} and PRODUCT_FEEDBACK.md does not mention it`,
      ).toBe(true);
    }
  });
});
