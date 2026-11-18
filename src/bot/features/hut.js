import { buildState } from '../safety.js';

const CAPTURE_PAYLOAD = { id: 0, count: 1, idx: 0 };

async function captureFree(s, maxCaptures, log, guard) {
  let done = 0;
  let reason = 'done';
  let cd = null;
  while (done < maxCaptures && !s.closed) {
    const b = await buildState(s, 1, log);
    cd = Array.isArray(b.cd) ? b.cd[1] : null;
    const num = b.num;
    if (typeof num !== 'number') { log('hut: data bangunan tidak tersedia - skip'); reason = 'nodata'; break; }
    if (num <= 0) { log('hut: jatah tangkap gratis habis - stop'); reason = 'quota'; break; }
    if (cd !== 0) { log(`hut: cooldown ${cd}s (sisa gratis ${num}) - tunggu putaran berikutnya`); reason = 'cooldown'; break; }

    const qBefore = s.store.quest.list ? s.store.questString() : null;
    const g0 = s.store.player.gold, s0 = s.store.player.silver;
    guard.sendFree('raffle', CAPTURE_PAYLOAD);
    await s.receiveSource(3500);
    const g1 = s.store.player.gold, s1 = s.store.player.silver;
    if (g1 !== g0) {
      log(`hut: ! tangkap malah makan gold ${g0}->${g1} - ABORT`);
      s.close();
      throw new Error('gold-spend guard tripped');
    }
    done++;
    reason = 'captured';
    const b1 = s.store.buildings.bd[1] || {};
    const qAfter = s.store.quest.list ? s.store.questString() : null;
    log(`hut: capture gratis ok (sisa ${b1.num ?? '?'})` +
      (s1 !== s0 ? ` silver ${s0}->${s1}` : '') +
      (qAfter && qAfter !== qBefore ? ` quest[${qBefore} -> ${qAfter}]` : ''));
    break;
  }
  return { captured: done, reason, cd, left: (s.store.buildings.bd[1] || {}).num };
}

export { captureFree, CAPTURE_PAYLOAD };
