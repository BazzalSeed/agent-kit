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
