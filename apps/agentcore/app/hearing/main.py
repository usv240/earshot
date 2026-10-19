"""Earshot's Hearing Check-in agent, hosted on Amazon Bedrock AgentCore Runtime.

Invoke with {"prompt": "<a question>", "household": "ours"}. The agent is the
same Strands agent as apps/agent/hearing_check_in.py (a copy sits beside this
file; a test fails if they differ): it answers from Earshot's MCP tools only,
the endpoint Alexa+ uses (spec 2025-11-25, Streamable HTTP), reports only
numbers the tools returned, and never diagnoses or recommends a device.
"""

from __future__ import annotations

import os

from bedrock_agentcore.runtime import BedrockAgentCoreApp
from mcp.client.streamable_http import streamablehttp_client
from strands import Agent
from strands.models import BedrockModel
from strands.tools.mcp import MCPClient

import hearing_check_in as hc

app = BedrockAgentCoreApp()
log = app.logger

MCP_URL = os.environ.get("EARSHOT_MCP", hc.DEFAULT_MCP_URL)


@app.entrypoint
def invoke(payload, context):
    payload = payload if isinstance(payload, dict) else {}
    household = str(payload.get("household") or "ours")
    question = payload.get("prompt") if isinstance(payload.get("prompt"), str) and payload["prompt"].strip() else (
        f"My television suggested a hearing check. Why did it ask, what does the check actually tell me, "
        f"and has anything changed for the household {household!r}?")
    log.info("hearing check-in for %s", household)
    client = MCPClient(lambda: streamablehttp_client(MCP_URL))
    with client:
        agent = Agent(model=BedrockModel(model_id=hc.MODEL_ID, region_name="us-east-1"), tools=client.list_tools_sync(),
                      system_prompt=hc.SYSTEM_PROMPT, name="earshot-hearing-check-in", callback_handler=None)
        answer = hc.clean(str(agent(question)))
    return {"answer": answer, "household": household, "model": hc.MODEL_ID, "runtime": "Amazon Bedrock AgentCore Runtime"}


if __name__ == "__main__":
    app.run()
