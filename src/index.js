import { AccountCoordinator } from './cf/coordinator.js';
import { connectGame } from './platform/protocol-cf.js';

export { AccountCoordinator };

function getCoordinator(env) {
  const id = env.ACCOUNT_COORDINATOR.idFromName('main');
  return env.ACCOUNT_COORDINATOR.get(id);
}

function isAuthorized(request, env) {
  const secret = request.headers.get('x-spike-secret');
  return Boolean(env.SPIKE_SECRET && secret === env.SPIKE_SECRET);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({ ok: true, mode: 'notify-only' });
    }

    if (request.method === 'GET' && url.pathname === '/status') {
      if (!isAuthorized(request, env)) {
        return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
      }
      return getCoordinator(env).fetch('https://do/status');
    }

    if (request.method === 'POST' && url.pathname === '/test-notify') {
      if (!isAuthorized(request, env)) {
        return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
      }
      return getCoordinator(env).fetch('https://do/test-notify', { method: 'POST' });
    }

    if (request.method === 'POST' && url.pathname === '/spike-connect') {
      if (!isAuthorized(request, env)) {
        return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
      }
      if (!env.GAME_EMAIL || !env.GAME_PASSWORD || !env.GAME_SERVER) {
        return Response.json(
          { ok: false, error: 'missing GAME_EMAIL / GAME_PASSWORD / GAME_SERVER secrets' },
          { status: 400 }
        );
      }

      const t0 = Date.now();
      const logs = [];
      let session = null;
      const ver = url.searchParams.get('version') || env.GAME_VERSION || '2.6.1';
      try {
        session = await connectGame(
          {
            email: env.GAME_EMAIL,
            password: env.GAME_PASSWORD,
            server: env.GAME_SERVER,
            httpPort: Number(env.GAME_HTTP_PORT || 80),
            version: ver,
          },
          (m) => logs.push(m),
          1
        );
        const player = session.store.player || {};
        return Response.json({
          ok: true,
          ms: Date.now() - t0,
          server: env.GAME_SERVER,
          version: ver,
          name: player.name || null,
          lv: player.lv || null,
          gold: player.gold ?? null,
          logs,
        });
      } catch (err) {
        return Response.json(
          {
            ok: false,
            ms: Date.now() - t0,
            error: err && err.message ? err.message : String(err),
            logs,
          },
          { status: 502 }
        );
      } finally {
        if (session) session.close();
      }
    }

    return Response.json({ ok: false, error: 'not found' }, { status: 404 });
  },

  async scheduled(event, env, ctx) {
    const stub = getCoordinator(env);
    ctx.waitUntil(stub.fetch('https://do/ensure-alarm', { method: 'POST' }));
  },
};
