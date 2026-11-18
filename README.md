# Kage Heroes Bot (Cloudflare Workers)

Automated daily farming bot for Kage Heroes built for the **Cloudflare Workers Free Plan**. It runs scheduled game services via SQLite-backed Durable Object Alarms, connects over `cloudflare:sockets`, protects gold with `GoldGuard`, and sends outbound notifications to a Telegram group topic.

![Runtime](https://img.shields.io/badge/runtime-Cloudflare%20Workers-F38020)
![Node](https://img.shields.io/badge/node-%3E%3D20-339933)

## Features

- **Free Plan Safe Execution:** Executes one scheduled service per Durable Object Alarm invocation to stay within the 10 ms CPU limit.
- **GoldGuard (R1):** Blocks gold-spending commands (`FORBIDDEN` list) and aborts the session immediately if `player.gold` decreases.
- **Multi-Server Serialization:** Runs multiple servers (e.g. `45,47`) sequentially through a per-account mutex so concurrent logins do not kick each other.
- **Plaintext WebSocket over `cloudflare:sockets`:** Uses `fetch()` on port `80` for HTTP login and raw TCP (`secureTransport: 'off'`) with a pure `Uint8Array` RFC 6455 codec for `games<N>:6000+N`.
- **Auto Version Bump:** Starts at base version `2.6.1` and automatically increments and persists the patch version in Durable Object SQLite if the server rejects it with `type 39`.
- **Notify-Only Telegram Integration:** Sends formatted status, completion, error, and gold-alert messages to a Telegram group or specific forum topic (`message_thread_id`).

## Prerequisites & Quick Start

- **Node.js `>= 20`**
- **Cloudflare account** (Free Plan works; SQLite Durable Objects enabled)
- **Wrangler CLI** (`npx wrangler login`)

1. **Create your local Wrangler config** from the example template:

   ```bash
   cp wrangler.example.jsonc wrangler.jsonc
   ```

   Edit `vars` in `wrangler.jsonc` with your server list (`GAME_SERVER`), `TELEGRAM_CHAT_ID`, and `TELEGRAM_THREAD_ID`.

2. **Set required secrets** (never stored in `wrangler.jsonc`):

   ```bash
   npx wrangler secret put SPIKE_SECRET
   npx wrangler secret put GAME_EMAIL
   npx wrangler secret put GAME_PASSWORD
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   ```

3. **Deploy to Cloudflare Workers:**

   ```bash
   npx wrangler deploy
   ```

4. **Verify notification & arm the scheduler:**

   ```bash
   curl -sS -X POST https://<your-worker>.<your-subdomain>.workers.dev/test-notify \
     -H "X-Spike-Secret: <SPIKE_SECRET>"
   ```

## Usage & Configuration

### Environment Variables (`wrangler.jsonc` -> `vars`)

| Variable | Description | Example |
|---|---|---|
| `GAME_SERVER` | Comma-separated server IDs | `"45,47"` |
| `GAME_VERSION` | Initial game client version | `"2.6.1"` |
| `GAME_HTTP_PORT` | Login HTTP port (`80` for cloud egress) | `"80"` |
| `TELEGRAM_CHAT_ID` | Target Telegram chat or supergroup ID | `"-100xxxxxxxxxx"` |
| `TELEGRAM_THREAD_ID` | Optional forum topic ID (`message_thread_id`) | `"1"` |

### Worker Secrets (`wrangler secret put`)

| Secret | Description |
|---|---|
| `SPIKE_SECRET` | Shared secret for `X-Spike-Secret` header on protected endpoints |
| `GAME_EMAIL` | Game account email |
| `GAME_PASSWORD` | Game account password |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API token from `@BotFather` |

### HTTP Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/health` | Public | Liveness check (`{"ok":true,"mode":"notify-only"}`) |
| `GET` | `/status` | `X-Spike-Secret` | Inspect WIB time, version, next alarm, server snapshots, and logs |
| `POST` | `/test-notify` | `X-Spike-Secret` | Send a test notification to Telegram and arm the DO alarm |
| `POST` | `/spike-connect` | `X-Spike-Secret` | Read-only login + `enterGame` handshake test |

<details>
<summary>Daily Service Schedule (WIB / UTC+7)</summary>

| Service | Schedule (WIB) | Behavior |
|---|---|---|
| `quest.claim` | `01:00` | Claims completed quests and milestones |
| `mail.claim` | `01:00` | Claims all mail rewards |
| `streak.claim` | `01:00` | Claims daily streak reward |
| `share.claim` | `01:00` | Claims daily share reward |
| `arena.fight` | `01:00` | Runs arena battles up to `arenaFights` (`5`) |
| `whack.dig` | `01:00` | Free digs (`4`/day), 5-minute cooldown via DO Alarm |
| `hut.capture` | `01:00` | Free basic captures (`5`/day), 5-minute cooldown via DO Alarm |
| `school.train` | `01:00` | Free skill practices (`3`/day, empty slots only), 5-minute cooldown |
| `gnw.war` | `01:00` | Great Ninja War free restart and fights |
| `tower.snt` | `01:00` | SNT tower climb until defeat cap (`retries: 5`) |
| `tower.gst` | `01:00` | GST tower climb until defeat cap (`retries: 5`) |
| `ramen.claim` | `12:00, 18:00` | Polls every 2 minutes until stamina is claimed |
| `beast.hit` | `20:00` (Mon–Fri), `15:00, 20:00` (Sat–Sun) | Hits Tailed Beast every 5 minutes until closed |

</details>

<details>
<summary>Project Structure</summary>

```text
src/
├── index.js                 # Worker entrypoint, HTTP routes, 15-min Cron safety net
├── config.js                # Default settings, validators, bumpVersion()
├── schedule.js              # Pure WIB (UTC+7) scheduling logic
├── bot/
│   ├── safety.js            # GoldGuard (R1) and building state helpers
│   ├── session.js           # Login with auto version bump + session lifecycle
│   └── features/            # Game feature handlers (arena, beast, tower, etc.)
├── cf/
│   ├── coordinator.js       # AccountCoordinator Durable Object (SQLite + Alarms)
│   └── telegram-api.js      # Outbound Telegram sendMessage client
├── lib/
│   ├── store.js             # Per-session game state snapshot
│   └── ws-codec.js          # Pure Uint8Array RFC 6455 frame codec
├── platform/
│   └── protocol-cf.js       # fetch() login + cloudflare:sockets transport
└── services/                # Scheduled service definitions in execution order
test/
├── core.test.js             # Unit tests for config, schedule, and GoldGuard
└── ws-codec.test.js         # Unit tests for RFC 6455 framing and store
```

</details>

## Development & Testing

Run syntax checks and offline unit tests:

```bash
npm run check
```

Run unit tests only:

```bash
npm test
```

Run locally with Wrangler:

```bash
npm run dev
```

## Contributing

1. Keep `wrangler.jsonc` and secrets untracked (`wrangler.example.jsonc` is the committed template).
2. Ensure `npm run check` passes before committing any changes.

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
