import { connectGame } from '../platform/protocol-cf.js';
import { bumpVersion } from '../config.js';
import { GoldGuard } from './safety.js';

export const MAX_VERSION_BUMPS = 3;

export async function login(ctx, cfg) {
  const log = (...a) => ctx.log(...a);
  for (let bump = 0; ; bump++) {
    cfg.version = ctx.settings.version;
    try {
      return await connectGame(cfg, log);
    } catch (e) {
      const next = bump < MAX_VERSION_BUMPS && e.code === 'version' && bumpVersion(ctx.settings.version);
      if (!next) throw e;
      log(`! versi ${ctx.settings.version} ditolak server (type 39) - coba ${next}`);
      ctx.settings.version = next;
      if (typeof ctx.saveSettings === 'function') await ctx.saveSettings(ctx.settings);
      if (typeof ctx.onVersion === 'function') ctx.onVersion(next);
    }
  }
}

export async function withSession(ctx, label, fn) {
  const { account, server, settings, log } = ctx;
  const s = await login(ctx, {
    email: account.email,
    password: account.password,
    channel: settings.channel,
    httpHost: settings.httpHost,
    httpPort: settings.httpPort || 80,
    server: String(server),
  });
  const t0 = Date.now();
  const guard = new GoldGuard(s, log);
  guard.arm();

  const goldBefore = s.store.player.gold;
  log(`pass s${server} [${label}] gold ${s.store.player.gold} silver ${s.store.player.silver} energy ${s.store.player.energy}`);

  let value, ended;
  try {
    value = await fn(s, guard);
  } finally {
    ended = s.closed ? (s.endReason || 'socket closed') : 'clean';
    const gold = s.store.player.gold;
    const dg = (gold || 0) - (goldBefore || 0);
    log(
      `pass s${server} selesai [${label}] gold ${gold}${dg ? ` (${dg > 0 ? '+' : ''}${dg})` : ''} silver ${s.store.player.silver}` +
      `${ended !== 'clean' ? ` ! putus=${ended}` : ''} (${((Date.now() - t0) / 1000).toFixed(1)}s)`
    );
    if (typeof ctx.saveSnapshot === 'function') {
      try {
        await ctx.saveSnapshot(server, {
          savedAt: new Date().toISOString(),
          player: s.store.player,
          quest: s.store.quest,
          buildings: s.store.buildings,
        });
      } catch {}
    }
    try { s.close(); } catch {}
  }
  return { value, ended, ms: Date.now() - t0 };
}
