# agent-team monitor — design spec

**Date:** 2026-06-27
**Status:** approved design, pre-implementation
**Scope:** a read-only observability UI for a running Claude Code agent team, shipped in the `agent-team` plugin.

---

## 1. Problem

When an agent team runs, the most decision-relevant information is invisible:

- **what the team is aiming at** (the mandates / end-state),
- **what the lead and teammates are saying** to each other,
- **how far along the build is.**

Claude Code's built-in surfaces (`/agents`, the agent panel, tmux split-panes) show task *status* and let you open a teammate's terminal, but none present the **mandates**, the **message traffic**, or a **progress view**. This plugin fills that gap.

## 2. Goal

A local, zero-dependency monitor — started by a dedicated `watch-team` skill — that reads the files Claude Code already writes and renders, in near-real-time:

1. **Team structure** — roster, role, model, live/idle.
2. **Mandates** — the bulleted end-state held by the lead.
3. **Communications** — role-centric message threads (lead ⇄ teammate).
4. **Build progress** — derived from the shared task list, dependency-aware.

Read-only. Light/dark, matching the author's personal design system.

## 3. Key decisions (settled during brainstorming)

| # | Decision | Rationale |
|---|---|---|
| D1 | **Read-only**, no message-sending | No supported external write API; direct inbox writes race with Claude; the lead terminal is the designed steering channel. |
| D2 | **`watch-team` is the only launcher**; `launch-team` does **not** start any UI | Keeps `launch-team` pure orchestration (decision "b"); no server/browser side effect on every launch. |
| D3 | **Comms source = transcripts, not inboxes** | Inboxes drain on read (empirically: 0 retained read-messages on disk) and are deleted at session end. Transcripts are append-only and persistent. |
| D4 | **Role-centric UI** (pick a role → read its thread), not a comms graph | Empirically the team runs hub-and-spoke: **0 / 738** messages were teammate↔teammate. Peer messaging is *supported* by Claude Code but does not occur in practice. |
| D5 | **`launch-team` writes a session-keyed breadcrumb** `.claude/team-runs/<session-id>.meta.json` with mandates + per-teammate role + model | `config.json` carries none of these. Metadata write only — not a UI side effect, so D2 holds. |
| D6 | **Single zero-dependency Node file** (`fs` + `http` + SSE), HTML inlined/sibling | The hard part (getting data out) is solved by `fs.read`; a framework adds cost without buying anything. Plugin stays otherwise pure-markdown. |
| D7 | **Mandates redefined**: multi-bullet end-state (was a one-sentence Ship goal) | Requires a `plan-team` change; see §8. |

## 4. Data sources (verified against on-disk `~/.claude`)

Each field is read from its cleanest source. The map below reflects the **actual** on-disk schema (an earlier assumption that `config.json` held `members[].prompt` / `model` / `isActive` was checked and found **false**).

| Need | Source | Notes |
|---|---|---|
| Roster + role | `~/.claude/teams/session-<id>/config.json` → `members[]` | Fields present: `agentId, name, agentType, joinedAt, tmuxPaneId, cwd, subscriptions, backendType`. `agentType` (e.g. `agent-team:backend`) is the role/persona. |
| **Mandates, model, human role** | `.claude/team-runs/<session-id>.meta.json` (breadcrumb, D5) | Written by `launch-team` at spawn; the only reliable source for these three. Fallback: parse spawn-prompt from lead transcript. |
| Communications | lead transcript `~/.claude/projects/<proj>/<session-id>.jsonl` + teammate transcripts `…/<session-id>/subagents/agent-<id>.jsonl` | Extract `SendMessage` tool-use entries: sender = transcript owner; `to`/`recipient` = destination; `message`/`content` = body; `type`. |
| Build progress | `~/.claude/tasks/session-<id>/<n>.json` | Fields: `id, subject, description, activeForm, status, blocks, blockedBy`. Persistent. **No `owner`** in the solo sample — see open risk OR-2. |
| Live/idle | transcript mtimes + folder existence (+ optional `TeammateIdle` hook) | See §6. |

**Team discovery:** `watch-team` runs in the lead session and knows its `session-id` → points the recorder at the exact folders. Standalone fallback: glob `~/.claude/teams/session-*`, pick the one whose `leadSessionId`/recency indicates the active team; list if several.

### 4a. CORRECTIONS from the first live run (2026-06-27)

The table above was written from a *solo* sample and the pre-implementation design; a real 3-teammate run corrected several load-bearing assumptions. The implementation reflects **this** reality:

- **`config.json` is much richer than "§4 false" claimed.** Each member *does* carry `prompt`, `model`, `agentType`, `isActive`, `color`, `tmuxPaneId`; the top level carries `leadSessionId`, `leadAgentId`, `createdAt`. Roster/role/model/liveness are all derivable straight from config; the breadcrumb remains the clean source only for **mandates** (and as a fallback).
- **Comms discovery was wrong and is now `teamName`-based.** There are **no `<leadSessionId>/subagents/` dirs**, and `leadSessionId` names **no transcript file** (the lead runs in-process under the chat-session id, a different uuid). Each tmux teammate runs in its **own top-level `<uuid>.jsonl`**, and **every line is tagged `teamName` + `agentName`**. The recorder discovers a team's transcripts by scanning the project dir for files whose lines carry the target `teamName`, attributing each message's `from` via `agentName`.
- **The lead transcript is never read.** Lead→teammate messages are **mirrored into each teammate transcript** as a `type:user` envelope `<teammate-message teammate_id="team-lead" …>BODY</teammate-message>`. `extractMessages` parses both the outgoing `SendMessage` tool-uses and these incoming envelopes, so both directions are reconstructed from teammate transcripts alone. Cross-file duplicates (a teammate→teammate message is outgoing in one file and incoming in another) collapse via a timestamp-less dedup key.
- **OR-2 resolved: task `owner` IS populated** once a teammate claims a task (`TaskUpdate owner=`); it is `null` only for unclaimed tasks. Per-teammate progress works from the `owner` field directly.
- **Task `status` is `in_progress` (underscore), not `in-progress`.** Both the progress derivation and the viewer were keyed on the hyphen form and corrected.
- **The lead is named `team-lead`** in all routing (not `lead`); viewer lead-detection corrected, and `team-lead` is excluded from the teammate rail (it is rendered as the dedicated lead row).

## 5. Architecture

```
Claude Code (team running)
   │  writes JSON + appends transcripts
   ▼
~/.claude/teams|tasks|projects/…   +   .claude/team-runs/<id>.meta.json (breadcrumb)
   │
   │  ① recorder: tail transcripts (offset per file) + poll task files + read config/meta
   ▼
.claude/team-runs/<id>.jsonl   (durable, append-only mirror — survives session end)
   │
   │  ② server: serves viewer + SSE stream of new events
   ▼
browser:  [Build progress] [team-lead] [teammate threads]  +  pinned mandates
```

Two units, one process (`monitor/watch.mjs`):

- **Recorder** — for transcripts (append-only) track a **byte offset per file** and parse newly appended lines (no mutation, no dedup race). Poll task files (mutable, but persistent) on an interval and diff. Read `config.json` + breadcrumb for roster/mandates. Mirror all normalized events to `.claude/team-runs/<id>.jsonl` so the record outlives the session.
- **Server** — static viewer page + an SSE endpoint pushing new events. Writes `url` + `pid` to `.claude/team-runs/<id>.lock`.

## 6. Live/idle detection

No `isActive` field exists, so liveness is **inferred passively from file mtimes — the zero-setup route.** This is the **sole** mechanism in v1: it mutates nothing, requires no config, and works the instant `watch-team` runs.

- **Per-teammate:** mtime of `…/subagents/agent-<id>.jsonl` (mapped via `config.json` `agentId→name`).
  - touched < ~30s ago → **active**; quiet 30s–few min → **idle** ("quiet", a visual proxy); thresholds tunable.
  - Accepted imprecision: a teammate mid-long-operation may briefly read idle until its next transcript append; it self-corrects.
- **Whole team:** team folder exists + lead-transcript mtime. Folder deleted → session ended → monitor flips to **read-only "ended"** mode on the last durable snapshot.
- **Deliberately NOT used in v1:**
  - The `TeammateIdle` hook — gives precise idle transitions but requires a **`settings.json` mutation** (permission prompt) and, once installed, fires for *every* team in *every* session as an always-on side effect, even when not monitoring. The marginal precision isn't worth that persistent footprint; the easy, side-effect-free mtime route wins. (Revisitable later as an explicit opt-in, never auto-installed.)
  - `tmuxPaneId` probing — couples to tmux internals for marginal gain.

## 7. UI

- **Design system** copied from `~/projects/bazzalseed.github.io`: CSS variables for light (`#faf8f4`/`#b04a2f`) and dark (`#0d1117`/`#3fb950`), JetBrains Mono headings + Inter body, accent `::selection`, frosted sticky header. **Theme toggle:** `data-theme` on `<html>`, **auto-detects** `prefers-color-scheme`, click is an in-memory override (never persisted), OS change wins; moon in light / sun in dark.
- **Layout:** left rail = navigation, right pane = selected view.
  - Rail (top→bottom): **Build progress** (pinned, shows live %), **team-lead**, then each **teammate** (role + model + live dot + last-message preview + an "approve" flag when an approval is pending), then **mandates** (pinned, collapsible).
  - **Build progress pane** (default view): segmented bar (done/in-progress/blocked/up-next) + dependency-aware task groups (*In progress · Blocked-by-X · Up next · Done*), each task showing `activeForm`, `blockedBy`, and an owner pill.
  - **team-lead pane:** chronological overview of every lead⇄teammate message.
  - **teammate pane:** two-sided thread (lead vs teammate), badges for `gate`/`approval`/`done`/`relay`.
- **Mandates** stay pinned in the rail (always-on north star), collapsible; optionally also surfaced atop the team-lead pane (mandates are "held by the lead"). Not a separate tab.
- Accessibility: semantic markup, `prefers-reduced-motion` respected.

## 8. Companion skill/plugin changes

- **New skill `watch-team`** — starts/attaches the monitor: resolves the active team, launches `node monitor/watch.mjs --team session-<id> --open`, idempotent via the lockfile (re-running reopens the tab rather than double-recording). No `settings.json` changes — liveness is mtime-based (§6).
- **`launch-team` edit (metadata only):** at spawn, write `.claude/team-runs/<session-id>.meta.json` = `{ sessionId, planPath?, mandates: string[], members: [{name, role, model, agentType}] }`. No UI launch.
- **`plan-team` edit:** Ship goal (one sentence) → **Mandates** (bulleted end-state held by the lead). Update wording, the table, and the `launch-team` injection that propagates them.
- **Repo:** `.gitignore` add `team-runs/`; README "Monitor" section; `roadmap.md` update.

## 9. Footprint

New: `plugins/agent-team/monitor/watch.mjs`, `plugins/agent-team/monitor/viewer.html`, `plugins/agent-team/skills/watch-team/SKILL.md`.
Edits: `launch-team/SKILL.md` (breadcrumb write), `plan-team/SKILL.md` (mandates), `README.md`, `roadmap.md`, `.gitignore`, version bump.

## 10. Testing

1. **Live probe (first task):** spawn a throwaway 2-teammate team; confirm — (a) inbox drain behavior (delete-on-read vs `read:true`) to validate the transcript-source choice; (b) whether task files carry `owner`; (c) the live/idle mtime thresholds; (d) the exact `SendMessage` + spawn-call transcript shapes.
2. Recorder unit tests: offset-tailing a growing JSONL, task-file diffing, breadcrumb + config merge, dedup.
3. End-to-end: run `watch-team` against a real team; confirm mandates, roster, threads, and progress render and update live; confirm re-running reopens without duplicating; confirm post-session read-only mode.

## 11. Open risks

- **OR-1 — transcript format coupling.** Comms + spawn-prompt parsing depend on the undocumented transcript JSONL schema (`SendMessage` shape, `subagents/` path). A Claude Code update could reshape it → parser tweak. Same coupling class as reading any `~/.claude` internal; accepted, isolated to a small adapter.
- **OR-2 — task `owner` attribution.** Per-teammate progress needs `owner` on task files; absent in the solo sample. If unset in real teams, attribute via transcript `TaskUpdate` calls (fallback) or drop per-lane progress to overall-only.
- **OR-3 — live/idle thresholds** are heuristic until the probe confirms good values. Liveness is intentionally mtime-only (no hook, no setup); accepted imprecision per §6.
- **OR-4 — breadcrumb absence.** A team launched without our `launch-team` has no `meta.json`; fall back to spawn-prompt parsing for mandates/role/model.

## 12. Out of scope (v1)

Sending messages; multi-team dashboard; historical/cross-session archive browser; auth/remote hosting; **hook-based liveness** (`TeammateIdle`) — excluded to keep liveness zero-setup and side-effect-free (§6); reshaping the plugin's "seams" guidance (noted: peer messaging is unused in practice — separate consideration).
