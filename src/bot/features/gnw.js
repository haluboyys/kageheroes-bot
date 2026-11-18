async function runGNW(s, log) {
  const getState = async () => {
    s.queue.length = 0;
    s.sendCommand('requestWarInfo', 1);
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
      const r = await s.waitFor('warInfo', deadline - Date.now());
      if (!r || r.__closed) return null;
      if (r.warInfo && typeof r.warInfo.currPass === 'number' && r.warInfo.allAttackers) {
        return r.warInfo;
      }
    }
    return null;
  };
  const hp = (w, hids) => hids.map((h) => ((w.allAttackers || {})[String(h)]));
  const roster = (w) => Object.keys((w && w.allAttackers) || {}).filter((h) => /^\d+$/.test(h) && Number(h) > 0).map(Number);
  const aliveOf = (w) => roster(w).filter((h) => ((w.allAttackers[String(h)] || 0) > 0));
  const teamOf = (w) => {
    const all = roster(w);
    const alive = all.filter((h) => ((w.allAttackers[String(h)] || 0) > 0));
    if (!alive.length) return [];
    const cur = Array.isArray(w.currAttackers) ? w.currAttackers.filter((h) => all.includes(h)) : [];
    const sel = cur.filter((h) => alive.includes(h)).concat(alive.filter((h) => !cur.includes(h))).slice(0, 3);
    for (const h of cur) if (sel.length < 3 && !sel.includes(h)) sel.push(h);
    for (const h of all) if (sel.length < 3 && !sel.includes(h)) sel.push(h);
    return sel.slice(0, 3);
  };

  let state = await getState();
  if (!state) {
    log(s.closed ? `gnw: sesi sudah putus (${s.endReason}) - state tidak terbaca` : 'gnw: tidak ada state (belum pernah ikut perang?)');
    return { ok: false };
  }
  const out = { ok: true, stage: state.currPass, battles: 0, wins: 0, lastStage: state.currPass };
  const t0 = Date.now();
  log(`gnw: stage ${state.currPass} status ${state.status} (restart ${state.num}/${state.total}, ${aliveOf(state).length}/${roster(state).length} hidup)`);

  if (state.num === 1 && state.total === 1) {
    let after = null;
    for (let tryNo = 1; tryNo <= 2; tryNo++) {
      s.sendCommand('restartWar', 1);
      after = await getState();
      const full = after && roster(after).length > 0 && roster(after).every((h) => (after.allAttackers[String(h)] || 0) === 1);
      if (after && after.num === 0 && after.currPass === 0 && full) break;
      after = null;
      if (tryNo === 2) break;
      log('gnw: restart belum terkonfirmasi - ulang sekali');
    }
    if (!after) {
      log('gnw: restart gratis gagal - perang berakhir hari ini');
      out.ok = false;
      return out;
    }
    state = after;
    out.stage = 0;
    out.lastStage = 0;
    log('gnw: restart gratis - mulai perang dari awal');
    try {
      await s.cmd('openBuild', { id: 11 }, 2500);
      state = await getState();
      const q = (s.store.quest && s.store.quest.list) || {};
      log(`gnw: quest refresh ${JSON.stringify(q)}`);
    } catch (e) { }
  }

  const claimed = new Set();
  for (let i = 0; i < 60; i++) {
    state = await getState();
    if (!state) break;
    const hids = teamOf(state);
    if (!hids.length) {
      log('gnw: semua pasukan mati dan restart tidak tersedia - perang berakhir hari ini');
      out.ok = false;
      break;
    }
    const same = (a, b) => Array.isArray(a) && a.length === b.length && [...a].sort((x, y) => x - y).join() === [...b].sort((x, y) => x - y).join();
    if (!same(hids, state.currAttackers)) {
      s.sendCommand('setWarAttackers', { hids });
      state = await getState();
      if (!state || !same(hids, state.currAttackers)) {
        log('gnw: gagal set pasukan (butuh 3 ninja hidup lv>10) - stop');
        out.ok = false;
        break;
      }
    }
    const before = state.currPass;
    if (typeof before !== 'number' || before < 0) { log('gnw: stage tidak valid - stop'); out.ok = false; break; }
    if (before > 0 && state.status === 0 && !claimed.has(before)) {
      claimed.add(before);
      const tClaim = Date.now();
      s.sendCommand('getWarReward', 1);
      state = await getState();
      if (!state) break;
      log(`gnw: klaim reward stage ${before} -> status ${state.status}, pass ${state.currPass}, restart ${state.num}/${state.total} (${Date.now() - tClaim}ms)`);
    }
    log(`gnw: fight #${out.battles + 1} stage ${before} status ${state.status} hids ${JSON.stringify(hids)} hp ${JSON.stringify(hp(state, hids))}`);
    s.sendCommand('doWarFight', {});
    const tFight = Date.now();
    const r = await s.waitFor('fightRes', 45000);
    if (!r || !r.fightRes) { log('gnw: hasil pertarungan tidak jelas - stop'); break; }
    if (!out.battles) log(`gnw: fightRes #1 ${JSON.stringify(r.fightRes).slice(0, 300)}`);
    const beforeHp = hp(state, hids);
    state = await getState();
    out.battles++;
    if (r.fightRes.win) out.wins++;
    const now = state && state.currPass;
    log(`gnw: ${r.fightRes.win ? 'WIN' : 'LOSE'} stage ${before} -> ${now} (status ${state && state.status}, ${Date.now() - tFight}ms, hp ${JSON.stringify(hp(state || {}, hids))} dari ${JSON.stringify(beforeHp)})`);
    if (typeof now === 'number') out.lastStage = now;
    if (!state) break;
    if (!aliveOf(state).length) continue;
    if (now === before && JSON.stringify(hp(state, hids)) === JSON.stringify(beforeHp)) {
      log('gnw: tidak ada kemajuan - stop');
      break;
    }
  }
  if (out.battles) log(`gnw: ${out.battles} battle, ${out.wins} win, stage terakhir ${out.lastStage}, status ${state ? state.status : '-'} (${Math.round((Date.now() - t0) / 1000)}s)`);
  try {
    await s.cmd('openBuild', { id: 11 }, 2500);
    log(`gnw: quest akhir ${JSON.stringify((s.store.quest && s.store.quest.list) || {})}`);
  } catch (e) { }
  return out;
}

export { runGNW };
