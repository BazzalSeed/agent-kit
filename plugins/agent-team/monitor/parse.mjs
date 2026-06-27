const SENDMSG = '"SendMessage"';

export function extractMessages(jsonlText, owner) {
  const out = [];
  for (const line of jsonlText.split('\n')) {
    if (!line.includes(SENDMSG)) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    const ts = rec.timestamp || rec.ts || null;
    let content = rec.message?.content ?? rec.content ?? [];
    if (!Array.isArray(content)) content = [content];
    for (const b of content) {
      if (b && b.type === 'tool_use' && b.name === 'SendMessage') {
        const i = b.input || {};
        const rawBody = i.message || i.content || '';
        const body = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
        out.push({
          kind: 'message',
          from: owner,
          to: i.to || i.recipient || null,
          body,
          summary: i.summary || '',
          type: i.type || 'message',
          ts,
        });
      }
    }
  }
  return out;
}

export function normalizeTask(raw) {
  return {
    id: raw.id,
    subject: raw.subject || '',
    activeForm: raw.activeForm || '',
    status: raw.status || 'pending',
    blockedBy: Array.isArray(raw.blockedBy) ? raw.blockedBy : [],
    owner: raw.owner || null,
  };
}

export function deriveProgress(tasks) {
  const p = { done: 0, inProgress: 0, blocked: 0, upNext: 0, total: tasks.length, byOwner: {} };
  for (const t of tasks) {
    if (t.status === 'completed') p.done++;
    else if (t.status === 'in-progress') p.inProgress++;
    else if (t.blockedBy.length) p.blocked++;
    else p.upNext++;
    if (t.owner) {
      const o = (p.byOwner[t.owner] ??= { done: 0, total: 0 });
      o.total++;
      if (t.status === 'completed') o.done++;
    }
  }
  return p;
}

export function buildRoster(config, meta) {
  const byName = new Map((meta?.members || []).map(m => [m.name, m]));
  return (config.members || []).map(c => {
    const m = byName.get(c.name);
    return {
      name: c.name,
      role: m?.role || String(c.agentType || '').replace(/^agent-team:/, '') || c.name,
      model: m?.model || null,
      agentId: c.agentId,
    };
  });
}

export function extractMandates(meta) {
  return Array.isArray(meta?.mandates) ? meta.mandates : [];
}

export function computeLiveness({ now, folderExists, memberMtimes, activeMs = 30000 }) {
  const members = {};
  for (const [name, mtime] of Object.entries(memberMtimes || {}))
    members[name] = (mtime != null && now - mtime <= activeMs) ? 'active' : 'idle';
  return { team: folderExists ? 'live' : 'ended', members };
}

export function readNewLines(prevOffset, buf) {
  const slice = buf.subarray(prevOffset);
  const text = slice.toString('utf8');
  const lastNl = text.lastIndexOf('\n');
  if (lastNl < 0) return { lines: [], offset: prevOffset };
  const complete = text.slice(0, lastNl);
  const lines = complete.split('\n').filter(l => l.length > 0);
  return { lines, offset: prevOffset + Buffer.byteLength(complete, 'utf8') + 1 };
}
