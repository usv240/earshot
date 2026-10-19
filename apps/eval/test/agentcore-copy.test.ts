import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The hearing agent hosted on AgentCore Runtime is the same code as the one
 * in apps/agent: the runtime imports a copy, and this fails if they differ.
 */
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("the hosted hearing agent", () => {
  it("is byte for byte the local one", () => {
    const local = fs.readFileSync(path.join(repo, "apps/agent/hearing_check_in.py"));
    const hosted = fs.readFileSync(path.join(repo, "apps/agentcore/app/hearing/hearing_check_in.py"));
    expect(hosted.equals(local)).toBe(true);
  });
});
