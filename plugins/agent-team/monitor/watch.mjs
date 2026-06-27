import { readFileSync, readdirSync, existsSync, statSync, appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { teamDir, pickActiveTeam, transcriptPaths } from './sources.mjs';
import { extractMessages, normalizeTask, deriveProgress, buildRoster, extractMandates, computeLiveness, readNewLines } from './parse.mjs';

const readJSON = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const listJSON = d => { try { return readdirSync(d).filter(f => f.endsWith('.json')); } catch { return []; } };
const mtimeOf = p => { try { return statSync(p).mtimeMs; } catch { return null; } };
const msgKey = m => `${m.ts}|${m.from}|${m.to}|${m.summary}|${m.body}`;

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
    if (existsSync(this.runFile)) {
      for (const line of readFileSync(this.runFile, 'utf8').split('\n').filter(Boolean)) {
        try { this.seen.add(msgKey(JSON.parse(line))); } catch { /* skip malformed lines */ }
      }
    }
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
  const home = os.homedir();
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
