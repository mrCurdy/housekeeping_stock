---
name: run-stage
description: Finish every unchecked step of a docs/plan-*.md, each step done by a fresh step-runner agent (clean context per step), stopping on any failure. Use when asked to "run the stage", "finish the plan", or "do all steps of docs/<plan>.md".
---

# Running a whole stage

The user writes a stage as `docs/plan-<stage>.md` with `- [ ] **N. Title**` steps. You (the main
session) are only the orchestrator: each step is done by a **new** `step-runner` agent, which starts
with empty context and is discarded when it reports. Never continue an old runner with SendMessage.

## Routine

1. **Preflight**
   - `git status --porcelain` must be empty, and `git branch --show-current` must not be `main` or
     `production`. Otherwise stop and ask the user.
   - Note the start commit: `git rev-parse --short HEAD`.
   - Read only the step lines and the order note: `grep -n '^- \[[ x]\]' docs/<plan>.md` and the
     first ~10 lines of the plan (it may say which steps depend on each other).
2. **Loop, strictly one step at a time**
   - Take the first `- [ ]` step N.
   - Spawn: `Agent(subagent_type: "step-runner", description: "Plan step N", prompt: "Do step N of docs/<plan>.md.")`.
     Add one line of NOTES from an earlier runner only if it matters for this step.
   - Wait for the completion notification. Don't poll it and don't predict its result.
   - **Verify, don't just trust the report:**
     - `grep -n '^- \[x\] \*\*N\.' docs/<plan>.md` finds the step ticked;
     - `git log -1 --oneline` is a new commit that names step N;
     - `git status --porcelain` is empty.
   - Tell the user in 2–3 lines: step, commit hash, summary, notes.
   - If `STATUS` isn't `DONE`, or a check fails: **stop the stage**. Show the runner's QUESTION or
     failing output and wait for the user. When they answer (or fix the plan), run this skill again:
     it continues from the first unchecked step. Pass their answer into that runner's prompt.
3. **Stage done** when no `- [ ]` is left:
   - list the run's commits: `git log --oneline <start>..HEAD`;
   - repeat the NOTES worth knowing (leftovers, decisions that differ from the plan).
   - Don't push, merge or deploy unless the user asks.

## Keep the orchestrator light

- Never read code, diffs or test files yourself: only the plan's checkbox lines, git one-liners
  and the runners' reports. The runners carry the heavy context.
- Never run two runners at once: steps commit to the same branch and often depend on each other.
