export const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export function splitMessage(text, limit = 4000) {
  const s = String(text || '');
  if (s.length <= limit) return [s];
  const out = [];
  let rest = s;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n', limit);
    if (cut < limit * 0.4) cut = limit;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, '');
  }
  if (rest) out.push(rest);
  return out;
}

export class TelegramClient {
  constructor(token) {
    this.token = token;
  }

  async sendMessage(chatId, text, { threadId } = {}) {
    if (!this.token || !chatId) return null;
    const parts = splitMessage(text);
    let last = null;
    for (const part of parts) {
      const body = {
        chat_id: chatId,
        text: part,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      };
      if (threadId !== undefined && threadId !== null && threadId !== '') {
        body.message_thread_id = Number(threadId);
      }
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 10000);
      let res;
      try {
        res = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: ac.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      const json = await res.json();
      if (!json.ok) throw new Error(`tg sendMessage: ${json.description || res.status}`);
      last = json.result;
    }
    return last;
  }
}
