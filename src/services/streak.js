import { claimDayReward } from '../bot/features/faucets.js';

export default {
  name: 'streak.claim',
  label: 'streak harian',
  event: 'dayReward',
  at: (s) => [s.dailyAt || '01:00'],
  late: 24 * 60,
  flag: 'daily',
  async run(s, ctx) {
    const gold = await claimDayReward(s, ctx.log);
    return { done: true, result: gold };
  },
};
