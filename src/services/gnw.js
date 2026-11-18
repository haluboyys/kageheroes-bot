import { runGNW } from '../bot/features/gnw.js';

export default {
  name: 'gnw.war',
  label: 'great ninja war',
  event: 'doWarFight',
  at: (s) => [s.dailyAt || '01:00'],
  late: 24 * 60,
  flag: 'gnw',
  max: () => 1,
  async run(s, ctx) {
    const out = await runGNW(s, ctx.log);
    return { done: true, trustworthy: out.battles > 0, result: out };
  },
};
