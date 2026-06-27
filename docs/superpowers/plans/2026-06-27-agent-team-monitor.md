# agent-team monitor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a read-only, zero-dependency local UI that watches a running Claude Code agent team and renders its mandates, lead⇄teammate comms, and build progress.

**Architecture:** A Node recorder tails the files Claude Code already writes (transcripts for comms, task JSON for progress, `config.json` for roster) plus a session-keyed breadcrumb `launch-team` writes (mandates/role/model), mirrors normalized events to a durable JSONL, and serves a single HTML viewer over HTTP+SSE. A new `watch-team` skill is the only launcher.

**Tech Stack:** Node ≥ 18 (built-ins only: `node:fs`, `node:http`, `node:path`, `node:test`, `node:assert`). No npm dependencies, no build step. ES modules (`.mjs`). Viewer is one HTML file (vanilla JS + inline CSS, Inter/JetBrains Mono via Google Fonts CDN).

## Global Constraints

- **Zero runtime dependencies.** Node standard library only. No `package.json` `dependencies`, no framework, no bundler.
- **ES modules** — all JS files are `.mjs`.
- **Tests use `node:test` + `node:assert/strict`**, run with `node --test plugins/agent-team/monitor/`.
- **Read-only.** The monitor never writes into `~/.claude/teams|tasks|projects`. It only writes under the project's `.claude/team-runs/`.
- **Design tokens (verbatim):** light `--bg:#faf8f4 --fg:#2b2722 --muted:#9c9486 --rule:#e6e0d6 --accent:#b04a2f`; dark `--bg:#0d1117 --fg:#c9d1d9 --muted:#8b949e --rule:#21262d --accent:#3fb950`. Headings JetBrains Mono, body Inter. Theme: `data-theme` on `<html>`, auto-detect `prefers-color-scheme`, click = in-memory override (never persisted), OS change wins.
- **Liveness is mtime-only** — no `settings.json` hooks.
- **Reference mockups** (final visual + behavior target), in the session scratchpad:
  - `…/scratchpad/monitor-progress.html` — the full role-centric + progress viewer to port.
- All new code lives under `plugins/agent-team/monitor/` except the skill (`plugins/agent-team/skills/watch-team/`).

---

## File Structure

- `plugins/agent-team/monitor/parse.mjs` — **pure functions**: message extraction, task/progress derivation, roster+mandates merge, liveness, incremental line reading. No IO. The testable core.
- `plugins/agent-team/monitor/sources.mjs` — **pure path logic**: resolve a team's file paths from a session id; discover the active team from a directory listing. IO injected as args (so it's testable).
- `plugins/agent-team/monitor/watch.mjs` — **entry point / IO**: CLI args, the recorder loop (tail + poll), durable mirror, HTTP+SSE server, lockfile, browser open. Thin; delegates logic to `parse.mjs`/`sources.mjs`.
- `plugins/agent-team/monitor/viewer.html` — the UI, ported from the mockup, wired to `/state` + `/events`.
- `plugins/agent-team/monitor/fixtures/` — synthetic, schema-accurate sample files for tests.
- `plugins/agent-team/monitor/*.test.mjs` — `node:test` suites.
- `plugins/agent-team/skills/watch-team/SKILL.md` — the launcher skill.
- Edits: `plugins/agent-team/skills/launch-team/SKILL.md`, `plugins/agent-team/skills/plan-team/SKILL.md`, `README.md`, `docs/roadmap.md`, `.gitignore`, `plugins/agent-team/.claude-plugin/plugin.json`.

**Normalized event shapes** (the contract every task shares):

```
Message  = { kind:'message', from, to, body, summary, type, ts }     // type: 'message'|'gate'|'approval'|'done'|'relay'|other
Task     = { id, subject, activeForm, status, blockedBy:[], owner }  // status: 'pending'|'in-progress'|'completed'
Member   = { name, role, model, agentId }
Mandates = string[]
Progress = { done, inProgress, blocked, upNext, total, byOwner:{[name]:{done,total}} }
Liveness = { team:'live'|'ended', members:{[name]:'active'|'idle'} }
```

---

### Task 1: Scaffold, fixtures, and test harness

**Files:**
- Create: `plugins/agent-team/monitor/fixtures/lead.jsonl`
- Create: `plugins/agent-team/monitor/fixtures/sub-backend.jsonl`
- Create: `plugins/agent-team/monitor/fixtures/config.json`
- Create: `plugins/agent-team/monitor/fixtures/task-1.json`, `task-2.json`, `task-3.json`
- Create: `plugins/agent-team/monitor/fixtures/meta.json`
- Create: `plugins/agent-team/monitor/smoke.test.mjs`

**Interfaces:**
- Produces: the fixture files every later test reads; confirms `node --test` runs.

- [ ] **Step 1: Create the lead transcript fixture** — `fixtures/lead.jsonl` (each line a JSON record; shapes match what we verified on disk):

```jsonl
{"type":"message","timestamp":"2026-06-27T09:13:00.000Z","message":{"role":"assistant","content":[{"type":"tool_use","name":"SendMessage","input":{"to":"backend","recipient":"backend","type":"message","summary":"start orders API","message":"architect gate green — begin the orders API. Seam partner is frontend."}}]}}
{"type":"message","timestamp":"2026-06-27T09:25:00.000Z","message":{"role":"assistant","content":[{"type":"tool_use","name":"SendMessage","input":{"to":"frontend","recipient":"frontend","type":"message","summary":"approved","message":"Approved — matches the plan. Go."}}]}}
```

- [ ] **Step 2: Create the teammate transcript fixture** — `fixtures/sub-backend.jsonl`:

```jsonl
{"type":"message","timestamp":"2026-06-27T09:14:00.000Z","message":{"role":"assistant","content":[{"type":"tool_use","name":"SendMessage","input":{"to":"team-lead","recipient":"team-lead","type":"approval","summary":"approval: orders","message":"Plan: POST/GET /orders + repo. Approve before writes?"}}]}}
{"type":"message","timestamp":"2026-06-27T09:42:00.000Z","message":{"role":"assistant","content":[{"type":"tool_use","name":"SendMessage","input":{"to":"team-lead","recipient":"team-lead","type":"relay","summary":"needs schema change","message":"Need a nullable orders.note column. Please relay to architect."}}]}}
```

- [ ] **Step 3: Create `fixtures/config.json`** (matches the verified on-disk schema — note: no `prompt`/`model`/`isActive`):

```json
{
  "name": "session-deadbeef",
  "createdAt": "2026-06-27T09:10:00.000Z",
  "leadAgentId": "lead-1",
  "leadSessionId": "deadbeef-0000-0000-0000-000000000000",
  "members": [
    {"agentId":"a-arch","name":"architect","agentType":"agent-team:architect","joinedAt":"2026-06-27T09:11:00.000Z","tmuxPaneId":"%1","cwd":"/x","subscriptions":[],"backendType":"tmux"},
    {"agentId":"a-back","name":"backend","agentType":"agent-team:backend","joinedAt":"2026-06-27T09:11:01.000Z","tmuxPaneId":"%2","cwd":"/x","subscriptions":[],"backendType":"tmux"},
    {"agentId":"a-front","name":"frontend","agentType":"agent-team:frontend","joinedAt":"2026-06-27T09:11:02.000Z","tmuxPaneId":"%3","cwd":"/x","subscriptions":[],"backendType":"tmux"}
  ]
}
```

- [ ] **Step 4: Create the task fixtures.** `fixtures/task-1.json`:

```json
{"id":"T2.1","subject":"POST /orders endpoint","description":"create order","activeForm":"","status":"completed","blocks":[],"blockedBy":[],"owner":"backend"}
```

`fixtures/task-2.json`:

```json
{"id":"T2.2","subject":"GET /orders + repo","description":"list orders","activeForm":"wiring the repo query","status":"in-progress","blocks":[],"blockedBy":[],"owner":"backend"}
```

`fixtures/task-3.json`:

```json
{"id":"T4.1","subject":"Wire dashboard to API","description":"bind UI","activeForm":"","status":"pending","blocks":[],"blockedBy":["T2.2"],"owner":"frontend"}
```

- [ ] **Step 5: Create the breadcrumb fixture** — `fixtures/meta.json`:

```json
{
  "sessionId":"deadbeef-0000-0000-0000-000000000000",
  "planPath":".claude/team-plans/ship-dashboard.md",
  "mandates":["Dashboard ships at /app, behind auth.","Orders persist to Postgres and survive reload.","Green CI on main; deploy preview live."],
  "members":[
    {"name":"architect","role":"contract & schema seam","model":"opus","agentType":"agent-team:architect"},
    {"name":"backend","role":"orders API & data","model":"sonnet","agentType":"agent-team:backend"},
    {"name":"frontend","role":"dashboard UI","model":"sonnet","agentType":"agent-team:frontend"}
  ]
}
```

- [ ] **Step 6: Write a smoke test** — `smoke.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const FIX = join(here, 'fixtures');

test('fixtures load', () => {
  const cfg = JSON.parse(readFileSync(join(FIX, 'config.json'), 'utf8'));
  assert.equal(cfg.members.length, 3);
});
```

- [ ] **Step 7: Run the suite**

Run: `node --test plugins/agent-team/monitor/`
Expected: 1 test, pass.

- [ ] **Step 8: Commit**

```bash
git add plugins/agent-team/monitor/
git commit -m "monitor: scaffold fixtures + node:test harness"
```

---

### Task 2: Message extraction (`parse.mjs`)

**Files:**
- Create: `plugins/agent-team/monitor/parse.mjs`
- Test: `plugins/agent-team/monitor/parse.messages.test.mjs`

**Interfaces:**
- Produces: `extractMessages(jsonlText: string, owner: string) => Message[]` — one `Message` per `SendMessage` tool_use in the text; `from = owner`, `to = input.to || input.recipient`, `body = input.message || input.content`, `summary = input.summary`, `type = input.type || 'message'`, `ts = record.timestamp`. Ignores non-SendMessage lines and unparseable lines.

- [ ] **Step 1: Write the failing test** — `parse.messages.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIX } from './smoke.test.mjs';
import { extractMessages } from './parse.mjs';

test('extracts SendMessage from a lead transcript', () => {
  const text = readFileSync(join(FIX, 'lead.jsonl'), 'utf8');
  const msgs = extractMessages(text, 'lead');
  assert.equal(msgs.length, 2);
  assert.deepEqual(
    { from: msgs[0].from, to: msgs[0].to, type: msgs[0].type },
    { from: 'lead', to: 'backend', type: 'message' }
  );
  assert.match(msgs[0].body, /begin the orders API/);
  assert.equal(msgs[0].ts, '2026-06-27T09:13:00.000Z');
});

test('owner becomes the sender for a teammate transcript', () => {
  const text = readFileSync(join(FIX, 'sub-backend.jsonl'), 'utf8');
  const msgs = extractMessages(text, 'backend');
  assert.equal(msgs[1].from, 'backend');
  assert.equal(msgs[1].to, 'team-lead');
  assert.equal(msgs[1].type, 'relay');
});

test('ignores blank and non-JSON lines', () => {
  assert.deepEqual(extractMessages('\nnot json\n{}\n', 'lead'), []);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test plugins/agent-team/monitor/parse.messages.test.mjs`
Expected: FAIL — `extractMessages` is not exported / module not found.

- [ ] **Step 3: Implement** — `parse.mjs`:

```js
const SENDMSG = '"SendMessage"';

export function extractMessages(jsonlText, owner) {
  const out = [];
  for (const line of jsonlText.split('\n')) {
    if (!line.includes(SENDMSG)) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    const ts = rec.timestamp || rec.ts || null;
    let content = rec.message?.content ?? rec.content ?? [];
    if (!Array.isArray(content)) content = [content];
    for (const b of content) {
      if (b && b.type === 'tool_use' && b.name === 'SendMessage') {
        const i = b.input || {};
        out.push({
          kind: 'message',
          from: owner,
          to: i.to || i.recipient || null,
          body: i.message || i.content || '',
          summary: i.summary || '',
          type: i.type || 'message',
          ts,
        });
      }
    }
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test plugins/agent-team/monitor/parse.messages.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/agent-team/monitor/parse.mjs plugins/agent-team/monitor/parse.messages.test.mjs
git commit -m "monitor: extract lead<->teammate messages from transcripts"
```

---

### Task 3: Tasks + progress derivation (`parse.mjs`)

**Files:**
- Modify: `plugins/agent-team/monitor/parse.mjs`
- Test: `plugins/agent-team/monitor/parse.progress.test.mjs`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `normalizeTask(raw) => Task` — `{ id, subject, activeForm, status, blockedBy: raw.blockedBy||[], owner: raw.owner||null }`.
  - `deriveProgress(tasks: Task[]) => Progress` — `done` = status `completed`; `inProgress` = `in-progress`; `blocked` = `pending` with non-empty `blockedBy`; `upNext` = `pending` with empty `blockedBy`; `total` = length; `byOwner[name] = { done, total }` counting only tasks with an `owner`.

- [ ] **Step 1: Write the failing test** — `parse.progress.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIX } from './smoke.test.mjs';
import { normalizeTask, deriveProgress } from './parse.mjs';

const load = n => normalizeTask(JSON.parse(readFileSync(join(FIX, n), 'utf8')));

test('derives counts and blocked vs up-next', () => {
  const tasks = [load('task-1.json'), load('task-2.json'), load('task-3.json')];
  const p = deriveProgress(tasks);
  assert.deepEqual(
    { done: p.done, inProgress: p.inProgress, blocked: p.blocked, upNext: p.upNext, total: p.total },
    { done: 1, inProgress: 1, blocked: 1, upNext: 0, total: 3 }
  );
  assert.deepEqual(p.byOwner.backend, { done: 1, total: 2 });
});

test('tasks without owner are excluded from byOwner', () => {
  const p = deriveProgress([normalizeTask({ id: 'x', subject: 's', status: 'completed' })]);
  assert.deepEqual(p.byOwner, {});
  assert.equal(p.done, 1);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test plugins/agent-team/monitor/parse.progress.test.mjs`
Expected: FAIL — exports missing.

- [ ] **Step 3: Implement** — append to `parse.mjs`:

```js
export function normalizeTask(raw) {
  return {
    id: raw.id,
    subject: raw.subject || '',
    activeForm: raw.activeForm || '',
    status: raw.status || 'pending',
    blockedBy: Array.isArray(raw.blockedBy) ? raw.blockedBy : [],
    owner: raw.owner || null,
  };
}

export function deriveProgress(tasks) {
  const p = { done: 0, inProgress: 0, blocked: 0, upNext: 0, total: tasks.length, byOwner: {} };
  for (const t of tasks) {
    if (t.status === 'completed') p.done++;
    else if (t.status === 'in-progress') p.inProgress++;
    else if (t.blockedBy.length) p.blocked++;
    else p.upNext++;
    if (t.owner) {
      const o = (p.byOwner[t.owner] ??= { done: 0, total: 0 });
      o.total++;
      if (t.status === 'completed') o.done++;
    }
  }
  return p;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test plugins/agent-team/monitor/parse.progress.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/agent-team/monitor/parse.mjs plugins/agent-team/monitor/parse.progress.test.mjs
git commit -m "monitor: derive dependency-aware build progress from task list"
```

---

### Task 4: Roster + mandates merge (`parse.mjs`)

**Files:**
- Modify: `plugins/agent-team/monitor/parse.mjs`
- Test: `plugins/agent-team/monitor/parse.roster.test.mjs`

**Interfaces:**
- Produces:
  - `buildRoster(config, meta) => Member[]` — one per `config.members`. `name = c.name`; `agentId = c.agentId`; `role` = matching `meta.members[].role` (by name) else a prettified `c.agentType` (strip `agent-team:`); `model` = matching `meta.members[].model` else `null`. `meta` may be `null`.
  - `extractMandates(meta) => string[]` — `meta?.mandates ?? []`.

- [ ] **Step 1: Write the failing test** — `parse.roster.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIX } from './smoke.test.mjs';
import { buildRoster, extractMandates } from './parse.mjs';

const cfg = JSON.parse(readFileSync(join(FIX, 'config.json'), 'utf8'));
const meta = JSON.parse(readFileSync(join(FIX, 'meta.json'), 'utf8'));

test('merges meta role+model onto config members', () => {
  const r = buildRoster(cfg, meta);
  assert.equal(r.length, 3);
  assert.deepEqual(r[1], { name: 'backend', role: 'orders API & data', model: 'sonnet', agentId: 'a-back' });
});

test('falls back to agentType when meta is missing', () => {
  const r = buildRoster(cfg, null);
  assert.equal(r[0].role, 'architect');   // from "agent-team:architect"
  assert.equal(r[0].model, null);
});

test('mandates come from meta', () => {
  assert.equal(extractMandates(meta).length, 3);
  assert.deepEqual(extractMandates(null), []);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test plugins/agent-team/monitor/parse.roster.test.mjs`
Expected: FAIL — exports missing.

- [ ] **Step 3: Implement** — append to `parse.mjs`:

```js
export function buildRoster(config, meta) {
  const byName = new Map((meta?.members || []).map(m => [m.name, m]));
  return (config.members || []).map(c => {
    const m = byName.get(c.name);
    return {
      name: c.name,
      role: m?.role || String(c.agentType || '').replace(/^agent-team:/, '') || c.name,
      model: m?.model || null,
      agentId: c.agentId,
    };
  });
}

export function extractMandates(meta) {
  return Array.isArray(meta?.mandates) ? meta.mandates : [];
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test plugins/agent-team/monitor/parse.roster.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/agent-team/monitor/parse.mjs plugins/agent-team/monitor/parse.roster.test.mjs
git commit -m "monitor: build roster + mandates from config + breadcrumb"
```

---

### Task 5: Liveness + incremental reads (`parse.mjs`)

**Files:**
- Modify: `plugins/agent-team/monitor/parse.mjs`
- Test: `plugins/agent-team/monitor/parse.live.test.mjs`

**Interfaces:**
- Produces:
  - `computeLiveness({ now, folderExists, memberMtimes, activeMs=30000 }) => Liveness` — `team` = `folderExists ? 'live' : 'ended'`; each member `'active'` if `now - mtime <= activeMs`, else `'idle'`; a member with no mtime is `'idle'`.
  - `readNewLines(prevOffset, buf: Buffer) => { lines: string[], offset: number }` — returns complete newline-terminated lines after `prevOffset` and the new offset (start of any trailing partial line). Used for byte-offset transcript tailing.

- [ ] **Step 1: Write the failing test** — `parse.live.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeLiveness, readNewLines } from './parse.mjs';

test('liveness from mtimes', () => {
  const now = 1_000_000;
  const l = computeLiveness({ now, folderExists: true, memberMtimes: { a: now - 5000, b: now - 90000 }, activeMs: 30000 });
  assert.equal(l.team, 'live');
  assert.equal(l.members.a, 'active');
  assert.equal(l.members.b, 'idle');
});

test('missing folder => ended', () => {
  assert.equal(computeLiveness({ now: 1, folderExists: false, memberMtimes: {} }).team, 'ended');
});

test('readNewLines returns whole lines and a stable offset on partial tail', () => {
  const buf = Buffer.from('aaa\nbbb\nccc');     // "ccc" has no newline yet
  const r = readNewLines(0, buf);
  assert.deepEqual(r.lines, ['aaa', 'bbb']);
  assert.equal(r.offset, 8);                     // start of "ccc"
  const r2 = readNewLines(r.offset, Buffer.from('aaa\nbbb\nccc\n'));
  assert.deepEqual(r2.lines, ['ccc']);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test plugins/agent-team/monitor/parse.live.test.mjs`
Expected: FAIL — exports missing.

- [ ] **Step 3: Implement** — append to `parse.mjs`:

```js
export function computeLiveness({ now, folderExists, memberMtimes, activeMs = 30000 }) {
  const members = {};
  for (const [name, mtime] of Object.entries(memberMtimes || {}))
    members[name] = (mtime != null && now - mtime <= activeMs) ? 'active' : 'idle';
  return { team: folderExists ? 'live' : 'ended', members };
}

export function readNewLines(prevOffset, buf) {
  const slice = buf.subarray(prevOffset);
  const text = slice.toString('utf8');
  const lastNl = text.lastIndexOf('\n');
  if (lastNl < 0) return { lines: [], offset: prevOffset };
  const complete = text.slice(0, lastNl);
  const lines = complete.split('\n').filter(l => l.length > 0);
  return { lines, offset: prevOffset + Buffer.byteLength(complete, 'utf8') + 1 };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test plugins/agent-team/monitor/parse.live.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/agent-team/monitor/parse.mjs plugins/agent-team/monitor/parse.live.test.mjs
git commit -m "monitor: mtime liveness + byte-offset line tailing"
```

---

### Task 6: Path resolution + active-team discovery (`sources.mjs`)

**Files:**
- Create: `plugins/agent-team/monitor/sources.mjs`
- Test: `plugins/agent-team/monitor/sources.test.mjs`

**Interfaces:**
- Produces:
  - `teamDir(name) => string` and `tasksDir(name) => string` — `~/.claude/teams/<name>` and `~/.claude/tasks/<name>` (use `os.homedir()`).
  - `transcriptPaths(projectsRoot, sessionId) => { lead, subDir }` — lead = `<projectsRoot>/<slug>/<sessionId>.jsonl` where `<slug>` is discovered by which subdir contains `<sessionId>.jsonl`; `subDir` = `<...>/<sessionId>/subagents`. Takes a `listDir(path)=>string[]` injected for testability.
  - `pickActiveTeam(names, statFolder) => string|null` — given team folder names and a `statFolder(name)=>{mtimeMs}|null`, return the most recently modified existing team, else `null`.

- [ ] **Step 1: Write the failing test** — `sources.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { teamDir, pickActiveTeam } from './sources.mjs';
import os from 'node:os';
import { join } from 'node:path';

test('teamDir resolves under home', () => {
  assert.equal(teamDir('session-x'), join(os.homedir(), '.claude', 'teams', 'session-x'));
});

test('pickActiveTeam chooses newest existing', () => {
  const stat = n => ({ 'session-a': { mtimeMs: 10 }, 'session-b': { mtimeMs: 20 } }[n] || null);
  assert.equal(pickActiveTeam(['session-a', 'session-b', 'session-gone'], stat), 'session-b');
  assert.equal(pickActiveTeam(['session-gone'], () => null), null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test plugins/agent-team/monitor/sources.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — `sources.mjs`:

```js
import os from 'node:os';
import { join } from 'node:path';

const home = () => os.homedir();
export const teamDir = name => join(home(), '.claude', 'teams', name);
export const tasksDir = name => join(home(), '.claude', 'tasks', name);

export function transcriptPaths(projectsRoot, sessionId, listDir) {
  for (const slug of listDir(projectsRoot)) {
    const dir = join(projectsRoot, slug);
    if (listDir(dir).includes(`${sessionId}.jsonl`)) {
      return { lead: join(dir, `${sessionId}.jsonl`), subDir: join(dir, sessionId, 'subagents') };
    }
  }
  return { lead: null, subDir: null };
}

export function pickActiveTeam(names, statFolder) {
  let best = null, bestM = -Infinity;
  for (const n of names) {
    const s = statFolder(n);
    if (s && s.mtimeMs > bestM) { best = n; bestM = s.mtimeMs; }
  }
  return best;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test plugins/agent-team/monitor/sources.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/agent-team/monitor/sources.mjs plugins/agent-team/monitor/sources.test.mjs
git commit -m "monitor: team path resolution + active-team discovery"
```

---

### Task 7: Recorder loop + durable mirror (`watch.mjs`)

**Files:**
- Create: `plugins/agent-team/monitor/watch.mjs`
- Test: `plugins/agent-team/monitor/recorder.test.mjs`

**Interfaces:**
- Consumes: all of `parse.mjs` + `sources.mjs`.
- Produces (exported from `watch.mjs` for testing):
  - `class Recorder { constructor({teamName, projectsRoot, sessionId, runDir}); poll(): void; getState(): {team, members, mandates, messages, tasks, progress, liveness}; onEvent(cb) }` — `poll()` reads config/meta, tails transcripts (lead + each `subagents/*.jsonl`) via byte offsets, reads task files, recomputes state, appends new messages to `<runDir>/<sessionId>.jsonl`, and fires `onEvent` for each new message. Pure-ish: all FS via `node:fs` but driven by explicit `poll()` calls (no timer) so tests can step it.

- [ ] **Step 1: Write the failing test** — `recorder.test.mjs` (drives the recorder against a temp dir built from fixtures):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FIX } from './smoke.test.mjs';
import { Recorder } from './watch.mjs';

function scaffold() {
  const root = mkdtempSync(join(tmpdir(), 'mon-'));
  const teamDir = join(root, 'teams', 'session-deadbeef');
  const projects = join(root, 'projects');
  const projSlug = join(projects, 'proj');
  const subs = join(projSlug, 'deadbeef-0000-0000-0000-000000000000', 'subagents');
  const tasks = join(root, 'tasks', 'session-deadbeef');
  const runDir = join(root, 'team-runs');
  [teamDir, subs, tasks, runDir].forEach(d => mkdirSync(d, { recursive: true }));
  copyFileSync(join(FIX, 'config.json'), join(teamDir, 'config.json'));
  copyFileSync(join(FIX, 'meta.json'), join(runDir, 'deadbeef-0000-0000-0000-000000000000.meta.json'));
  copyFileSync(join(FIX, 'lead.jsonl'), join(projSlug, 'deadbeef-0000-0000-0000-000000000000.jsonl'));
  copyFileSync(join(FIX, 'sub-backend.jsonl'), join(subs, 'agent-a-back.jsonl'));
  ['task-1.json','task-2.json','task-3.json'].forEach((f,i)=>copyFileSync(join(FIX,f), join(tasks, `${i+1}.json`)));
  return { root, projects, runDir, leadFile: join(projSlug, 'deadbeef-0000-0000-0000-000000000000.jsonl') };
}

test('recorder aggregates messages, roster, mandates, progress', () => {
  const s = scaffold();
  const rec = new Recorder({
    teamRoot: join(s.root, 'teams'), tasksRoot: join(s.root, 'tasks'),
    teamName: 'session-deadbeef', projectsRoot: s.projects,
    sessionId: 'deadbeef-0000-0000-0000-000000000000', runDir: s.runDir,
  });
  rec.poll();
  const st = rec.getState();
  assert.equal(st.members.length, 3);
  assert.equal(st.mandates.length, 3);
  assert.equal(st.progress.total, 3);
  assert.ok(st.messages.length >= 4);              // 2 lead + 2 backend
  assert.ok(st.messages.some(m => m.from === 'backend' && m.type === 'relay'));
});

test('only newly appended messages fire onEvent on the next poll', () => {
  const s = scaffold();
  const rec = new Recorder({
    teamRoot: join(s.root, 'teams'), tasksRoot: join(s.root, 'tasks'),
    teamName: 'session-deadbeef', projectsRoot: s.projects,
    sessionId: 'deadbeef-0000-0000-0000-000000000000', runDir: s.runDir,
  });
  rec.poll();
  const seen = [];
  rec.onEvent(m => seen.push(m));
  appendFileSync(s.leadFile, JSON.stringify({type:'message',timestamp:'2026-06-27T10:00:00.000Z',message:{role:'assistant',content:[{type:'tool_use',name:'SendMessage',input:{to:'architect',type:'message',summary:'apply',message:'apply orders.note'}}]}}) + '\n');
  rec.poll();
  assert.equal(seen.length, 1);
  assert.equal(seen[0].to, 'architect');
  const durable = readFileSync(join(s.runDir, 'deadbeef-0000-0000-0000-000000000000.jsonl'), 'utf8').trim().split('\n');
  assert.ok(durable.length >= 5);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test plugins/agent-team/monitor/recorder.test.mjs`
Expected: FAIL — `watch.mjs`/`Recorder` not found.

- [ ] **Step 3: Implement** — `watch.mjs` (Recorder class + helpers; server/CLI added in Task 8):

```js
import { readFileSync, readdirSync, existsSync, statSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { extractMessages, normalizeTask, deriveProgress, buildRoster, extractMandates, computeLiveness, readNewLines } from './parse.mjs';
import { transcriptPaths } from './sources.mjs';

const readJSON = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const listJSON = d => { try { return readdirSync(d).filter(f => f.endsWith('.json')); } catch { return []; } };
const mtimeOf = p => { try { return statSync(p).mtimeMs; } catch { return null; } };
const msgKey = m => `${m.ts}|${m.from}|${m.to}|${m.summary}`;

export class Recorder {
  constructor(o) {
    this.o = o;
    this.offsets = new Map();      // file -> byte offset
    this.seen = new Set();         // msgKey
    this.messages = [];
    this.cbs = [];
    this.state = { team: o.teamName, members: [], mandates: [], messages: [], tasks: [], progress: null, liveness: null };
    mkdirSync(o.runDir, { recursive: true });
    this.runFile = join(o.runDir, `${o.sessionId}.jsonl`);
  }
  onEvent(cb) { this.cbs.push(cb); }
  _teamDir() { return join(this.o.teamRoot, this.o.teamName); }
  _ingest(file, owner) {
    if (!existsSync(file)) return;
    const buf = readFileSync(file);
    const prev = this.offsets.get(file) || 0;
    if (buf.length < prev) this.offsets.set(file, 0);   // file shrank/rotated
    const { lines, offset } = readNewLines(this.offsets.get(file) || 0, buf);
    this.offsets.set(file, offset);
    for (const line of lines)
      for (const m of extractMessages(line, owner)) {
        const k = msgKey(m);
        if (this.seen.has(k)) continue;
        this.seen.add(k);
        this.messages.push(m);
        appendFileSync(this.runFile, JSON.stringify(m) + '\n');
        for (const cb of this.cbs) cb(m);
      }
  }
  poll() {
    const dir = this._teamDir();
    const folderExists = existsSync(dir);
    const config = readJSON(join(dir, 'config.json')) || { members: [] };
    const meta = readJSON(join(this.o.runDir, `${this.o.sessionId}.meta.json`));
    const members = buildRoster(config, meta);
    const mandates = extractMandates(meta);

    const { lead, subDir } = transcriptPaths(this.o.projectsRoot, this.o.sessionId, p => { try { return readdirSync(p); } catch { return []; } });
    if (lead) this._ingest(lead, 'lead');
    const idToName = new Map((config.members || []).map(m => [m.agentId, m.name]));
    const memberMtimes = {};
    if (subDir && existsSync(subDir)) {
      for (const f of readdirSync(subDir)) {
        if (!f.endsWith('.jsonl')) continue;
        const agentId = f.replace(/^agent-/, '').replace(/\.jsonl$/, '');
        const name = idToName.get(agentId) || agentId;
        const fp = join(subDir, f);
        this._ingest(fp, name);
        memberMtimes[name] = mtimeOf(fp);
      }
    }

    const tasks = listJSON(join(this.o.tasksRoot, this.o.teamName))
      .map(f => readJSON(join(this.o.tasksRoot, this.o.teamName, f)))
      .filter(Boolean).map(normalizeTask);

    this.state = {
      team: this.o.teamName, members, mandates,
      messages: this.messages.slice().sort((a, b) => String(a.ts).localeCompare(String(b.ts))),
      tasks, progress: deriveProgress(tasks),
      liveness: computeLiveness({ now: Date.now(), folderExists, memberMtimes }),
    };
  }
  getState() { return this.state; }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test plugins/agent-team/monitor/recorder.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the whole suite (regression)**

Run: `node --test plugins/agent-team/monitor/`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add plugins/agent-team/monitor/watch.mjs plugins/agent-team/monitor/recorder.test.mjs
git commit -m "monitor: recorder aggregates state + durable mirror"
```

---

### Task 8: HTTP + SSE server, lockfile, CLI (`watch.mjs`)

**Files:**
- Modify: `plugins/agent-team/monitor/watch.mjs`
- Test: `plugins/agent-team/monitor/server.test.mjs`

**Interfaces:**
- Consumes: `Recorder`.
- Produces:
  - `startServer({ recorder, port=0, viewerPath }) => { server, port, url }` — routes: `GET /` → `viewer.html`; `GET /state` → `JSON.stringify(recorder.getState())`; `GET /events` → SSE, pushing `data: <json message>\n\n` on each `recorder.onEvent`.
  - `main(argv)` — parses `--team`, `--session`, `--projects`, `--run-dir`, `--port`, `--open`; resolves the team (explicit `--team`, else discover via `pickActiveTeam`); constructs `Recorder`; `setInterval(()=>recorder.poll(), 400)`; `startServer`; writes `<runDir>/<sessionId>.lock` = `{url,pid}`; if `--open`, `open <url>` via `child_process`. Guarded by `if (import.meta.url === \`file://${process.argv[1]}\`) main(process.argv)`.

- [ ] **Step 1: Write the failing test** — `server.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from './watch.mjs';

const fakeRecorder = {
  _cbs: [],
  getState: () => ({ team: 'session-x', members: [], mandates: ['ship it'], messages: [], tasks: [], progress: { total: 0 }, liveness: { team: 'live', members: {} } }),
  onEvent(cb) { this._cbs.push(cb); },
  emit(m) { this._cbs.forEach(cb => cb(m)); },
};

test('GET /state returns the recorder state as JSON', async () => {
  const { server, port } = startServer({ recorder: fakeRecorder, port: 0, viewerPath: new URL('./viewer.html', import.meta.url).pathname });
  try {
    const res = await fetch(`http://127.0.0.1:${port}/state`);
    const body = await res.json();
    assert.equal(body.team, 'session-x');
    assert.deepEqual(body.mandates, ['ship it']);
  } finally { server.close(); }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test plugins/agent-team/monitor/server.test.mjs`
Expected: FAIL — `startServer` not exported. (`viewer.html` may not exist yet; the `/state` route does not read it, so the test still exercises the server.)

- [ ] **Step 3: Implement** — append to `watch.mjs`:

```js
import http from 'node:http';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { teamDir, pickActiveTeam } from './sources.mjs';

export function startServer({ recorder, port = 0, viewerPath }) {
  const clients = new Set();
  recorder.onEvent(m => { const d = `data: ${JSON.stringify(m)}\n\n`; for (const c of clients) c.write(d); });
  const server = http.createServer((req, res) => {
    if (req.url === '/state') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(recorder.getState()));
    } else if (req.url === '/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
      res.write('\n'); clients.add(res); req.on('close', () => clients.delete(res));
    } else {
      try { res.writeHead(200, { 'content-type': 'text/html' }); res.end(readFileSync(viewerPath)); }
      catch { res.writeHead(404); res.end('viewer.html missing'); }
    }
  });
  server.listen(port);
  const actual = server.address().port;
  return { server, port: actual, url: `http://127.0.0.1:${actual}/` };
}

function arg(argv, name, def) { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; }

export function main(argv) {
  const home = process.env.HOME;
  const teamRoot = join(home, '.claude', 'teams');
  const tasksRoot = join(home, '.claude', 'tasks');
  const projectsRoot = arg(argv, '--projects', join(home, '.claude', 'projects'));
  let teamName = arg(argv, '--team');
  if (!teamName) {
    const names = (() => { try { return readdirSync(teamRoot).filter(n => n.startsWith('session-')); } catch { return []; } })();
    teamName = pickActiveTeam(names, n => { try { return statSync(teamDir(n)); } catch { return null; } });
  }
  if (!teamName) { console.error('No active team found.'); process.exit(1); }
  const cfg = (() => { try { return JSON.parse(readFileSync(join(teamRoot, teamName, 'config.json'), 'utf8')); } catch { return {}; } })();
  const sessionId = arg(argv, '--session', cfg.leadSessionId);
  const runDir = arg(argv, '--run-dir', join(process.cwd(), '.claude', 'team-runs'));
  const recorder = new Recorder({ teamRoot, tasksRoot, teamName, projectsRoot, sessionId, runDir });
  recorder.poll();
  setInterval(() => recorder.poll(), 400).unref?.();
  const { server, url, port } = startServer({ recorder, port: Number(arg(argv, '--port', 0)), viewerPath: new URL('./viewer.html', import.meta.url).pathname });
  writeFileSync(join(runDir, `${sessionId}.lock`), JSON.stringify({ url, pid: process.pid }));
  console.log(`agent-team monitor: ${url}  (team ${teamName})`);
  if (argv.includes('--open')) spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
  return { server, url, port };
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test plugins/agent-team/monitor/server.test.mjs`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add plugins/agent-team/monitor/watch.mjs plugins/agent-team/monitor/server.test.mjs
git commit -m "monitor: HTTP+SSE server, CLI, lockfile, browser open"
```

---

### Task 9: Viewer (`viewer.html`)

**Files:**
- Create: `plugins/agent-team/monitor/viewer.html`

**Interfaces:**
- Consumes: `GET /state` (initial snapshot) and `GET /events` (SSE stream of new `Message`s).

- [ ] **Step 1: Port the mockup.** Copy `…/scratchpad/monitor-progress.html` to `plugins/agent-team/monitor/viewer.html` verbatim — it already has the design tokens, theme toggle, role-centric rail, mandates, teammate/lead threads, and the Build-progress view.

```bash
cp "$SCRATCH/monitor-progress.html" plugins/agent-team/monitor/viewer.html
```
(`$SCRATCH` = the session scratchpad dir noted in Global Constraints.)

- [ ] **Step 2: Replace the hard-coded `members`/`mandates`/`msgs`/`tasks` constants** with live data. Delete those four `const … = [...]` literals and instead, near the end of the script, add a loader that fetches `/state`, maps it to the existing render variables, and calls `select('progress')`:

```js
let members = [], mandates = [], msgs = [], tasks = [];
async function load() {
  const s = await (await fetch('/state')).json();
  members = s.members.map(m => ({ name: m.name, role: m.role, model: m.model || '—', active: (s.liveness?.members?.[m.name] ?? 'idle') === 'active' }));
  mandates = s.mandates;
  tasks = s.tasks.map(t => ({ id: t.id, sj: t.subject, own: t.owner || '', status: t.status, af: t.activeForm, blockedBy: t.blockedBy?.length ? t.blockedBy : null }));
  msgs = s.messages.map(m => ({ from: m.from, to: m.to, t: (m.ts || '').slice(11, 16), type: m.type, b: m.body, sum: m.summary }));
  document.getElementById('meta').textContent = `${members.length} teammates · ${msgs.length} msgs · ${s.liveness?.team === 'live' ? 'live' : 'ended'}`;
  select(sel);
}
const es = new EventSource('/events');
es.onmessage = e => { const m = JSON.parse(e.data); msgs.push({ from: m.from, to: m.to, t: (m.ts || '').slice(11, 16), type: m.type, b: m.body, sum: m.summary }); select(sel); };
load();
```

(Keep `let sel='progress'`; remove the old `select('progress')` bootstrap call since `load()` now drives it.)

- [ ] **Step 3: Manual verify against a served fixture state.** Temporarily run the server over the recorder test scaffold, or simplest — start the real server and open it (covered end-to-end in Task 12). For now confirm the file is valid HTML:

Run: `node -e "const s=require('fs').readFileSync('plugins/agent-team/monitor/viewer.html','utf8'); if(!s.includes('/state')||!s.includes('EventSource')) throw new Error('viewer not wired'); console.log('viewer wired ok')"`
Expected: `viewer wired ok`

- [ ] **Step 4: Commit**

```bash
git add plugins/agent-team/monitor/viewer.html
git commit -m "monitor: viewer wired to /state + /events"
```

---

### Task 10: `watch-team` skill

**Files:**
- Create: `plugins/agent-team/skills/watch-team/SKILL.md`

- [ ] **Step 1: Write the skill** — `SKILL.md`:

```markdown
---
name: watch-team
description: Use to open a live, read-only monitor of a running Claude Code agent team — its mandates, lead↔teammate messages, and build progress — or to reopen the monitor for a team already running.
---

# Watch a team

Open a local browser monitor for an agent team. **Read-only** — it observes the files Claude Code already writes; it never messages the team. Pairs with `launch-team`.

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
```

- [ ] **Step 2: Validate the plugin manifest**

Run: `claude plugin validate plugins/agent-team`
Expected: `Validation passed`.

- [ ] **Step 3: Commit**

```bash
git add plugins/agent-team/skills/watch-team/
git commit -m "monitor: add watch-team skill"
```

---

### Task 11: `launch-team` breadcrumb + `plan-team` mandates

**Files:**
- Modify: `plugins/agent-team/skills/launch-team/SKILL.md`
- Modify: `plugins/agent-team/skills/plan-team/SKILL.md`

- [ ] **Step 1: Add the breadcrumb write to `launch-team`.** In the spawn step (after the teammates are spawned), add a sub-step instructing the lead to write the breadcrumb. Insert after the "Spawn ALL teammates" step:

```markdown
   - **Write the monitor breadcrumb (metadata only — no UI is launched).** Right after spawning, write `.claude/team-runs/<leadSessionId>.meta.json` capturing what the runtime files don't store, so a later `watch-team` can render the team cleanly:
     ```json
     { "sessionId": "<leadSessionId>", "planPath": "<plan file or null>",
       "mandates": ["<each mandate bullet>"],
       "members": [ { "name": "<spawn name>", "role": "<role>", "model": "<model>", "agentType": "agent-team:<persona|''>" } ] }
     ```
     This is a plain metadata file — it does not start any server or browser. The user opens the monitor separately with the `watch-team` skill.
```

- [ ] **Step 2: Redefine the Ship goal as Mandates in `plan-team`.** Update the Overview/Process wording so the one-sentence "Ship goal" becomes **Mandates** — a short bulleted list describing the **final goal and end-state of the app** after the team's work, held by the lead. Specifically:
  - In the plan template, replace the single `Ship goal: <one sentence>` line with:
    ```markdown
    Mandates (end-state, held by the lead):
    - <bullet 1>
    - <bullet 2>
    ```
  - Update the prose that says "one-sentence definition of done" to "a short bulleted end-state (1–5 bullets)".
  - Keep the rule that `launch-team` injects the mandates into every teammate's spawn prompt (now the bullet list), and add that it also records them in the breadcrumb (Task 11 Step 1).

- [ ] **Step 3: Validate**

Run: `claude plugin validate plugins/agent-team`
Expected: `Validation passed`.

- [ ] **Step 4: Commit**

```bash
git add plugins/agent-team/skills/launch-team/SKILL.md plugins/agent-team/skills/plan-team/SKILL.md
git commit -m "monitor: launch-team breadcrumb + plan-team mandates (bulleted end-state)"
```

---

### Task 12: Docs, gitignore, version, end-to-end verification

**Files:**
- Modify: `.gitignore`, `README.md`, `docs/roadmap.md`, `plugins/agent-team/.claude-plugin/plugin.json`

- [ ] **Step 1: Ignore the run records.** Append to `.gitignore`:

```
.claude/team-runs/
```

- [ ] **Step 2: README "Monitor" section.** Add under the agent-team section: a short paragraph + the `watch-team` usage, noting it's read-only, zero-dependency (`node monitor/watch.mjs`), shows mandates/comms/progress, and reads the files Claude Code already writes.

- [ ] **Step 3: Roadmap.** Move/justify the monitor under a shipped/in-progress heading in `docs/roadmap.md`.

- [ ] **Step 4: Version bump.** In `plugins/agent-team/.claude-plugin/plugin.json` set `"version": "0.9.0"`.

- [ ] **Step 5: Full unit suite**

Run: `node --test plugins/agent-team/monitor/`
Expected: all tests pass.

- [ ] **Step 6: Live end-to-end (the deferred probe).** With a real agent team running (or spawn a throwaway 2-teammate team), from the repo root:

Run: `node plugins/agent-team/monitor/watch.mjs --open`
Confirm in the browser: roster + models render; mandates show (if the team was launched via the updated `launch-team`); selecting team-lead and a teammate shows real messages; Build progress reflects the task list. **Empirically confirm the two deferred unknowns:** (a) whether task JSON carries `owner` (→ per-teammate progress) — if absent, note it and rely on overall progress; (b) that a teammate's `subagents/agent-*.jsonl` mtime tracks activity well enough for the 30s active threshold (adjust `activeMs` in `parse.mjs` if needed).

- [ ] **Step 7: Commit**

```bash
git add .gitignore README.md docs/roadmap.md plugins/agent-team/.claude-plugin/plugin.json
git commit -m "monitor: docs, gitignore, v0.9.0"
```

---

## Self-Review

**Spec coverage:** §2 goals → roster/mandates/comms/progress (Tasks 4,7,2,3,9); §4 data sources → Tasks 2–7; §5 architecture (recorder+mirror+server) → Tasks 7,8; §6 liveness mtime-only → Task 5; §7 UI/tokens/theme → Task 9 (+ Global Constraints); §8 watch-team/launch-team/plan-team changes → Tasks 10,11; §9 footprint → all; §10 testing incl. live probe → Tasks 1 + 12 step 6; §11 risks (owner, idle thresholds, transcript coupling, breadcrumb absence) → handled defensively in Tasks 3,4,5 and verified in Task 12. **Decision D1 read-only:** no write path to `~/.claude` anywhere. **D2/D5:** breadcrumb is metadata-only (Task 11), watch-team is the sole launcher (Task 10).

**Placeholder scan:** all code steps contain full code; commands have expected output. No TBD/TODO.

**Type consistency:** `Message`/`Task`/`Member`/`Progress`/`Liveness` shapes are defined once in File Structure and used consistently; `Recorder` constructor keys (`teamRoot, tasksRoot, teamName, projectsRoot, sessionId, runDir`) match between Tasks 7 and 8 and the tests.
