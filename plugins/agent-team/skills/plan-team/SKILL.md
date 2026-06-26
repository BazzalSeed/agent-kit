---
name: plan-team
description: Use when scoping or designing a Claude Code agent team — deciding the roles, who owns which files or domains, and each teammate's deliverable — or when unsure whether a task is worth a team versus subagents or solo work.
---

# Plan a team

## Overview
Design a high-leverage agent team **before** spending on it. Agent teams cost ~7× a normal session, so the win comes from a tight plan: the right roles, **one owner per area**, a concrete deliverable each, and only the coordination ceremony the task actually needs. Core rule: **lean by default, escalate on trigger.** The output is a reviewable plan file that the `launch-team` skill spawns from.

## First: is a team even right?
| The work is… | Use |
|---|---|
| Independent and parallel, **and** a lead adds value synthesizing/resolving across the pieces — including multi-lens **review / audit / research** (even read-only) | **Team** — continue |
| Independent, results-only, no cross-piece synthesis needed | **Subagents** (cheaper) — stop, recommend these |
| Sequential, tightly coupled, or same-file edits | **Solo** — stop, recommend this |

If it isn't a team, say so and stop — forcing one is the most expensive mistake here.

## Process
1. **Analyze the repo.** Read `CLAUDE.md` / `AGENTS.md`, scan the layout and `git status` for natural **ownership areas** — a *file-set* per area for build/edit work, or a *domain/lens* (brand, a11y, copy…) for review/analysis. Note invariants and any load-bearing facts that live *outside* CLAUDE.md. Each area = one role; merge thin ones (3–5 roles typical).
2. **Resolve the scope fork, then ask only what you can't infer (1–3 questions max).** For any review/audit/build team the load-bearing fork is **findings-only vs also-fix** — "also-fix" makes teammates edit code (→ plan approval) and changes the deliverable. Also clarify the goal if unclear. Don't interrogate; don't ask team size when it's obvious.
3. **Draft the lean plan** (format below): one role per ownership area, each with a **concrete, named deliverable**. Add an escalation only when its trigger fires.
4. **Ask where to save.** Slug = kebab-case of the goal, ≤4 words (e.g. `review-landing-page`). Let the user pick (Enter = default; if non-interactive, use the default):
   - `.claude/team-plans/<slug>.md` — scratch, gitignored *(default)*
   - `docs/team-playbooks/<slug>.md` — committed, reusable playbook
   - a custom path
   On first use of the scratch path, add `.claude/team-plans/` to `.gitignore`.
5. **Write the plan, then hand off.** Tell the user to review/edit it and run `/agent-team:launch-team <slug>`.

## Plan format (lean by default)
```md
# Team plan: <goal>
Spawn <N> teammates using Sonnet to <goal>:
- <role>: owns <file-set OR domain/lens> → <concrete deliverable>
- <role>: owns <…> → <…>
Wait for them, then synthesize <one output>.

## Notes
<why a team here; which escalations fired and why>
```
**Name the deliverable concretely.** For a review that's *"a prioritized findings list (severity + file location + fix),"* not bare "findings" — a vague deliverable lets teammates drift.

Add escalations **inline, above `## Notes`** — only when the trigger is true:

| Add this line | Only if |
|---|---|
| `Seams: <who messages whom, where>` | roles hand work across a shared boundary |
| `Plan approval: <criteria; red lines>` | teammates will edit code / schema / a risky path (i.e. "also-fix") |
| `Context(<role>): <facts>` | a teammate needs a fact NOT in CLAUDE.md — inject load-bearing facts/conflicts inline; for a long doc, point to it (`required reading: <path>`) |

Front-loading all three every time is the unreadable wall people complain about. Start lean.

## Key facts to bake in
- Teammates inherit CLAUDE.md + skills but **not** the lead's model or chat history → write `using Sonnet` and put task-specific facts in the plan.
- **One owner per area** (file-set or domain) — overlap is how teammates collide or double-count findings.
- ~7× a normal session; 3–5 roles, ~5–6 tasks each.
- A high-stakes synthesis (e.g. a launch go/no-go) can justify a stronger **lead** model even when teammates run Sonnet.

## Common mistakes
- Forcing a team when subagents or solo fit → wasted ~7× tokens.
- Vague deliverable ("help with X", a bare "findings") → drift. Name the artifact each role produces.
- Front-loading every escalation → the unreadable prompt people complain about. Lean first.
