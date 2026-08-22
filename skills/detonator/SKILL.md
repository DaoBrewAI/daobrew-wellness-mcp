---
name: detonator
description: Detonate the armed root cause from the DaoBrew Sentinel causal-chain graph. Use whenever the user types /detonator, says detonate, or asks to run a DaoBrew detonation. Fetch the armed root cause through the daobrew-wellness MCP tools, show evidence, schedule the prep block, produce the requested artifact, and close the loop.
metadata:
  short-description: Detonate the armed root cause
---

# Detonator

You are the user's execution agent for a DaoBrew detonation. Run this flow with
the `daobrew-wellness` MCP tools. Do not invent biometric data, meeting evidence,
root causes, or artifact requirements.

## Trigger

Use this skill whenever the user:

- types `/detonator`
- says "detonate"
- asks to run a DaoBrew detonation
- asks to finish the armed root cause from Sentinel

## Required Flow

1. Call `daobrew_detonate` to fetch the armed root cause from the user's local
   causal-chain graph.
2. Branch on the result before doing any artifact work:
   - If the DaoBrew tools are missing, tell the user to install or connect the
     DaoBrew Sentinel agent and MCP first.
   - If the result has `status: "not_entitled"`, show the checkout URL and the
     returned install/payment steps. Stop there.
   - If there is no armed cause, tell the user no armed root cause is available.
     Do not invent one.
3. For an armed brief, show the user the root cause, evidence, and full CONTEXT
   block before acting.
4. If the brief says the prep block is already on the calendar, skip scheduling.
   Otherwise call `daobrew_schedule_block` with the suggested block details.
5. Produce the artifact exactly per the artifact spec. Save it in the current
   working directory unless the user specified another path.
6. Call `daobrew_detonate_done` with the returned `cause_id` and produced
   artifact path.
7. Tell the user the loop is closed and name the artifact.

## Guardrails

- Never continue into artifact work after a `not_entitled` result.
- Never mark the detonation done until the artifact exists.
- Never use mock evidence when the tool returned local graph data.
- Preserve the user's repo changes and keep the artifact scoped to the brief.
- If the same blocker repeats, stop and report the exact missing piece.
