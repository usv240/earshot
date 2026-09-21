import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Escape sequences that got eaten on the way into a file.
 *
 * Tooling between an editor and the disk sometimes collapses a doubled
 * backslash, and whatever wrote the file then interprets what is left.
 * A word boundary in a regular expression becomes a backspace
 * character. A Windows path like the one in a build instruction becomes
 * a tab followed by a bell.
 *
 * The result is the worst kind of defect, because nothing is obviously
 * broken. A documented build command silently stops working and nobody
 * notices, because people build from memory rather than from the page.
 * A regular expression in a test silently matches nothing, so the test
 * passes, so the guard looks alive while checking nothing at all.
 *
 * Both of those happened in this codebase and in a sibling one, three
 * times between them. The second is how the prior-art check in
 * claims.test.ts came to have eight backspace characters where its word
 * boundaries should have been: it passed, and it was inert.
 *
 * None of these characters has a legitimate reason to appear in source
 * or prose here, so their presence is the signal.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");

/** Control characters that only turn up when an escape was mangled. */
const SUSPECT = new Map<number, string>([
  [7, "BEL, probably a mangled backslash-a in a Windows path"],
  [8, "BS, probably a mangled backslash-b in a regular expression"],
  [11, "VT, probably a mangled backslash-v"],
  [12, "FF, probably a mangled backslash-f"],
  [27, "ESC, probably a mangled backslash-e"],
]);

function trackedFiles(): string[] {
  const out = execFileSync("git", ["ls-files"], { cwd: repo, encoding: "utf8" });
  return out
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean)
    .filter((f) => /\.(ts|tsx|js|jsx|mjs|json|md|css|yml|yaml|txt)$/i.test(f));
}

/*
  The television app is outside the npm workspaces, because Metro and
  Gradle both resolve from the app directory and hoisting breaks them.
  Nothing else installs it, and nothing else runs its suite.

  A sibling project shipped for three days with a green root suite that
  had never once run the app on its primary track. The failure arrives
  at the end of a long green run as "jest is not recognized", which
  reads like a missing global tool rather than a missing install, and
  the published test count included those tests.
*/
describe("the documented command can reach the whole suite", () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(repo, "package.json"), "utf8"),
  ) as { scripts: Record<string, string> };

  it("runs the television suite from npm test", () => {
    expect(pkg.scripts.test).toContain("--prefix tv");
  });

  it("installs the television app's own dependencies from npm install", () => {
    const install = [pkg.scripts.postinstall, pkg.scripts.prepare]
      .filter(Boolean)
      .join(" ");
    expect(
      install,
      "nothing installs tv/, so a clean clone cannot run its suite",
    ).toContain("tv");
  });

  it("keeps the television app out of the vitest run, so it is not run twice badly", () => {
    // vitest would walk into tv/__tests__ and fail on a tsconfig that
    // only exists inside the app's own node_modules.
    const config = fs.readFileSync(path.join(repo, "vitest.config.ts"), "utf8");
    expect(config).toContain("tv/**");
  });
});

describe("source hygiene", () => {
  const files = trackedFiles();

  it("has files to check, so a broken walker cannot pass silently", () => {
    // The check below is a loop over a list. An empty list passes every
    // assertion in it, which is the same failure mode it exists to catch.
    expect(files.length).toBeGreaterThan(5);
  });

  it("points only at documents that exist", () => {
    /*
      Both of the pipeline's error messages tell somebody to read
      docs/AWS.md. A message that names a file which is not there is
      worse than one that says nothing, because it was written by
      somebody who believed they had explained the problem.

      This also covers the ordinary rot: a document gets renamed and
      four links keep pointing at where it used to be.
    */
    const missing: string[] = [];
    let found = 0;
    for (const file of files) {
      const full = path.join(repo, file);
      if (!fs.existsSync(full)) continue;
      const text = fs.readFileSync(full, "utf8");
      for (const m of text.matchAll(/docs\/[A-Za-z0-9_-]+\.md/g)) {
        found++;
        const target = m[0];
        if (!fs.existsSync(path.join(repo, target))) {
          missing.push(`${file} points at ${target}, which does not exist`);
        }
      }
    }
    // The check is a loop over matches. Without this, a pattern that
    // stopped matching would pass every assertion inside it. The first
    // version of this test did exactly that, in the file whose whole
    // job is catching checks that quietly stopped checking.
    expect(found, "no document references found at all").toBeGreaterThan(3);
    expect(missing, missing.join("\n")).toEqual([]);
  });

  it("contains no escape sequence that was eaten on the way to disk", () => {
    const damaged: string[] = [];
    for (const file of files) {
      const full = path.join(repo, file);
      if (!fs.existsSync(full)) continue;
      const text = fs.readFileSync(full, "utf8");
      for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        const why = SUSPECT.get(code);
        if (!why) continue;
        const around = text.slice(Math.max(0, i - 40), i + 20).replace(/\s+/g, " ");
        damaged.push(`${file}: ${why}, near ${JSON.stringify(around)}`);
        break;
      }
    }
    expect(damaged, damaged.join("\n")).toEqual([]);
  });
});
