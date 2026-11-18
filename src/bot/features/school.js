import { buildState } from '../safety.js';

function freeSlot(h) {
  const g0 = h && Array.isArray(h.skill) ? h.skill[0] : null;
  if (!Array.isArray(g0)) return -1;
  for (let i = 0; i < 4; i++) {
    const v = g0[i];
    if (v === null || v === undefined || v === 0) return i;
  }
  return -1;
}

function hasFreeSlot(h) {
  return freeSlot(h) >= 0;
}

function skillMap(s) {
  const out = {};
  for (const hid of Object.keys(s.store.hes || {})) {
    const h = s.store.hes[hid];
    const g0 = h && Array.isArray(h.skill) ? h.skill[0] : null;
    out[hid] = Array.isArray(g0) ? g0.filter((v) => v !== null && v !== undefined && v !== 0).map(Number) : [];
  }
  return out;
}

function overwritten(before, after) {
  const hits = [];
  for (const hid of Object.keys(before)) {
    const now = new Set(after[hid] || []);
    for (const sid of before[hid]) if (!now.has(sid)) hits.push({ hid: Number(hid), sid });
  }
  return hits;
}

function pickHero(s) {
  const hes = s.store.hes || {};
  const hids = Object.keys(hes).map(Number).sort((a, b) => a - b);
  for (const hid of hids) {
    const idx = freeSlot(hes[hid]);
    if (idx >= 0) return { hid, idx };
  }
  return null;
}

function trainPayload(hid) {
  return {
    hid, id: 2, idx: 0, index: 0, type: 0, studyType: 0, data: '', key: 0,
    lastSid: 0, skillList: [], skillItemIndex: 0, sid: 0, category: 0, role_idx: 0, skillBox: 0,
  };
}

async function trainFree(s, maxTrains, log, guard) {
  let done = 0;
  let reason = 'done';
  let cd = null;
  while (done < maxTrains && !s.closed) {
    const b = await buildState(s, 2, log);
    cd = Array.isArray(b.cd) ? b.cd[1] : null;
    const num = b.num;
    if (typeof num !== 'number') { log('school: data bangunan tidak tersedia - skip'); reason = 'nodata'; break; }
    if (num <= 0) { log('school: jatah latihan gratis habis - stop'); reason = 'quota'; break; }
    if (cd !== 0) { log(`school: cooldown ${cd}s (sisa gratis ${num}) - tunggu putaran berikutnya`); reason = 'cooldown'; break; }

    const pick = pickHero(s);
    if (pick === null) {
      log('school: semua hero penuh - tidak ada slot jutsu kosong, dilewati biar jutsu lama tidak tertimpa');
      reason = 'full';
      break;
    }

    const qBefore = s.store.quest.list ? s.store.questString() : null;
    const g0 = s.store.player.gold, s0 = s.store.player.silver, p0 = s.store.player.spoint;
    const skBefore = skillMap(s);
    s.store.lastOper = null;
    guard.sendFree('studySkill', trainPayload(pick.hid));
    await s.receiveSource(3500);
    if (s.store.player.gold !== g0) {
      log(`school: ! latihan malah makan gold ${g0}->${s.store.player.gold} - ABORT`);
      s.close();
      throw new Error('gold-spend guard tripped');
    }
    const op0 = s.store.lastOper;
    if (!op0 || op0.type !== 3 || op0.res !== 0 || !op0.param || !op0.param.replace) {
      log(`school: latihan ditolak server (${op0 ? `type ${op0.type} res ${op0.res}` : 'tanpa balasan'}) - skip`);
      reason = 'nodata';
      break;
    }
    guard.sendFree('replaceSkill', { idx: pick.idx });
    for (let k = 0; k < 3; k++) {
      const r = await s.receiveSource(2500);
      if (r === null || r.__closed) break;
      if (r.operResult) break;
    }
    done++;
    reason = 'trained';
    const gone = overwritten(skBefore, skillMap(s));
    if (gone.length) {
      reason = 'overwrite';
      log(`school: ! ninjutsu lama tertimpa ${gone.map((h) => `hid ${h.hid} sid ${h.sid}`).join(', ')} - berhenti`);
    }
    const g1 = s.store.player.gold, s1 = s.store.player.silver, p1 = s.store.player.spoint;
    const b2 = s.store.buildings.bd[2] || {};
    const qAfter = s.store.quest.list ? s.store.questString() : null;
    const sid = op0.param.sid;
    log(`success school train jutsu hid ${pick.hid} slot ${pick.idx} (sisa ${b2.num ?? '?'})` +
      (sid !== undefined ? ` sid ${sid}` : '') +
      (p1 !== p0 ? ` spoint ${p0}->${p1}` : '') +
      (s1 !== s0 ? ` silver ${s0}->${s1}` : '') +
      (qAfter && qAfter !== qBefore ? ` quest[${qBefore} -> ${qAfter}]` : ''));
    break;
  }
  return { trained: done, reason, cd, left: (s.store.buildings.bd[2] || {}).num };
}

export const pickHid = (s) => { const p = pickHero(s); return p ? p.hid : null; };
export { trainFree, pickHero, trainPayload, hasFreeSlot, freeSlot, skillMap, overwritten };
