import { test } from 'node:test';
import assert from 'node:assert/strict';
import { teamDir, pickActiveTeam, teamTranscripts } from './sources.mjs';
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

test('teamTranscripts finds team files by teamName and reads their agentName', () => {
  const listDir = d => d === 'ROOT' ? ['proj'] : ['arch.jsonl', 'back.jsonl', 'other.jsonl', 'notes.txt'];
  const heads = {
    [join('ROOT', 'proj', 'arch.jsonl')]: '{"type":"system"}\n{"agentName":"architect","teamName":"session-deadbeef"}',
    [join('ROOT', 'proj', 'back.jsonl')]: '{"agentName":"backend","teamName":"session-deadbeef"}',
    [join('ROOT', 'proj', 'other.jsonl')]: '{"agentName":"z","teamName":"session-OTHER"}',
  };
  const readHead = p => heads[p] || '';
  const found = teamTranscripts('ROOT', 'session-deadbeef', listDir, readHead);
  const byName = Object.fromEntries(found.map(f => [f.agentName, f.file]));
  assert.deepEqual(Object.keys(byName).sort(), ['architect', 'backend']);
  assert.equal(byName.architect, join('ROOT', 'proj', 'arch.jsonl'));
  assert.equal(byName.backend, join('ROOT', 'proj', 'back.jsonl'));
});
