# The Hearing Check-in agent

A Strands agent on Amazon Bedrock that answers the question a person has
when their television suggests a hearing check: why did it ask, what does
the check measure and not measure, and has anything changed for us?

It is a second, independent client of the same MCP server Alexa+ would use
(`apps/mcp`, spec 2025-11-25 over Streamable HTTP). It has no database
access and no privileged path, and how a household watches television never
leaves the television, so no tool can tell it. If the MCP surface were
wrong, this agent would be wrong too.

```
pip install strands-agents mcp
python apps/agent/hearing_check_in.py --household ours
python apps/agent/hearing_check_in.py --household ours --ask "Is it worth seeing someone?"
```

Its rules are in the system prompt and enforced after it: only numbers the
tools returned, a change smaller than the test's repeatability called no
change, no diagnosis, no device recommended, and no dashes or headings,
removed in code rather than requested (the first live run wrote em dashes
the prompt had forbidden).

## Verified against the deployed server, 2026-10-19

It called `what_the_television_watches`, `explain_the_check` and
`get_screen_history`, in that order, and answered that no check had been
recorded yet for the household, why the television asked, and what the
check measures. The run is committed in [runs/hearing-check-in.json](runs/hearing-check-in.json).
