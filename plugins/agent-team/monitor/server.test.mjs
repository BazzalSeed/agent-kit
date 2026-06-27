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
