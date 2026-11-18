import quest from './quest.js';
import mail from './mail.js';
import streak from './streak.js';
import share from './share.js';
import arena from './arena.js';
import whack from './whack.js';
import hut from './hut.js';
import school from './school.js';
import gnw from './gnw.js';
import towerSnt from './tower-snt.js';
import towerGst from './tower-gst.js';
import ramen from './ramen.js';
import beast from './beast.js';

const list = [
  quest,
  mail,
  streak,
  share,
  arena,
  whack,
  hut,
  school,
  gnw,
  towerSnt,
  towerGst,
  ramen,
  beast,
];

const seen = new Set();
for (const sv of list) {
  if (!sv || !sv.name || typeof sv.run !== 'function') {
    throw new Error('service tidak valid: ' + JSON.stringify(sv && sv.name));
  }
  if (seen.has(sv.name)) throw new Error('nama service dobel: ' + sv.name);
  seen.add(sv.name);
}

export const services = list;
export const names = list.map((sv) => sv.name);
export const getService = (name) => list.find((sv) => sv.name === name);
export default list;
