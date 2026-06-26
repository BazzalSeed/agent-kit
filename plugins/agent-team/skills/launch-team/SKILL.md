---
name: launch-team
description: Use when spawning or starting a Claude Code agent team now — from a team plan, or a direct request to launch teammates, spin up the team, or start the agents on a task.
---

# Launch a team

## Overview
Spawn the team a plan describes, then **coordinate — do not do the work yourself.** The session that runs this becomes the **lead**; each teammate gets its own context window. The lead waits for them and synthesizes one deliverable. Cost is ~7× a normal session, so launch deliberately. Pairs with the `plan-team` skill, which produces the plan.

## Process
1. **Check the feature is enabled.** Agent teams require `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in settings `env`, read at **startup**. If you cannot spawn teammates, tell the user to add this to `~/.claude/settings.json` (or `.claude/settings.local.json`) and **restart the session**, then stop — do not fake a "team" inside one context:
   ```json
   { "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }
   ```
2. **Load the plan.** Use the slug/path the user gave; else read the most-recent or only file in `.claude/team-plans/`; else if the user gave an inline goal, plan it first (see the `plan-team` skill). Restate what you're about to spawn — N roles, model, ownership — and get a quick go-ahead.
3. **Spawn one named teammate per role.** Use the Agent tool with a distinct `name` per role. Put that role's ownership, deliverable, and any `Context(...)` from the plan into its spawn prompt — **teammates don't see this chat.** Pass the model the plan names (default Sonnet; teammates don't inherit yours). If the plan has a `Plan approval` line, require each teammate to plan before changing anything and approve only against the plan's stated criteria.
4. **Wait for the teammates. Do NOT start implementing yourself.** Monitor progress, answer their messages, steer. Let `Seams` partners message each other directly.
5. **Synthesize** the single deliverable the plan names — one merged output, not N scattered ones.
6. **Cleanup is automatic** on session exit, and teammates clean up when done. Intervene only if one is stuck or idling.

## Key facts
- **Lead ≠ worker.** The #1 failure is the lead doing the tasks solo. If you catch yourself implementing, stop and delegate.
- **Model isn't inherited** — name it per teammate (Sonnet unless a role needs more), or set *Default teammate model* in `/config`.
- **No nested teams; one team at a time.** Teammates can't spawn their own teammates.
- **The spawn prompt is the teammate's whole world** (plus CLAUDE.md). Under-context it and the run is wasted.

## Common mistakes
- Spawning before checking the env var → "teammates not appearing," confusion.
- Lead implements instead of waiting → defeats the entire point of a team.
- Forgetting the model → a teammate silently runs on a default you didn't intend.
- Over-spawning (>5 roles) → coordination overhead and cost balloon; tighten the plan first.
