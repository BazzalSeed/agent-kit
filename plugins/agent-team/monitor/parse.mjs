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
        out.push({
          kind: 'message',
          from: owner,
          to: i.to || i.recipient || null,
          body: i.message || i.content || '',
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
