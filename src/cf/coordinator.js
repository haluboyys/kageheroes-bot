import { DurableObject } from 'cloudflare:workers';
import { DEFAULT_ACCOUNT, DEFAULT_SETTINGS } from '../config.js';
import { withSession } from '../bot/session.js';
import services from '../services/index.js';
import * as schedule from '../schedule.js';
import { TelegramClient, esc } from './telegram-api.js';

const MAX_LOG_ROWS = 200;
const HEARTBEAT_ALARM_MS = 15 * 60000;
const fmtNum = (n) => (typeof n === 'number' ? n.toLocaleString('en-US') : '-');

export class AccountCoordinator extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this._lane = Promise.resolve();
    this._initSchema();
  }

  _initSchema() {
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS service_state (
        server TEXT NOT NULL,
        day TEXT NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (server, day)
      );
      CREATE TABLE IF NOT EXISTS snapshots (
        server TEXT PRIMARY KEY,
        data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts TEXT NOT NULL,
        level TEXT NOT NULL,
        msg TEXT NOT NULL
      );
    `);
  }

  _getKv(key, fallback) {
    const rows = this.sql.exec('SELECT value FROM kv WHERE key = ?', key).toArray();
    if (!rows.length) return fallback;
    try {
      return JSON.parse(rows[0].value);
    } catch {
      return fallback;
    }
  }

  _setKv(key, val) {
    this.sql.exec(
      'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key,
      JSON.stringify(val)
    );
  }

  _getAccount() {
    if (this.env.GAME_EMAIL && this.env.GAME_PASSWORD && this.env.GAME_SERVER) {
      const servers = String(this.env.GAME_SERVER)
        .split(',')
        .map((x) => Number(x.trim()))
        .filter((n) => Number.isInteger(n) && n > 0);
      return {
        ...DEFAULT_ACCOUNT,
        email: this.env.GAME_EMAIL,
        password: this.env.GAME_PASSWORD,
        servers,
        enabled: true,
      };
    }
    return this._getKv('account', { ...DEFAULT_ACCOUNT });
  }

  _getSettings() {
    const saved = this._getKv('settings', {});
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      enabledFeatures: { ...DEFAULT_SETTINGS.enabledFeatures, ...(saved.enabledFeatures || {}) },
    };
  }

  _log(msg, level = 'info') {
    const ts = new Date().toISOString();
    this.sql.exec('INSERT INTO logs (ts, level, msg) VALUES (?, ?, ?)', ts, level, String(msg));
    this.sql.exec(
      'DELETE FROM logs WHERE id NOT IN (SELECT id FROM logs ORDER BY id DESC LIMIT ?)',
      MAX_LOG_ROWS
    );
  }

  _getServiceState(server, day) {
    const rows = this.sql
      .exec('SELECT data FROM service_state WHERE server = ? AND day = ?', String(server), day)
      .toArray();
    if (!rows.length) return {};
    try {
      return JSON.parse(rows[0].data);
    } catch {
      return {};
    }
  }

  _saveServiceState(server, day, data) {
    this.sql.exec(
      'INSERT INTO service_state (server, day, data) VALUES (?, ?, ?) ON CONFLICT(server, day) DO UPDATE SET data = excluded.data',
      String(server),
      day,
      JSON.stringify(data)
    );
    this.sql.exec(
      'DELETE FROM service_state WHERE server = ? AND day NOT IN (SELECT day FROM service_state WHERE server = ? ORDER BY day DESC LIMIT 3)',
      String(server),
      String(server)
    );
  }

  _getSnapshot(server) {
    const rows = this.sql.exec('SELECT data FROM snapshots WHERE server = ?', String(server)).toArray();
    if (!rows.length) return null;
    try {
      return JSON.parse(rows[0].data);
    } catch {
      return null;
    }
  }

  _saveSnapshot(server, snap) {
    this.sql.exec(
      'INSERT INTO snapshots (server, data) VALUES (?, ?) ON CONFLICT(server) DO UPDATE SET data = excluded.data',
      String(server),
      JSON.stringify(snap)
    );
  }

  async _notify(text) {
    if (!this.env.TELEGRAM_BOT_TOKEN || !this.env.TELEGRAM_CHAT_ID) return;
    const tg = new TelegramClient(this.env.TELEGRAM_BOT_TOKEN);
    try {
      await tg.sendMessage(this.env.TELEGRAM_CHAT_ID, text, {
        threadId: this.env.TELEGRAM_THREAD_ID,
      });
    } catch (e) {
      this._log(`tg notify err: ${e.message}`, 'error');
    }
  }

  _fmtHeader(icon, server, title) {
    return `${icon} <b>[S${esc(server)}] ${esc(title)}</b>`;
  }

  _fmtFooter(now = new Date()) {
    return `🕒 <code>${schedule.hhmm(now)} WIB</code>`;
  }

  _fmtDoneNotif(server, svc, snap) {
    const label = svc.label || svc.name;
    const p = snap && snap.player;
    const lines = [this._fmtHeader('✅', server, `${label} selesai`)];
    if (p) {
      lines.push(`👤 ${esc(p.name || '?')} (Lv.${esc(p.lv ?? '?')})`);
      lines.push(`🪙 Gold: <b>${fmtNum(p.gold)}</b>  |  🥈 Silver: <b>${fmtNum(p.silver)}</b>`);
    }
    lines.push(this._fmtFooter());
    return lines.join('\n');
  }

  _withLane(fn) {
    const p = this._lane.then(fn, fn);
    this._lane = p.catch(() => {});
    return p;
  }

  async _runServicePass(server, sv, entry) {
    const account = this._getAccount();
    const settings = this._getSettings();
    const ctx = {
      account,
      server: Number(server),
      settings,
      log: (m) => this._log(m),
      saveSettings: async (next) => this._setKv('settings', next),
      onVersion: (v) =>
        this._notify(
          `🔄 <b>Update Versi Game</b>\nVersi otomatis naik ke <code>${esc(v)}</code>\n${this._fmtFooter()}`
        ),
      saveSnapshot: async (srv, snap) => this._saveSnapshot(srv, snap),
    };

    return this._withLane(async () => {
      try {
        const res = await withSession(ctx, sv.name, async (s, guard) => {
          return sv.run(s, { settings, log: ctx.log, guard, entry: entry || {}, now: Date.now() });
        });
        if (res.ended !== 'clean' && !res.value) {
          return { error: res.ended, nextIn: 15000 };
        }
        return res.value || { done: true };
      } catch (e) {
        this._log(`service ${sv.name} s${server} error: ${e.message}`, 'error');
        if (e && e.goldTrip) {
          await this._notify(
            [
              this._fmtHeader('🚨', server, `GOLD GUARD TRIP (${sv.label || sv.name})`),
              `⚠️ Gold turun: <code>${e.goldTrip.from} → ${e.goldTrip.to}</code> (<code>${esc(e.goldTrip.tag)}</code>)`,
              this._fmtFooter(),
            ].join('\n')
          );
        }
        return { error: e.message || String(e), nextIn: 5 * 60000 };
      }
    });
  }

  async _scheduleNextAlarm(nowMs = Date.now()) {
    const account = this._getAccount();
    if (!account.enabled || !account.email || !account.servers.length) {
      const fallback = nowMs + HEARTBEAT_ALARM_MS;
      await this.ctx.storage.setAlarm(fallback);
      return fallback;
    }

    const settings = this._getSettings();
    const now = new Date(nowMs);
    const day = schedule.ymd(now);

    let earliest = nowMs + HEARTBEAT_ALARM_MS;
    for (const srv of account.servers) {
      const state = this._getServiceState(srv, day);
      const dueList = schedule.due(state, services, settings, now);
      if (dueList.some((x) => !x.missed)) {
        earliest = Math.min(earliest, nowMs + 2000);
        break;
      }
      for (const entry of Object.values(state)) {
        if (!entry.done && entry.nextDue && entry.nextDue > nowMs) {
          earliest = Math.min(earliest, entry.nextDue);
        }
      }
      const upcoming = schedule.next(services, settings, state, now, 1);
      if (upcoming.length && upcoming[0].at) {
        earliest = Math.min(earliest, upcoming[0].at.getTime());
      }
    }

    const target = Math.max(nowMs + 1000, earliest);
    await this.ctx.storage.setAlarm(target);
    return target;
  }

  async ensureAlarm() {
    const existing = await this.ctx.storage.getAlarm();
    if (!existing) {
      const nextAt = await this._scheduleNextAlarm();
      return { scheduled: true, nextAt };
    }
    return { scheduled: false, nextAt: existing };
  }

  async alarm() {
    const nowMs = Date.now();
    const now = new Date(nowMs);
    const account = this._getAccount();

    if (!account.enabled || !account.email || !account.servers.length) {
      await this._scheduleNextAlarm();
      return;
    }

    const settings = this._getSettings();
    const day = schedule.ymd(now);

    for (const srv of account.servers) {
      const state = this._getServiceState(srv, day);
      const dueList = schedule.due(state, services, settings, now);
      let stateDirty = false;

      for (const item of dueList) {
        if (item.missed) {
          schedule.markMissed(item.entry, item);
          stateDirty = true;
          this._log(`s${srv} ${item.svc.name} missed (${item.lateMin}m late)`);
          await this._notify(
            [
              this._fmtHeader('⏭️', srv, `${item.svc.label || item.svc.name} terlewat`),
              `⏱️ Telat ${item.lateMin} menit dari jadwal`,
              this._fmtFooter(),
            ].join('\n')
          );
          continue;
        }

        const res = await this._runServicePass(srv, item.svc, item.entry);
        schedule.record(item.entry, item.svc, res, settings, new Date());
        this._saveServiceState(srv, day, state);

        if (item.entry.failed) {
          await this._notify(
            [
              this._fmtHeader('❌', srv, `${item.svc.label || item.svc.name} gagal (${schedule.MAX_FAILS}x)`),
              `⚠️ Error: <code>${esc(res.error || 'unknown')}</code>`,
              this._fmtFooter(),
            ].join('\n')
          );
        } else if (item.entry.done) {
          const snap = this._getSnapshot(srv);
          await this._notify(this._fmtDoneNotif(srv, item.svc, snap));
        }

        await this._scheduleNextAlarm();
        return;
      }

      if (stateDirty) this._saveServiceState(srv, day, state);
    }

    await this._scheduleNextAlarm();
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/ensure-alarm') {
      const res = await this.ensureAlarm();
      return Response.json({ ok: true, ...res });
    }
    if (request.method === 'POST' && url.pathname === '/test-notify') {
      const alarm = await this.ensureAlarm();
      if (!this.env.TELEGRAM_BOT_TOKEN || !this.env.TELEGRAM_CHAT_ID) {
        return Response.json({ ok: false, error: 'missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID', alarm }, { status: 400 });
      }
      const tg = new TelegramClient(this.env.TELEGRAM_BOT_TOKEN);
      const acc = this._getAccount();
      const settings = this._getSettings();
      const msg = [
        '🤖 <b>Kage Heroes Bot Aktif</b>',
        `📡 Server: <code>${esc(acc.servers.join(', ') || '-')}</code>  |  Versi: <code>${esc(settings.version)}</code>`,
        `⚙️ Mode: <code>Notify-Only (Cloudflare Workers)</code>`,
        this._fmtFooter(),
      ].join('\n');
      try {
        const res = await tg.sendMessage(
          this.env.TELEGRAM_CHAT_ID,
          msg,
          { threadId: this.env.TELEGRAM_THREAD_ID }
        );
        return Response.json({ ok: true, messageId: res && res.message_id, alarm });
      } catch (e) {
        this._log(`tg notify err: ${e.message}`, 'error');
        return Response.json({ ok: false, error: e.message, alarm }, { status: 502 });
      }
    }
    if (request.method === 'GET' && url.pathname === '/status') {
      const acc = this._getAccount();
      const settings = this._getSettings();
      const now = new Date();
      const day = schedule.ymd(now);
      const servers = acc.servers.map((srv) => ({
        server: srv,
        snapshot: this._getSnapshot(srv),
        services: this._getServiceState(srv, day),
      }));
      const logs = this.sql.exec('SELECT ts, level, msg FROM logs ORDER BY id DESC LIMIT 20').toArray();
      return Response.json({
        ok: true,
        wib: `${day} ${schedule.hhmm(now)}`,
        version: settings.version,
        nextAlarm: await this.ctx.storage.getAlarm(),
        servers,
        logs,
      });
    }
    return Response.json({ ok: false, error: 'unknown DO route' }, { status: 404 });
  }
}
