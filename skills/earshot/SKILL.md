---
name: earshot
description: Work with Earshot, a hearing screen that runs on a television. Use this skill when somebody asks why their TV suggested checking their hearing, wants to know what the check measures or how it works, wants to record or look up a check that was taken, asks whether their hearing has changed over time, or wants something to take to a doctor. Also use it when somebody says they can hear the television but cannot follow the dialogue, or asks why they passed a hearing test and still struggle with speech.
license: MIT
compatibility: Requires network access to an Earshot MCP server. The public demo server needs no credentials.
metadata:
  author: usv240
  version: "0.1.0"
  project: https://github.com/usv240/earshot
  endpoint: https://inwrmblw32v4iyzsxkr5bfpidu0izuah.lambda-url.us-east-1.on.aws/mcp
---

# Earshot: the hearing test your television can give you

Most hearing tests play tones in a quiet room. The thing people actually
struggle with is speech with other sound behind it, and those are
different measurements. People with ordinary results on a pure-tone test
routinely cannot follow television dialogue; it is common enough to have
a name in the literature, and diagnosing it needs speech measured in
noise rather than tones measured in silence.

So somebody who cannot follow dialogue can take a well-made hearing test
and be told they are fine. Earshot measures the other one, on the device
where the problem was noticed.

It matters because around 80 percent of people with hearing loss do not
know, those who notice wait about seven years before asking anybody, and
the 2024 Lancet standing Commission puts hearing loss level with high
cholesterol as the largest modifiable risk factor for dementia from
midlife.

## When to use this skill

| The user says | What to do |
|---|---|
| "Why did my TV ask me about my hearing?" | `what_the_television_watches`. Explain the mechanism. Say plainly that it is a reason to ask a question, not a measurement of them. |
| "What is this test?" or "What does it measure?" | `explain_the_check` |
| "I passed a hearing test but still can't hear the TV" | `explain_the_check`, and explain why a pure-tone test can be normal while speech in noise is not |
| "I just did the check" (from the TV app) | `record_screen_result` |
| "Has my hearing changed?" | `get_screen_history`. Read the `change` field and repeat its note rather than improvising a trend. |
| "I'm seeing a doctor, what do I tell them?" | `prepare_for_appointment` |

## What this skill must never do

These are not style preferences. Each one has a test in the repository
that fails the build if it is violated.

**Never diagnose.** The screen sorts people into "probably fine" and
"worth getting checked". It cannot say what is wrong, how bad it is, or
whether anything can be done. Do not name conditions. Do not speculate
about causes. If asked directly, say that a ratio measured through a
television cannot know, and that this is what the appointment is for.

**Never treat a refused run as a result.** A run that does not settle
comes back `unmeasured`, and that is the answer. Do not average it with
others, do not report the threshold it nearly produced, and do not
reassure somebody on the strength of it. The person most likely to
produce an unusable run is the one whose hearing is furthest outside the
range the test can present.

**Never report how somebody watches television.** The server does not
have it. Volume, subtitle use and rewinding stay on the device they
happened on. If asked what the television saw, describe the mechanism
with `what_the_television_watches` and say the numbers never left the
set. Do not guess at them.

**Never call a small difference a change.** The procedure's own
test-retest spread of 0.748 dB. Two results a month apart differing by a
decibel is the instrument repeating itself. `get_screen_history` already
applies this rule; repeat what it says rather than looking at the two
numbers and drawing your own line between them.

**Never quote a threshold without its reference.** A figure in decibels
means nothing without the speech material it was measured against, and
this project's material is not a normed corpus, so its bands are
provisional. Every result carries its reference. Carry it too.

## The tools

All five are on one MCP server, spec revision 2025-11-25 over Streamable
HTTP.

- **`what_the_television_watches`**: the mechanism, and nothing else.
  Returns no data, because there is none to return.
- **`explain_the_check`**: what the test measures, why it works on
  uncalibrated equipment, and what it cannot do.
- **`record_screen_result`**: store a completed check, including one
  that was refused. Wants `household` and `valid`, plus `srt_db` when
  the run was usable.
- **`get_screen_history`**: past checks, newest first, with whether
  anything has actually changed.
- **`prepare_for_appointment`**: one page for a clinician: what was
  measured, when, and what it does not establish. Excludes refused runs
  and anything measured with placeholder audio rather than burying them
  under a caveat.

## Tone

The person asking has often just been told something about their body by
an appliance, and may be frightened by it. Be plain and be short. Lead
with what was measured rather than with what it might mean. Say that
turning the television up is extremely common and has many causes,
because it is true and because it is the difference between an offer and
an accusation.

If somebody wants to stop talking about it, stop. The product itself
never asks twice in a season and never again after two refusals, and an
agent attached to it should behave the same way.
