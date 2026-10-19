"""The Hearing Check-in agent.

A Strands agent on Amazon Bedrock that answers the question a person has
when their television suggests a hearing check: why did it ask, what does
the check actually measure, and has anything changed for us? It answers by
talking to Earshot's own MCP server, the same endpoint Alexa+ would use
(apps/mcp/src/mcp.ts, spec 2025-11-25 over Streamable HTTP).

It has no database access and no privileged path: it can call only the
server's tools, and how a household watches television never leaves the
television, so no tool can tell it. If the MCP surface were wrong, this
agent would be wrong too, which is the cheapest proof that the surface is
real.

Usage:
    python apps/agent/hearing_check_in.py --household ours
    python apps/agent/hearing_check_in.py --household ours --ask "Is it worth seeing someone?"
    python apps/agent/hearing_check_in.py --json
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys

from mcp.client.streamable_http import streamablehttp_client
from strands import Agent
from strands.models import BedrockModel
from strands.tools.mcp import MCPClient

DEFAULT_MCP_URL = os.environ.get("EARSHOT_MCP", "https://inwrmblw32v4iyzsxkr5bfpidu0izuah.lambda-url.us-east-1.on.aws/mcp")
MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "us.anthropic.claude-sonnet-4-6")

SYSTEM_PROMPT = """You help a person whose television suggested a hearing check,
using a tool called Earshot. Earshot notices how far past a programme's
dialogue a household is listening, offers a ninety-second hearing-in-noise
check with the remote, and prepares one page for a doctor.

How to work:
1. Call what_the_television_watches to explain why the television asked.
2. Call explain_the_check to say what the check measures and what it cannot.
3. If a household is named, call get_screen_history for it. If there is
   history worth taking to an appointment, call prepare_for_appointment.
4. Only then answer.

Hard rules:
- Report only numbers and facts the tools returned. Never estimate.
- A difference smaller than the test's own repeatability is no change; say so.
- Never diagnose hearing loss, never name a condition, never recommend a
  device or a product, never give medical advice. The one thing you may
  suggest is taking the page to a clinician they trust.
- If there is no history, say plainly that no check has been recorded yet.
- At most four sentences and 90 words in all, warm and plain, second person. No emojis, no
  headings, no lists, no dashes of any kind as punctuation.

Output format: the answer itself and nothing else."""


def clean(text: str) -> str:
    """The house style, enforced rather than requested: no markdown, no
    dashes as punctuation. The first live run wrote em dashes the prompt
    had forbidden, which is the usual result of asking a sampler nicely."""
    t = re.sub(r"^\s*#+\s*", "", text, flags=re.M).replace("**", "")
    t = re.sub(r"\s*[—–]\s*", ", ", t)
    return re.sub(r"[ 	]+", " ", t).strip()


def main() -> int:
    ap = argparse.ArgumentParser(description="Earshot hearing check-in agent")
    ap.add_argument("--url", default=DEFAULT_MCP_URL, help="Earshot MCP endpoint")
    ap.add_argument("--household", default="ours", help="the household name the television app uses")
    ap.add_argument("--ask", default=None)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    question = args.ask or (
        f"My television suggested a hearing check. Why did it ask, what does the check actually tell me, "
        f"and has anything changed for the household {args.household!r}?"
    )
    client = MCPClient(lambda: streamablehttp_client(args.url))
    with client:
        tools = client.list_tools_sync()
        names = sorted(getattr(t, "tool_name", str(t)) for t in tools)
        agent = Agent(model=BedrockModel(model_id=MODEL_ID, region_name="us-east-1"), tools=tools,
                      system_prompt=SYSTEM_PROMPT, name="earshot-hearing-check-in", callback_handler=None)
        answer = clean(str(agent(question)))
        used = [m["content"][0]["toolUse"]["name"] for m in agent.messages
                if m.get("role") == "assistant" and m.get("content") and "toolUse" in m["content"][0]]
        used += [b["toolUse"]["name"] for m in agent.messages if m.get("role") == "assistant"
                 for b in (m.get("content") or [])[1:] if isinstance(b, dict) and "toolUse" in b]
    out = {"question": question, "answer": answer, "tools_available": names, "tools_called": used,
           "model": MODEL_ID, "server": args.url}
    if args.json:
        print(json.dumps(out, indent=1))
        return 0
    print(f"Connected to {args.url}\nTools discovered: {', '.join(names)}\n")
    bar = "=" * 62
    print(f"{bar}\nHEARING CHECK-IN\n{bar}\n{answer}\n{bar}")
    print(f"Tools called: {', '.join(used) or 'none'}. Written by a Strands agent from Earshot's MCP tools only. Not a diagnosis.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
