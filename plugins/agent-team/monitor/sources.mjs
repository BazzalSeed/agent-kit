import os from 'node:os';
import { join } from 'node:path';

const home = () => os.homedir();
export const teamDir = name => join(home(), '.claude', 'teams', name);
export const tasksDir = name => join(home(), '.claude', 'tasks', name);

// Discover every transcript that belongs to a team. Each teammate runs in its
// OWN top-level <uuid>.jsonl (NOT under a `<leadSessionId>/subagents/` dir, and
// the team's leadSessionId names no transcript file). Every line is tagged with
// `teamName` and `agentName`, so we match on teamName and read agentName for the
// owner. `readHead` returns the first chunk of a file (teamName/agentName appear
// in the opening lines), keeping discovery cheap on large transcripts.
export function teamTranscripts(projectsRoot, teamName, listDir, readHead) {
  const out = [];
  for (const slug of listDir(projectsRoot)) {
    const dir = join(projectsRoot, slug);
    for (const f of listDir(dir)) {
      if (!f.endsWith('.jsonl')) continue;
      const file = join(dir, f);
      const head = readHead(file) || '';
      if (!head.includes(teamName)) continue;
      let agentName = null, belongs = false;
      for (const line of head.split('\n')) {
        if (!line.includes(teamName)) continue;
        let o; try { o = JSON.parse(line); } catch { continue; }
        if (o.teamName === teamName) { belongs = true; if (o.agentName) agentName = o.agentName; }
        if (belongs && agentName) break;
      }
      if (belongs) out.push({ file, agentName });
    }
  }
  return out;
}

export function pickActiveTeam(names, statFolder) {
  let best = null, bestM = -Infinity;
  for (const n of names) {
    const s = statFolder(n);
    if (s && s.mtimeMs > bestM) { best = n; bestM = s.mtimeMs; }
  }
  return best;
}
