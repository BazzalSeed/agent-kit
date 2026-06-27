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
