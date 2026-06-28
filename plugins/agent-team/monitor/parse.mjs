const SENDMSG = '"SendMessage"';
// Incoming messages are mirrored into the recipient's transcript wrapped in an
// envelope: <teammate-message teammate_id="X" color="…" summary="…">BODY</teammate-message>.
// Attributes can appear in any order, so capture the attr blob and pick fields out of it.
const TEAMMSG_RE = /<teammate-message\s+([^>]*?)>\s*([\s\S]*?)<\/teammate-message>/;
const attrOf = (attrs, name) => {
  const m = attrs.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : null;
};

// Extract both directions of traffic from one transcript:
//   • OUTGOING — SendMessage tool_use blocks (from = this transcript's agent)
//   • INCOMING — received <teammate-message> envelopes (from = the envelope's sender)
// `owner` is the agent that owns this transcript; a per-line `agentName`, when
// present, takes precedence (real transcripts tag every line with it).
export function extractMessages(jsonlText, owner) {
  const out = [];
  for (const line of jsonlText.split('\n')) {
    if (!line.trim()) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    const ts = rec.timestamp || rec.ts || null;
    const self = rec.agentName || owner;
    const raw = rec.message?.content ?? rec.content ?? [];

    if (line.includes(SENDMSG)) {
      const blocks = Array.isArray(raw) ? raw : [raw];
      for (const b of blocks) {
        if (b && b.type === 'tool_use' && b.name === 'SendMessage') {
          const i = b.input || {};
          const rawBody = i.message || i.content || '';
          const body = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
          out.push({
            kind: 'message',
            from: self,
            to: i.to || i.recipient || null,
            body,
            summary: i.summary || '',
            type: i.type || 'message',
            ts,
          });
        }
      }
    }

    if (typeof raw === 'string' && raw.includes('<teammate-message')) {
      const m = raw.match(TEAMMSG_RE);
      if (m) {
        const sender = attrOf(m[1], 'teammate_id');
        // Skip self-addressed envelopes; a teammate→teammate message also appears
        // as OUTGOING in the sender's own transcript and is deduped downstream.
        if (sender && sender !== self) {
          out.push({
            kind: 'message',
            from: sender,
            to: self,
            body: m[2].trim(),
            summary: attrOf(m[1], 'summary') || '',
            type: 'message',
            ts,
          });
        }
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
    else if (t.status === 'in_progress' || t.status === 'in-progress') p.inProgress++;
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
