const WIB_OFFSET_MS = 7 * 3600000;
const pad = (n) => String(n).padStart(2, '0');
const toWib = (d) => new Date(d.getTime() + WIB_OFFSET_MS);

export const hhmm = (d) => {
  const w = toWib(d);
  return `${pad(w.getUTCHours())}:${pad(w.getUTCMinutes())}`;
};

export const ymd = (d) => {
  const w = toWib(d);
  return `${w.getUTCFullYear()}-${pad(w.getUTCMonth() + 1)}-${pad(w.getUTCDate())}`;
};

export const isWeekend = (d) => {
  const day = toWib(d).getUTCDay();
  return day === 6 || day === 0;
};

export const FULL_DAY = 24 * 60;
export const MAX_FAILS = 3;

export function parseTimes(str) {
  return String(str || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const m = /^(\d{1,2}):(\d{2})$/.exec(t);
      if (!m) throw new Error(`jam tidak valid: "${t}" (contoh 01:00,20:00)`);
      const h = Number(m[1]);
      const mi = Number(m[2]);
      if (h > 23 || mi > 59) throw new Error(`jam tidak valid: "${t}"`);
      return `${pad(h)}:${pad(mi)}`;
    });
}

export function atTime(d, t) {
  const [h, m] = t.split(':').map(Number);
  const w = toWib(d);
  return new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate(), h, m, 0, 0) - WIB_OFFSET_MS);
}

export function slotOf(sv, settings, now) {
  const times = typeof sv.at === 'function' ? sv.at(settings, now) : null;
  if (!times || !times.length) return { slot: 'any', lateMin: 0 };
  let best = null;
  for (const t of times) {
    const at = atTime(now, t);
    if (now >= at && (!best || at > best.at)) best = { slot: t, at };
  }
  if (!best) return null;
  return { slot: best.slot, lateMin: Math.round((now - best.at) / 60000) };
}

export function maxOf(sv, settings) {
  return typeof sv.max === 'function' ? Number(sv.max(settings)) : Infinity;
}

export function dueOne(svc, entry, settings, now) {
  if (typeof svc.disabled === 'function' && svc.disabled(settings)) return null;
  const s = slotOf(svc, settings, now);
  if (!s) return null;
  const late = svc.late || FULL_DAY;
  if (entry.slot !== s.slot) {
    if (s.lateMin > late) return { svc, entry, slot: s.slot, lateMin: s.lateMin, missed: true };
    return { svc, entry, slot: s.slot, lateMin: s.lateMin, fresh: true };
  }
  if (entry.done) return null;
  if (entry.nextDue && entry.nextDue > now.getTime()) return null;
  return { svc, entry, slot: s.slot, lateMin: s.lateMin, fresh: false };
}

export function due(state, services, settings, now) {
  const out = [];
  const flags = settings.enabledFeatures || {};
  for (const sv of services) {
    if (sv.flag && flags[sv.flag] === false) continue;
    const entry = state[sv.name] || (state[sv.name] = {});
    const item = dueOne(sv, entry, settings, now);
    if (!item) continue;
    if (!item.missed) {
      entry.slot = item.slot;
      if (item.fresh) Object.assign(entry, { count: 0, done: false, opened: false, nextDue: 0 });
    }
    out.push(item);
  }
  return out;
}

export function markMissed(entry, item) {
  entry.slot = item.slot;
  entry.done = true;
  entry.missed = true;
}

export function record(entry, sv, res, settings, now) {
  const r = res || {};
  if (r.error) {
    entry.fails = (entry.fails || 0) + 1;
    if (entry.fails >= MAX_FAILS) {
      entry.done = true;
      entry.failed = true;
      entry.nextDue = 0;
      return entry;
    }
    entry.nextDue = now.getTime() + (r.nextIn || 5 * 60000);
    return entry;
  }
  entry.fails = 0;
  entry.count = (entry.count || 0) + 1;
  const max = maxOf(sv, settings);
  if (r.done || max === 0 || entry.count >= max) {
    entry.done = true;
    entry.nextDue = 0;
    return entry;
  }
  const gap = typeof sv.gap === 'function' ? sv.gap(settings) : 5 * 60000;
  entry.nextDue = now.getTime() + (r.nextIn || gap);
  return entry;
}

export function next(services, settings, state, now, limit) {
  const cands = [];
  const w = toWib(now);
  const baseUtc = Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate(), 0, 0, 0, 0) - WIB_OFFSET_MS;
  for (let i = 0; i < 3; i++) {
    const day = new Date(baseUtc + i * 86400000);
    for (const sv of services) {
      let times;
      try {
        times = typeof sv.at === 'function' ? sv.at(settings, day) : [];
      } catch {
        continue;
      }
      for (const t of times) {
        const at = atTime(day, t);
        if (at <= now) continue;
        cands.push({ name: sv.name, label: sv.label, at, time: t });
      }
    }
  }
  cands.sort((a, b) => a.at - b.at);
  return cands.slice(0, limit || 4);
}
