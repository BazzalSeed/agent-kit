---
name: plan-team
description: Use when scoping or designing a Claude Code agent team — deciding the roles, who owns which files or domains, which model each teammate runs, and each teammate's deliverable — or when unsure whether a task is worth a team versus subagents or solo work.
---

# Plan a team

## Overview
Design a high-leverage agent team **before** spending on it. Teams cost much more than a normal session — each teammate is a full Claude with its own context window — so the win comes from a tight plan: the right roles, **one owner per area**, the right model per role, a concrete deliverable each, and only the coordination ceremony the task needs. Core rule: **lean by default, escalate on trigger.** Output is a reviewable plan file that the `launch-team` skill spawns from.

## First: is a team even right?
| The work is… | Use |
|---|---|
| Independent and parallel, **and** outputs must be compared / ranked / merged across roles, or conflicting findings need resolving by a lead | **Team** — continue |
| Independent, parallel, but outputs are separate artifacts with no cross-role comparison | **Subagents** (cheaper) — stop, recommend these |
| Sequential, tightly coupled, or same-file edits | **Solo** — stop, recommend this |

If it isn't a team, say so and stop — forcing one is the most expensive mistake here.

## Process
1. **Analyze the repo.** Read `CLAUDE.md` / `AGENTS.md`, scan the layout and `git status` for natural **ownership areas** — a *file-set* per area for build/edit work, or a *domain/lens* (brand, a11y, copy…) for review/analysis. Note invariants and load-bearing facts that live *outside* CLAUDE.md. Each area = one role; merge a **thin** role (≤~3 files, or fewer than ~3 distinct deliverable items) into an adjacent one. 3–5 roles typical.
2. **Resolve the scope fork, then ask only what you can't infer (1–3 questions max).** The load-bearing fork is **findings-only vs also-fix** — infer *findings-only* unless the request says fix / patch / update / resolve; ask only if genuinely ambiguous. "Also-fix" makes teammates edit code (→ plan approval) and changes the deliverable. Also clarify the goal if unclear. Don't interrogate.
3. **Pick a model per role** (see *Models* below) and **draft the lean plan** (format below): one role per ownership area, each with a **concrete, named deliverable**. Add an escalation only when its trigger fires.
4. **Ask where to save.** Slug = kebab-case of the goal, ≤4 words (e.g. `review-landing-page`). Offer the choices (Enter = default). **If you were invoked by another agent rather than a user, skip the prompt and use the default.**
   - `.claude/team-plans/<slug>.md` — scratch, gitignored *(default)*
   - `docs/team-playbooks/<slug>.md` — committed, reusable playbook
   - a custom path
   On first use of the scratch path, add `.claude/team-plans/` to `.gitignore` **only if not already present.**
5. **Write the plan, then hand off** with the **exact path**: "review/edit it, then run `/agent-team:launch-team <path>`." If the user requests changes, revise in place and re-confirm before handing off.

## Models (suggest, but make override trivial)
Suggest a model per role, grounded in what this session can actually spawn — the Agent tool's set is **`haiku`, `sonnet`, `opus`, `fable`**; the user's plan may expose only a subset, which they can confirm with `/model`. Guidance:
- **Default `sonnet`** — the cost-fit for most coordination/review work.
- **`opus`** for heavy reasoning, or a high-stakes synthesis (set it on the `Lead:` line).
- **`haiku`** for cheap, mechanical roles (collecting, listing, simple checks).

The model is a **per-role token in the plan** — the user overrides by editing it. Don't invent model names; only suggest from the set above (or whatever `/model` shows).

## Plan format (lean by default)
```md
# Team plan: <goal>
Lead: <model>            # omit unless synthesis warrants more than your current session model
Spawn <N> teammates to <goal>:
- <role> (<model>): owns <file-set OR domain/lens> → <concrete deliverable>
- <role> (<model>): owns <…> → <…>
Wait for them, then synthesize <one output>.

## Notes
<why a team here; which escalations fired and why>
```
**Name the deliverable concretely.** For a review that's *"a prioritized findings list (severity + file location + fix),"* not bare "findings."

Add escalations **inline, above `## Notes`** — only when the trigger is true:

| Add this line | Only if |
|---|---|
| `Seams: <role-A ↔ role-B on X>` | roles hand work across a shared boundary (names matter — `launch-team` injects them) |
| `Plan approval: <criteria; red lines>` | teammates will edit code / schema / a risky path (i.e. "also-fix") |
| `Context(<role>): <facts>` | a teammate needs a fact NOT in CLAUDE.md — inject load-bearing facts inline; for a long doc, point to it (`required reading: <path>`) |

Front-loading all three every time is the unreadable wall people complain about. Start lean.

## Key facts to bake in
- Teammates inherit **CLAUDE.md, MCP servers, skills, and the lead's effort level** — but **not** the lead's model or chat history. So name a model per role and put task-specific facts in the plan.
- **One owner per area** (file-set or domain) — overlap is how teammates collide or double-count.
- **Much more expensive than one session** — each teammate is a full Claude; ~5–6 tasks per teammate.

## Common mistakes
- Forcing a team when subagents or solo fit → wasted spend.
- Vague deliverable ("help with X", a bare "findings") → drift. Name the artifact each role produces.
- One model for everything → either overpaying (opus on mechanical work) or underpowering a synthesis. Right-size per role.
- Front-loading every escalation → the unreadable prompt people complain about. Lean first.
