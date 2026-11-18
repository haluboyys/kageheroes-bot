import { waitBuild } from '../safety.js';

const isOpen = (x) => !!(x && typeof x.currPass === 'number' && x.currPass >= 0);

async function logQuests(s, name, log) {
  try {
    await s.cmd('openBuild', { id: 11 }, 2500);
    const q = (s.store.quest && s.store.quest.list) || {};
    const txt = Object.keys(q).map(Number).sort((a, b) => a - b).map((k) => `${k}:${q[k]}`).join(' ');
    log(`tower ${name}: quest ${txt}`);
  } catch (e) { }
}

async function quitTower(s, snt, key, log) {
  const cmd = snt ? 'endExam' : 'newEndExam';
  const build = snt ? 9 : 16;
  const name = snt ? 'SNT' : 'GST';
  s.sendCommand(cmd, { '1': 1 });
  let r = await s.waitFor(key, 25000);
  if (!(r && r[key] && r[key].currPass === -1)) {
    s.sendCommand('openBuild', { id: build });
    r = await s.waitFor(key, 25000);
  }
  if (!(r && r[key] && r[key].currPass === -1)) log(`tower ${name}: keluar tidak terkonfirmasi`);
}

async function runTower(s, snt, floors, retries, log, guard) {
  const [name, build, key, start, fight] = snt
    ? ['SNT', 9, 'exam', 'doExamOption', 'examFight']
    : ['GST', 16, 'newexam', 'doNewExamOption', 'newExamFight'];
  const out = { name, entered: false, lastFloor: null, wins: 0, losses: 0, skipped: null, ok: false };

  const gate = await waitBuild(s, build, 8000);

  s.sendCommand('openBuild', { id: build });
  const st = await s.waitFor(key, 25000);
  if (!st || st.__closed) { log(`tower ${name}: gagal masuk`); return out; }
  let state = st[key];

  if (gate && gate.num <= 0 && !isOpen(state)) {
    out.skipped = 'jatah habis';
    log(`tower ${name}: skip - jatah hari ini habis`);
    return out;
  }

  out.entered = true;
  if (isOpen(state)) log(`tower ${name}: lanjut menara yang masih terbuka, lantai ${state.currPass}`);
  else log(`tower ${name}: masuk, lantai ${state.currPass}`);

  const limit = floors > 0 ? floors : Infinity;
  const MAXLOSS = Math.max(1, Number(retries) || 5);
  let completed = 0, attempts = 0, losses = 0, streak = 0;

  try {
  while (completed < limit) {
    if (state.currPass === -1) {
      const cost = Array.isArray(state.cost) && state.cost.length ? state.cost[0] : null;
      if (typeof cost !== 'number' || cost < 0 || cost > 10000) { log(`tower ${name}: biaya masuk ${cost} mencurigakan - batal`); break; }
      if (!guard.send(start, { idx: 0 })) break;
      guard.check(name + ' entry');
      const r = await s.waitFor(key, 25000);
      if (!r || r.__closed) { log(`tower ${name}: gagal mulai`); break; }
      state = r[key];
    }

    const before = state.currPass;
    if (typeof before !== 'number' || before < 0) { log(`tower ${name}: tidak ada lantai`); break; }
    if (typeof state.maxPass === 'number' && before >= state.maxPass) { log(`tower ${name}: sudah di lantai maksimum ${state.maxPass}`); break; }

    if (attempts) await new Promise((r) => setTimeout(r, 1000));
    attempts++;
    if (!guard.send(fight, 1)) break;

    const deadline = Date.now() + 45000;
    let resultReceived = false, lost = false, updated = null;
    while (Date.now() < deadline) {
      const r = await s.receiveSource(deadline - Date.now());
      if (!r) break;
      if (r.__closed) break;
      if (r.fightRes !== undefined) resultReceived = true;
      if (r.fightRes && (r.fightRes.win === 0 || r.fightRes.win === false)) {
        losses++;
        streak++;
        if (streak >= MAXLOSS) {
          log(`tower ${name}: kalah ${streak}x berturut di lantai ${before + 1} - keluar`);
          out.lastFloor = before; out.losses = losses;
          break;
        }
        lost = true;
        break;
      }
      if (r[key] && typeof r[key] === 'object') updated = r[key];
      if (resultReceived && updated) break;
    }
    if (!state) break;
    if (lost) continue;
    if (!updated) {
      s.sendCommand('openBuild', { id: build });
      const r2 = await s.waitFor(key, 10000);
      if (r2 && !r2.__closed && r2[key] && r2[key].currPass > before) {
        log(`tower ${name}: jawaban hilang - baca ulang, lanjut lantai ${r2[key].currPass}`);
        updated = r2[key];
      } else { log(`tower ${name}: hasil tidak jelas`); break; }
    }
    state = updated;
    if (state.currPass <= before) { log(`tower ${name}: tidak naik lantai`); break; }
    completed++;
    streak = 0;
    out.lastFloor = state.currPass; out.wins = completed;
    log(`tower ${name}: win ${before} -> ${state.currPass}`);
  }
  } finally {
    if (isOpen(state)) await quitTower(s, snt, key, log);
    await logQuests(s, name, log);
  }
  if (out.losses) { out.ok = true; log(`success tower ${name.toLowerCase()} kalah di lantai ${out.lastFloor + 1} - keluar`); }
  else { out.ok = true; log(`success tower ${name.toLowerCase()} last floor ${out.lastFloor}`); }
  return out;
}

export { runTower, quitTower };
