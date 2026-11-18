export const FREE_AUDITED = new Set(['studySkill', 'replaceSkill', 'raffle']);
export const FORBIDDEN = /^(quickExam|refreshShopFunc|refreshTypeShop|raffle|exchange|buyShopItemFunc|enhanceItem|composeItem|decomposeItem|washAccessory|upSkill|studySkill|beastInject|takeFace|clearEnhanceCd|practice|practise|endPractise|buyPvpTimes|upgradeTeam|donateTeamWealth|buyFund|buySilver|buyGold)$/;

export class GoldGuard {
  constructor(session, log) {
    this.s = session;
    this.log = log;
    this.base = null;
  }

  arm() {
    this.base = this.s.store.player.gold;
  }

  send(name, value) {
    if (FORBIDDEN.test(name)) {
      this.log(`safety: perintah berisiko gold DIBLOKIR (${name})`);
      return false;
    }
    this.s.sendCommand(name, value);
    return true;
  }

  sendFree(name, value) {
    if (!FREE_AUDITED.has(name)) return this.send(name, value);
    this.s.sendCommand(name, value);
    return true;
  }

  check(tag) {
    const g = this.s.store.player.gold;
    if (this.base === null) {
      this.base = g;
      return;
    }
    if (typeof g === 'number' && g < this.base) {
      this.log(`safety: !! GOLD TURUN ${this.base} -> ${g} saat '${tag}' - pass dibatalkan`);
      this.s.close();
      const err = new Error('gold-spend guard tripped');
      err.goldTrip = { from: this.base, to: g, tag };
      throw err;
    }
    this.base = g;
  }
}

export async function buildState(s, id) {
  const r = await s.cmd('openBuild', { id }, 2500);
  const b =
    (r && r.buildings && r.buildings.bd && r.buildings.bd[id]) ||
    (s.store.buildings.bd && s.store.buildings.bd[id]);
  return b || {};
}

export async function waitBuild(s, id, ms) {
  s.sendCommand('openBuild', { id });
  const deadline = Date.now() + (ms || 8000);
  while (Date.now() < deadline) {
    const r = await s.receiveSource(deadline - Date.now());
    if (!r) break;
    if (r.__closed) return null;
    const bd = r.buildings && r.buildings.bd && r.buildings.bd[id];
    if (bd) return bd;
  }
  return null;
}
