const BEAST_DAILY_H = 20, BEAST_WEEKEND_H = 15;
const RAMEN_HOURS = [12, 18];

function inBeastWindow(d) {
  const day = d.getDay(), h = d.getHours();
  if (h >= BEAST_DAILY_H) return true;
  if ((day === 6 || day === 0) && h >= BEAST_WEEKEND_H) return true;
  return false;
}

function nextDailySlot(from, hours) {
  for (let i = 0; i < 4; i++) {
    const base = new Date(from.getTime() + i * 86400000);
    base.setHours(0, 0, 0, 0);
    for (const h of hours) {
      const t = new Date(base);
      t.setHours(h, 0, 0, 0);
      if (t.getTime() > from.getTime()) return t;
    }
  }
  return null;
}

function nextBeastStart(from) {
  for (let i = 0; i < 10; i++) {
    const base = new Date(from.getTime() + i * 86400000);
    base.setHours(0, 0, 0, 0);
    const day = base.getDay();
    const slots = [];
    if (day === 6 || day === 0) slots.push(BEAST_WEEKEND_H);
    slots.push(BEAST_DAILY_H);
    for (const h of slots) {
      const t = new Date(base);
      t.setHours(h, 0, 0, 0);
      if (t.getTime() > from.getTime()) return t;
    }
  }
  return null;
}

function currentBeastSlot(d) {
  const day = d.getDay(), h = d.getHours();
  const slots = [];
  if (day === 6 || day === 0) slots.push(BEAST_WEEKEND_H);
  slots.push(BEAST_DAILY_H);
  let chosen = null;
  for (const s of slots) if (h >= s) chosen = Math.max(chosen === null ? -1 : chosen, s);
  if (chosen === null) return null;
  const at = new Date(d); at.setHours(chosen, 0, 0, 0);
  const key = `${at.getFullYear()}-${at.getMonth() + 1}-${at.getDate()}#${chosen}`;
  return { key, at };
}

function currentRamenSlot(d) {
  const h = d.getHours();
  if (!RAMEN_HOURS.includes(h)) return null;
  const at = new Date(d); at.setHours(h, 0, 0, 0);
  const key = `${at.getFullYear()}-${at.getMonth() + 1}-${at.getDate()}#${h}`;
  return { key, at };
}

async function beastCool(s) {
  await s.cmd('openBuild', { id: 13 }, 2500);
  const b = (s.store.buildings.bd || {})['13'] || {};
  const cd = b.cd;
  return Array.isArray(cd) && cd.length >= 2 ? (Number(cd[1]) || 0) : null;
}

async function beastAttack(s, log, guard) {
  const cooldown = await beastCool(s);
  const open = s.store.player.beastOpen;
  if (open !== 1) { log('beast: belum buka'); return { hit: false, open, cooldown }; }
  if (typeof cooldown !== 'number') { log('beast: cooldown tidak diketahui - batal'); return { hit: false, open, cooldown: null }; }
  if (cooldown > 0) { log(`beast: cooldown ${cooldown}s - tunggu`); return { hit: false, open, cooldown }; }

  const g0 = s.store.player.gold;
  if (!guard.send('beastFight', 1)) return { hit: false, open, cooldown };
  let res = null;
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const r = await s.receiveSource(4000);
    if (r === null) continue;
    if (r.__closed) return { hit: false, open, cooldown };
    if (r.fightRes && typeof r.fightRes.win === 'number' && [0, 1].includes(r.fightRes.win)) { res = r.fightRes; break; }
    if (s.store.player.gold < g0) { log(`beast: ! gold terpakai ${g0}->${s.store.player.gold} - abort`); s.close(); throw new Error('guard'); }
  }
  const dg = (s.store.player.gold || 0) - g0;
  const boss = res && res.fighters && res.fighters[1] && res.fighters[1].roleList && res.fighters[1].roleList[0];
  const hp = boss && typeof boss.hpRate === 'number' ? ` beast ${Math.round(boss.hpRate * 100)}%` : '';
  log(res ? `beast: ${res.win ? 'WIN' : 'LOSE'}${hp} (gold ${dg >= 0 ? '+' : ''}${dg})` : 'beast: tidak ada jawaban fightRes');
  guard.check('beast');
  const after = await beastCool(s);
  return { hit: !!res, open: s.store.player.beastOpen, cooldown: after };
}

async function claimRamen(s, log) {
  const before = s.store.player.energy;
  s.sendCommand('giveEnergy', {});
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const r = await s.receiveSource(2500);
    if (r === null) continue;
    if (r.__closed) break;
    if (r.player && typeof r.player.energy === 'number' && r.player.energy > before) {
      log(`claim ramen -> claim stamina success ${before} -> ${r.player.energy}`);
      return true;
    }
    if (r.operResult && r.operResult.type === 9) {
      if (r.operResult.res === 0) { log(`claim ramen -> sudah diklaim (stamina ${before})`); return true; }
      log(`claim ramen -> gagal, di luar jam 12:00/18:00 (res${r.operResult.res})`);
      return false;
    }
  }
  log('claim ramen -> tidak ada jawaban dari server');
  return false;
}

export {
  inBeastWindow, nextDailySlot, nextBeastStart, currentBeastSlot, currentRamenSlot,
  beastAttack, claimRamen, BEAST_DAILY_H, BEAST_WEEKEND_H, RAMEN_HOURS,
};
