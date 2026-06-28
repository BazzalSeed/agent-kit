import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, appendFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FIX } from './smoke.test.mjs';
import { Recorder } from './watch.mjs';

// New on-disk reality: each teammate runs in its OWN top-level <uuid>.jsonl under
// the project slug (NOT a `<leadSessionId>/subagents/` dir), every line tagged
// with teamName + agentName. The lead transcript is undiscoverable, but lead→
// teammate messages are mirrored into each teammate transcript, so the recorder
// reconstructs both directions from the teammate transcripts alone.
function scaffold() {
  const root = mkdtempSync(join(tmpdir(), 'mon-'));
  const teamDir = join(root, 'teams', 'session-deadbeef');
  const projects = join(root, 'projects');
  const projSlug = join(projects, 'proj');
  const tasks = join(root, 'tasks', 'session-deadbeef');
  const runDir = join(root, 'team-runs');
  [teamDir, projSlug, tasks, runDir].forEach(d => mkdirSync(d, { recursive: true }));
  copyFileSync(join(FIX, 'config.json'), join(teamDir, 'config.json'));
  copyFileSync(join(FIX, 'meta.json'), join(runDir, 'deadbeef-0000-0000-0000-000000000000.meta.json'));
  copyFileSync(join(FIX, 'team-architect.jsonl'), join(projSlug, 'arch.jsonl'));
  copyFileSync(join(FIX, 'team-backend.jsonl'), join(projSlug, 'back.jsonl'));
  ['task-1.json', 'task-2.json', 'task-3.json'].forEach((f, i) => copyFileSync(join(FIX, f), join(tasks, `${i + 1}.json`)));
  return { root, projects, runDir, archFile: join(projSlug, 'arch.jsonl') };
}

const opts = s => ({
  teamRoot: join(s.root, 'teams'), tasksRoot: join(s.root, 'tasks'),
  teamName: 'session-deadbeef', projectsRoot: s.projects,
  sessionId: 'deadbeef-0000-0000-0000-000000000000', runDir: s.runDir,
});

test('recorder aggregates roster, mandates, progress, and both-direction comms', () => {
  const s = scaffold();
  const rec = new Recorder(opts(s));
  rec.poll();
  const st = rec.getState();
  assert.equal(st.members.length, 3);
  assert.equal(st.mandates.length, 3);
  assert.equal(st.progress.total, 3);
  assert.equal(st.progress.inProgress, 1, 'in_progress task counted');
  // 3 unique: lead→architect (incoming), architect→backend (outgoing AND incoming → deduped), backend→lead (relay)
  assert.equal(st.messages.length, 3, 'cross-file send/receive duplicate must collapse to one');
  assert.ok(st.messages.some(m => m.from === 'team-lead' && m.to === 'architect'), 'lead→teammate captured without the lead transcript');
  assert.ok(st.messages.some(m => m.from === 'backend' && m.type === 'relay'));
  assert.equal(st.messages.filter(m => m.from === 'architect' && m.to === 'backend').length, 1, 'architect→backend appears exactly once');
});

test('only newly appended messages fire onEvent on the next poll', () => {
  const s = scaffold();
  const rec = new Recorder(opts(s));
  rec.poll();
  const seen = [];
  rec.onEvent(m => seen.push(m));
  appendFileSync(s.archFile, JSON.stringify({ type: 'assistant', agentName: 'architect', teamName: 'session-deadbeef', timestamp: '2026-06-27T10:00:00.000Z', message: { role: 'assistant', content: [{ type: 'tool_use', name: 'SendMessage', input: { to: 'frontend', type: 'message', summary: 'apply', message: 'apply orders.note' } }] } }) + '\n');
  rec.poll();
  assert.equal(seen.length, 1);
  assert.equal(seen[0].to, 'frontend');
  assert.equal(seen[0].from, 'architect');
  const durable = readFileSync(join(s.runDir, 'deadbeef-0000-0000-0000-000000000000.jsonl'), 'utf8').trim().split('\n');
  assert.ok(durable.length >= 4);
});

test('two SendMessages with same to/empty-summary but different bodies both appear (msgKey collision fix)', () => {
  const s = scaffold();
  const rec = new Recorder(opts(s));
  // One JSONL record with two SendMessage blocks — same to, empty summary, different bodies
  appendFileSync(s.archFile, JSON.stringify({
    type: 'assistant', agentName: 'architect', teamName: 'session-deadbeef', timestamp: '2026-06-27T10:10:00.000Z',
    message: {
      role: 'assistant',
      content: [
        { type: 'tool_use', name: 'SendMessage', input: { to: 'frontend', summary: '', message: 'first instruction' } },
        { type: 'tool_use', name: 'SendMessage', input: { to: 'frontend', summary: '', message: 'second instruction' } },
      ],
    },
  }) + '\n');
  rec.poll();
  const st = rec.getState();
  const pair = st.messages.filter(m => m.to === 'frontend' && m.ts === '2026-06-27T10:10:00.000Z');
  assert.equal(pair.length, 2, 'both messages must appear — not deduplicated by msgKey');
  assert.ok(pair.some(m => m.body === 'first instruction'));
  assert.ok(pair.some(m => m.body === 'second instruction'));
});

test('retains the last task snapshot when the live task files are cleaned up', () => {
  const s = scaffold();
  const rec = new Recorder(opts(s));
  rec.poll();
  assert.equal(rec.getState().progress.total, 3);
  const tdir = join(s.root, 'tasks', 'session-deadbeef');
  for (const f of readdirSync(tdir)) if (f.endsWith('.json')) rmSync(join(tdir, f));
  rec.poll();
  const st = rec.getState();
  assert.equal(st.progress.total, 3, 'progress retained after task files cleaned');
  assert.equal(st.tasksStale, true);
});

test('a fresh Recorder restores the task snapshot from disk after cleanup', () => {
  const s = scaffold();
  new Recorder(opts(s)).poll();                       // writes the snapshot
  const tdir = join(s.root, 'tasks', 'session-deadbeef');
  for (const f of readdirSync(tdir)) if (f.endsWith('.json')) rmSync(join(tdir, f));
  const rec2 = new Recorder(opts(s));                 // loads snapshot in constructor
  rec2.poll();
  assert.equal(rec2.getState().progress.total, 3);
  assert.equal(rec2.getState().tasksStale, true);
});

test('second Recorder on same runDir does not duplicate messages or fire onEvent (mirror idempotency)', () => {
  const s = scaffold();
  const rec1 = new Recorder(opts(s));
  rec1.poll();
  const runFile = join(s.runDir, 'deadbeef-0000-0000-0000-000000000000.jsonl');
  const linesBefore = readFileSync(runFile, 'utf8').trim().split('\n').filter(Boolean).length;

  const rec2 = new Recorder(opts(s));
  const spy = [];
  rec2.onEvent(m => spy.push(m));
  rec2.poll();
  const linesAfter = readFileSync(runFile, 'utf8').trim().split('\n').filter(Boolean).length;
  assert.equal(spy.length, 0, 'onEvent must not fire for already-mirrored messages');
  assert.equal(linesAfter, linesBefore, 'runFile line count must not increase on re-poll from same sources');
});
