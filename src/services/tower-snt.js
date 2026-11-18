import { runTower } from '../bot/features/tower.js';

export default {
  name: 'tower.snt',
  label: 'tower SNT',
  event: 'doExamOption',
  at: (s) => [s.dailyAt || '01:00'],
  late: 24 * 60,
  flag: 'tower',
  max: () => 1,
  async run(s, ctx) {
    const out = await runTower(s, true, ctx.settings.floors, ctx.settings.retries, ctx.log, ctx.guard);
    return { done: true, result: out };
  },
};
