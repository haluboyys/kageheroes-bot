import { connect as tcpConnect } from 'cloudflare:sockets';
import {
  buildUpgradeRequest,
  concatBytes,
  decodeFrames,
  encodeTextFrame,
  makeWebSocketKey,
  parseUpgradeResponse,
} from '../lib/ws-codec.js';
import { newStore } from '../lib/store.js';

const now = () => Date.now();
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RETRY_MS = [2000, 5000, 10000];

export async function httpLogin(cfg) {
  const q =
    `accId=${encodeURIComponent(cfg.email)}&pwd=${encodeURIComponent(cfg.password)}` +
    `&channel=${cfg.channel || '108'}&lv=1`;
  const host = cfg.httpHost || 'central.kageherostudio.com';
  const port = Number(cfg.httpPort) || 80;
  const url = `http://${host}:${port}/game/lyto/login?${q}`;

  const res = await fetch(url, {
    method: 'GET',
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  try {
    const idx = text.indexOf('{');
    const b = JSON.parse(idx >= 0 ? text.slice(idx) : text);
    if (!b || !b.msg) throw new Error(b && b.msgText ? b.msgText : 'no msg field');
    return JSON.parse(b.msg);
  } catch {
    throw new Error('bad login response: ' + text.slice(0, 160));
  }
}

export async function wsConnect(cfg, connectFn = tcpConnect) {
  const server = String(cfg.server);
  const host = `games${server}.kageherostudio.com`;
  const port = 6000 + Number(server);

  const socket = connectFn({ hostname: host, port }, { secureTransport: 'off', allowHalfOpen: false });
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();

  const key = makeWebSocketKey();
  const reqBytes = buildUpgradeRequest({ host, port, path: '/nadsocket', key });
  await writer.write(reqBytes);

  let buf = new Uint8Array(0);
  const deadline = now() + 20000;

  while (now() < deadline) {
    const { value, done } = await reader.read();
    if (done) throw new Error('ws upgrade closed before 101');
    if (value && value.length) {
      buf = concatBytes(buf, value);
      const parsed = parseUpgradeResponse(buf);
      if (parsed) {
        if (!parsed.is101) throw new Error(`ws upgrade rejected: ${parsed.statusLine}`);
        return { socket, reader, writer, head: parsed.headRest };
      }
    }
  }
  try { await socket.close(); } catch {}
  throw new Error('ws connect timeout');
}

export class Session {
  constructor({ socket, reader, writer, head, store, logger }) {
    this.socket = socket;
    this.reader = reader;
    this.writer = writer;
    this.buf = head && head.length ? head : new Uint8Array(0);
    this.store = store || newStore();
    this.log = logger || (() => {});
    this.queue = [];
    this.waiters = [];
    this.closed = false;
    this.endReason = null;
    this.onClose = null;
    this._writeChain = Promise.resolve();

    if (this.buf.length) this._drainBuffer();
    this._readLoop();
  }

  async _readLoop() {
    try {
      while (!this.closed) {
        const { value, done } = await this.reader.read();
        if (done) {
          this._close('socket closed');
          break;
        }
        if (value && value.length) {
          this.buf = concatBytes(this.buf, value);
          this._drainBuffer();
        }
      }
    } catch (e) {
      this._close('socket error: ' + (e && e.message));
    }
  }

  _drainBuffer() {
    const { messages, rest } = decodeFrames(this.buf);
    this.buf = rest;
    for (const msg of messages) {
      if (msg && msg.__wsClose) {
        this._close('ws close frame');
        return;
      }
      this._handle(msg);
    }
  }

  _close(reason) {
    if (!this.closed) {
      this.closed = true;
      this.endReason = reason;
    }
    while (this.waiters.length) this.waiters.shift()({ __closed: true, reason });
    if (this.onClose) this.onClose(reason);
  }

  _handle(txt) {
    const src = txt.source;
    if (src && typeof src === 'object') this.store.applySource(src);
    if (txt.type === 26 && !this.closed) {
      this.send({ type: 29, cName: 'com.jelly.player.DefaultPlayerEvent', timeStamp: now() });
    }
    if (txt.type === 12 || txt.type === 25 || txt.type === 39) {
      this._close('server ended session (type ' + txt.type + ')');
      return;
    }
    if (txt.type === 28 || txt.type === 29) {
      this._push(src && typeof src === 'object' ? src : {});
    }
  }

  _push(src) {
    if (this.waiters.length) this.waiters.shift()(src);
    else this.queue.push(src);
  }

  receiveSource(timeoutMs = 3000) {
    if (this.queue.length) return Promise.resolve(this.queue.shift());
    if (this.closed) return Promise.resolve({ __closed: true, reason: this.endReason });
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        const i = this.waiters.indexOf(w);
        if (i >= 0) this.waiters.splice(i, 1);
        resolve(null);
      }, timeoutMs);
      const w = (v) => {
        clearTimeout(t);
        resolve(v);
      };
      this.waiters.push(w);
    });
  }

  send(obj) {
    if (this.closed) return;
    const frame = encodeTextFrame(obj);
    this._writeChain = this._writeChain
      .then(() => (this.closed ? null : this.writer.write(frame)))
      .catch((e) => this._close('write error: ' + (e && e.message)));
  }

  sendCommand(name, value) {
    this.send({ type: 28, source: { [name]: value }, timeStamp: now() });
  }

  async cmd(name, value, timeoutMs = 1500) {
    this.queue.length = 0;
    this.sendCommand(name, value);
    return this.receiveSource(timeoutMs);
  }

  async waitFor(key, timeoutMs = 25000) {
    const deadline = now() + timeoutMs;
    for (;;) {
      const left = deadline - now();
      if (left <= 0) return null;
      const s = await this.receiveSource(left);
      if (s === null) return null;
      if (s.__closed) return s;
      if (s && typeof s === 'object' && s[key] !== undefined) return s;
    }
  }

  close() {
    this.closed = true;
    try { this.reader.cancel(); } catch {}
    try { this.socket.close(); } catch {}
  }
}

export async function connectGame(cfg, logger, attempts = RETRY_MS.length + 1) {
  const log = (m) => (typeof logger === 'function' ? logger(m) : logger && logger.log && logger.log(m));
  let last = null;
  for (let i = 1; i <= attempts; i++) {
    let s = null;
    try {
      const auth = await httpLogin(cfg);
      const conn = await wsConnect(cfg);
      s = new Session({ ...conn, store: newStore(), logger });
      s.send({
        type: 8,
        source: [auth.accId, String(cfg.server), 'LDGameRoom', cfg.version || '2.6.0', '99108', '', auth.sgin],
        timeStamp: now(),
      });
      const got = await s.waitFor('enterGame', 30000);
      if (!got || got.__closed) throw new Error('login failed: ' + ((got && got.reason) || 'timeout'));
      await sleep(2500);
      s.queue.length = 0;
      return s;
    } catch (e) {
      last = e;
      if (/type 39\b/.test(e.message || '')) e.code = 'version';
      if (s) s.close();
      if (i < attempts) {
        const wait = RETRY_MS[i - 1] !== undefined ? RETRY_MS[i - 1] : 10000;
        log(`connect: ${e.message} (try ${i}/${attempts}) - retry in ${wait / 1000}s`);
        await sleep(wait);
      }
    }
  }
  throw last;
}
