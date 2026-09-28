import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Are the committed accuracy figures what the current code produces?
 *
 * The suite checks that the committed numbers satisfy the properties
 * this project claims. It cannot check that they came from this version
 * of the procedure, because it reads the file rather than producing it.
 * So a change that quietly worsened the estimator would pass everything
 * until somebody happened to re-run the validation.
 *
 * This regenerates the run and compares, which is the missing half.
 *
 * Everything except `generatedAt` is compared. A plain `git diff` would
 * have worked and would have failed on every day except the one the
 * file was written, which is the sort of check people learn to ignore
 * and then delete.
 *
 *   node scripts/check-validation.mjs
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..");
const relative = "apps/eval/results/validation.json";
const file = path.join(repo, relative);

const withoutDate = (text) => {
  const { generatedAt, ...rest } = JSON.parse(text);
  void generatedAt;
  return rest;
};

const committed = withoutDate(
  execFileSync("git", ["show", `HEAD:${relative}`], { cwd: repo, encoding: "utf8" }),
);

execFileSync("npm", ["run", "validate"], {
  cwd: repo,
  stdio: "inherit",
  shell: process.platform === "win32",
});

const regenerated = withoutDate(fs.readFileSync(file, "utf8"));

if (JSON.stringify(committed) === JSON.stringify(regenerated)) {
  console.log("the committed figures are what this code produces");
  process.exit(0);
}

console.error("\nThe committed validation results are not what this code produces.\n");
for (const key of new Set([...Object.keys(committed), ...Object.keys(regenerated)])) {
  const before = JSON.stringify(committed[key]);
  const after = JSON.stringify(regenerated[key]);
  if (before !== after) {
    console.error(`  ${key}`);
    console.error(`    committed:   ${before}`);
    console.error(`    regenerated: ${after}`);
  }
}
console.error(
  "\nEither the change was intended, in which case commit the regenerated file\n" +
    "and the figures in every document that quotes it, or it was not.\n",
);
process.exit(1);
