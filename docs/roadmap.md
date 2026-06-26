# Roadmap

## v0.1 (now)
- `agent-team` plugin: `plan-team` + `launch-team`.

## Intentionally not built yet
- **`team-or-not` reference skill** — a standalone cheatsheet for "team vs subagent vs solo" + canned playbook patterns. For now that decision lives inside `plan-team`'s first step.
- **Lifecycle hooks** — quality gates via `TeammateIdle` / `TaskCreated` / `TaskCompleted` (e.g. block "done" while tests fail). Powerful but project-specific; out of scope for a general plugin.
- **More plugins** — `pr-review`, `design-review`, `debug-prod-incident`, etc. The marketplace is built to hold them.

## Longer term
- **Cross-runtime core.** Keep each skill's logic portable so `agent-kit` can target Codex, Pi, and other agent runtimes, not just Claude Code — sharing the core decision logic across runtimes rather than re-authoring per tool.
