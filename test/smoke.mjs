#!/usr/bin/env node
// G. smoke test. Two tiers, both headless:
//   1. engine — drives games/gdot/engine.js directly in Node (always runs).
//   2. browser — launches Chromium over the DevTools protocol (no npm packages: Node's built-in
//      WebSocket + the Playwright-installed Chromium, or Chrome/Edge), loads play.html from disk,
//      plays with real key events and checks the DOM, zones, progress and the editor.
//      Skipped with a note when no Chromium is found; point GDOT_CHROME at a chrome.exe to use one.
// Run: node games/gdot/test/smoke.mjs        exit code 1 on any failure
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadLevels, loadZones, solve, rng } from '../tools/solver.mjs';

const require = createRequire(import.meta.url);
const GDOT = require('../engine.js');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const lv = (o) => Object.assign({ id: 't', name: 't', goal: 8, start: ['KeyG'], required: [], terrain: {}, creatures: [] }, o);
const play = (g, ...keys) => { let ev; for (const k of keys) ev = GDOT.place(g, k); return ev; };
const alive = (g, i) => g.creatures[i].alive;
// fixed tanks for the turn-order checks, so the campaign can change freely
const SHARK_NJI9 = lv({ creatures: [{ type: 'shark', mover: 'path', path: ['KeyN', 'KeyJ', 'KeyI', 'Digit9'], loop: 'pingpong', pathIndex: 2, size: 'big', speed: 1 }] });
const SHARK_BHU7 = lv({ id: 'smoke-shark', name: 'Smoke shark', start: ['KeyF', 'KeyG'], creatures: [{ type: 'shark', mover: 'path', path: ['KeyB', 'KeyH', 'KeyU', 'Digit7'], loop: 'pingpong', pathIndex: 0, size: 'big', speed: 1 }] });

/* ================= tier 1: engine ================= */
function engineTests() {
  console.log('engine');
  const levels = loadLevels(), zones = loadZones();
  eq(GDOT.KEYS.length, 74, 'key table size');
  eq(GDOT.NEI.KeyG.slice().sort(), ['KeyB', 'KeyF', 'KeyH', 'KeyT', 'KeyV', 'KeyY'], 'G neighbours');
  ok(GDOT.NEI.F4.includes('Digit5') && !GDOT.NEI.F4.includes('F5'), 'F4 touches 5, not F5 (F-row gaps)');
  ok(['F4', 'Digit5', 'KeyT', 'KeyY', 'KeyH', 'KeyN', 'KeyM', 'Comma', 'AltRight'].every((k, i, a) => i === 0 || GDOT.NEI[a[i - 1]].includes(k)), 'Alt+F4 chain is connected');

  // turn order: press where the shark IS = safe, where it is GOING = dead, swing back = dead
  let g = GDOT.createGame(SHARK_NJI9);
  play(g, 'KeyG', 'KeyH', 'KeyJ');
  ok(g.creatures[0].seen && g.creatures[0].pos === 'KeyI', 'shark discovered on I after J reveals it');
  eq(play(g, 'KeyI').type, 'placed', 'pressing where the shark is: it steps away first');
  eq(g.creatures[0].pos, 'Digit9', 'shark stepped to 9');
  let ev = play(g, 'KeyK');
  eq([ev.type, ev.kind, ev.key, ev.from], ['dead', 'swung', 'KeyI', 'Digit9'], 'shark swings back onto the tentacle on I (kind, key, from)');
  g = GDOT.createGame(SHARK_BHU7); play(g, 'KeyG');
  ok(g.creatures[0].seen, 'shark on B seen from G');
  ev = play(g, 'KeyH');
  eq([ev.type, ev.kind, ev.key, ev.from], ['dead', 'going', 'KeyH', 'KeyB'], 'pressing where the shark is going (kind, key, from)');

  // refused presses cost nothing
  g = GDOT.createGame(lv({ terrain: { KeyH: 'rock', KeyF: 'algae' } }));
  play(g, 'KeyG');
  eq(play(g, 'KeyE').reason, 'fog', 'fog refused'); eq(play(g, 'KeyH').reason, 'rock', 'rock refused'); eq(play(g, 'KeyF').reason, 'algae', 'algae refused');
  eq(g.turn, 1, 'refusals take no turn'); eq(g.fingers.size, 1, 'and add no tentacle');
  eq(GDOT.legalPlacements(g).sort(), ['KeyB', 'KeyT', 'KeyV', 'KeyY'], 'legal placements = revealed water with grip');

  // reef and cave protect tentacles
  const crabIn = (extra) => lv({ start: ['KeyD'], terrain: { KeyD: 'reef' }, creatures: [{ type: 'crab', at: 'KeyS', mover: 'dir', dir: 'E', speed: 1, size: 'small', ...extra }] });
  g = GDOT.createGame(crabIn({})); play(g, 'KeyD');
  eq(play(g, 'KeyF').type, 'placed', 'crab passes over the reef tentacle'); eq(g.creatures[0].pos, 'KeyD', 'crab is on D');
  g = GDOT.createGame(crabIn({ type: 'shark', size: 'big' })); play(g, 'KeyD');
  eq(play(g, 'KeyF').type, 'dead', 'a big creature on a reef tentacle kills');
  g = GDOT.createGame(lv({ start: ['KeyD'], terrain: { KeyD: 'cave' }, creatures: [{ type: 'shark', at: 'KeyS', mover: 'dir', dir: 'E', speed: 1, size: 'big' }] }));
  play(g, 'KeyD'); eq(play(g, 'KeyF').type, 'placed', 'cave hides the tentacle from the shark');
  g = GDOT.createGame(lv({ start: ['KeyF'], terrain: { KeyD: 'cave' }, creatures: [{ type: 'eel', at: 'KeyD', mover: 'chase', speed: 1, size: 'big', cave: true, wake: true }] }));
  ev = play(g, 'KeyF'); eq(ev.woke.length, 1, 'eel wakes when a tentacle lands next to its cave'); ok(!GDOT.isVisible(g, g.creatures[0]), 'eel stays hidden inside the cave');
  ev = play(g, 'KeyG'); eq([ev.type, ev.kind], ['dead', 'caught'], 'eel chases and catches the tentacle');
  // prey, speeds, still creatures
  g = GDOT.createGame(lv({ creatures: [{ type: 'fish', at: 'KeyH', mover: 'flee', speed: 0.5, size: 'small', prey: true }] }));
  play(g, 'KeyG'); ev = play(g, 'KeyH');
  eq(ev.ate.length, 1, 'fish eaten'); ok(g.revealed.has('KeyK') && g.revealed.has('KeyI'), 'two rings revealed around H');
  g = GDOT.createGame(lv({ start: ['KeyF'], terrain: { KeyK: 'rock' }, creatures: [{ type: 'barracuda', at: 'KeyG', mover: 'dir', dir: 'E', speed: 2, size: 'small' }] }));
  play(g, 'KeyF', 'KeyD'); eq(g.creatures[0].pos, 'KeyJ', 'barracuda G→H→J'); play(g, 'KeyS'); eq(g.creatures[0].pos, 'KeyG', 'barracuda J→(rock)→H→G');
  g = GDOT.createGame(lv({ start: ['KeyF'], creatures: [{ type: 'crab', at: 'KeyG', mover: 'dir', dir: 'E', speed: 0.5, size: 'small' }] }));
  play(g, 'KeyF', 'KeyD'); eq(g.creatures[0].pos, 'KeyG', 'crab waits a turn'); play(g, 'KeyS'); eq(g.creatures[0].pos, 'KeyH', 'crab moves on the second');
  g = GDOT.createGame(lv({ creatures: [{ type: 'urchin', at: 'KeyH', mover: 'still', speed: 0, size: 'big' }] }));
  play(g, 'KeyG'); ev = play(g, 'KeyH'); eq([ev.type, ev.kind], ['dead', 'there'], 'a visible urchin kills as "there"');
  g = GDOT.createGame(lv({ start: ['KeyG'], creatures: [{ type: 'urchin', at: 'KeyJ', mover: 'still', speed: 0, size: 'big' }] }));
  play(g, 'KeyG', 'KeyH'); ok(g.creatures[0].seen, 'urchin on J seen from H');
  g = GDOT.createGame(lv({ start: ['KeyG'], terrain: { KeyH: 'cave' }, creatures: [{ type: 'urchin', at: 'KeyH', mover: 'still', speed: 0, size: 'big', cave: true }] }));
  play(g, 'KeyG'); ev = play(g, 'KeyH'); eq([ev.type, ev.kind], ['dead', 'hiding'], 'an urchin inside a cave kills as "hiding"');
  // required keys gate the clear; goal counts tentacles
  g = GDOT.createGame(lv({ goal: 2, required: ['KeyH'] }));
  play(g, 'KeyG'); eq(play(g, 'KeyF').type, 'placed', 'two tentacles but the marked key is not held'); eq(play(g, 'KeyH').type, 'won', 'marked key held → clear');
  eq(play(g, 'KeyT').type, 'noop', 'no play after a clear');

  // ---- ecology: creatures eat each other
  const eat = (creatures, extra = {}) => GDOT.createGame(lv({ start: ['KeyS'], ...extra, creatures }));
  g = eat([{ type: 'crab', at: 'KeyD', mover: 'dir', dir: 'E', speed: 1, size: 'small' }, { type: 'urchin', at: 'KeyF', mover: 'still', speed: 0 }]);
  play(g, 'KeyS'); ev = play(g, 'KeyA');
  ok(!alive(g, 1) && alive(g, 0), 'crab walks onto the urchin and eats it');
  eq(ev.meals.map(m => [m.eater.type, m.victim.type, m.key]), [['crab', 'urchin', 'KeyF']], 'the meal is reported with its key');
  g = eat([{ type: 'urchin', at: 'KeyF', mover: 'still', speed: 0 }, { type: 'crab', at: 'KeyD', mover: 'dir', dir: 'E', speed: 1, size: 'small' }], { terrain: { KeyF: 'reef' } });
  play(g, 'KeyS', 'KeyA'); ok(alive(g, 0), 'an urchin on reef is safe from the (small) crab');
  g = eat([{ type: 'shark', at: 'KeyS', mover: 'dir', dir: 'E', speed: 1 }, { type: 'eel', at: 'KeyF', mover: 'chase', speed: 1, wake: false, cave: false }], { start: ['KeyA'] });
  play(g, 'KeyA'); ok(g.creatures[0].seen, 'shark seen from A');
  play(g, 'KeyQ'); eq(g.creatures[0].pos, 'KeyD', 'shark S→D');
  ev = play(g, 'KeyW'); ok(!alive(g, 1), 'the shark swims onto the eel (even unseen, in the fog) and eats it');
  eq(ev.meals.map(m => m.victim.type), ['eel'], 'reported as a meal');
  g = eat([{ type: 'shark', mover: 'path', path: ['KeyD', 'KeyF', 'KeyG'], loop: 'pingpong', pathIndex: 0 }, { type: 'eel', at: 'KeyF', mover: 'chase', speed: 1, cave: true, wake: true }], { terrain: { KeyF: 'cave' } });
  play(g, 'KeyS', 'KeyA'); eq(g.creatures[0].pos, 'KeyF', 'shark passes through the cave'); ok(alive(g, 1), 'the eel is safe inside its cave');
  g = eat([{ type: 'barracuda', at: 'KeyD', mover: 'dir', dir: 'E', speed: 2, size: 'small' }, { type: 'fish', at: 'KeyF', mover: 'flee', speed: 0.5, size: 'small', prey: true }]);
  play(g, 'KeyS', 'KeyA'); ok(alive(g, 1), 'a speed-2 barracuda hops over the fish, the same way it hops over a tentacle'); eq(g.creatures[0].pos, 'KeyG', 'and lands one further');
  g = eat([{ type: 'barracuda', at: 'KeyD', mover: 'dir', dir: 'E', speed: 2, size: 'small' }, { type: 'fish', at: 'KeyG', mover: 'flee', speed: 0.5, size: 'small', prey: true }]);
  play(g, 'KeyS', 'KeyA'); ok(!alive(g, 1), 'but eats a fish on the key it lands on');
  for (const order of [[0, 1], [1, 0]]) { // meetings do not depend on the order creatures are listed in
    const cr = [{ type: 'shark', at: 'KeyD', mover: 'dir', dir: 'E', speed: 1 }, { type: 'urchin', at: 'KeyF', mover: 'still', speed: 0, eats: ['shark'] }];
    g = eat(order.map(i => cr[i])); play(g, 'KeyS', 'KeyA');
    ok(g.creatures.find(c => c.type === 'shark').alive === false, `the shark that arrives on an urchin that eats sharks is eaten (listed ${order.join(',')})`);
  }
  g = eat([{ type: 'shark', at: 'KeyD', mover: 'dir', dir: 'E', speed: 1 }, { type: 'eel', at: 'KeyF', mover: 'dir', dir: 'W', speed: 1, wake: false, cave: false }], { start: ['KeyS'] });
  play(g, 'KeyS'); ok(g.creatures[1].seen || true, ''); g.creatures[1].seen = true; ev = play(g, 'KeyA');
  ok(!alive(g, 1), 'shark and eel swimming head-on through each other still meet');
  g = eat([{ type: 'crab', at: 'KeyD', mover: 'dir', dir: 'E', speed: 1, size: 'small' }, { type: 'urchin', at: 'KeyF', mover: 'still', speed: 0 }], { ecology: { crab: { eats: [] } } });
  play(g, 'KeyS', 'KeyA'); ok(alive(g, 1), 'level ecology can switch a meal off');
  g = eat([{ type: 'crab', at: 'KeyD', mover: 'dir', dir: 'E', speed: 1, size: 'small', eats: [] }, { type: 'urchin', at: 'KeyF', mover: 'still', speed: 0 }]);
  play(g, 'KeyS', 'KeyA'); ok(alive(g, 1), 'a creature can carry its own eats list');
  const zl = GDOT.resolveLevel(lv({ creatures: [{ type: 'crab', at: 'KeyD' }] }), { id: 'z', ecology: { crab: { eats: ['fish'] } } });
  eq(GDOT.createGame(zl).creatures[0].eats, ['fish'], 'zone ecology applies under the level');
  // ---- goes for / follows / distracted
  g = eat([{ type: 'shark', at: 'KeyH', mover: 'still', speed: 0 }, { type: 'pilot', at: 'KeyD', mover: 'chase', speed: 1, size: 'small', prey: true }]);
  play(g, 'KeyS'); ok(g.creatures[1].seen, 'pilot fish seen');
  play(g, 'KeyA'); eq(g.creatures[1].pos, 'KeyF', 'the pilot fish swims toward the shark');
  play(g, 'KeyQ'); eq(g.creatures[1].pos, 'KeyG', 'one more key');
  play(g, 'KeyW'); eq(g.creatures[1].pos, 'KeyG', 'and stays one key behind it');
  ok(alive(g, 1), 'so the shark never eats it');
  g = GDOT.createGame(lv({ start: ['KeyG'], creatures: [{ type: 'seal', at: 'KeyJ', mover: 'chase', speed: 1 }, { type: 'fish', at: 'KeyL', mover: 'flee', speed: 0.5, size: 'small', prey: true }] }));
  play(g, 'KeyG', 'KeyH'); ok(g.creatures[0].seen, 'seal seen');
  play(g, 'KeyB'); eq(g.creatures[0].pos, 'KeyK', 'the seal goes for the fish, not your tentacles');
  // ---- max tentacles and lifting rules
  g = GDOT.createGame(lv({ goal: 2, maxTentacles: 2 }));
  play(g, 'KeyG', 'KeyF'); ok(g.phase === 'won', 'goal 2 with max 2 clears');
  g = GDOT.createGame(lv({ goal: 2, maxTentacles: 2, required: ['KeyJ'] }));
  play(g, 'KeyG', 'KeyH'); eq(play(g, 'KeyJ'), { type: 'refused', reason: 'max', code: 'KeyJ' }, 'a third tentacle is refused at the cap');
  eq(GDOT.legalPlacements(g), [], 'no legal placements at the cap');
  ok(GDOT.pickup(g, 'KeyG'), 'lift one'); eq(play(g, 'KeyJ').type, 'won', 'then the marked key can be taken');
  g = GDOT.createGame(lv({ lift: 'one' })); play(g, 'KeyG', 'KeyF', 'KeyH');
  ok(GDOT.pickup(g, 'KeyF'), 'lift one tentacle'); eq(GDOT.liftBlock(g, 'KeyH'), 'one', 'a second lift waits for a placement'); ok(!GDOT.pickup(g, 'KeyH'), 'refused');
  play(g, 'KeyT'); eq(GDOT.liftBlock(g, 'KeyH'), null, 'after placing, lifting works again');
  g = GDOT.createGame(lv({ lift: 'none' })); play(g, 'KeyG', 'KeyF'); eq(GDOT.liftBlock(g, 'KeyF'), 'none', 'lift none'); ok(!GDOT.pickup(g, 'KeyF'), 'nothing lifts');
  g = GDOT.createGame(lv({})); play(g, 'KeyG', 'KeyF'); ok(GDOT.pickup(g, 'KeyF') && GDOT.pickup(g, 'KeyG'), 'free lifting takes several at once');
  eq(play(g, 'KeyP'), { type: 'refused', reason: 'fog', code: 'KeyP' }, 'with no tentacle down, fog still refuses (the fence holds)');
  eq(play(g, 'KeyT').type, 'placed', 'revealed water still takes one');
  eq(GDOT.createGame(lv({ maxTentacles: 2 })).GOAL, 2, 'the goal never exceeds the cap');
  g = GDOT.createGame(lv({ creatures: [{ type: 'fish', at: 'KeyH', mover: 'flee', speed: 0.5, size: 'small', prey: true }, { type: 'shark', at: 'KeyK', mover: 'dir', dir: 'E', speed: 1 }] }));
  play(g, 'KeyG'); ev = play(g, 'KeyH'); ok(ev.ate.length && g.creatures[1].seen, 'what eating uncovers is discovered at once');
  play(g, 'KeyB'); eq(g.creatures[1].pos, 'KeyL', 'so it moves on the very next press');
  { const w2 = {}; new Function('window', GDOT.levelsSource([], [{ terrain: {}, creatures: [] }]))(w2); eq(w2.GDOT_LEVELS.length, 1, 'levels.js writer handles a bare level'); }
  // ---- closed tanks and the levels.js writer
  g = GDOT.createGame(lv({ tank: ['KeyG', 'KeyH'], terrain: { KeyH: 'reef' } }));
  eq([g.TER.KeyF, g.TER.KeyG, g.TER.KeyH], ['algae', undefined, 'reef'], 'a closed tank: outside is algae');
  const src = GDOT.levelsSource(zones, levels); const w = {}; new Function('window', src)(w);
  eq(w.GDOT_LEVELS, levels, 'levels.js writer round-trips every level'); eq(w.GDOT_ZONES, zones, 'and every zone');
  // pickup is free; clones are independent
  g = GDOT.createGame(lv({})); play(g, 'KeyG', 'KeyF'); GDOT.pickup(g, 'KeyF');
  const h = GDOT.cloneGame(g); play(h, 'KeyF'); eq(g.fingers.size, 1, 'clone does not touch the original'); eq(h.turn, 3, 'placing again is a turn');

  // ---- the campaign: zones and a clear for every level
  ok(zones.length >= 5, 'at least five zones');
  for (const z of zones) ok(levels.some(l => l.zone === z.id), `zone ${z.name} has tanks`);
  ok(levels.every(l => zones.some(z => z.id === l.zone)), 'every level belongs to a zone');
  eq(levels.filter(l => l.finale).map(l => l.id), ['alt-f4'], 'Alt+F4 is the finale');
  for (const z of zones) levels.filter(l => l.zone === z.id).forEach((l, n) => { if (z.keys[n]) eq(l.start, [z.keys[n]], `${l.name} starts on its key ${GDOT.L(z.keys[n])}`); });
  const used = zones.flatMap(z => z.keys); eq(used.length, new Set(used).size, 'no key names two tanks');
  // moving a tank sideways keeps it the same puzzle
  const ft = levels.find(l => l.start[0] === 'KeyG'); const moved = GDOT.shiftLevel(ft, 1);
  ok(moved && moved.start[0] === 'KeyH', 'a tank on G moves to H'); eq(solve(moved, { budget: 60000 }).turns, solve(ft, { budget: 60000 }).turns, 'and clears in the same number of turns');
  eq(GDOT.rowOffset('KeyG', 'KeyT'), null, 'no sideways move between rows');
  for (const level of levels) {
    const played = GDOT.resolveLevel(level, zones.find(z => z.id === level.zone));
    let s = solve(played, { budget: 60000 });
    if (!s.solved) s = solve(played, { budget: 60000, pickups: true });
    ok(s.solved, `${level.name}: solver finds a clear`);
    if (s.solved) { const r = GDOT.createGame(played); for (const m of s.moves) { if (m.pickup) GDOT.pickup(r, m.pickup); GDOT.place(r, m.place); } eq(r.phase, 'won', `${level.name}: the line replays to a clear`); }
  }
}

/* ================= territory rules (engine) ================= */
{
  const T = o => lv(Object.assign({ rules: 'territory' }, o));
  const SH = (path, i = 0) => ({ type: 'shark', mover: 'path', path, loop: 'pingpong', pathIndex: i, size: 'big', speed: 1 });
  // the goal: every key of the territory; an urchin is a wall; a crab eating it opens the key
  { const g = GDOT.createGame(T({ tank: ['KeyG', 'KeyH', 'KeyJ', 'KeyK'], creatures: [{ type: 'urchin', mover: 'still', at: 'KeyJ', size: 'big', speed: 0 }] }));
    eq([...GDOT.territory(g)].sort(), ['KeyG', 'KeyH'], 'territory: grip keys joined to the start; an urchin is a wall');
    eq([g.MODE, g.GOAL, g.MAX], ['territory', 2, 0], 'territory mode: the goal is the keys to fill, no tentacle cap'); }
  { const g = GDOT.createGame(T({ tank: ['KeyG', 'KeyH', 'KeyJ'], creatures: [{ type: 'urchin', mover: 'still', at: 'KeyJ', size: 'big', speed: 0 }, { type: 'crab', mover: 'dir', dir: 'W', at: 'KeyK', size: 'small', speed: 1 }] }));
    play(g, 'KeyG'); g.creatures[1].seen = true; play(g, 'KeyH');
    ok(!g.creatures[0].alive && GDOT.territory(g).has('KeyJ'), 'when the crab eats the urchin, its key joins the territory'); }
  // reach: only next to a tentacle; putting back the one you lifted is always allowed
  { const g = GDOT.createGame(T({ tank: ['KeyG', 'KeyH', 'KeyJ', 'KeyF'] }));
    play(g, 'KeyG', 'KeyH'); GDOT.pickup(g, 'KeyG'); eq(GDOT.placeBlock(g, 'KeyF'), 'reach', 'F is no longer next to a tentacle once G is lifted');
    eq(GDOT.placeBlock(g, 'KeyG'), null, 'but the lifted G can go back'); eq(GDOT.legalPlacements(g).sort(), ['KeyG', 'KeyJ'], 'legal presses follow the reach rule');
    const k = GDOT.stateKey(g); GDOT.place(g, 'KeyG'); ok(GDOT.stateKey(g) !== k, 'state keys see the lift'); }
  // a creature takes a key instead of killing; the key is free again once it leaves
  { const g = GDOT.createGame(T({ tank: ['KeyG', 'KeyH', 'KeyJ', 'KeyY', 'KeyU'], creatures: [SH(['KeyY', 'KeyH', 'KeyJ'])] }));
    play(g, 'KeyG'); let ev = play(g, 'KeyB'); eq(ev.type, 'refused', 'B is algae in a closed tank');
    const pred = GDOT.intents(g)[0]; ev = play(g, 'KeyH');
    eq([ev.type, ev.taken.map(t => t.key), [...g.fingers]], ['placed', ['KeyH'], ['KeyG']], 'pressing where the shark lands: it takes the key, you keep playing');
    eq(pred.to, 'KeyH', 'the arrow said so'); ok(ev.taken[0].landed, 'and says it landed on your new tentacle');
    ev = play(g, 'KeyY'); eq(g.creatures[0].pos, 'KeyJ', 'the shark moves on'); ev = play(g, 'KeyH'); eq(ev.taken.length, 1, 'H again, as it swings back: taken again');
    eq(g.phase, 'play', 'still playing'); }
  // a creature swimming onto a tentacle already down takes it; losing the last one loses the tank
  { const g = GDOT.createGame(T({ tank: ['KeyG', 'KeyH', 'KeyJ'], creatures: [SH(['KeyH', 'KeyG'])] }));
    play(g, 'KeyG'); const ev = play(g, 'KeyG'); eq(ev.type, 'noop', 'a held key is a no-op');
    GDOT.pickup(g, 'KeyG'); const e2 = GDOT.place(g, 'KeyG'); eq([e2.type, e2.kind, g.phase], ['dead', 'overrun', 'dead'], 'waiting where the shark lands on your only tentacle: every tentacle taken, the tank is lost'); }
  // clear: every key yours or under a creature
  { const g = GDOT.createGame(T({ tank: ['KeyG', 'KeyH', 'KeyJ'], creatures: [SH(['KeyJ'])] }));
    eq(GDOT.territory(g).size, 3, 'a creature on a key does not shrink the territory');
    play(g, 'KeyG'); const ev = play(g, 'KeyH'); eq(ev.type, 'won', "clear once every key is yours or a creature's"); }
  // starfish: once held, the algae around it becomes water, once; the level and clones are untouched
  { const L0 = T({ tank: ['KeyG', 'KeyH'], required: ['KeyH'] }); const g = GDOT.createGame(L0); play(g, 'KeyG');
    const c = GDOT.cloneGame(g); const ev = play(g, 'KeyH');
    eq([ev.type, ev.grew.slice().sort(), g.GOAL], ['placed', ['KeyB', 'KeyJ', 'KeyN', 'KeyU', 'KeyY'], 7], 'the starfish turns the algae around it into water: more to fill');
    ok(c.TER.KeyJ === 'algae' && !L0.terrain.KeyJ, 'the clone and the level keep their own terrain');
    GDOT.pickup(g, 'KeyH'); const e2 = GDOT.place(g, 'KeyH'); eq(e2.grew, [], 'it only grows once'); ok(GDOT.stateKey(g).includes('|g'), 'state keys include grown starfish'); }
  // prey is still eaten
  { const g = GDOT.createGame(T({ tank: ['KeyG', 'KeyH', 'KeyJ'], creatures: [{ type: 'fish', mover: 'still', at: 'KeyH', size: 'small', speed: 0, prey: true }] }));
    play(g, 'KeyG'); const ev = play(g, 'KeyH'); eq([ev.ate.length, g.fingers.has('KeyH')], [1, true], 'landing on prey eats it and keeps the key'); }
  // classic mode unchanged: a bite kills
  { const g = GDOT.createGame(lv({ tank: ['KeyG', 'KeyH', 'KeyJ', 'KeyY', 'KeyU'], creatures: [SH(['KeyY', 'KeyH', 'KeyJ'])] })); play(g, 'KeyG'); eq(play(g, 'KeyH').type, 'dead', 'classic tanks still bite'); }
  // intents predict the real move, for every kind of mover
  { const rnd = rng(7); let checked = 0, wrong = 0;
    for (let t = 0; t < 60; t++) {
      const keys = ['KeyG', 'KeyH', 'KeyJ', 'KeyK', 'KeyY', 'KeyU', 'KeyI', 'KeyB', 'KeyN', 'KeyM', 'KeyF', 'KeyT'];
      const cs = [SH(['KeyY', 'KeyU', 'KeyI', 'KeyK', 'KeyM'], Math.floor(rnd() * 4)), { type: 'crab', mover: 'dir', dir: ['E', 'W', 'NE', 'SW'][t % 4], at: 'KeyN', size: 'small', speed: 0.5 },
        { type: 'eel', mover: 'chase', at: 'KeyK', size: 'big', speed: 1, cave: true, wake: false }, { type: 'barracuda', mover: 'dir', dir: 'W', at: 'KeyT', size: 'small', speed: 2 }];
      const g = GDOT.createGame(T({ tank: keys, creatures: cs.slice(0, 1 + (t % 4)) }));
      play(g, 'KeyG');
      for (let n = 0; n < 8 && g.phase === 'play'; n++) {
        const pred = GDOT.intents(g); const opts = GDOT.legalPlacements(g); if (!opts.length) break;
        const k = opts[Math.floor(rnd() * opts.length)]; GDOT.place(g, k);
        for (const pr of pred) { const c = g.creatures[pr.id]; if (!c.alive) continue; checked++; if (c.pos !== pr.to) wrong++; }
      }
    }
    ok(checked > 100 && wrong === 0, `intents predict every move (${checked} checked, ${wrong} wrong)`); }
  // par is exact: A* matches a plain breadth-first search on random small tanks
  { const bfs = L => { const g0 = GDOT.createGame(L); let layer = [g0], seen = new Set([GDOT.stateKey(g0)]);
      for (let d = 1; d <= 11; d++) { const next = [];
        for (const g of layer) { const acts = g.turn === 0 ? g.START.map(k => ({ place: k })) : [...GDOT.legalPlacements(g).map(k => ({ place: k })), ...[...g.fingers].flatMap(f => { const h = GDOT.cloneGame(g); return GDOT.pickup(h, f) ? GDOT.legalPlacements(h).map(k => ({ pickup: f, place: k })) : []; })];
          for (const a of acts) { const h = GDOT.cloneGame(g); if (a.pickup) GDOT.pickup(h, a.pickup); const ev = GDOT.place(h, a.place); if (ev.type === 'won') return d; if (ev.type !== 'placed') continue; const k = GDOT.stateKey(h); if (seen.has(k)) continue; seen.add(k); next.push(h); } }
        layer = next; if (!layer.length) return null; }
      return null; };
    const rnd = rng(11); let same = 0, n = 0; const bad = [];
    const pool = ['KeyG', 'KeyH', 'KeyJ', 'KeyY', 'KeyU', 'KeyB', 'KeyN', 'KeyT'];
    for (let t = 0; t < (process.env.GDOT_DEEP ? 24 : 10); t++) { // GDOT_DEEP=1: the full 24
      const tank = pool.filter((k, i) => i === 0 || rnd() < 0.6);
      const cs = []; if (rnd() < 0.8) cs.push(SH(['KeyY', 'KeyH', 'KeyN'].filter(k => tank.includes(k)).length > 1 ? ['KeyY', 'KeyH', 'KeyN'] : ['KeyU', 'KeyJ'], Math.floor(rnd() * 2)));
      if (rnd() < 0.5) cs.push({ type: 'crab', mover: 'dir', dir: 'W', at: 'KeyV', size: 'small', speed: 0.5 });
      const L = T({ tank, creatures: cs, required: rnd() < 0.3 ? [tank[tank.length - 1]] : [] });
      const a = GDOT.solvePar(L, { budget: 200000 }); const b = bfs(L); n++;
      if ((a.solved ? a.par : null) === b) same++; else bad.push(t + ':' + a.par + '/' + b);
    }
    eq(bad, [], `par (A*) equals breadth-first search on ${n} random tanks`); ok(same === n, 'all agree'); }
}

/* ================= levels: tutorial coach lines ================= */
{
  const levels = loadLevels(), zones = loadZones();
  const WORDS = new Set(['hold', 'Hold', 'next', 'goal', 'max', 'G.', 'fog', 'tentacle', 'starfish', 'lock', 'bones', 'algae', 'rock', 'reef', 'cave', ...GDOT.TYPES]);
  const LABELS = new Set(GDOT.KEYS.map(k => k.label).filter(Boolean).concat(['Space']));
  const MOMENTS = /^(ready|\d+|lift|won|eaten|letgo|fog|algae|rock|max|start|one|none)$/;
  const bad = [];
  for (const l of levels) for (const [m, line] of Object.entries(l.coach || {})) {
    if (!MOMENTS.test(m)) bad.push(l.id + ': moment ' + m);
    for (const [, t0] of String(line).matchAll(/\{([^{}]+)\}/g)) { const t = t0[0] === '~' && t0.length > 1 ? t0.slice(1) : t0; if (!WORDS.has(t0) && !GDOT.KEYMAP[t] && !LABELS.has(t) && !LABELS.has(t.toUpperCase())) bad.push(l.id + ' ' + m + ': {' + t0 + '}'); }
  }
  eq(bad, [], 'every coach line uses known moments and tokens');
  for (const f of ['gdot.js', 'engine.js', 'telemetry.js', 'levels.js']) ok(!/\(\?<[=!]/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')), f + ' uses no regex lookbehind (Safari before 16.4 cannot load it)');
  { const t = lv({ tank: ['KeyG', 'KeyH'], creatures: [{ type: 'shark', mover: 'path', path: ['KeyT', 'KeyY'], loop: 'pingpong', size: 'big', speed: 1 }], coach: { 1: 'It swims {~T} and {~Y}.' } });
    eq(GDOT.shiftLevel(t, 1, 0).coach[1], 'It swims {~Y} and {~U}.', 'coach tokens on a creature route outside the water move too'); }
  { const t = lv({ tank: ['KeyG', 'KeyH', 'KeyJ'], coach: { ready: 'Press {G}, then {H} and {KeyJ}; {shark} {q} {G.} {~H}', 1: 'x' } });
    const m = GDOT.shiftLevel(t, 1, 0);
    eq(m.coach.ready, 'Press {H}, then {J} and {K}; {shark} {q} {G.} {~J}', 'coach key tokens move with the tank (other tokens stay)'); eq(t.coach.ready.startsWith('Press {G}'), true, 'the original is untouched'); }
  const byLabel = {}; for (const k of GDOT.KEYS) if (k.label && !byLabel[k.label]) byLabel[k.label] = k.code; byLabel.Space = 'Space';
  const stray = [];
  for (const z of zones.filter(z => z.tutorial)) for (const l of levels.filter(l => l.zone === z.id)) {
    const own = new Set([...GDOT.tankWater(l), ...(l.start || []), ...(l.required || [])]); for (const k of [...own]) for (const n of GDOT.NEI[k]) own.add(n);
    own.add('KeyG'); own.add('Period');
    for (const [m, line] of Object.entries(l.coach || {})) for (const [, t0] of String(line).matchAll(/\{([^{}]+)\}/g)) {
      if (WORDS.has(t0)) continue; const t = t0[0] === '~' && t0.length > 1 ? t0.slice(1) : t0; const c = GDOT.KEYMAP[t] ? t : byLabel[t] || byLabel[t.toUpperCase()]; if (c && !own.has(c)) stray.push(l.id + ' ' + m + ': {' + t + '}'); }
  }
  eq(stray, [], 'tutorial coach lines only name keys of their own tank (or G and .)');
  const tz = zones.filter(z => z.tutorial);
  ok(tz.length <= 1, 'at most one tutorial zone');
  for (const z of tz) for (const l of levels.filter(l => l.zone === z.id)) ok(l.coach && l.coach.ready, `tutorial tank ${l.name} has a ready line`);
}

/* ================= tier 2: Chromium over CDP ================= */
function findChrome() {
  if (process.env.GDOT_CHROME) return fs.existsSync(process.env.GDOT_CHROME) ? process.env.GDOT_CHROME : null;
  const c = [];
  const bases = [process.env.PLAYWRIGHT_BROWSERS_PATH, path.join(process.env.LOCALAPPDATA || '', 'ms-playwright'), path.join(os.homedir(), '.cache', 'ms-playwright'), path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright')].filter(Boolean);
  for (const base of bases) {
    if (!fs.existsSync(base)) continue;
    for (const d of fs.readdirSync(base).sort().reverse()) {
      if (d.startsWith('chromium-')) c.push(path.join(base, d, 'chrome-win64', 'chrome.exe'), path.join(base, d, 'chrome-win', 'chrome.exe'), path.join(base, d, 'chrome-linux', 'chrome'), path.join(base, d, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'));
      if (d.startsWith('chromium_headless_shell-')) c.push(path.join(base, d, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'), path.join(base, d, 'chrome-headless-shell-linux64', 'chrome-headless-shell'), path.join(base, d, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell'), path.join(base, d, 'chrome-headless-shell-mac-x64', 'chrome-headless-shell'));
    }
  }
  c.push('C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  return c.find(p => fs.existsSync(p)) || null;
}
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = [];
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && this.pending.has(m.id)) { const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } else for (const h of this.handlers) h(m); }; }
  static async connect(url) { const ws = new WebSocket(url); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; }); return new CDP(ws); }
  send(method, params = {}, sessionId) { const id = ++this.id; const msg = { id, method, params }; if (sessionId) msg.sessionId = sessionId; this.ws.send(JSON.stringify(msg)); return new Promise((res, rej) => this.pending.set(id, { res, rej })); }
  on(fn) { this.handlers.push(fn); }
}
function launch(exe) {
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'gdot-smoke-'));
  const args = ['--remote-debugging-port=0', '--user-data-dir=' + udd, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-extensions', '--mute-audio', '--window-size=1280,900', 'about:blank'];
  if (!/headless-shell/i.test(exe)) args.unshift('--headless=new');
  const proc = spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const wsUrl = new Promise((res, rej) => {
    let buf = ''; const onData = d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) res(m[1]); };
    proc.stderr.on('data', onData); proc.stdout.on('data', onData);
    proc.on('exit', c => rej(new Error('chromium exited with ' + c + '\n' + buf)));
    setTimeout(() => rej(new Error('chromium did not start in 20 s\n' + buf)), 20000).unref();
  });
  return { proc, wsUrl, udd };
}
const KEYNAME = code => /^Key/.test(code) ? code[3].toLowerCase() : /^Digit/.test(code) ? code[5] : ({ Period: '.', Comma: ',', Slash: '/', Semicolon: ';', Quote: "'", Space: ' ', AltRight: 'Alt', AltLeft: 'Alt', ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Control', ControlRight: 'Control' })[code] || code;
const VK = code => /^Key/.test(code) ? code.charCodeAt(3) : /^Digit/.test(code) ? code.charCodeAt(5) : /^F\d+$/.test(code) ? 111 + +code.slice(1) : ({ ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Period: 190, Comma: 188, Slash: 191, Semicolon: 186, Quote: 222, Space: 32, Enter: 13, Tab: 9, Escape: 27, AltRight: 18, AltLeft: 18, ShiftLeft: 16, ShiftRight: 16, ControlLeft: 17, ControlRight: 17 })[code] || 0;

async function browserTests() {
  const exe = findChrome();
  if (!exe) { console.log('browser: SKIP — no Chromium found (install Playwright browsers or set GDOT_CHROME)'); return; }
  console.log('browser: ' + exe);
  const { proc, wsUrl, udd } = launch(exe);
  let cdp;
  try {
    cdp = await CDP.connect(await wsUrl);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const S = (m, p) => cdp.send(m, p, sessionId);
    await S('Page.enable'); await S('Runtime.enable');
    const errors = []; cdp.on(m => { if (m.sessionId === sessionId && m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception || {}).description); });
    const load = async (url) => { const loaded = new Promise(r => { const h = m => { if (m.method === 'Page.loadEventFired' && m.sessionId === sessionId) r(); }; cdp.on(h); }); await S('Page.navigate', { url }); await loaded; };
    const PLAYER = pathToFileURL(path.join(ROOT, 'play.html')).href;
    const PAGE = pathToFileURL(path.join(ROOT, 'studio.html')).href; // same game, plus the editor; never redirects or records progress
    const toTank = () => js('introEnd(); buildRuntime(); 1'); // on play.html: leave the intro onto the tank progress points at
    const playPage = async () => { await load(PLAYER); await toTank(); };
    await load(PLAYER);
    const js = async expr => { const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('page: ' + r.exceptionDetails.text + ' ' + ((r.exceptionDetails.exception || {}).description || '')); return r.result.value; };
    const key = (type, code) => S('Input.dispatchKeyEvent', { type, code, key: KEYNAME(code), windowsVirtualKeyCode: VK(code) });
    const down = c => key('keyDown', c), up = c => key('keyUp', c), tap = async c => { await down(c); await up(c); };
    const state = () => js(`({phase:G.phase,turn:G.turn,fingers:[...G.fingers].sort(),held:[...held].sort(),lvl:LV.id,next:NEXT,zone:document.getElementById('zone').textContent,
      strip:document.getElementById('status').innerHTML,say:document.getElementById('say').textContent,dead:document.getElementById('board').classList.contains('dead'),
      hurt:[...document.querySelectorAll('.k.hurt')].map(e=>e.dataset.code),trail:[...document.querySelectorAll('.k.trail')].map(e=>e.dataset.code),
      bad:[...document.querySelectorAll('.k.bad')].map(e=>e.dataset.code),gone:document.querySelectorAll('.k.gone').length,held3:document.querySelectorAll('.k.held').length,
      beaten:Object.keys(PROG.beaten),progCur:PROG.cur,coach:(document.getElementById('coach')||{}).innerHTML||'',coachText:(document.getElementById('coach')||{}).textContent||''})`);
    let levels = loadLevels(), zones = loadZones();
    const LIVE = { levels, zones }; // levels.js as shipped (its zones may use territory rules)
    const inZone = id => levels.filter(l => l.zone === id);
    let zT = zones.find(z => z.tutorial), tut = zT ? inZone(zT.id) : [], real = zones.filter(z => !z.tutorial);
    const parLine = l => { const r = GDOT.solvePar(l, { budget: 600000 }); return r.solved ? r.moves : null; };
    const sk = l => GDOT.createGame(l).START[0]; // every tank starts on its own key
    const SKIPPED = "localStorage.setItem('gdot-progress-v1', JSON.stringify({tutorial:'skipped'})); 1";
    // ---- the player page: no tools, a live tank until G.
    for (const id of ['panel', 'debug', 'editor', 'probe', 'evlog', 'why']) ok(!(await js(`!!document.getElementById('${id}')`)), `the player page has no #${id}`);
    eq(await js('G.phase'), 'intro', 'the player page opens on the intro');
    eq(await js('document.querySelectorAll(".k.fog").length'), 0, 'the intro tank is fully revealed');
    ok(await js('document.querySelector(".k[data-code=KeyG]").classList.contains("start") && document.querySelector(".k[data-code=Period]").classList.contains("start")'), 'G and . pulse');
    ok(/class="cap down">G</.test(await js('document.getElementById("status").innerHTML')), 'the strip asks for G + .');
    const before = await js('G.creatures.map(c=>c.pos).join()');
    await js('for(let i=0;i<4;i++) introStep(); 1');
    ok(before !== await js('G.creatures.map(c=>c.pos).join()'), 'creatures move in the intro');
    await js('for(let i=0;i<30;i++) introStep(); 1');
    ok(await js('G.creatures.some(c=>!c.alive)'), 'and eat each other');
    await down('KeyG'); eq(await js('G.phase'), 'intro', 'G alone does not start');
    await tap('Period'); eq(await js('[G.phase, LV.id]'), tut.length ? ['ready', tut[0].id] : ['play', inZone(real[0].id)[0].id], 'G + . starts the first tank (for a new player, the tutorial)');
    ok(!(await js('document.body.classList.contains("intro")')), 'and the intro is gone');
    eq(await js('introTimer'), null, 'its timer is stopped');
    await up('KeyG');
    await S('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await load(PLAYER);
    eq(await js('[G.phase, introTimer]'), ['intro', null], 'with reduced motion the intro is a still frame');
    await S('Emulation.setEmulatedMedia', { features: [] });
    await up('KeyG');
    // ---- the tutorial: a brand-new player's first zone
    if (zT) {
      let t;
      await js("localStorage.removeItem('gdot-progress-v1'); 1"); await load(PLAYER);
      eq(await js('[document.getElementById("tutorial").hidden, document.getElementById("tutorial").textContent]'), [false, 'skip tutorial'], 'a new player can skip the tutorial');
      ok((await state()).coachText.length > 0, 'the intro says what the game is');
      await down('KeyG'); await tap('Period');
      t = await state(); eq([t.lvl, t.phase], [tut[0].id, 'ready'], 'G+. opens the first tutorial tank');
      ok(t.zone.includes(zT.name), 'the header names the tutorial');
      ok(t.coachText.length > 0, 'its coach line says what to do');
      const t0 = sk(tut[0]);
      ok(await js(`/\\b(start|coachk)\\b/.test(document.querySelector('.k[data-code=${t0}]').className)`), 'and the key to press pulses');
      eq(t.bad, [], 'G+. on a tank that starts elsewhere flags nothing');
      await up('KeyG'); await down(t0); await up(t0);
      t = await state(); eq([t.phase, t.next], ['dead', tut[0].id], 'a loss in the tutorial retries the same tank');
      ok(t.coachText.includes('let go'), 'and the coach line says what happened');
      { const vis = v => js(`Object.defineProperty(document,'visibilityState',{get:()=>'${v}',configurable:true}); Object.defineProperty(document,'hidden',{get:()=>${v === 'hidden'},configurable:true}); document.dispatchEvent(new Event('visibilitychange')); 1`);
        await down('KeyG'); await tap('Period'); await up('KeyG'); await down(t0);
        await vis('hidden'); t = await state(); ok(t.phase === 'dead' && !t.coachText.includes('lost focus'), 'a death while the page is hidden is not explained to nobody');
        await vis('visible'); t = await state(); ok(t.coachText.includes('lost focus'), 'coming back to the page explains it');
        await down('KeyG'); await tap('Period'); await up('KeyG'); await down(t0); await vis('hidden');
        await js("(()=>{ const p=JSON.parse(localStorage.getItem('gdot-progress-v1')); p.beaten={'other-tab':1}; localStorage.setItem('gdot-progress-v1', JSON.stringify(p)); })(); 1");
        await vis('visible'); ok(await js("!!JSON.parse(localStorage.getItem('gdot-progress-v1')).beaten['other-tab']"), 'coming back never writes a stale copy over progress saved meanwhile');
        await js("(()=>{ const p=JSON.parse(localStorage.getItem('gdot-progress-v1')); delete p.beaten['other-tab']; localStorage.setItem('gdot-progress-v1', JSON.stringify(p)); loadProgress(); })(); 1");
        await js('delete document.visibilityState; delete document.hidden; 1'); await up(t0); }
      await down('KeyG'); // G stays held as the anchor finger, as a player keeps one key down
      for (let i = 0; i < tut.length; i++) {
        await tap('Period'); t = await state(); eq([t.lvl, t.phase], [tut[i].id, 'ready'], `tutorial tank ${i + 1} comes up in order`);
        const lvl = GDOT.resolveLevel(tut[i], zT);
        let sol = lvl.rules === 'territory' ? GDOT.solvePar(lvl, { budget: 600000 }) : solve(lvl, { budget: 200000 }); if (!sol.solved && lvl.rules !== 'territory') sol = solve(lvl, { budget: 400000, pickups: true, wait: true });
        ok(sol.solved, `tutorial tank ${i + 1} is solvable`); if (!sol.solved) break;
        ok(!sol.moves.some(m => m.place === 'KeyG' || m.pickup === 'KeyG'), `tutorial tank ${i + 1} never needs G (the test holds it)`);
        for (const m of sol.moves) { if (m.pickup) await tap(m.pickup); await tap(m.place); }
        t = await state(); eq(t.phase, 'won', `tutorial tank ${i + 1} cleared with real key presses`); ok(t.coachText.length > 0, `tutorial tank ${i + 1} has a line for the clear`);
      }
      eq(await js('PROG.tutorial'), 'done', 'clearing the last tutorial tank finishes the tutorial');
      const first = inZone(real[0].id)[0].id;
      eq(t.next, first, 'and G+. goes on to the first real tank');
      eq(await js('document.getElementById("tutorial").textContent'), 'play the tutorial', 'the button now offers it again');
      await tap('Period'); eq(await js('LV.id'), first, 'G+. goes there');
      if (sk(inZone(real[0].id)[0]) === 'KeyG') ok((await state()).coachText.includes('Keep holding G'), 'a tank that starts on G says the run has begun');
      ok(!(await state()).coachText.includes('another tank'), 'no loss tip on arrival');
      { const st = tut.find(l => (l.required || []).length); if (st) { await js(`CUR=levelIndex(${JSON.stringify(st.id)}); buildRuntime(); for(const k of GDOT.createGame(STORE.levels[CUR]).START) GDOT.place(G,k); for(const k of GDOT.KEYS.map(k=>k.code)) if(G.REQ.includes(k)) G.revealed.add(k); render(); 1`);
        ok(await js("!!document.querySelector('#status .tray .reqs .cap.req:not(.down)')"), 'an uncovered starfish sits in the tray as a slot still to fill'); } }
      await js("document.getElementById('tutorial').click(); 1"); await up('KeyG');
      eq([await js('LV.id'), await js('PROG.tutorial')], [tut[0].id, 'replay'], 'play the tutorial starts it again from its first tank');
      await js("document.getElementById('tutorial').click(); 1");
      eq([await js('PROG.tutorial'), await js('LV.zone')], ['skipped', real[0].id], 'skip tutorial goes to the first real zone');
      await load(PLAYER); await js("document.getElementById('tutorial').click(); 1");
      eq(await js('PROG.tutorial'), 'replay', 'play the tutorial is saved as a replay');
      await load(PLAYER); eq([await js('PROG.tutorial'), await js('STORE.levels[CUR].id')], ['replay', tut[0].id], 'a reload keeps the replay (the player asked for it)');
      { // follow the coach: tap what pulses (a pulsing tentacle: lift it), put back what was lifted, else a key that is safe right now
        await down('KeyG'); let deaths = 0, stuck = 0;
        for (let i = 0; i < tut.length; i++) {
          await tap('Period');
          for (let step = 0; step < 24; step++) {
            const st = await js(`(()=>{ if(G.phase!=='ready'&&G.phase!=='play') return {phase:G.phase};
              const pulse=[...document.querySelectorAll('.k.coachk,.k.start')].map(e=>e.dataset.code).filter(c=>c!=='KeyG'&&c!=='Period');
              const safe=GDOT.legalPlacements(G).filter(c=>c!=='KeyG'&&c!=='Period'&&GDOT.place(GDOT.cloneGame(G),c).type!=='dead');
              return {phase:G.phase, lifted:G.lifted, pulse, safe}; })()`);
            if (st.phase !== 'ready' && st.phase !== 'play') break;
            const k = st.lifted || st.pulse[0] || st.safe[0]; if (!k) { stuck++; break; }
            await tap(k);
          }
          const ph = await js('G.phase'); if (ph === 'dead') deaths++;
          eq(ph, 'won', `following the coach clears tutorial tank ${i + 1}`);
          if (ph !== 'won') break;
        }
        eq([deaths, stuck], [0, 0], 'the coach never leads into a bite or a dead end');
        await up('KeyG'); }
      await js(`PROG={beaten:{},played:{},tick:0,cur:null,finished:1,tutorial:'done',tips:{}}; for(const l of STORE.levels) if(!isTut(zoneOf(l))) PROG.beaten[l.id]=1; saveProgress(); 1`);
      await load(PLAYER); await js("document.getElementById('tutorial').click(); 1");
      await down('KeyG'); await tap('Period'); await up('KeyG');
      eq([await js('LV.id'), await js('PROG.finished')], [tut[0].id, 1], 'a player who finished the game can replay the tutorial (not a new game)');
      await js("document.getElementById('tutorial').click(); 1");
      eq([await js('G.phase'), await js('PROG.tutorial')], ['intro', 'skipped'], 'skipping it then goes back to the intro');
      await down('KeyG'); await tap('Period'); await up('KeyG');
      eq([await js('isTut(zoneOf(LV))'), await js('PROG.finished')], [false, 2], 'where G+. starts a new game');
      await js(`localStorage.setItem('gdot-progress-v1', JSON.stringify({finished:1,beaten:{},played:{},tick:0,cur:null})); 1`);
      await load(PLAYER); eq(await js('PROG.tutorial'), 'skipped', 'a player who finished the game before the tutorial existed is not sent to it');
      await js(`localStorage.setItem('gdot-progress-v1', JSON.stringify({beaten:{[${JSON.stringify(first)}]:1},played:{},tick:1,cur:${JSON.stringify(inZone(real[0].id)[1].id)}})); 1`);
      await load(PLAYER); eq([await js('PROG.tutorial'), await js('STORE.levels[CUR].id')], ['skipped', inZone(real[0].id)[1].id], 'a returning player who cleared a tank skips it and carries on');
      await js(`localStorage.setItem('gdot-progress-v1', JSON.stringify({beaten:{},played:{[${JSON.stringify(first)}]:1},tick:1,cur:${JSON.stringify(inZone(real[0].id)[1].id)}})); 1`);
      await load(PLAYER); eq([await js('PROG.tutorial===undefined'), await js('STORE.levels[CUR].id')], [true, tut[0].id], 'a returning player who cleared nothing gets the tutorial first');
      eq(JSON.parse(await js("localStorage.getItem('gdot-progress-v1')")).cur, null, 'and that is saved');
    }
    // ---- the classic rules are tested on the classic campaign kept in test/fixtures (live zones may use territory rules)
    if (zones.some(z => z.rules === 'territory')) {
      const FIX = path.join(ROOT, 'test', 'fixtures', 'classic-levels.js');
      levels = loadLevels(FIX); zones = loadZones(FIX); zT = zones.find(z => z.tutorial); tut = zT ? inZone(zT.id) : []; real = zones.filter(z => !z.tutorial);
      await js(`localStorage.setItem('gdot-levels-v2', JSON.stringify({levels:${JSON.stringify(levels)},zones:${JSON.stringify(zones)},dirty:true,base:BUILTIN_SIG,baseCopy:BUILTIN})); 1`);
    }
    await js(SKIPPED);
    await playPage();
    const z1 = inZone(real[0].id);

    // ---- boot: zone header, icon strip, no sentences on screen
    let b = await state();
    eq(await js('document.querySelectorAll("#board .k").length'), GDOT.KEYS.length, 'one div per key');
    eq(b.lvl, z1[0].id, 'starts on the first tank of the first zone'); eq(b.phase, 'ready', 'ready');
    ok(b.zone.includes(real[0].name), 'header names the zone');
    eq(await js('document.querySelectorAll("#zone .tank").length'), z1.length, 'one cap per tank in the zone');
    ok(/class="cap down">G</.test(b.strip) && /class="cap ">\./.test(b.strip), 'strip shows the G + . keycaps');
    ok(!(await js('!!document.getElementById("why")')), 'no sentence line for players');
    ok(b.say.length > 0, 'the sentence still goes to screen readers');
    // ---- clear tank 1 with the solver's line
    await down('KeyG'); b = await state(); eq(b.phase, 'play', 'G starts the run');
    ok(b.coach.includes('ci shark'), 'the first shark you see comes with a one-line tip'); eq(await js('!!PROG.tips.shark'), false, 'not counted as seen until you play on past it');
    const line = solve(z1[0], { budget: 60000 }).moves;
    for (const m of line.slice(1)) await tap(m.place);
    b = await state(); eq(b.phase, 'won', 'tank 1 cleared'); eq(b.beaten, [z1[0].id], 'progress remembers it');
    ok(!b.coach.includes('ci shark'), 'the tip is gone once you have played on'); eq(await js('PROG.tips.shark'), 1, 'and now it counts as seen, so it is said once'); ok(b.coachText.includes('Clear'), 'the first clear explains the zone strip');
    eq(b.next, z1[1].id, 'the next tank is the second one'); ok(b.strip.includes('cap next'), 'strip shows where G+. goes');
    await tap('Period'); b = await state(); eq(b.lvl, z1[1].id, 'G+. goes there');
    const s2 = sk(z1[1]); ok(s2 !== 'KeyG', 'tank 2 starts on its own key, not G');
    if (s2 !== 'KeyG') { eq(b.phase, 'ready', 'so G+. waits for that key'); ok(b.strip.includes('cap pulse'), 'and the strip shows it'); }
    await down(s2); b = await state(); eq(b.phase, 'play', 'pressing it starts tank 2');
    // ---- die on tank 2: the bite is drawn, and the tank sends you to another unbeaten tank
    const t2 = GDOT.createGame(z1[1]); GDOT.place(t2, s2);
    const killer = t2.creatures.find(c => c.seen && c.mover === 'path');
    ok(killer, 'tank 2 shows a shark from the first press');
    const probe = GDOT.cloneGame(t2); const kc = probe.creatures.find(c => c.id === killer.id); GDOT.moveOnce(probe, kc); const going = kc.pos;
    await tap(going); b = await state();
    eq(b.phase, 'dead', 'pressing where it is going kills'); eq(b.hurt, [going], 'the bitten key is marked');
    ok(b.coachText.includes('creatures move, then your tentacle lands'), 'the first death of this kind explains the turn order');
    ok(b.coachText.includes('another tank of this zone'), 'and the first loss says it sends you on');
    eq(b.trail, [killer.pos], 'where it came from is marked with an arrow');
    ok(b.strip.includes('chip bite'), 'strip shows the bite'); ok(b.dead, 'board dims');
    eq(b.next, z1[2].id, 'death sends you to the third tank (unbeaten, never played)');
    await up('KeyG'); await up(s2); await playPage(); b = await state(); eq(b.lvl, z1[2].id, 'a reload does not undo the redirect');
    const s3 = sk(z1[2]);
    await down(s3); b = await state(); eq(b.phase, 'play', 'tank 3 starts on its key');
    await playPage(); b = await state(); eq(b.lvl, z1[3].id, 'leaving the page mid-run counts as letting go: sent on to tank 4');
    await js(`CUR=levelIndex(${JSON.stringify(z1[2].id)}); buildRuntime(); 1`);
    // ---- let go
    await down(s3); await up(s3); b = await state();
    eq(b.phase, 'dead', 'releasing every key = let go'); ok(b.gone >= 1, 'the released tentacles are drawn as gone');
    ok(!b.hurt.length, 'no bite mark for letting go');
    // ---- no holding: letting go of every key, or the window losing focus, no longer ends the run
    await playPage(); await js(`setCur(levelIndex(${JSON.stringify(z1[2].id)})); buildRuntime(); 1`);
    await js("document.getElementById('nohold').click(); 1");
    eq(await js('[SET.nohold, JSON.parse(localStorage.getItem("gdot-settings-v1")).nohold, mustHold()]'), [true, true, false], 'no holding is a saved setting');
    await down(s3); await up(s3); b = await state(); eq([b.phase, b.fingers], ['play', [s3]], 'with no holding, releasing every key keeps the run');
    await js("window.dispatchEvent(new Event('blur')); 1"); b = await state(); eq(b.phase, 'play', 'and so does the window losing focus');
    ok(!b.coachText.includes('let go'), 'nothing says you let go');
    await load(PLAYER); eq(await js('document.getElementById("nohold").checked'), true, 'the box stays ticked after a reload');
    await toTank(); b = await state(); ok(b.lvl !== z1[2].id && JSON.parse(await js("localStorage.getItem('gdot-progress-v1')")).cur !== z1[2].id, 'leaving the page mid-run still sends you on (no free retries)');
    ok(b.coachText.includes('You left mid-run'), 'and the next tank says why');
    eq(await js('!!PROG.left'), false, 'said once');
    await js("document.getElementById('nohold').click(); 1"); eq(await js('mustHold()'), true, 'unticked: hold again');
    // ---- refused press
    await playPage(); await js(`CUR=levelIndex(${JSON.stringify(z1[2].id)}); buildRuntime(); 1`); await down(s3);
    const t3 = GDOT.createGame(z1[2]); GDOT.place(t3, s3);
    const fogKey = GDOT.KEYS.map(k => k.code).find(k => !t3.revealed.has(k) && k !== 'Period');
    await down(fogKey); b = await state(); eq(b.bad, [fogKey], 'a fog press is flagged on its key');
    ok(await js(`!!document.querySelector('.k.bad .mark.why')`), 'with a reason icon'); await up(fogKey);
    await up(s3);
    // ---- the coach line: a step, a reply to one press, tokens
    { const c = { id: 'smoke-coach', name: 'Smoke coach', zone: real[0].id, goal: 3, start: ['KeyG'], required: [], tank: ['KeyG', 'KeyH', 'KeyJ'], terrain: {}, creatures: [],
        coach: { ready: 'Press {G}.', 1: 'Step one: tap {H}. A {tentacle}! Not {Q}.', algae: 'No grip there.', lift: 'Lifted.' } };
      await js(`STORE.levels.push(${JSON.stringify(c)}); CUR=STORE.levels.length-1; buildRuntime(); 1`);
      eq((await state()).coachText, 'Press G.', 'the ready line');
      await down('KeyG'); b = await state(); ok(b.coachText.startsWith('Step one: tap H.'), 'the numbered line after the first tentacle');
      ok(await js("document.querySelector('.k[data-code=KeyH]').classList.contains('coachk')"), 'the key it names is highlighted');
      eq(await js("[...document.querySelectorAll('#coach .cap')].map(e=>e.textContent)"), ['H'], 'a sentence that only names keys in fog is left out');
      eq(await js("(()=>{ const k=[]; const h=coachTokens('{q} {Q} {~J}',k); return [h.match(/class=.cap/g).length, k]; })()"), [3, ['KeyQ', 'KeyQ']], '{q} is the Q key, not an icon, and {~J} names J without pulsing it');
      eq(await js("document.querySelector('#coach .ci.tentacle').getAttribute('aria-label')"), 'tentacle', 'icons have a spoken name');
      await down('KeyF'); b = await state(); ok(b.coachText.includes('No grip there. Step one'), 'a refusal replies and the step stays'); await up('KeyF');
      await tap('KeyH'); b = await state(); ok(!b.coachText.includes('No grip'), 'the reply is gone after the next tentacle');
      await tap('KeyH'); ok((await state()).coachText.startsWith('Lifted.'), 'a lift replies'); await tap('KeyH');
      await up('KeyG'); }
    { const m = { id: 'smoke-hidden-star', name: 'Smoke hidden star', zone: real[0].id, goal: 2, start: ['KeyG'], required: ['KeyK'], tank: ['KeyG', 'KeyH', 'KeyJ', 'KeyK'], terrain: {}, creatures: [] };
      await js(`STORE.levels.push(${JSON.stringify(m)}); CUR=STORE.levels.length-1; buildRuntime(); PROG.tips={}; 1`);
      await down('KeyG'); await tap('KeyH'); b = await state(); ok(b.phase === 'play' && b.coachText.includes('still hidden in the fog'), 'a full tray with a starfish still in the fog says so'); await up('KeyG'); }
    // G+. mid-run on a real tank sends you on, and says so the first time
    await playPage(); await js(`PROG.tips={}; setCur(levelIndex(${JSON.stringify(z1[3].id)})); buildRuntime(); 1`); await down(sk(z1[3]));
    { const g3 = GDOT.createGame(z1[3]); GDOT.place(g3, sk(z1[3])); const safe = GDOT.legalPlacements(g3).find(k => { const h = GDOT.cloneGame(g3); return GDOT.place(h, k).type === 'placed' && k !== 'KeyG' && k !== 'Period'; });
      if (safe) { await tap(safe); await down('KeyG'); await tap('Period'); b = await state(); ok(b.lvl !== z1[3].id && b.coachText.includes('another tank of this zone'), 'G+. mid-run sends you on and the tip says why'); await up('KeyG'); } }
    await up(sk(z1[3]));
    // ---- territory rules in the page (a made-up tank that says territory itself)
    { const J = JSON.stringify;
      const tt = { id: 'smoke-terr', name: 'Smoke territory', zone: real[0].id, rules: 'territory', goal: 8, start: ['KeyG'], required: [], tank: ['KeyG', 'KeyH', 'KeyJ', 'KeyY', 'KeyU', 'KeyB'], terrain: {},
        creatures: [{ type: 'shark', mover: 'path', path: ['KeyY', 'KeyU', 'KeyJ'], loop: 'pingpong', pathIndex: 0, size: 'big', speed: 1 }] };
      const line = parLine(tt); tt.par = line.length;
      await playPage(); await js(`STORE.levels.push(${J(tt)}); setCur(STORE.levels.length-1); buildRuntime(); PROG.tips={}; COACH.tip=[]; coachReady(); render(); 1`);
      eq(await js('[G.MODE, document.getElementById("parbox").hidden, document.getElementById("par").textContent]'), ['territory', false, String(tt.par)], 'a territory tank shows its par');
      ok((await state()).coachText.includes('Fill every open key'), 'and says what the goal is, once');
      await down('KeyG'); b = await state();
      ok(new RegExp('class="tcount">1/' + (await js('G.GOAL')) + '<').test(b.strip), 'the tray counts filled keys against keys to fill');
      ok(await js('!!document.querySelector(".k .mark.intent")'), 'the shark shows an arrow');
      eq(await js('document.querySelector(".k[data-code=KeyU]").classList.contains("aimed")'), false, 'a target still in fog is not marked');
      await tap('KeyH'); ok(await js('document.querySelector(".k[data-code=KeyJ]").classList.contains("aimed")'), 'once uncovered, the key it moves to is marked');
      await tap('KeyH'); // lift H: J stays uncovered but is not next to a tentacle
      eq(await js('GDOT.placeBlock(G,"KeyN")'), 'algae', 'outside the tank is algae');
      await tap('KeyH');
      await js('G.fingers.clear(); G.fingers.add("KeyG"); G.phase="play"; 1'); await down('KeyJ'); b = await state(); eq(b.bad, ['KeyJ'], 'a key not next to a tentacle is refused'); await up('KeyJ');
      ok(b.coachText.includes('Only keys next to'), 'and the reason is said');
      // play the par line with real presses from a fresh start
      await up('KeyG'); await js('buildRuntime(); 1'); await down('KeyG');
      for (const m of line.slice(1)) { if (m.pickup) await tap(m.pickup); await tap(m.place); }
      b = await state(); eq(b.phase, 'won', 'the par line clears the tank');
      ok(/chip parc made/.test(b.strip), 'the strip shows presses against par, made'); eq(await js('PROG.best["smoke-terr"]'), tt.par, 'the best is recorded');
      await up('KeyG');
      const idx = await js('CUR'); await js(`document.querySelector('#zone .tank[data-i="${idx}"]').click(); 1`);
      eq(await js('[LV.id, G.phase]'), ['smoke-terr', 'ready'], 'a cleared territory tank can be played again for par');
      // a creature taking a key, and every key taken
      const tk = { id: 'smoke-take', name: 'Smoke take', zone: real[0].id, rules: 'territory', goal: 8, start: ['KeyG'], required: [], tank: ['KeyG', 'KeyH', 'KeyJ'], terrain: {},
        creatures: [{ type: 'shark', mover: 'path', path: ['KeyH', 'KeyG'], loop: 'pingpong', pathIndex: 0, size: 'big', speed: 1 }] };
      await js(`STORE.levels.push(${J(tk)}); setCur(STORE.levels.length-1); buildRuntime(); 1`);
      await js('place("KeyG"); GDOT.start(G); GDOT.pickup(G,"KeyG"); place("KeyG"); 1'); b = await state();
      eq([b.phase, b.next], ['dead', 'smoke-take'], 'every tentacle taken: the tank is lost, and G+. plays it again');
      ok(b.coachText.includes('Every') && b.coachText.includes('taken'), 'the loss says what happened');
      await js(`STORE.levels.push(${J(Object.assign({}, tk, { id: 'smoke-take2', tank: ['KeyG', 'KeyH', 'KeyJ', 'KeyF'] }))}); setCur(STORE.levels.length-1); buildRuntime(); PROG.tips={}; 1`);
      await js('place("KeyG"); place("KeyF"); 1'); b = await state();
      ok(await js('document.querySelector(".k[data-code=KeyG]").classList.contains("taken")'), 'a taken key is marked'); ok(b.coachText.includes('took that'), 'and explained the first time');
      await down('KeyG'); await tap('Period');
      eq(await js('[LV.id, G.phase, G.turn, [...G.fingers]]'), ['smoke-take2', 'play', 1, ['KeyG']], 'G+. mid-run on a territory tank starts it again (on G, the first tentacle goes straight down)'); await up('KeyG'); }
    // ---- max tentacles and lift one at a time, in the page
    const cap2 = { id: 'smoke-cap', name: 'Smoke cap', zone: real[0].id, goal: 2, maxTentacles: 2, lift: 'one', start: ['KeyG'], required: ['KeyJ'], terrain: {}, creatures: [] };
    await js(`STORE.levels.push(${JSON.stringify(cap2)}); CUR=STORE.levels.length-1; buildRuntime(); 1`);
    ok(await js(`!document.querySelector('.k[data-code=KeyJ]').classList.contains('req') && document.querySelector('.k[data-code=KeyJ]').classList.contains('fog')`), 'a starfish in fog stays hidden');
    ok(await js(`!document.querySelector('#status .cap.req')`), 'and the strip does not mention it');
    await down('KeyG'); await tap('KeyH'); b = await state(); eq(b.fingers, ['KeyG', 'KeyH'], 'two tentacles down');
    ok(await js(`document.querySelectorAll('#status .cap.req .cstar').length===1`), 'once uncovered, the strip names the starfish key');
    ok(await js(`document.querySelector('.k[data-code=KeyJ]').classList.contains('req') && !!document.querySelector('.k[data-code=KeyJ] > svg')`), 'and the starfish fills its key');
    ok(await js(`document.querySelector('.k[data-code=KeyJ] > svg').innerHTML.includes('Q')`), 'drawn as the curvy starfish, not a plain star');
    await down('KeyJ'); b = await state(); eq(b.fingers, ['KeyG', 'KeyH'], 'the third is refused at the cap'); ok(b.strip.includes('tray full'), 'the tray shows it is full'); await up('KeyJ');
    await tap('KeyH'); b = await state(); eq(b.fingers, ['KeyG'], 'lift one'); ok(b.strip.includes('chip lifted'), 'strip shows a lifted tentacle');
    ok(await js(`!!document.querySelector('.k.lifted')`), 'the lifted key keeps a ghost tentacle');
    await tap('KeyJ'); b = await state(); eq(b.phase, 'won', 'the marked key completes it');
    await up('KeyG');
    const one = { id: 'smoke-one', name: 'Smoke one', zone: real[0].id, goal: 8, lift: 'one', start: ['KeyG'], required: [], terrain: {}, creatures: [] };
    await js(`STORE.levels.push(${JSON.stringify(one)}); CUR=STORE.levels.length-1; buildRuntime(); 1`);
    await down('KeyG'); await tap('KeyF'); await tap('KeyH');
    await tap('KeyF'); b = await state(); eq(b.fingers, ['KeyG', 'KeyH'], 'one at a time: lifted F');
    await tap('KeyH'); b = await state(); eq(b.fingers, ['KeyG', 'KeyH'], 'a second lift is refused');
    ok(await js(`!!document.querySelector('.k .mark.lk')`), 'with a lock drawn on the tentacle');
    await tap('KeyT'); await tap('KeyH'); b = await state(); eq(b.fingers, ['KeyG', 'KeyT'], 'after a placement the next lift works');
    await up('KeyG');
    // ---- finishing every tank: G+. starts a fresh game, right away and after a reload
    await playPage();
    await js(`PROG={beaten:{},played:{},tick:0,cur:null}; for(const l of STORE.levels) if(l.id!==${JSON.stringify(z1[0].id)}) PROG.beaten[l.id]=1; saveProgress(); CUR=levelIndex(${JSON.stringify(z1[0].id)}); buildRuntime(); 1`);
    await down('KeyG'); for (const m of line.slice(1)) await tap(m.place);
    b = await state(); eq(b.next, '__new__', 'clearing the last uncleared tank finishes the game'); ok(b.strip.includes('chip done'), 'the strip shows it');
    await tap('Period'); b = await state();
    eq([b.beaten, b.lvl, b.phase], [[], z1[0].id, 'play'], 'G+. starts a fresh game on the first tank');
    eq(await js('PROG.finished'), 1, 'and counts the finished game');
    await up('KeyG');
    await js(`for(const l of STORE.levels) PROG.beaten[l.id]=1; saveProgress(); 1`);
    await load(PLAYER); ok(/chip done/.test(await js('document.getElementById("status").innerHTML')), 'after a reload the intro shows the game is finished');
    await down('KeyG'); await tap('Period');
    eq(await js('[Object.keys(PROG.beaten).length, LV.id, G.phase]'), [0, z1[0].id, 'play'], 'and G+. starts over from the first tank'); await up('KeyG');
    await js("localStorage.removeItem('gdot-progress-v1'); 1");
    // ---- reset progress: every tank as never played, back to the intro
    await playPage();
    await js(`PROG.beaten[${JSON.stringify(z1[0].id)}]=1; PROG.beaten[${JSON.stringify(z1[1].id)}]=1; PROG.played[${JSON.stringify(z1[1].id)}]=5; PROG.tick=5; PROG.cur=${JSON.stringify(z1[2].id)}; saveProgress(); CUR=levelIndex(${JSON.stringify(z1[2].id)}); buildRuntime(); document.getElementById('reset-progress').click(); 1`);
    eq(await js('[Object.keys(PROG.beaten).length, document.getElementById("reset-progress").textContent]'), [2, 'click again to forget every tank'], 'the first click only asks');
    await js(`document.getElementById('reset-progress').click(); 1`);
    eq(await js('[Object.keys(PROG.beaten).length, Object.keys(PROG.played).length, G.phase, document.querySelectorAll("#zone .tank.won").length]'), [0, 0, 'intro', 0], 'reset progress forgets every tank and goes back to the intro');
    await down('KeyG'); await tap('Period'); eq(await js('LV.id'), tut.length ? tut[0].id : z1[0].id, 'and G+. starts at the first tank (the tutorial again)'); await up('KeyG');
    await js(SKIPPED); await load(PLAYER);
    // a reset in another tab reaches this one
    await toTank(); await js(`PROG.beaten[${JSON.stringify(z1[0].id)}]=1; saveProgress(); 1`);
    await js(`(()=>{ const v=JSON.stringify({beaten:{},played:{},tick:0,cur:null}); localStorage.setItem('gdot-progress-v1', v); window.dispatchEvent(new StorageEvent('storage',{key:'gdot-progress-v1',newValue:v})); })(); 1`);
    eq(await js('Object.keys(PROG.beaten).length'), 0, 'a reset in another tab reaches this one');
    await js("localStorage.removeItem('gdot-progress-v1'); 1");
    // ---- the studio: plays the tank you pick, never redirects, never touches progress
    await load(PAGE);
    { const J = JSON.stringify, progBefore = await js("localStorage.getItem('gdot-progress-v1')");
      await js(`CUR=levelIndex(${J(z1[1].id)}); buildRuntime(); 1`);
      const s1 = sk(z1[1]); await down(s1); await up(s1); b = await state();
      eq([b.phase, b.next], ['dead', z1[1].id], 'in the studio a death retries the same tank');
      eq(await js("localStorage.getItem('gdot-progress-v1')"), progBefore, 'and progress is untouched');
      await js(`document.getElementById('editor').click(); CUR=levelIndex(${J(z1[4].id)}); buildRuntime(); refreshEditor(); document.getElementById('editor').click(); 1`);
      eq(await js('LV.id'), z1[4].id, 'closing the editor stays on the tank you were editing');
      ok(!(await js("!!document.getElementById('debug')")), 'there is no designer view any more');
      // hotkeys: arrows move through the zone strip and between zones, without playing
      await js(`CUR=levelIndex(${J(z1[0].id)}); buildRuntime(); 1`);
      const shown = await js('zoneTanksShown(zoneOf(LV)).map(t=>t.l.id)'), at = shown.indexOf(z1[0].id);
      await key('keyDown', 'ArrowRight'); await key('keyUp', 'ArrowRight');
      eq(await js('[LV.id, G.phase]'), [shown[(at + 1) % shown.length], 'ready'], 'right arrow: the next tank in the strip, ready to play');
      await key('keyDown', 'ArrowLeft'); await key('keyUp', 'ArrowLeft'); eq(await js('LV.id'), z1[0].id, 'left arrow: back');
      await key('keyDown', 'ArrowDown'); await key('keyUp', 'ArrowDown');
      eq(await js('[LV.zone, LV.id===zoneTanksShown(zoneOf(LV))[0].l.id]'), [real[1].id, true], 'down arrow: the first tank of the next zone');
      await key('keyDown', 'ArrowUp'); await key('keyUp', 'ArrowUp'); eq(await js('LV.zone'), real[0].id, 'up arrow: the zone before');
      await load(PAGE); eq(await js('LV.zone'), real[0].id, 'the studio reopens on the tank it was on'); }
    // ---- editor: new tank, slot, zone, undo, delete, export, load
    await load(PAGE);
    await js(`window.confirm=()=>{ throw new Error('no dialogs'); }; window.prompt=()=>{ throw new Error('no dialogs'); }; document.getElementById('editor').click(); 1`);
    // ---- the live preview: creatures move while you edit, on a copy of the tank
    { const barr = levels.find(l => real.some(z => z.id === l.zone) && l.creatures.some(c => c.mover === 'path' || c.mover === 'dir'));
      await js(`CUR=levelIndex(${JSON.stringify(barr.id)}); buildRuntime(); refreshEditor(); 1`);
      ok(await js('!!PV && pvActive() && !!pvTimer'), 'the editor runs a live preview');
      const start = await js('G.creatures.map(c=>c.pos).join()');
      await js('for(let i=0;i<3;i++) pvStep(); 1');
      ok(await js('PV.creatures.map(c=>c.pos).join()') !== start, 'its creatures move');
      eq(await js('G.creatures.map(c=>c.pos).join()'), start, 'the tank itself does not');
      ok(await js(`[...document.querySelectorAll('.k.occ')].some(e=>PV.creatures.some(c=>c.alive&&c.pos===e.dataset.code))`), 'the board draws the preview positions');
      await js('for(let i=0;i<30;i++) pvStep(); 1'); ok(await js('pvStepN') <= 24, 'it loops');
      await js(`(()=>{ const i=document.getElementById('e-name'); i.value=LV.name; i.dispatchEvent(new Event('change')); })(); 1`);
      eq(await js('pvStepN'), 0, 'an edit restarts it');
      await js(`E.sel=0; document.getElementById('c-place').click(); 1`); ok(!(await js('pvActive()')), 'placing a creature pauses it');
      await js(`document.getElementById('c-place').click(); 1`); ok(await js('pvActive()'), 'and it resumes');
      await js(`document.getElementById('pv-play').click(); 1`); eq(await js('pvPaused'), true, 'Pause pauses');
      await js(`document.getElementById('pv-step').click(); 1`); eq(await js('pvStepN'), 1, 'Step steps once');
      await js(`document.getElementById('pv-play').click(); 1`);
      const sk0 = GDOT.createGame(barr).START[0]; await down(sk0);
      eq(await js('[G.phase, pvActive()]'), ['play', false], 'test-playing stops the preview');
      await up(sk0); }
    const n0 = await js('STORE.levels.length'), zone0 = await js('LV.zone'), first0 = await js('tanks(zoneOf(LV))[0].l.id');
    await js(`document.getElementById('e-new').click(); 1`);
    eq(await js('STORE.levels.length'), n0 + 1, 'New tank adds one'); eq(await js('LV.zone'), zone0, 'in the same zone');
    eq(await js('tanks(zoneOf(LV)).slice(-1)[0].l===LV'), true, 'at the next free key of the zone (the end)');
    eq(await js('LV.tank.length'), await js('1+NEI[LV.start[0]].filter(q=>!/^Meta/.test(q)).length'), 'a new tank is closed: its start and its neighbours');
    eq(await js('Object.values(G.TER).filter(t=>t==="algae").length'), await js('74-LV.tank.length'), 'everything else is algae');
    await js(`(()=>{ const s=document.getElementById('e-slot'); s.value='0'; s.dispatchEvent(new Event('change')); })(); 1`);
    eq(await js('tanks(zoneOf(LV))[0].l===LV'), true, 'the Key select swaps it onto the first key');
    eq(await js('tanks(zoneOf(LV)).slice(-1)[0].l.id'), first0, 'and the tank that was there takes its place');
    eq(await js('LV.start'), [await js('zoneOf(LV).keys[0]')], 'the new tank now starts on the first key');
    await js(`document.getElementById('e-undo').click(); 1`); eq(await js('tanks(zoneOf(LV))[0].l.id'), first0, 'Undo swaps them back');
    await js(`(()=>{ const s=document.getElementById('e-zone'); s.value=${JSON.stringify(zones[2].id)}; s.dispatchEvent(new Event('change')); })(); 1`);
    eq(await js('LV.zone'), zones[2].id, 'the Zone select moves it to another zone'); eq(await js('tanks(zoneOf(LV)).slice(-1)[0].l===LV'), true, 'at the end of that zone');
    eq(await js('slotKey(LV)?LV.start[0]===slotKey(LV):true'), true, 'starting on its key there, if the zone has one free');
    await js(`document.getElementById('e-undo').click(); 1`); eq(await js('LV.zone'), zone0, 'Undo puts it back');
    // arrows on a focused dropdown are hotkeys, never edits
    { const snap = await js('JSON.stringify({l:STORE.levels.map(l=>l.id+l.zone),z:STORE.zones.map(z=>z.keys.join())})');
      await js(`document.getElementById('e-zone').focus(); 1`); await key('keyDown', 'ArrowDown'); await key('keyUp', 'ArrowDown');
      eq(await js('JSON.stringify({l:STORE.levels.map(l=>l.id+l.zone),z:STORE.zones.map(z=>z.keys.join())})'), snap, 'an arrow on the focused Zone list changes nothing');
      eq(await js('document.activeElement.id'), '', 'and the list lets go of the keyboard');
      await key('keyDown', 'ArrowUp'); await key('keyUp', 'ArrowUp'); }
    // Set key: the new keyless tank takes a key of your choice, carrying its layout
    { const nt = await js(`(()=>{ const z=zoneOf(LV); return tanks(z).slice(-1)[0].l.id; })()`);
      await js(`CUR=levelIndex(${JSON.stringify(nt)}); buildRuntime(); refreshEditor(); 1`);
      eq(await js('slotKey(LV)'), null, 'the ninth tank of a zone has no key');
      await js(`document.getElementById('e-setkey').click(); 1`); eq(await js('E.capture'), true, 'Set key waits for a key');
      await key('keyDown', 'KeyL'); await key('keyUp', 'KeyL');
      eq(await js('[slotKey(LV), LV.start, E.capture]'), ['KeyL', ['KeyL'], false], 'pressing L gives it L, and it starts there');
      const firstId = await js('tanks(zoneOf(LV))[0].l.id');
      await js(`document.getElementById('e-setkey').click(); 1`); await key('keyDown', 'KeyG'); await key('keyUp', 'KeyG');
      eq(await js(`[slotKey(LV), LV.start[0], tanks(zoneOf(LV)).some(t=>t.l.id===${JSON.stringify(firstId)}&&slotKey(t.l)==="KeyL")]`), ['KeyG', 'KeyG', true], 'a key another tank of the zone has: the two swap');
      await js(`document.getElementById('e-setkey').click(); 1`); await key('keyDown', 'KeyT'); await key('keyUp', 'KeyT');
      ok(/also a tank key/.test(await js("document.getElementById('e-msg').textContent")), 'a key another zone uses is named');
      await js(`for(let i=0;i<3;i++) document.getElementById('e-undo').click(); 1`); }
    await js(`document.getElementById('brush').querySelector('[data-id=start]').click(); CUR=levelIndex(${JSON.stringify(levels[0].id)}); buildRuntime(); refreshEditor(); onKeyPaint('KeyP',true); 1`);
    eq(await js('LV.start'), levels[0].start, 'the Start brush cannot move a keyed tank off its key');
    await js(`CUR=STORE.levels.length-1; buildRuntime(); refreshEditor(); 1`);
    await js(`(()=>{ const i=document.getElementById('e-max'); i.value='2'; i.dispatchEvent(new Event('change')); })(); 1`); eq(await js('[LV.maxTentacles,LV.goal]'), [2, 2], 'max tentacles clamps the goal');
    await js(`(()=>{ const i=document.getElementById('e-lift'); i.value='one'; i.dispatchEvent(new Event('change')); })(); 1`); eq(await js('LV.lift'), 'one', 'lifting rule saved');
    await js(`document.getElementById('e-del').click(); 1`); eq(await js('STORE.levels.length'), n0 + 1, 'the first Delete click only asks');
    await js(`document.getElementById('e-del').click(); 1`); eq(await js('STORE.levels.length'), n0, 'Delete removes it');
    { const before = await js(`tanks(zoneOf(LV)).map(t=>[t.l.id,slotKey(t.l)])`); const victim = before[1][0];
      await js(`CUR=levelIndex(${JSON.stringify(victim)}); buildRuntime(); refreshEditor(); document.getElementById('e-del').click(); document.getElementById('e-del').click(); 1`);
      const after = await js(`tanks(zoneOf(LV)).map(t=>[t.l.id,slotKey(t.l)])`);
      eq(after, before.filter(x => x[0] !== victim), 'deleting a tank leaves every other tank on its key');
      await js(`document.getElementById('e-undo').click(); 1`); eq(await js(`tanks(zoneOf(LV)).map(t=>[t.l.id,slotKey(t.l)])`), before, 'Undo brings it back on its key'); }
    await js(`document.getElementById('e-copyall').click(); 1`);
    const exported = await js(`document.getElementById('e-json').value`);
    ok(/window\.GDOT_ZONES=\[/.test(exported) && /window\.GDOT_LEVELS=\[/.test(exported), 'Copy levels.js writes the whole file');
    const w = {}; new Function('window', exported)(w); eq(w.GDOT_LEVELS.length, n0, 'and it parses back with every tank');
    await js(`document.getElementById('e-load').click(); document.getElementById('e-load').click(); 1`); eq(await js('STORE.levels.length'), n0, 'Load of a whole levels.js replaces the tanks');
    ok(await js('STORE.dirty'), 'editing marks the copy dirty');
    ok(await js(`document.getElementById('e-banner').hidden`), 'no banner while levels.js has not changed');
    await js(`STORE.base='old'; refreshEditor(); 1`); ok(!(await js(`document.getElementById('e-banner').hidden`)), 'banner when levels.js changed under an edited copy');
    await js(`document.getElementById('b-use').click(); document.getElementById('b-use').click(); 1`); ok(!(await js('STORE.dirty')), 'Use levels.js follows the file again');
    ok((await js('backups().length')) >= 1, 'the replaced copy is in Backups');
    // ---- an edited copy follows levels.js for every tank it did not touch
    { const J = JSON.stringify, L0 = levels[0], L1 = levels[1], L2 = levels[2];
      await js(`(()=>{ const base=clone(BUILTIN); base.levels[0].goal=3; base.levels.splice(2,1); const mine=clone(base); mine.levels[1].name='Mine'; localStorage.setItem('gdot-levels-v2', JSON.stringify({levels:mine.levels,zones:mine.zones,dirty:true,base:'old',baseCopy:base})); })(); 1`);
      await load(PAGE);
      eq(await js(`STORE.levels.find(l=>l.id===${J(L0.id)}).goal`), L0.goal, 'a tank untouched here follows levels.js');
      eq(await js(`STORE.levels.find(l=>l.id===${J(L1.id)}).name`), 'Mine', 'a tank edited here stays edited');
      eq(await js(`STORE.levels.findIndex(l=>l.id===${J(L2.id)})`), 2, 'a tank new in levels.js arrives in its place');
      eq(await js('[STORE.dirty, (STORE.clash||[]).length, STORE.base===BUILTIN_SIG]'), [true, 0, true], 'no clash, and the copy now builds on the current levels.js');
      await js(`(()=>{ const base=clone(BUILTIN); base.levels[0].goal=3; const mine=clone(base); mine.levels[0].name='Both'; localStorage.setItem('gdot-levels-v2', JSON.stringify({levels:mine.levels,zones:mine.zones,dirty:true,base:'old',baseCopy:base})); })(); 1`);
      await load(PAGE);
      eq(await js('[STORE.levels[0].name, STORE.levels[0].goal, STORE.clash]'), ['Both', 3, ['Both']], 'changed on both sides: this browser keeps its version and names it');
      await js(`document.getElementById('editor').click(); 1`); ok(!(await js(`document.getElementById('e-banner').hidden`)) && /Both/.test(await js(`document.getElementById('b-text').textContent`)), 'the banner names it');
      await js(`document.getElementById('editor').click(); localStorage.removeItem('gdot-levels-v2'); 1`); await load(PAGE); }
    // ---- merge details the review asked for
    { const J = JSON.stringify, setCopy = code => js(`(()=>{ ${code}; localStorage.setItem('gdot-levels-v2', JSON.stringify({levels:mine.levels,zones:mine.zones,dirty:true,base:'old',baseCopy:base})); })(); 1`);
      // levels.js reordered two tanks (their starts swapped with them); this copy only renamed another tank
      await setCopy(`const base=clone(BUILTIN); const z=base.levels.filter(l=>l.zone===BUILTIN.levels[0].zone); const i=base.levels.indexOf(z[0]), j=base.levels.indexOf(z[1]); [base.levels[i],base.levels[j]]=[base.levels[j],base.levels[i]]; [base.levels[i].start,base.levels[j].start]=[base.levels[j].start,base.levels[i].start]; const mine=clone(base); mine.levels[base.levels.length-1].name='Renamed'`);
      await load(PAGE);
      eq(await js('STORE.levels.slice(0,2).map(l=>l.id)'), levels.slice(0, 2).map(l => l.id), 'a reorder in levels.js reaches a copy that never reordered');
      eq(await js('STORE.clash'), [], 'with every tank on its key and nothing to report');
      // a tank made here shares an id with a new levels.js tank: both are kept
      await setCopy(`const base=clone(BUILTIN); base.levels.splice(1,1); const mine=clone(base); const t=clone(BUILTIN.levels[1]); t.name='Made here'; t.goal=1; mine.levels.push(t)`);
      await load(PAGE);
      eq(await js(`[STORE.levels.some(l=>l.id===${J(levels[1].id)}&&l.name===${J(levels[1].name)}), STORE.levels.some(l=>l.name==='Made here'&&l.id!==${J(levels[1].id)})]`), [true, true], 'a tank made here that shares an id with a new levels.js tank: both are kept');
      // zones merge one by one; the same change on both sides is not a clash
      await setCopy(`const base=clone(BUILTIN); base.zones[0].name='Old name'; base.levels[0].goal=1; const mine=clone(base); mine.zones[1].name='Mine'; mine.levels[0].goal=BUILTIN.levels[0].goal`);
      await load(PAGE);
      eq(await js('[STORE.zones[0].name, STORE.zones[1].name, STORE.clash]'), [zones[0].name, 'Mine', []], 'zones merge one by one, and an identical change on both sides is no clash');
      await js("localStorage.removeItem('gdot-levels-v2'); 1"); }
    // ---- a storage event from another tab never merges or writes
    { await load(PAGE);
      const stored = await js(`(()=>{ const v={levels:clone(BUILTIN.levels),zones:clone(BUILTIN.zones),dirty:true,base:'from-another-levels-js',baseCopy:{levels:[],zones:[]}}; v.levels[0].name='Other tab'; const raw=JSON.stringify(v); localStorage.setItem('gdot-levels-v2', raw); window.dispatchEvent(new StorageEvent('storage',{key:'gdot-levels-v2',newValue:raw})); return raw; })()`);
      eq(await js("localStorage.getItem('gdot-levels-v2')"), stored, 'the other tab\'s copy is adopted without a merge or a write');
      eq(await js('STORE.levels[0].name'), 'Other tab', 'and shown');
      await js("localStorage.removeItem('gdot-levels-v2'); 1"); }
    // ---- preview details: placing ends on a tank switch; play's wake and cave rules; the ghost is a layer
    { await load(PAGE); await js(`document.getElementById('editor').click(); 1`);
      const withC = levels.find((l, i) => i > 0 && l.creatures.length);
      await js(`CUR=levelIndex(${JSON.stringify(withC.id)}); buildRuntime(); refreshEditor(); E.sel=0; document.getElementById('c-place').click(); 1`);
      eq(await js('E.placing'), true, 'placing');
      await js(`CUR=levelIndex(${JSON.stringify(levels[0].id)}); buildRuntime(); refreshEditor(); 1`);
      eq(await js('[E.placing, E.drawing, pvActive()]'), [false, false, true], 'switching tanks ends Place and the preview runs again');
      const t = { id: 'pv-rules', name: 'Pv rules', zone: real[0].id, goal: 8, start: ['KeyG'], required: ['KeyG'], terrain: { KeyK: 'cave' },
        creatures: [{ type: 'eel', at: 'KeyH', mover: 'chase', speed: 1, size: 'big', cave: true, wake: true }, { type: 'eel', at: 'KeyK', mover: 'chase', speed: 1, size: 'big', cave: true, wake: false }] };
      await js(`STORE.levels.push(${JSON.stringify(t)}); CUR=STORE.levels.length-1; buildRuntime(); refreshEditor(); 1`);
      eq(await js('PV.creatures.map(c=>[c.awake,c.seen])'), [[true, true], [true, false]], 'a sleeper next to the start wakes, a cave dweller stays unseen');
      await js('pvStep(); 1'); eq(await js('PV.creatures[1].pos'), 'KeyK', 'so the hidden one does not swim out');
      ok(await js(`!!document.querySelector('.k[data-code=KeyG].req .ghost.pvg') || !!document.querySelector('.k[data-code=KeyG] .starfish')`), 'the ghost is drawn over the start key without hiding its starfish');
      await js(`STORE.levels.pop(); CUR=0; buildRuntime(); document.getElementById('editor').click(); 1`); }
    await S('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await load(PAGE); await js(`document.getElementById('editor').click(); 1`);
    eq(await js('pvPaused'), true, 'with reduced motion the preview starts paused');
    await js(`document.getElementById('editor').click(); 1`);
    await S('Emulation.setEmulatedMedia', { features: [] });
    // ---- a legacy browser copy (before zones) moves to levels.js on load, kept as a backup
    await js(`localStorage.setItem('gdot-levels-v2', JSON.stringify({levels:[{id:'old',name:'Old',goal:1,start:['KeyG'],terrain:{},creatures:[]}],cur:0,dirty:true})); 1`);
    await load(PAGE);
    eq(await js('[STORE.dirty, STORE.levels.length]'), [false, levels.length], 'a pre-zone copy is replaced by levels.js');
    ok(await js(`backups().some(b=>b.levels.length===1&&b.levels[0].id==='old')`), 'and kept in Backups');
    // ---- the live levels.js: its territory zones clear at par with real presses
    if (LIVE.zones.some(z => z.rules === 'territory')) {
      await js("localStorage.removeItem('gdot-levels-v2'); localStorage.setItem('gdot-progress-v1', JSON.stringify({tutorial:'skipped'})); 1");
      await playPage();
      const tz = LIVE.zones.filter(z => z.rules === 'territory' && !z.tutorial);
      for (const z of tz) for (const l of LIVE.levels.filter(l => l.zone === z.id)) {
        const lvl = GDOT.resolveLevel(l, z); const line = parLine(lvl);
        ok(!!line, `${l.name}: the solver clears it`); if (!line) continue;
        eq(line.length, l.par, `${l.name}: par in levels.js is the solver's (${line.length})`);
        await js(`setCur(levelIndex(${JSON.stringify(l.id)})); buildRuntime(); 1`);
        const inT = new Set(lvl.tank || []); const hold = ['KeyQ', 'KeyP', 'KeyZ', 'KeyT', 'KeyG', 'KeyA'].find(k => !inT.has(k) && !line.some(m => m.place === k || m.pickup === k));
        await down(hold); // an anchor finger that is not in the way, as a player keeps one key down
        for (const m of line) { if (m.pickup) await tap(m.pickup); await tap(m.place); }
        const ph = await js('G.phase'); eq(ph, 'won', `${l.name}: its par line clears it with real presses`); await up(hold);
      }
    }
    eq(errors, [], 'no page exceptions');
  } finally {
    try { cdp && cdp.ws.close(); } catch (e) {}
    proc.kill(); await new Promise(r => setTimeout(r, 300));
    try { fs.rmSync(udd, { recursive: true, force: true }); } catch (e) {}
  }
}

engineTests();
await browserTests();
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
