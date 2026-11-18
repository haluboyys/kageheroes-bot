import { claimRamen } from '../bot/features/beast.js';
import { parseTimes } from '../schedule.js';

export default {
  name: 'ramen.claim',
  label: 'claim stamina',
  event: 'claimRamen',
  at: (s) => parseTimes(s.ramenTimes),
  late: 90,
  max: () => 30,
  gap: () => 2 * 60000,
  async run(s, ctx) {
    const claimed = await claimRamen(s, ctx.log);
    return { done: !!claimed, result: { claimed } };
  },
};
