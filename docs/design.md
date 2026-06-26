# Design — `agent-team` plugin

## Goal
Help a user design and launch a **high-leverage** Claude Code agent team — without forcing a team where it doesn't belong, and without the verbose, always-on prompt ceremony that makes team prompts unreadable.

## The corrected agent-team template (research-grounded)
Cross-checked against the [official agent-teams docs](https://code.claude.com/docs/en/agent-teams). Two things many community templates get wrong:

1. **The feature got leaner (Claude Code v2.1.178+).** Every session has one *implicit* team; the `TeamCreate`/`TeamDelete` tools were removed; the `team_name` param is ignored. So `"Create a team of N…"` is now *ceremony, not mechanism*. Cleanup is partial-automatic: on exit the **team config** is removed but the **task list persists** (`cleanupPeriodDays`) so resumes keep tasks. Teammates inherit the lead's **effort** (universally for in-process; for split-pane backends since v2.1.186) — but **not** the **model**, which is set per role or via `/config`.
2. **The thinking matters; the verbosity doesn't.** What earns its place: the goal, per-role **ownership + deliverable**, and — *only when relevant* — seams, plan-approval criteria, and per-role context. What makes templates unreadable is front-loading all of that every time.

**Lean default:**
```
Lead: <model>            # only if synthesis warrants more than your session model
Spawn <N> teammates to <goal>:
- <role> (<model>): owns <file-set OR domain/lens> → <deliverable>
- <role> (<model>): owns <…> → <…>
Wait for them, then synthesize <one output>.
```
Model is **per role**, suggested but grounded in the spawnable set (`haiku`/`sonnet`/`opus`/`fable`; default `sonnet`) and overridable by editing the token. Escalate **only on trigger**: `Seams:` (roles interact — partner names matter), `Plan approval:` (touches code/schema/risky paths), `Context(<role>):` (a fact not in CLAUDE.md).

## Two skills, one reviewable seam between them
- **`plan-team`** — analyze repo → ask 1–3 questions → propose the lean plan → **one location prompt** (default `.claude/team-plans/<slug>.md` scratch; or `docs/team-playbooks/<slug>.md` committed; or custom) → write it.
- **`launch-team`** — enablement check → read the plan → spawn one named teammate per role → wait (don't work solo) → synthesize.

The split exists so there is a **reviewable, editable artifact before the (much larger) team spend** — each teammate is a full Claude session. `launch-team` carries zero promotion logic — it just reads whatever path the plan lives at.

## Key facts encoded in both skills
- Teammates inherit `CLAUDE.md` + MCP servers + skills + the lead's **effort**, but **not** model and **not** chat history.
- **Model is per role** (suggested, grounded in the spawnable set; default `sonnet`), overridable by editing the plan; optional `Lead:` line for a high-stakes synthesis.
- **Permissions:** teammates inherit the lead's mode; **the default is not bypass** — bypass / `--dangerously-skip-permissions` is a deliberate per-task opt-in, never automatic.
- Much more expensive than a single session; 3–5 roles, ~5–6 tasks each; one owner per area.
- No nested teams; one team at a time; lead coordinates, never works solo. `/resume` doesn't restore in-process teammates.

## Packaging
A single plugin `agent-team` in the `agent-kit` marketplace. Manifest lives at `plugins/agent-team/.claude-plugin/plugin.json` (the manifest **must** be inside `.claude-plugin/`); skills live at the plugin root under `skills/<name>/SKILL.md`.
