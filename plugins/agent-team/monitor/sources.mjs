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
