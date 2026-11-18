import { buildState } from '../safety.js';

async function whackFree(s, maxDigs, log, guard) {
  let done = 0;
  let reason = 'done';
  let cd = null;
  while (done < maxDigs && !s.closed) {
    const b = await buildState(s, 4, log);
    cd = Array.isArray(b.cd) ? b.cd[0] : null;
    const num = b.num;
    if (typeof num !== 'number') { log('whack: data bangunan tidak tersedia - skip'); reason = 'nodata'; break; }
    if (num <= 0) { log('whack: jatah dig gratis habis - stop'); reason = 'quota'; break; }
    if (cd !== 0) { log(`whack: cooldown ${cd}s (sisa gratis ${num}) - tunggu putaran berikutnya`); reason = 'cooldown'; break; }

    const before = s.store.quest.list ? s.store.questString() : null;
    const g0 = s.store.player.gold;
    if (!guard.send('dig', {})) { reason = 'guard'; break; }
    await s.receiveSource(3500);
    const g1 = s.store.player.gold;
    if (g1 !== g0) {
      log(`whack: ! dig malah makan gold ${g0}->${g1} - ABORT`);
      s.close();
      throw new Error('gold-spend guard tripped');
    }
    done++;
    reason = 'dug';
    const left = (s.store.buildings.bd[4] || {}).num;
    const after = s.store.quest.list ? s.store.questString() : null;
    log(`whack: dig gratis ok (sisa ${left})` + (after && after !== before ? ` quest[${before} -> ${after}]` : ''));
    break;
  }
  return { dug: done, reason, cd, left: (s.store.buildings.bd[4] || {}).num };
}

export { whackFree };
