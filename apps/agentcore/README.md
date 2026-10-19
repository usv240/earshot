# Earshot's Hearing Check-in agent, hosted on Amazon Bedrock AgentCore

The same Strands agent as [`apps/agent/hearing_check_in.py`](../agent/hearing_check_in.py), deployed to AgentCore Runtime as an invocable endpoint.

```
Runtime: earshothearing_hearing
Region:  us-east-1
Model:   us.anthropic.claude-sonnet-4-6
```

It answers from Earshot's MCP tools only (the endpoint Alexa+ uses, spec 2025-11-25 over Streamable HTTP): why the television asked, what the check measures and cannot, and whether anything changed for a household. It reports only numbers the tools returned, calls a change smaller than the test's repeatability no change, and never diagnoses or recommends a device.

## Verified running, 2026-10-19

```
npx @aws/agentcore invoke --prompt "Is it worth seeing someone about my hearing?"
```

With no household named, it said it had no recorded checks to point to, explained why the television asked and what the check measures, and said plainly the check is a screen and not a diagnosis.

## Deploy it yourself

```
cd apps/agentcore
cp agentcore/aws-targets.example.json agentcore/aws-targets.json   # set your account id
(cd agentcore/cdk && npm install)
npx @aws/agentcore deploy --yes
```

`app/hearing/hearing_check_in.py` is a copy of `apps/agent/hearing_check_in.py`; `apps/eval/test/agentcore-copy.test.ts` fails if they differ.
