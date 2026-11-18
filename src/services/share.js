import { claimShare } from '../bot/features/faucets.js';

export default {
  name: 'share.claim',
  label: 'claim share',
  event: 'getShareTaskAward',
  at: (s) => [s.dailyAt || '01:00'],
  late: 24 * 60,
  flag: 'daily',
  async run(s, ctx) {
    const gold = await claimShare(s, ctx.log);
    return { done: true, result: gold };
  },
};
