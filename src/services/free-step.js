function freeStep(o) {
  const { name, label, event, clock, setting, gapSetting, call, key, flag } = o;
  return {
    name,
    label,
    event,
    flag,
    at: (s) => [s[clock] || '01:00'],
    late: 24 * 60,
    max: (s) => Math.max(0, Number(s[setting]) || 0),
    gap: (s) => Math.max(1, Number(s[gapSetting]) || 5) * 60000,
    async run(s, ctx) {
      const d = await call(s, Number(ctx.settings[setting]) || 0, ctx.log, ctx.guard);
      if (d.reason === 'overwrite') {

        ctx.log(`${name}: ! jutsu lama tertimpa - hentikan sampai besok`);
        return { done: true, result: d };
      }
      if (d[key]) return { result: d };
      if (d.reason === 'cooldown') {
        const wait = Math.min(Math.max((Number(d.cd) || 0) + 5, 30), 600) * 1000;
        return { nextIn: wait, result: d };
      }
      return { done: true, result: d };
    },
  };
}

export { freeStep };
