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
