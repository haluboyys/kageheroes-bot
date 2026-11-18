import { claimBacklog } from '../bot/features/quests.js';

export default {
  name: 'quest.claim',
  label: 'claim semua quest',
  event: 'submitQuest',
  at: (s) => [s.claimAt || '01:00'],
  disabled: (s) => s.claimEnabled === false,
  late: 12 * 60,
  async run(s, ctx) {
    const r = await claimBacklog(s, ctx.log);
    ctx.entry.claimable = r.count;
    return { done: true, result: r };
  },
};
