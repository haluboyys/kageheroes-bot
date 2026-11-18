import { claimMails } from '../bot/features/faucets.js';

export default {
  name: 'mail.claim',
  label: 'claim mail',
  event: 'rewardMail',
  at: (s) => [s.dailyAt || '01:00'],
  late: 24 * 60,
  flag: 'mails',
  async run(s, ctx) {
    const gold = await claimMails(s, ctx.log);
    return { done: true, result: gold };
  },
};
