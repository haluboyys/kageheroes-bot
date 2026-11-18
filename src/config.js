import { parseTimes } from './schedule.js';

export const DEFAULT_SETTINGS = {
  version: '2.6.1',
  channel: '108',
  httpHost: 'central.kageherostudio.com',
  httpPort: 80,
  claimAt: '01:00',
  claimEnabled: true,
  dailyAt: '01:00',
  whackAt: '01:00',
  schoolAt: '01:00',
  hutAt: '01:00',
  ramenTimes: '12:00,18:00',
  beastDaily: '20:00',
  beastWeekend: '15:00,20:00',
  digs: 4,
  whackGapMin: 5,
  schoolTrains: 3,
  schoolGapMin: 5,
  hutCaptures: 5,
  hutGapMin: 5,
  arenaFights: 5,
  floors: 0,
  retries: 5,
  enabledFeatures: { mails: true, daily: true, arena: true, dig: true, tower: true, gnw: true },
};

export const DEFAULT_ACCOUNT = { id: 'main', email: '', password: '', servers: [], enabled: true };

export const SETTABLE = {
  version:      { type: 'string',  desc: 'game client version sent at login (e.g. 2.6.1)' },
  channel:      { type: 'string',  desc: 'channel id (default 108)' },
  claimAt:      { type: 'time',    desc: 'HH:MM claim semua quest (sebelum daily, default 01:00)' },
  claimEnabled: { type: 'bool',    desc: 'jalankan claim-all otomatis tiap hari (true/false)' },
  dailyAt:      { type: 'time',    desc: 'HH:MM rutinitas harian (default 01:00)' },
  whackAt:      { type: 'time',    desc: 'HH:MM mulai dig Whack-a-Ninja (default 01:00)' },
  schoolAt:     { type: 'time',    desc: 'HH:MM mulai latihan gratis Ninjutsu School (default 01:00)' },
  hutAt:        { type: 'time',    desc: 'HH:MM mulai tangkap gratis Ninja Hut (default 01:00)' },
  ramenTimes:   { type: 'times',   desc: 'jam ramen, contoh 12:00,18:00' },
  beastDaily:   { type: 'time',    desc: 'HH:MM Tailed Beast hari kerja (default 20:00)' },
  beastWeekend: { type: 'times',   desc: 'jam Tailed Beast Sabtu/Minggu, contoh 15:00,20:00' },
  digs:         { type: 'int', min: 0, max: 10, desc: 'dig gratis per hari' },
  whackGapMin:  { type: 'int', min: 1, max: 60, desc: 'menit jeda antar dig' },
  schoolTrains: { type: 'int', min: 0, max: 10, desc: 'latihan gratis Ninjutsu School per hari' },
  schoolGapMin: { type: 'int', min: 1, max: 60, desc: 'menit jeda antar latihan sekolah' },
  hutCaptures:  { type: 'int', min: 0, max: 10, desc: 'tangkap gratis Ninja Hut per hari' },
  hutGapMin:    { type: 'int', min: 1, max: 60, desc: 'menit jeda antar tangkap hut' },
  arenaFights:  { type: 'int', min: 0, max: 50, desc: 'arena battles (quest 16 butuh 5)' },
  floors:       { type: 'int', min: 0, desc: 'tower floors per menara (0 = sebanyak yang diizinkan)' },
  retries:      { type: 'int', min: 1, max: 50, desc: 'tower: kalah N kali lalu keluar' },
};

export function bumpVersion(version) {
  const parts = String(version || '').split('.');
  const patch = Number(parts[parts.length - 1]);
  if (parts.length < 2 || !Number.isFinite(patch)) return null;
  parts[parts.length - 1] = String(patch + 1);
  return parts.join('.');
}

export function coerceSetting(key, raw) {
  const spec = SETTABLE[key];
  if (!spec) throw new Error(`unknown setting: ${key}`);
  if (spec.type === 'bool') {
    const v = String(raw).toLowerCase();
    if (['1', 'true', 'on', 'yes'].includes(v)) return true;
    if (['0', 'false', 'off', 'no'].includes(v)) return false;
    throw new Error(`${key} must be true/false`);
  }
  if (spec.type === 'time') {
    const t = parseTimes(String(raw));
    if (t.length !== 1) throw new Error(`${key} harus satu jam HH:MM`);
    return t[0];
  }
  if (spec.type === 'times') {
    const t = parseTimes(String(raw));
    if (!t.length) throw new Error(`${key} tidak boleh kosong`);
    return t.join(',');
  }
  if (spec.type === 'int') {
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n)) throw new Error(`${key} must be an integer`);
    if (spec.min !== undefined && n < spec.min) throw new Error(`${key} must be >= ${spec.min}`);
    if (spec.max !== undefined && n > spec.max) throw new Error(`${key} must be <= ${spec.max}`);
    return n;
  }
  const s = String(raw).trim();
  if (!s) throw new Error(`${key} must not be empty`);
  return s;
}
