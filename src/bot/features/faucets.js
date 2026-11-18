async function claimMails(s, log) {
  const tab = s.store.mails['1'] || {};
  const ids = Object.values(tab).filter((m) => m.n === 1).map((m) => m.id);
  if (!ids.length) return 0;
  let gained = 0, n = 0;
  for (const id of ids) {
    if (s.closed) break;
    const before = s.store.player.gold;
    const r = await s.cmd('rewardMail', { tab: 1, id }, 1500);
    if (r && !r.__closed && r.operResult && r.operResult.res === 0) {
      gained += (s.store.player.gold || 0) - before;
      n++;
    }
  }
  log(`claim mail -> ${n}/${ids.length} mail diklaim, gold ${s.store.player.gold}${gained ? ` (+${gained})` : ''}`);
  return gained;
}

async function claimGold(s, log, cmd, label) {
  const before = s.store.player.gold;
  await s.cmd(cmd, {}, 1400);
  const dg = (s.store.player.gold || 0) - before;
  log(`claim ${label} -> ${dg ? `+${dg} gold` : 'sudah diklaim'}`);
  return dg;
}

async function claimDayReward(s, log) {
  if (s.closed) return 0;
  return claimGold(s, log, 'dayReward', 'streak');
}

async function claimShare(s, log) {
  if (s.closed) return 0;
  const dg = await claimGold(s, log, 'getShareTaskAward', 'share');
  await s.cmd('getShareTaskState', {}, 1400);
  return dg;
}

export { claimMails, claimDayReward, claimShare };
