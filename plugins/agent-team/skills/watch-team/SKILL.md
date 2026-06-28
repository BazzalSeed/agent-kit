---
name: watch-team
description: Use to open a live, read-only monitor of a running Claude Code agent team — its mandates, lead↔teammate messages, and build progress — or to reopen the monitor for a team already running.
---

# Watch a team

Open a local browser monitor for an agent team. **Read-only** — it observes the files Claude Code already writes; it never messages the team. **`launch-team` invokes this automatically as its last step**, so the monitor is already up after a launch; run `watch-team` yourself to **re-open** it (a closed tab, a new session attaching to a still-running team, or a team launched some other way). Re-running is safe and idempotent — it reopens the existing monitor rather than starting a second one.

## Process
1. **Find the team.** If you're in the lead session, use this session's id. Otherwise let the monitor auto-discover: it scans `~/.claude/teams/session-*` and picks the active one (lists them if several — ask which).
2. **Check for an existing monitor.** If `.claude/team-runs/<sessionId>.lock` exists and its `url` responds, the monitor is already running (e.g. you started it earlier) — just reopen that URL in the browser instead of starting a second one.
3. **Start it.** Run, from the repo root:
   ```bash
   node "<plugin>/monitor/watch.mjs" --open
   ```
   (Add `--team session-<id>` to target a specific team, `--session <leadSessionId>` if discovery can't infer it.) The command prints the URL and keeps running in the background; it serves the UI and tails the team's files every ~400ms.
4. **Report the URL** to the user. The monitor keeps running until the user stops it (Ctrl-C / closes the process); it does **not** shut the team down.

## Notes
- Mandates, per-teammate role, and model come from the breadcrumb `launch-team` writes at spawn (`.claude/team-runs/<sessionId>.meta.json`). Without it, the monitor still shows roster (from `config.json`), comms, and progress.
- Liveness is inferred from file mtimes — no settings or hooks are changed.
- The durable record (`.claude/team-runs/<sessionId>.jsonl`) survives session end, so the monitor still renders after the team is gone (read-only "ended").
