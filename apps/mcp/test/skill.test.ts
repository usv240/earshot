import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TOOL_NAMES } from "../src/mcp";

/** The Agent Skill names every tool the MCP server has, so an agent that reads it learns the real surface. */
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const skill = fs.readFileSync(path.join(repo, "skills/earshot/SKILL.md"), "utf8");

describe("the Agent Skill", () => {
  it("names every tool on the MCP server", () => {
    expect(TOOL_NAMES.length).toBeGreaterThan(0);
    for (const name of TOOL_NAMES) expect(skill, name).toContain(name);
  });
});
