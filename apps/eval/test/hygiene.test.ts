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

describe("source hygiene", () => {
  const files = trackedFiles();

  it("has files to check, so a broken walker cannot pass silently", () => {
    // The check below is a loop over a list. An empty list passes every
    // assertion in it, which is the same failure mode it exists to catch.
    expect(files.length).toBeGreaterThan(5);
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
