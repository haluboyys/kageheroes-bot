export function newStore() {
  const store = {
    player: {},
    quest: { list: {}, status: 0 },
    mails: {},
    buildings: { bd: {} },
    heros: {},
    hes: {},
    inventory: {},
    itemList: [],
    recInfo: null,
    lastOper: null,

    applySource(src) {
      if (src.player) Object.assign(this.player, src.player);
      if (src.quest) {
        if (src.quest.list) Object.assign(this.quest.list, src.quest.list);
        if (src.quest.status !== undefined) this.quest.status = src.quest.status;
      }
      if (src.mails) {
        for (const tab of Object.keys(src.mails)) {
          const arr = src.mails[tab];
          if (!Array.isArray(arr)) continue;
          this.mails[tab] = this.mails[tab] || {};
          for (const m of arr) if (m && m.id !== undefined) this.mails[tab][m.id] = m;
        }
      }
      if (src.buildings && src.buildings.bd) {
        for (const b of Object.keys(src.buildings.bd)) {
          this.buildings.bd[b] = Object.assign(this.buildings.bd[b] || {}, src.buildings.bd[b]);
        }
      }
      if (src.heros) Object.assign(this.heros, src.heros);
      if (src.hes) Object.assign(this.hes, src.hes);
      if (src.inventory) Object.assign(this.inventory, src.inventory);
      if (Array.isArray(src.itemList)) this.itemList = src.itemList;
      if (src.recInfo) this.recInfo = Object.assign(this.recInfo || {}, src.recInfo);
      if (src.operResult) this.lastOper = src.operResult;
    },

    claimable() {
      return Object.entries(this.quest.list)
        .filter(([, v]) => v === 1)
        .map(([k]) => Number(k))
        .sort((a, b) => a - b);
    },

    questString() {
      return Object.entries(this.quest.list)
        .sort((a, b) => a[0] - b[0])
        .map(([k, v]) => `${k}:${v}`)
        .join(' ');
    },
  };
  return store;
}
