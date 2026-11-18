async function submitAll(s, keys, log) {
  const list = keys || s.store.claimable();
  let ok = 0, silver = 0, gold = 0;
  for (const k of list) {
    if (s.closed) break;
    const g0 = s.store.player.gold, s0 = s.store.player.silver;
    const r = await s.cmd('submitQuest', { key: k, id: k }, 1500);
    const dg = (s.store.player.gold || 0) - g0, ds = (s.store.player.silver || 0) - s0;
    const o = r && r.operResult;
    if (o && o.res === 0) {
      ok++; silver += ds; gold += dg;
      const bits = [];
      if (ds) bits.push(`silver +${ds}`);
      if (dg) bits.push(`gold +${dg}`);
      log(`claim q${k}: ok${bits.length ? ' ' + bits.join(' ') : ''}`);
    } else if (o) {
      log(`claim q${k}: FAILED res${o.res} type${o.type}`);
    } else {
      log(`claim q${k}: no answer (gold ${s.store.player.gold})`);
    }
  }
  if (list.length) log(`claim: ${ok}/${list.length} quest claimed (silver +${silver}${gold ? `, gold +${gold}` : ''})`);
  return { count: ok, silver, gold };
}

async function claimMilestones(s, log) {
  const got = [];
  for (const i of [0, 1, 2]) {
    if (s.closed) break;
    const before = s.store.player.gold;
    await s.cmd('questReward', { idx: i }, 1400);
    const dg = (s.store.player.gold || 0) - before;
    if (dg) { got.push(`milestone#${i} +${dg} gold`); log(`claim ${got[got.length - 1]}`); }
  }
  if (!got.length) log('claim: milestone belum bisa (20/40/60 butuh 5/10/15 quest)');
  return got;
}

async function claimBacklog(s, log) {
  await s.cmd('openBuild', { id: 11 }, 2500);
  const backlog = s.store.claimable();
  const out = await submitAll(s, backlog, log);
  const milestones = await claimMilestones(s, log);
  if (milestones.length) out.gold += milestones.reduce((n, l) => n + Number(l.split('+')[1].split(' ')[0]), 0);
  out.milestones = milestones.length;
  if (!backlog.length) log('claim: tidak ada quest menggantung');
  return out;
}

export { submitAll, claimBacklog, claimMilestones };
