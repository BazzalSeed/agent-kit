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
