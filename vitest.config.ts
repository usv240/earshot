import { defineConfig } from "vitest/config";

/**
 * What `npm test` at the root means.
 *
 * Workspace packages only. The Fire TV app lives outside the npm
 * workspaces because Metro and Gradle both resolve from the app
 * directory and hoisting breaks them, and it runs its own suite. That
 * split cost a sibling project three days of a green suite that had
 * never once run the app on its primary track, so the root install
 * wires the app up explicitly and this file says why the exclusion is
 * here rather than leaving it to be rediscovered.
 */
export default defineConfig({
  test: {
    include: ["packages/**/test/**/*.test.ts", "apps/**/test/**/*.test.ts"],
    exclude: ["**/node_modules/**", "tv/**", "**/dist/**"],
  },
});
