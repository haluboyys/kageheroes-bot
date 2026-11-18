async function fetchRank(s, log) {
  s.sendCommand('requestRank', { type: 0 });
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const r = await s.receiveSource(2000);
    if (r === null) continue;
    if (r.__closed) return [];
    if (r.rankInfo) return r.rankInfo;
  }
  log('arena: rank tidak tersedia - skip');
  return [];
}

async function oneFight(s, rows, i, log, guard) {
  const g0 = s.store.player.gold;
  const row = rows[i];
  guard.send('challege', { indexs: i, idx: i, listData: rows, name: row && row[0] });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const r = await s.receiveSource(2500);
    if (r === null) continue;
    if (r.__closed) {
      log(`arena: koneksi putus saat fight idx ${i}`);
      return null;
    }
    if (typeof s.store.player.gold === 'number' && s.store.player.gold < g0) {
      log(`arena: ! gold terpakai ${g0}->${s.store.player.gold} - ABORT`);
      s.close();
      throw new Error('gold-spend guard tripped');
    }
    if (r.fightRes) return r.fightRes;
  }
  return undefined;
}

async function runArena(s, nFights, log, guard) {
  const N = Math.max(0, Number(nFights) || 0);
  if (!N) return 0;

  const q = (s.store.quest.list || {})[16];
  if (q === 1 || q === 2) {
    log(`arena: quest 16 sudah ${q === 1 ? 'bisa diklaim' : 'selesai'} - tidak perlu fight`);
    return 0;
  }

  const bd = s.store.buildings.bd[12] || {};
  if (typeof bd.num === 'number' && bd.num <= 0) {
    log('arena: jatah hari ini habis (10/hari) - skip');
    return 0;
  }

  const rows = await fetchRank(s, log);
  if (!rows.length) return 0;

  const order = rows.map((r, i) => ({ i, power: (r && r[3]) || Infinity }));
  order.sort((a, b) => a.power - b.power);

  let fights = 0, wins = 0;
  const cap = typeof bd.num === 'number' ? Math.min(N, bd.num) : N;
  const g0 = s.store.player.gold, s0 = s.store.player.silver;
  for (let k = 0; k < order.length && fights < cap && !s.closed; k++) {
    const i = order[k].i;
    const fr = await oneFight(s, rows, i, log, guard);
    if (fr === null) break;
    fights++;
    if (fr && fr.win) wins++;
    const ds = (s.store.player.silver || 0) - s0;
    log(`arena ${fights}/${cap}: vs ${(rows[i] && rows[i][0]) || '?'} ${fr ? (fr.win ? 'WIN' : 'LOSE') : 'no-answer'}` +
        `${ds ? ` silver +${ds}` : ''}`);
    await new Promise((r) => setTimeout(r, 700));
  }
  log(`arena: ${fights} fight (${wins} win) quest16 butuh 5 fight, status refresh saat login berikutnya`);
  return fights;
}

export { runArena };
