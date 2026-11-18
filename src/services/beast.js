import { beastAttack } from '../bot/features/beast.js';
import { parseTimes, isWeekend } from '../schedule.js';

const GAP_MS = 5 * 60000;

export default {
  name: 'beast.hit',
  label: 'tailed beast',
  event: 'beastAttack',
  at: (s, now) => parseTimes(isWeekend(now) ? s.beastWeekend : s.beastDaily),
  late: 120,
  max: () => 60,
  gap: () => GAP_MS,
  async run(s, ctx) {
    const r = await beastAttack(s, ctx.log, ctx.guard);
    if (r.open === 1) ctx.entry.opened = true;
    const done = r.open !== 1 && ctx.entry.opened === true;
    const nextIn = typeof r.cooldown === 'number'
      ? Math.min(Math.max(GAP_MS, (r.cooldown + 5) * 1000), 15 * 60000)
      : undefined;
    return { done, nextIn, result: { hit: r.hit, open: r.open, cd: r.cooldown } };
  },
};
