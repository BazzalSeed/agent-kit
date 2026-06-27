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
2. **Load the plan, then derisk prerequisites.** Use the exact path/slug given; else if **exactly one** file is in `.claude/team-plans/`, use it; **if several exist and no path was given, list them and ask which via the `AskUserQuestion` tool — never silently pick the most-recent**; else, if the user gave an inline goal, invoke the `plan-team` skill (via the Skill tool) on it first. **Before spawning, the lead resolves the plan's user-input prerequisites itself** (logins / CLI auth / domain / paid steps) and confirms they actually work — so no teammate stalls mid-build. Restate what you're about to spawn **as a table (role · model · ownership)** + the **Mandates**, and get a quick go-ahead. **If invoked by another agent, not a user, skip the go-ahead and proceed.**
3. **Spawn ALL teammates at once** — one Agent-tool call per roles-table row, in a single message, each a distinct `name`. A team is strongest with everyone present from the start; don't stagger-spawn sequential roles — handle dependencies with **prep-then-wait** instructions instead.
   - **Model:** map each row's **Model** column to the Agent tool's lowercase value (`haiku`/`sonnet`/`opus`/`fable`). If a named model isn't available this session, warn and fall back to `sonnet`.
   - **Spawn prompt** (their whole task-world; they don't see this chat) — **inject the **Mandates** into every one**:
     ```
     You are the <role> teammate. <READ-ONLY, or the edit scope.>
     MANDATES (shared end-state):
     <inject each mandate bullet from the plan>
     Owns: <area>. Deliverable: <concrete artifact>.
     <Context(role) facts from the plan, if any.>
     <Seams: message <partner-name> about <X>.>   # inject the partner's spawn name
     <prep-then-wait, if this role depends on another:
        first read <context> and post your task plan, then WAIT for the lead's go-signal
        ("<upstream> gate green") before any writes.>
     <build/edit roles: use TDD; run your unit + integration tests GREEN before reporting done.>
     ```
   - **Seams:** for each pair, inject the **counterpart's spawn name** into both prompts — a teammate can't `SendMessage` to a name it was never told.
   - **Sequential deps = prep-then-wait, not staggered spawning.** A downstream role spawns now but only **prepares** (reads context, posts its task plan) until the lead relays the upstream's go-signal — then it writes. The lead relays that signal when the upstream reports its gate green.
   - **Use the bundled role agents when a plan role matches one.** Spawn via `subagent_type` from the eight bundled personas — `agent-team:architect`, `agent-team:builder`, `agent-team:backend`, `agent-team:frontend`, `agent-team:designer`, `agent-team:qa`, `agent-team:devops`, `agent-team:reviewer` — and each carries its standing discipline automatically (the architect's freeze-then-guard + no-feature-behavior + verify-before-rebuild; the builder/backend/frontend/designer's TDD + "done" = tests green + their domain quality bar; qa's test-seam ownership; devops's deploy-path ownership; the reviewer's milestone cadence, hands-on end-to-end final gate, and the two false-pass traps). `backend`/`frontend`/`designer` are `builder` specializations — use whichever the plan's role names; fall back to `builder` for a generic lane. You then inject only the **per-run specifics** in the spawn prompt: the Mandates, the owned area, seam-partner names, any gate / prep-then-wait signal, and plan-approval criteria. (If a bundled agent isn't resolvable this session, inline the role's brief instead.) Two per-run reminders the agents can't know on their own: tell the **architect** (and **devops**, if present) the builders' names so they route seam/infra changes to them, and confirm the plan handed the **reviewer** a drivable test seam — built by **qa** when the team has one — to reach gated/authed flows.
   - **Plan approval:** if the plan has it, inject the criteria into the spawn prompt and instruct the teammate to send a `plan_approval_request` **before any writes**; approve/reject via the protocol response, judged against those criteria.
   - **Write the monitor breadcrumb (metadata only — no UI is launched).** Right after spawning, write `.claude/team-runs/<leadSessionId>.meta.json` capturing what the runtime files don't store, so a later `watch-team` can render the team cleanly:
     ```json
     { "sessionId": "<leadSessionId>", "planPath": "<plan file or null>",
       "mandates": ["<each mandate bullet>"],
       "members": [ { "name": "<spawn name>", "role": "<role>", "model": "<model>", "agentType": "agent-team:<persona|''>" } ] }
     ```
     This is a plain metadata file — it does not start any server or browser. The user opens the monitor separately with the `watch-team` skill.
4. **Wait for the teammates. Do NOT start implementing yourself.** Monitor, answer messages, steer, **relay go-signals** between prep-then-wait roles. Let `Seams` partners message each other.
5. **Synthesize toward the **Mandates**** — one merged output, judged against those bullets. **On a contested call, defer to the role that owns that area; don't dilute the expert into a consensus average.** If a teammate errored or returned nothing, **note the gap explicitly** and surface the uncovered area; don't silently drop it.
6. **Leave the team running — persistence is the default** (lifecycle: spawn → work → synthesize → **stay available**). When the deliverable is synthesized, **do NOT shut the teammates down** — keep them available so the user can ask follow-ups, request revisions, or kick off the next phase with the warm context already loaded. **Tear a teammate down only when the user explicitly asks** (send a `shutdown_request` to the named teammate(s)). Session exit removes the **team config** automatically while the **task list persists** locally (retention via `cleanupPeriodDays`), so a resumed session keeps the tasks. Mid-run, intervene on a teammate only if it has gone quiet with no `TaskUpdate` and isn't reachable.

## Permissions (default: don't bypass)
Teammates inherit the **lead's** permission mode (you can't set per-teammate at spawn). **Default: keep your current mode.** Do **not** launch the lead with bypass / `--dangerously-skip-permissions` just to cut prompts — that hands every teammate unrestricted write/exec with no gate, which defeats plan-approval. For read-only review/research teams friction is already low; for editing teams, prefer plan-approval **plus pre-approving common safe ops** in permission settings. Bypass is a deliberate, per-task opt-in for fully-trusted work — never the default.

## Key facts
- **Lead ≠ worker.** The #1 failure is the lead doing the tasks solo. If you catch yourself implementing, stop and delegate.
- Teammates inherit CLAUDE.md + MCP + skills + the lead's **effort level**, but **not** the lead's **model** (name it per teammate) or chat history.
- **No nested teams; one team at a time.** Teammates can't spawn teammates.
- `/resume` and `/rewind` do **not** restore in-process teammates — after a resume the lead may message teammates that no longer exist; spawn fresh ones.

## Common mistakes
- Spawning before the env check → "teammates not appearing."
- Wrong model string (`"Sonnet"` not `"sonnet"`) or a model the session lacks → silent fallback.
- Seams declared but partner names not injected → teammates can't actually message each other.
- **Staggered spawning** when prep-then-wait would do → cold-start latency + less visibility. Spawn all at once; gate with instructions.
- **Forgetting to inject the Mandates** → roles optimize local deliverables and lose the whole.
- **Builders reporting "done" without running their tests** → defects sail to the reviewer. "Done" = tests green.
- **Lead spawns before derisking a login/domain/paid prereq** → a teammate stalls mid-build. Resolve those first.
- **Auto-shutting-down all teammates once the deliverable lands** → the user loses the warm context for follow-ups and revisions. Persist by default; tear down only on explicit request.
