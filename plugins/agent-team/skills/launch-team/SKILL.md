---
name: launch-team
description: Use when spawning or starting a Claude Code agent team now — from a team plan, or a direct request to launch teammates, spin up the team, or start the agents on a task.
---

# Launch a team

## Overview
Spawn the team a plan describes, then **coordinate — do not do the work yourself.** The session that runs this becomes the **lead**; each teammate gets its own context window. The lead waits for them and synthesizes one deliverable. Teams cost much more than a normal session, so launch deliberately. Pairs with the `plan-team` skill, which produces the plan.

## Process
1. **Check the feature is enabled — and offer to enable it.** Agent teams require `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in settings `env`, read at **startup**. If you can't spawn teammates:
   - **Offer to set it** (with permission): use the **project** `.claude/settings.local.json` when a repo is open, else `~/.claude/settings.json`. **Read the file first and merge** the key into any existing `env` map — don't overwrite. Use the `update-config` skill if available.
   - **It only takes effect after a restart.** Make the edit, tell the user to restart, then **stop** — don't fake a "team" in one context.
   ```json
   { "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }
   ```
2. **Load the plan.** Use the exact path/slug given; else the most-recent or only file in `.claude/team-plans/`; else, if the user gave an inline goal, invoke the `plan-team` skill (via the Skill tool) on it first. Restate what you're about to spawn — N roles, model each, ownership — and get a quick go-ahead. **If invoked by another agent, not a user, skip the go-ahead and proceed.**
3. **Spawn one named teammate per role** — Agent tool, a distinct `name` per role:
   - **Model:** map the plan's per-role token to the Agent tool's lowercase value (`haiku`/`sonnet`/`opus`/`fable`). If a named model isn't available this session, warn and fall back to `sonnet`.
   - **Spawn prompt** (their whole task-world; they don't see this chat):
     ```
     You are the <role> teammate. <READ-ONLY, or the edit scope.>
     Owns: <area>. Deliverable: <concrete artifact>.
     <Context(role) facts from the plan, if any.>
     <Seams: message <partner-name> about <X>.>   # inject the partner's spawn name
     ```
   - **Seams:** for each pair, inject the **counterpart's spawn name** into both prompts — a teammate can't `SendMessage` to a name it was never told.
   - **Plan approval:** if the plan has it, inject the criteria into the spawn prompt and instruct the teammate to send a `plan_approval_request` **before any writes**; approve/reject via the protocol response, judged against those criteria.
4. **Wait for the teammates. Do NOT start implementing yourself.** Monitor, answer messages, steer. Let `Seams` partners message each other.
5. **Synthesize** the single deliverable the plan names — one merged output. If a teammate errored or returned nothing, **note the gap explicitly** and surface the uncovered area; don't silently drop it.
6. **Wind down.** Shut down idle teammates (send a `shutdown_request`). On session exit the **team config** is removed automatically; the **task list persists** locally (retention via `cleanupPeriodDays`) so resumed sessions keep tasks. Intervene on a teammate only if it has gone quiet with no `TaskUpdate` and isn't reachable.

## Permissions (default: don't bypass)
Teammates inherit the **lead's** permission mode (you can't set per-teammate at spawn). **Default: keep your current mode.** Do **not** launch the lead with bypass / `--dangerously-skip-permissions` just to cut prompts — that hands every teammate unrestricted write/exec with no gate, which defeats plan-approval. For read-only review/research teams friction is already low; for editing teams, prefer plan-approval **plus pre-approving common safe ops** in permission settings. Bypass is a deliberate, per-task opt-in for fully-trusted work — never the default.

## Key facts
- **Lead ≠ worker.** The #1 failure is the lead doing the tasks solo. If you catch yourself implementing, stop and delegate.
- Teammates inherit CLAUDE.md + MCP + skills + the lead's **effort level**, but **not** the lead's **model** (name it per teammate) or chat history.
- **No nested teams; one team at a time.** Teammates can't spawn teammates.
- `/resume` and `/rewind` do **not** restore in-process teammates — after a resume the lead may message teammates that no longer exist; spawn fresh ones.

## Common mistakes
- Spawning before the env check → "teammates not appearing."
- Lead implements instead of waiting → defeats the point.
- Wrong model string (`"Sonnet"` not `"sonnet"`) or a model the session lacks → silent fallback.
- Seams declared but partner names not injected → teammates can't actually message each other.
