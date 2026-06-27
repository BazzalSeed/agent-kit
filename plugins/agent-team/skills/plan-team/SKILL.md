---
name: plan-team
description: Use when the user gives a free-text instruction to plan or spin up an agent team (e.g. "plan a team to fix all the bugs"), or when scoping or designing a Claude Code agent team — deciding the roles, who owns which files or domains, which model each teammate runs, and each teammate's deliverable — or when unsure whether a task is worth a team versus subagents or solo work.
---

# Plan a team

## Overview
Design a high-leverage agent team **before** spending on it. Teams cost much more than a normal session — each teammate is a full Claude with its own context window — so the win comes from a tight plan: the right roles, **one owner per area**, the right model per role, a concrete deliverable each, and only the coordination ceremony the task needs. Core rule: **lean by default, escalate on trigger.** Output is a reviewable plan file that the `launch-team` skill spawns from.

## Start from the user's instruction
The free-text ask the user gave when invoking this skill — e.g. *"plan a team to fix all the bugs in my app"* — **is the authority. It drives the plan and outranks any planning/spec doc in the repo.** Repo docs (`CLAUDE.md`, specs, planning files) are **supporting context** that inform *how* to deliver on the instruction; they never override it or substitute for it. Where the instruction and a repo doc disagree, the instruction wins.

**If no instruction was given** (the skill fired with no goal), **ask the user what the team should do before planning anything** — via the `AskUserQuestion` tool, or a plain-text question for a free-form goal. Do **not** silently fall back to planning from whatever doc happens to be in the repo. Proceed only once you have an explicit goal.

## First: is a team even right?
| The work is… | Use |
|---|---|
| Independent and parallel, **and** outputs must be compared / ranked / merged across roles, or conflicting findings need resolving by a lead | **Team** — continue |
| Independent, parallel, but outputs are separate artifacts with no cross-role comparison | **Subagents** (cheaper) — stop, recommend these |
| Sequential, tightly coupled, or same-file edits | **Solo** — stop, recommend this |

If it isn't a team, say so and stop — forcing one is the most expensive mistake here.

## Process
1. **Analyze the repo.** Read `CLAUDE.md` / `AGENTS.md`, scan the layout and `git status` for natural **ownership areas** — a *file-set* per area for build/edit work, or a *domain/lens* (brand, a11y, copy…) for review/analysis. Note invariants and load-bearing facts that live *outside* CLAUDE.md, **and any user-input prerequisites** the work will need (logins/CLI auth, domain/DNS, paid actions, secrets/keys). Each area = one role; merge a **thin** role (≤~3 files, or fewer than ~3 distinct deliverable items) into an adjacent one. 3–5 roles typical.
2. **Resolve the scope fork, then ask only what you can't infer (1–3 questions max).** The load-bearing fork is **findings-only vs also-fix** — infer *findings-only* unless the request says fix / patch / update / resolve; ask only if genuinely ambiguous. "Also-fix" makes teammates edit code (→ plan approval) and changes the deliverable. **Propose a `Ship goal`** (one-sentence definition of done) **synthesized from the user's instruction first, with the planning/spec docs as supporting detail**, then let the user **accept it or write their own** — don't ask open-ended, and don't silently assume. Don't interrogate. **Ask via the `AskUserQuestion` tool** (selectable options — e.g. "use this Ship goal" vs "write my own"), not a plain-text prompt.
3. **Pick a model per role** (see *Models* below) and **draft the lean plan** (format below): **lead with the one-sentence `Ship goal`**, then one role per ownership area, each with a **concrete, named deliverable**. Note any **user-input prerequisites** in `## Notes` so the lead derisks them *before* launch (don't let teammates stall mid-build on a login). Add an escalation only when its trigger fires. **Present the draft to the user as the roles table (below) and get a quick confirm — this is a pre-write review GATE, shown BEFORE step 4 (save) and before writing any file, never a post-write recap.** Send it as a normal text message containing the table; don't fold it into the `AskUserQuestion` call (that UI can't render a table), and don't skip ahead to writing the file.
4. **Ask where to save — via the `AskUserQuestion` tool** (selectable options, not a text prompt). Slug = kebab-case of the goal, ≤4 words (e.g. `review-landing-page`); the slug is **deterministic — re-running for the same goal revises the *same* file in place, never a `-v2` copy**, so `launch-team` is never ambiguous. Options:
   - `.claude/team-plans/<slug>.md` — scratch, gitignored *(default)*
   - `docs/team-playbooks/<slug>.md` — committed, reusable playbook
   - a custom path
   On first use of the scratch path, add `.claude/team-plans/` to `.gitignore` **only if not already present.** **If you were invoked by another agent rather than a user, skip the prompt and use the default.**
5. **Write the plan, then hand off** with the **exact path**: "review/edit it, then run `/agent-team:launch-team <path>`." Always hand off the *exact* path (not just "the plan") so launch is unambiguous. If the user requests changes, revise the same file in place and re-confirm before handing off.

## Models (suggest, but make override trivial)
Suggest a model per role, grounded in what this session can actually spawn — the Agent tool's set is **`haiku`, `sonnet`, `opus`, `fable`**; the user's plan may expose only a subset, which they can confirm with `/model`. Guidance:
- **Default `sonnet`** — the cost-fit for most coordination/review work.
- **`opus`** for heavy reasoning, or a high-stakes synthesis (set it on the `Lead:` line).
- **`haiku`** for cheap, mechanical roles (collecting, listing, simple checks).
- **A reviewer / judge / synthesis role is never *weaker* than the strongest role it reviews.** A model can't reliably catch mistakes a stronger model made — a `sonnet` reviewer over `opus` builders is backwards. Match or exceed: `opus` builders → `opus` (or `fable`) reviewer. Right-size *down* only for mechanical roles, never for the role that judges quality.

The model is a **per-role token in the plan** — the user overrides by editing it. Don't invent model names; only suggest from the set above (or whatever `/model` shows).

## Plan format (lean by default)
Roles go in a **table** — far more readable than a bullet wall, both in the file and when you print it back to the user.
```md
# Team plan: <goal>
Ship goal: <ONE sentence — the final shippable product / definition of done.>
Lead: <model>            # omit unless synthesis warrants more than your current session model

Spawn <N> teammates to <goal>:

| Role | Model | Owns (file-set OR domain/lens) | Deliverable |
|---|---|---|---|
| <role> | <model> | <area> | <concrete, named artifact> |
| <role> | <model> | <…> | <…> |

Wait for them, then synthesize <the Ship goal>.

## Notes
<why a team here; which escalations fired and why>
```
**`Ship goal` is mandatory** — one sentence naming the final shippable product (the shared definition of done). The lead holds it as the synthesis target and `launch-team` injects it into *every* teammate's prompt, so no role optimizes a local deliverable while losing the whole. **Propose one synthesized from the user's instruction (primary) and the planning/spec docs (supporting), then have the user accept it or write their own via `AskUserQuestion`** (offer the proposal as the selectable default).
**Name each deliverable concretely.** For a review that's *"a prioritized findings list (severity + file location + fix),"* not bare "findings."
**Always present the plan back to the user as this table** (Role · Model · Owns · Deliverable) — never a raw paragraph/bullet dump.

Add escalations **inline, above `## Notes`** — only when the trigger is true:

| Add this line | Only if |
|---|---|
| `Seams: <role-A ↔ role-B on X>` | roles hand work across a shared boundary (names matter — `launch-team` injects them) |
| `Plan approval: <criteria; red lines>` | teammates will edit code / schema / a risky path (i.e. "also-fix") |
| `Context(<role>): <facts>` | a teammate needs a fact NOT in CLAUDE.md — inject load-bearing facts inline; for a long doc, point to it (`required reading: <path>`) |

Front-loading all three every time is the unreadable wall people complain about. Start lean.

## Methodology defaults (for build/edit teams)
The standing discipline for these roles lives in the bundled role agents — `agent-team:builder`, `agent-team:reviewer`, `agent-team:foundation-guardian` (in the plugin's `agents/` dir). Spawn matching roles **from** them (via `subagent_type`) so the discipline travels automatically; it isn't restated here. What stays a *planning* decision:
- **Build/edit roles use TDD; "done" = tested** (the `builder` agent carries this). Put "unit + integration tests green before done" in the role's deliverable.
- **Include a dedicated reviewer by default.** Builders self-testing isn't a substitute for independent eyes on cross-lane coherence, invariants, and the running product; omit it only for a trivial single-lane team. Size its model to **match or exceed the strongest builder** (judge ≥ worker). The `reviewer` agent carries the full discipline — milestone cadence, the hands-on end-to-end final gate, and the two false-pass traps — so don't restate those; just (a) give it a **drivable test seam** (e.g. a guarded dev-login) in the plan so gated/authed flows are reachable, and (b) put "drives all in-scope flows e2e + exercised-vs-unverified report" in its deliverable.
- **Derisk user-input prerequisites before launch.** The lead resolves logins / CLI auth / domain / paid steps up front (and confirms they work) so no teammate stalls mid-build waiting on the user.

## Key facts to bake in
- Teammates inherit **CLAUDE.md, MCP servers, skills, and the lead's effort level** — but **not** the lead's model or chat history. So name a model per role and put task-specific facts in the plan.
- **One owner per area** (file-set or domain) — overlap is how teammates collide or double-count.
- **Much more expensive than one session** — each teammate is a full Claude; ~5–6 tasks per teammate.
- **A gating/foundation role (e.g. an "architect") stays thin** — its job is the **un-parallelizable shared setup** (freeze the contracts + stand up the skeleton/schema/config and the deploy/infra wiring that unblocks the lanes), and it implements **no feature behavior**. It keeps **standing value** as the guardian/sole owner of the frozen seam (contracts, schema/migrations, infra/env) even after setup — don't drop it. Full discipline lives in the bundled `agent-team:foundation-guardian` agent; spawn the role from it.

## Common mistakes
- **Planning from a repo doc while sidelining the user's instruction** → the team solves the wrong problem. The instruction is the authority; if none was given, ask before planning.
- Forcing a team when subagents or solo fit → wasted spend.
- Vague deliverable ("help with X", a bare "findings") → drift. Name the artifact each role produces.
- One model for everything → either overpaying (opus on mechanical work) or underpowering a synthesis. Right-size per role.
- **Reviewer/judge weaker than the builders** → it rubber-stamps their bugs. Match or exceed the strongest reviewed role.
- Front-loading every escalation → the unreadable prompt people complain about. Lean first.
- Presenting the plan as a bullet wall instead of the roles **table** → hard to read; use the table.
