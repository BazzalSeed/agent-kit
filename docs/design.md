# Design — `agent-team` plugin

## Goal
Help a user design and launch a **high-leverage** Claude Code agent team — without forcing a team where it doesn't belong, and without the verbose, always-on prompt ceremony that makes team prompts unreadable.

## The corrected agent-team template (research-grounded)
Cross-checked against the [official agent-teams docs](https://code.claude.com/docs/en/agent-teams). Two things many community templates get wrong:

1. **The feature got leaner (Claude Code v2.1.178+).** Every session has one *implicit* team; the `TeamCreate`/`TeamDelete` tools were removed; cleanup is **automatic** on session exit; the `team_name` param is ignored. So `"Create a team of N…"` and `"Clean up the team"` are now *ceremony, not mechanism*. (Effort level is inherited as of v2.1.186; **model is not** — set it in `/config` or the spawn prompt.)
2. **The thinking matters; the verbosity doesn't.** What earns its place: the goal, per-role **ownership + deliverable**, and — *only when relevant* — seams, plan-approval criteria, and per-role context. What makes templates unreadable is front-loading all of that every time.

**Lean default:**
```
Spawn <N> teammates using Sonnet to <goal>:
- <role>: owns <area/files> → <deliverable>
- <role>: owns <area/files> → <deliverable>
Wait for them, then synthesize <one output>.
```
Escalate **only on trigger**: `Seams:` (roles interact), `Plan approval:` (touches code/schema/risky paths), `Context(<role>):` (a fact not in CLAUDE.md).

## Two skills, one reviewable seam between them
- **`plan-team`** — analyze repo → ask 1–3 questions → propose the lean plan → **one location prompt** (default `.claude/team-plans/<slug>.md` scratch; or `docs/team-playbooks/<slug>.md` committed; or custom) → write it.
- **`launch-team`** — enablement check → read the plan → spawn one named teammate per role → wait (don't work solo) → synthesize.

The split exists so there is a **reviewable, editable artifact before the ~7× spend**. `launch-team` carries zero promotion logic — it just reads whatever path the plan lives at.

## Key facts encoded in both skills
- Teammates inherit `CLAUDE.md` + MCP + skills + effort, but **not** model and **not** chat history.
- ~7× the tokens of a single session; 3–5 roles, ~5–6 tasks each; one owner per file-set.
- No nested teams; one team at a time; lead coordinates, never works solo.

## Packaging
A single plugin `agent-team` in the `agent-kit` marketplace. Manifest lives at `plugins/agent-team/.claude-plugin/plugin.json` (the manifest **must** be inside `.claude-plugin/`); skills live at the plugin root under `skills/<name>/SKILL.md`.
