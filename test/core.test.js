import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, bumpVersion, coerceSetting } from '../src/config.js';
import { GoldGuard } from '../src/bot/safety.js';
import { ymd, hhmm, atTime, isWeekend, due, record } from '../src/schedule.js';
import services from '../src/services/index.js';

test('DEFAULT_SETTINGS starts at 2.6.1 and bumpVersion increments patch', () => {
  assert.equal(DEFAULT_SETTINGS.version, '2.6.1');
  assert.equal(bumpVersion('2.6.1'), '2.6.2');
  assert.equal(bumpVersion('2.6.9'), '2.6.10');
  assert.equal(coerceSetting('digs', '5'), 5);
  assert.throws(() => coerceSetting('digs', '99'));
});

test('schedule calculates WIB (UTC+7) explicitly regardless of host TZ', () => {
  // 2026-11-18T18:00:00Z == 2026-11-19 01:00:00 WIB (Thursday)
  const d = new Date('2026-11-18T18:00:00.000Z');
  assert.equal(ymd(d), '2026-11-19');
  assert.equal(hhmm(d), '01:00');
  assert.equal(isWeekend(d), false);

  const slot = atTime(d, '01:00');
  assert.equal(slot.toISOString(), '2026-11-18T18:00:00.000Z');

  const state = {};
  const dueList = due(state, services, DEFAULT_SETTINGS, d);
  assert.ok(dueList.some((x) => x.svc.name === 'quest.claim'));
  assert.ok(dueList.some((x) => x.svc.name === 'arena.fight'));
});

test('schedule.record marks done on completion and backs off on error', () => {
  const now = new Date('2026-11-18T18:00:00.000Z');
  const questSvc = services.find((s) => s.name === 'quest.claim');
  const entry = { slot: '01:00' };
  record(entry, questSvc, { error: 'socket closed', nextIn: 5000 }, DEFAULT_SETTINGS, now);
  assert.equal(entry.fails, 1);
  assert.equal(entry.nextDue, now.getTime() + 5000);

  record(entry, questSvc, { done: true }, DEFAULT_SETTINGS, now);
  assert.equal(entry.fails, 0);
  assert.equal(entry.done, true);
});

test('GoldGuard blocks FORBIDDEN commands and aborts session if gold drops', () => {
  let closed = false;
  const sent = [];
  const fakeSession = {
    store: { player: { gold: 1000 } },
    sendCommand: (n, v) => sent.push([n, v]),
    close: () => { closed = true; },
  };
  const guard = new GoldGuard(fakeSession, () => {});
  guard.arm();

  assert.equal(guard.send('quickExam', { a: 1 }), false);
  assert.equal(sent.length, 0);

  assert.equal(guard.send('openBuild', { id: 13 }), true);
  assert.equal(sent.length, 1);

  fakeSession.store.player.gold = 980;
  assert.throws(() => guard.check('test'), /gold-spend guard tripped/);
  assert.equal(closed, true);
});
