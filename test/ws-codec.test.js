import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUpgradeRequest,
  concatBytes,
  decodeFrames,
  encodeTextFrame,
  makeWebSocketKey,
  parseUpgradeResponse,
} from '../src/lib/ws-codec.js';
import { newStore } from '../src/lib/store.js';

function makeUnmaskedServerFrame(obj) {
  const payload = new TextEncoder().encode(JSON.stringify(obj));
  const len = payload.length;
  let hdr;
  if (len < 126) {
    hdr = new Uint8Array([0x81, len]);
  } else {
    hdr = new Uint8Array([0x81, 126, (len >>> 8) & 0xff, len & 0xff]);
  }
  return concatBytes(hdr, payload);
}

test('encodeTextFrame produces valid client-masked RFC 6455 frame (<126 bytes)', () => {
  const msg = { type: 28, source: { openBuild: 1 } };
  const frame = encodeTextFrame(msg);

  assert.equal(frame[0], 0x81);
  assert.equal(frame[1] & 0x80, 0x80); // masked bit set
  const decoded = decodeFrames(frame);
  assert.equal(decoded.rest.length, 0);
  assert.deepEqual(decoded.messages, [msg]);
});

test('encodeTextFrame & decodeFrames handle 16-bit extended payload (>=126 bytes)', () => {
  const big = { type: 28, source: { payload: 'x'.repeat(300) } };
  const frame = encodeTextFrame(big);

  assert.equal(frame[1] & 0x7f, 126);
  const decoded = decodeFrames(frame);
  assert.equal(decoded.rest.length, 0);
  assert.deepEqual(decoded.messages, [big]);
});

test('decodeFrames handles fragmented TCP chunks and multiple frames in one chunk', () => {
  const f1 = makeUnmaskedServerFrame({ type: 28, source: { enterGame: 1 } });
  const f2 = makeUnmaskedServerFrame({ type: 26 });
  const combined = concatBytes(f1, f2);

  // Split right in the middle of f1
  const part1 = combined.subarray(0, 10);
  const part2 = combined.subarray(10);

  const r1 = decodeFrames(part1);
  assert.equal(r1.messages.length, 0);
  assert.equal(r1.rest.length, 10);

  const r2 = decodeFrames(concatBytes(r1.rest, part2));
  assert.equal(r2.rest.length, 0);
  assert.deepEqual(r2.messages, [{ type: 28, source: { enterGame: 1 } }, { type: 26 }]);
});

test('buildUpgradeRequest and parseUpgradeResponse handle 101 + trailing WS bytes', () => {
  const key = makeWebSocketKey();
  const reqText = new TextDecoder().decode(
    buildUpgradeRequest({ host: 'games45.kageherostudio.com', port: 6045, key })
  );
  assert.match(reqText, /^GET \/nadsocket HTTP\/1\.1\r\n/);
  assert.match(reqText, /Upgrade: websocket\r\n/);

  const wsFrame = makeUnmaskedServerFrame({ type: 28, source: { ok: true } });
  const raw = concatBytes(
    new TextEncoder().encode('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n\r\n'),
    wsFrame
  );
  const parsed = parseUpgradeResponse(raw);
  assert.ok(parsed);
  assert.equal(parsed.is101, true);

  const decoded = decodeFrames(parsed.headRest);
  assert.deepEqual(decoded.messages, [{ type: 28, source: { ok: true } }]);
});

test('newStore applies player and quest updates cleanly', () => {
  const store = newStore();
  store.applySource({ player: { gold: 8000, lv: 50 }, quest: { list: { '1': 1, '2': 0 } } });
  assert.equal(store.player.gold, 8000);
  assert.deepEqual(store.claimable(), [1]);
});
