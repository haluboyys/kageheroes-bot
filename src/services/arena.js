import { runArena } from '../bot/features/arena.js';

export default {
  name: 'arena.fight',
  label: 'arena',
  event: 'challege',
  at: (s) => [s.dailyAt || '01:00'],
  late: 24 * 60,
  flag: 'arena',
  max: () => 1,
  async run(s, ctx) {
    const fights = await runArena(s, Number(ctx.settings.arenaFights) || 0, ctx.log, ctx.guard);
    return { done: true, result: fights };
  },
};
