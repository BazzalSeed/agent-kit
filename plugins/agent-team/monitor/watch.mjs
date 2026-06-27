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
