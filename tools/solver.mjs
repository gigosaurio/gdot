#!/usr/bin/env node
// G. solver and level analyzer. Drives engine.js headlessly in Node; no browser needed.
//
//   node games/gdot/tools/solver.mjs                    every level in levels.js, one row each
//   node games/gdot/tools/solver.mjs --level the-cave   one level (id, or 1-based index)
//   node games/gdot/tools/solver.mjs --file x.json      a JSON level or array of levels
//   node games/gdot/tools/solver.mjs --json             machine-readable report
//   node games/gdot/tools/solver.mjs --show             also print one winning line per level
//   --rollouts N (default 2000)  --budget N (search states, default 150000)  --seed N
//
// What the columns mean (all computed against the current rules in engine.js):
//   open      grip keys you could ever hold (reveal closure from the start keys); slack = open - goal
//   solve     turns of the shortest clear found (pure placements, no pickups); "-" = none found
//   sols      number of distinct winning placement sequences (capped at 100000)
//   lane0     can the level be cleared without ever gripping a key on any creature's lane?
//   minLane   fewest lane keys any clear must grip (0 = the beats never have to be read)
//   rand      win rate of a player pressing random revealed keys
//   caut      win rate of a player who avoids keys where a visible creature is or is about to step
//   omni      the same player seeing through fog and caves; omni - caut = what fog contributes
//   traps     share of the random player's legal placements that would kill at once
//   death     who kills the random player most
//   --json also reports the old reach rule (a new tentacle must touch the body), pickups, dead ends
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const GDOT = require('../engine.js');
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const LEVELS_JS = path.join(HERE, '..', 'levels.js');

/* ================= loading ================= */
export function loadLevels(file = LEVELS_JS) {
  const src = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.json')) { const v = JSON.parse(src); return Array.isArray(v) ? v : [v]; }
  const w = {}; new Function('window', src)(w); return w.GDOT_LEVELS || [];
}
export function loadZones(file = LEVELS_JS) {
  if (file.endsWith('.json')) return [];
  const w = {}; new Function('window', fs.readFileSync(file, 'utf8'))(w); return w.GDOT_ZONES || [];
}
// Levels as played: each with its zone's ecology applied under its own.
export function loadPlayable(file = LEVELS_JS) {
  const zones = loadZones(file);
  return loadLevels(file).map(l => GDOT.resolveLevel(l, zones.find(z => z.id === l.zone)));
}

/* ================= rng (mulberry32) ================= */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ================= actions ================= */
// An action is {place} or {pickup, place}. Pickups are offered only while another tentacle stays
// on the board; opts.pickupLast=true also allows lifting the last one (what the game permits today,
// via a refused key as the physical anchor). opts.wait allows pickup+replace on the same key.
// opts.reach='adjacent' models the old rule: the new key must touch a tentacle.
export function actions(g, opts = {}) {
  const out = [];
  for (const k of GDOT.legalPlacements(g)) out.push({ place: k });
  if (opts.pickups && g.LIFT !== 'none' && g.phase === 'play' && g.fingers.size >= (opts.pickupLast ? 1 : 2)) {
    for (const f of g.fingers) {
      const h = GDOT.cloneGame(g); GDOT.pickup(h, f);
      for (const k of GDOT.legalPlacements(h)) if (k !== f || opts.wait) out.push({ pickup: f, place: k });
    }
  }
  if (opts.reach === 'adjacent') {
    return out.filter(a => {
      const fs = new Set(g.fingers); if (a.pickup) fs.delete(a.pickup);
      if (!fs.size) return true;
      return GDOT.NEI[a.place].some(n => fs.has(n));
    });
  }
  return out;
}
export function apply(g, a) {
  const h = GDOT.cloneGame(g);
  if (a.pickup) GDOT.pickup(h, a.pickup);
  const ev = GDOT.place(h, a.place);
  return { g: h, ev };
}
export const fmtAction = a => (a.pickup ? GDOT.L(a.pickup) + '→' : '') + GDOT.L(a.place);

/* ================= lanes and open water ================= */
// Every key a path or dir creature will pass through, plus the keys still creatures sit on.
// Chasers and fleers are left out: where they go depends on the player.
export function laneKeys(level) {
  const g = GDOT.createGame(level); const s = new Set();
  for (const c of g.creatures) {
    if (c.prey) continue;
    if (c.mover === 'still') s.add(c.pos);
    for (const k of GDOT.lane(g, c)) s.add(k);
  }
  return s;
}
// Reveal closure from the start keys: every grip key a player could ever hold, ignoring creatures.
export function openWater(level) {
  const g = GDOT.createGame(level); const revealed = new Set(), placeable = new Set(); const q = [...g.START];
  for (const s of g.START) revealed.add(s);
  while (q.length) {
    const k = q.pop(); if (placeable.has(k) || !GDOT.grip(g, k)) continue;
    placeable.add(k);
    for (const n of GDOT.NEI[k]) { revealed.add(n); if (GDOT.grip(g, n) && !placeable.has(n)) q.push(n); }
  }
  return { placeable: placeable.size, revealed: revealed.size, keys: placeable };
}

/* ================= search: one clear ================= */
function dangerMap(g) {
  const d = {};
  for (const c of g.creatures) {
    if (!c.alive || c.prey) continue;
    d[c.pos] = (d[c.pos] || 0) + 3;
    for (const n of GDOT.NEI[c.pos]) d[n] = (d[n] || 0) + 1;
    for (const k of GDOT.lane(g, c)) d[k] = (d[k] || 0) + 1;
  }
  return d;
}
function order(g, acts) {
  const d = dangerMap(g);
  return acts.map(a => ({ a, s: (g.REQ.includes(a.place) ? -10 : 0) + (d[a.place] || 0) + (a.pickup ? 5 : 0) }))
    .sort((x, y) => x.s - y.s).map(x => x.a);
}
// Depth-first search with a memo of failed states and a node budget. Omniscient: sees through fog.
// opts: pickups, wait, pickupLast, reach, budget, maxTurns, lanes (Set) + maxLane (how many lane keys may be gripped)
// Iterative deepening, so the first clear found is the shortest. A clear can take more turns than
// the goal when a marked key is occupied or only reachable late; the cap is the level's open water.
export function solve(level, opts = {}) {
  const { pickups = false, wait = false, pickupLast = false, reach = 'any', budget = 150000, lanes = null, maxLane = Infinity } = opts;
  const g0 = GDOT.createGame(level);
  const cap = opts.maxTurns || (openWater(level).placeable + (pickups ? 4 : 0));
  let nodes = 0, exhausted = false;
  for (let limit = g0.GOAL; limit <= cap; limit++) {
    const failed = new Set();
    const dfs = (g, laneUsed, path) => {
      if (g.phase === 'won') return path;
      if (g.phase === 'dead' || g.turn >= limit) return null;
      if (++nodes > budget) { exhausted = true; return null; }
      const key = GDOT.stateKey(g) + '@' + g.turn + '#' + laneUsed;
      if (failed.has(key)) return null;
      for (const a of order(g, actions(g, { pickups, wait, reach, pickupLast }))) {
        const lu = laneUsed + (lanes && lanes.has(a.place) ? 1 : 0);
        if (lu > maxLane) continue;
        const { g: h, ev } = apply(g, a);
        if (ev.type === 'refused' || ev.type === 'noop' || ev.type === 'dead') continue;
        const r = dfs(h, lu, path.concat([a]));
        if (r) return r;
        if (exhausted) return null;
      }
      failed.add(key); return null;
    };
    const moves = dfs(g0, 0, []);
    if (moves) return { solved: true, moves, turns: moves.length, nodes, exhausted };
    if (exhausted) break;
  }
  return { solved: false, moves: null, turns: null, nodes, exhausted };
}

/* ================= search: count every clear ================= */
// Pure placements only (no pickups). Memoized on the full state, so each state is expanded once;
// also tallies what the player's legal options look like across every state reached.
export function countSolutions(level, opts = {}) {
  const { budget = 150000, cap = 100000, reach = 'any' } = opts;
  const g0 = GDOT.createGame(level);
  const memo = new Map(); let states = 0, exhausted = false;
  const t = { children: 0, fatal: 0, deadEnd: 0, winning: 0 };
  function wins(g) {
    if (g.phase === 'won') return 1;
    if (g.phase === 'dead') return 0;
    const key = GDOT.stateKey(g);
    if (memo.has(key)) return memo.get(key);
    if (++states > budget) { exhausted = true; return 0; }
    let total = 0;
    for (const a of actions(g, { reach })) {
      const { g: h, ev } = apply(g, a);
      if (ev.type === 'refused' || ev.type === 'noop') continue;
      t.children++;
      if (ev.type === 'dead') { t.fatal++; continue; }
      const w = wins(h);
      if (w > 0) { t.winning++; total = Math.min(cap, total + w); } else t.deadEnd++;
    }
    memo.set(key, total); return total;
  }
  const n = wins(g0);
  const rate = x => (t.children ? x / t.children : 0);
  return { solutions: n, capped: n >= cap, exhausted, states, fatalRate: rate(t.fatal), deadEndRate: rate(t.deadEnd), winningRate: rate(t.winning) };
}

/* ================= monte carlo players ================= */
// What a player reading the board can see: visible creatures now, and where each steps next.
export function visibleDanger(g, omniscient = false) {
  const avoid = new Set(); const h = GDOT.cloneGame(g);
  for (const c of h.creatures) {
    if (!c.alive || c.prey) continue;
    if (!omniscient && !GDOT.isVisible(g, c)) continue;
    avoid.add(c.pos);
    if (c.seen && c.awake) { GDOT.stepCreature(h, c); avoid.add(c.pos); }
  }
  return avoid;
}
export function rollout(level, policy, opts, rand) {
  const g = GDOT.createGame(level); const maxTurns = opts.maxTurns || g.GOAL + 6;
  let traps = 0, legal = 0;
  for (;;) {
    if (g.turn >= maxTurns) return { result: 'stuck', turn: g.turn, traps, legal };
    const acts = actions(g, { reach: opts.reach });
    if (!acts.length) return { result: 'stuck', turn: g.turn, traps, legal };
    if (opts.traps) for (const a of acts) { legal++; if (apply(g, a).ev.type === 'dead') traps++; }
    let pick = acts;
    if (policy === 'cautious' || policy === 'omniscient') { const avoid = visibleDanger(g, policy === 'omniscient'); const safe = acts.filter(a => !avoid.has(a.place)); if (safe.length) pick = safe; }
    const a = pick[Math.floor(rand() * pick.length)];
    const ev = GDOT.place(g, a.place);
    if (ev.type === 'dead') return { result: 'dead', by: ev.by ? ev.by.type : ev.cause, key: ev.key, turn: g.turn, traps, legal };
    if (ev.type === 'won') return { result: 'won', turn: g.turn, traps, legal };
  }
}
export function montecarlo(level, policy, opts = {}) {
  const n = opts.rollouts || 2000, rand = rng(opts.seed || 1);
  let won = 0, stuck = 0, turns = 0, traps = 0, legal = 0; const deaths = {};
  for (let i = 0; i < n; i++) {
    const r = rollout(level, policy, { reach: opts.reach, traps: i < 200 }, rand);
    if (r.result === 'won') { won++; turns += r.turn; }
    else if (r.result === 'stuck') stuck++;
    else deaths[r.by] = (deaths[r.by] || 0) + 1;
    traps += r.traps; legal += r.legal;
  }
  const top = Object.entries(deaths).sort((a, b) => b[1] - a[1])[0];
  return { winRate: won / n, stuckRate: stuck / n, avgTurns: won ? turns / won : null, deaths, topDeath: top ? `${top[0]} ${Math.round(100 * top[1] / n)}%` : '-', trapRate: legal ? traps / legal : 0 };
}

/* ================= territory players ================= */
// Territory tanks (fill every key, par = fewest presses). Two players, both without planning:
//   greedy — reads the arrows: never presses a key a creature is about to take, lifts a tentacle a
//            creature is about to take (and puts it back when it is safe), else fills any safe key;
//            when nothing is safe it waits (lift and put back a safe tentacle).
//   random — any legal press.
// The gap between greedy and par is what planning buys: the bigger, the more the tank is a puzzle.
export function terrRollout(level, policy, rand, cap) {
  const g = GDOT.createGame(level);
  for (;;) {
    if (g.turn >= cap) return { result: 'stuck', turn: g.turn };
    let act = null;
    if (g.phase === 'ready' || g.turn === 0) act = { place: g.START[Math.floor(rand() * g.START.length)] };
    else if (policy === 'random') {
      const ks = GDOT.legalPlacements(g); if (!ks.length) return { result: 'stuck', turn: g.turn };
      act = { place: ks[Math.floor(rand() * ks.length)] };
    } else {
      const aimed = new Set(GDOT.intents(g).map(t => t.to));
      const threat = [...g.fingers].filter(k => aimed.has(k));
      const h = GDOT.cloneGame(g); let pick = null;
      if (threat.length && g.fingers.size > 1 && g.LIFT !== 'none') act = { lift: threat[0] }; // a lift is a press: it saves the tentacle, nothing else
      else { const safe = GDOT.legalPlacements(g).filter(k => !aimed.has(k));
        if (safe.length) act = { place: safe[Math.floor(rand() * safe.length)] };
        else { const still = [...g.fingers].filter(k => !aimed.has(k)); if (still.length > 1 && g.LIFT !== 'none') act = { lift: still[Math.floor(rand() * still.length)] };
          else { const ks = GDOT.legalPlacements(g); if (!ks.length) return { result: 'stuck', turn: g.turn }; act = { place: ks[Math.floor(rand() * ks.length)] }; } } }
    }
    if (act.pickup && !GDOT.pickup(g, act.pickup)) return { result: 'stuck', turn: g.turn };
    const ev = act.lift ? GDOT.liftTurn(g, act.lift) : GDOT.place(g, act.place);
    if (ev.type === 'refused') return { result: 'stuck', turn: g.turn };
    if (ev.type === 'dead') return { result: 'dead', turn: g.turn };
    if (ev.type === 'won') return { result: 'won', turn: g.turn };
  }
}
export function terrPlayers(level, policy, opts = {}) {
  const n = opts.rollouts || 1000, rand = rng(opts.seed || 1), cap = opts.cap || 40;
  let won = 0, dead = 0, turns = 0, best = null;
  for (let i = 0; i < n; i++) { const r = terrRollout(level, policy, rand, cap); if (r.result === 'won') { won++; turns += r.turn; if (best == null || r.turn < best) best = r.turn; } else if (r.result === 'dead') dead++; }
  return { winRate: won / n, deadRate: dead / n, avgTurns: won ? turns / won : null, best };
}
export function analyzeTerritory(level, opts = {}) {
  const t0 = Date.now(); const g = GDOT.createGame(level);
  const s = GDOT.solvePar(level, { budget: opts.budget || 400000 });
  const cap = Math.max(20, (s.par || g.GOAL) * 4);
  const greedy = terrPlayers(level, 'greedy', { rollouts: opts.rollouts || 1000, seed: opts.seed, cap });
  const random = terrPlayers(level, 'random', { rollouts: opts.rollouts || 1000, seed: opts.seed, cap });
  const fmt = a => a.ink ? 'INK' : a.lift ? 'lift ' + GDOT.L(a.lift) : (a.pickup ? GDOT.L(a.pickup) + '>' : '') + GDOT.L(a.place);
  return { id: level.id, name: level.name, territory: true, ...describe(level), keys: g.GOAL, par: s.par, solvable: s.solved, exhausted: s.exhausted, nodes: s.nodes,
    solution: s.moves ? s.moves.map(fmt) : null, waits: s.moves ? s.moves.filter(a => a.pickup || a.lift).length : null, greedy, random, ms: Date.now() - t0 };
}
export const HEADER_T = ['level'.padEnd(15), 'keys', ' par', 'lifts', ' greedy', 'g-avg', 'g-best', ' g-lost', ' random', ' nodes'].join(' ');
export function rowT(a) {
  const n = x => (x == null ? '-' : (Math.round(x * 10) / 10).toString());
  return [(a.name || a.id).padEnd(15), String(a.keys).padStart(4), (a.solvable ? String(a.par) : '-').padStart(4), String(a.waits == null ? '-' : a.waits).padStart(5),
    pct(a.greedy.winRate).padStart(7), n(a.greedy.avgTurns).padStart(5), n(a.greedy.best).padStart(6), pct(a.greedy.deadRate).padStart(7), pct(a.random.winRate).padStart(7),
    (String(a.nodes) + (a.exhausted ? '+' : '')).padStart(7)].join(' ');
}

/* ================= the whole report ================= */
export function describe(level) {
  const g = GDOT.createGame(level);
  const cs = g.creatures.map(c => `${c.type}(${c.mover}${c.mover === 'dir' ? ' ' + c.dir : ''}${c.speed !== 1 ? ' x' + c.speed : ''}${c.wake ? ' asleep' : ''})`);
  const ter = {}; for (const t of Object.values(g.TER)) ter[t] = (ter[t] || 0) + 1;
  return { creatures: cs, terrain: ter, start: g.START.map(GDOT.L), required: g.REQ.map(GDOT.L), goal: g.GOAL };
}
export function analyze(level, opts = {}) {
  const budget = opts.budget || 150000, rollouts = opts.rollouts || 2000, seed = opts.seed || 1;
  const t0 = Date.now();
  const lanes = laneKeys(level);
  const open = openWater(level);
  const best = solve(level, { budget });
  const count = opts.count === false ? { solutions: null, capped: false, exhausted: false, states: 0, fatalRate: null, deadEndRate: null } : countSolutions(level, { budget });
  const lane0 = solve(level, { budget, lanes, maxLane: 0 });
  let minLane = lane0.solved ? 0 : null;
  if (!lane0.solved && best.solved) { for (let k = 1; k <= best.turns; k++) { const r = solve(level, { budget, lanes, maxLane: k }); if (r.solved) { minLane = k; break; } } }
  const rand = montecarlo(level, 'random', { rollouts, seed });
  const caut = montecarlo(level, 'cautious', { rollouts, seed });
  const omni = montecarlo(level, 'omniscient', { rollouts, seed });
  const randAdj = montecarlo(level, 'random', { rollouts, seed, reach: 'adjacent' });
  const cautAdj = montecarlo(level, 'cautious', { rollouts, seed, reach: 'adjacent' });
  const adj = solve(level, { budget, reach: 'adjacent' });
  const lifted = solve(level, { budget, pickups: true, wait: true });
  return {
    id: level.id, name: level.name, ...describe(level),
    open: open.placeable, slack: open.placeable - (level.goal || 8),
    solvable: best.solved, minTurns: best.turns, exhausted: best.exhausted || count.exhausted,
    solution: best.moves ? best.moves.map(fmtAction) : null,
    solutions: count.solutions, solutionsCapped: count.capped, states: count.states,
    fatalRate: count.fatalRate, deadEndRate: count.deadEndRate,
    laneKeys: lanes.size, laneFree: lane0.solved, laneFreeLine: lane0.moves ? lane0.moves.map(fmtAction) : null, minLane,
    solvableAdjacent: adj.solved, solvableWithPickups: lifted.solved, pickupTurns: lifted.turns,
    random: rand, cautious: caut, omniscient: omni, fogWork: omni.winRate - caut.winRate,
    randomAdjacent: randAdj, cautiousAdjacent: cautAdj,
    ms: Date.now() - t0,
  };
}

/* ================= cli ================= */
const pct = x => (x == null ? '   -' : String(Math.round(x * 100)).padStart(4)) + '%';
export function row(a) {
  return [
    (a.name || a.id).padEnd(15), String(a.goal).padStart(4), String(a.open).padStart(5),
    (a.solvable ? String(a.minTurns) : '-').padStart(6),
    (a.solutions == null ? '-' : (a.solutionsCapped ? '≥' : '') + a.solutions).padStart(8),
    (a.laneFree ? 'yes' : 'no').padStart(6), String(a.minLane == null ? '-' : a.minLane).padStart(8),
    pct(a.random.winRate), pct(a.cautious.winRate), pct(a.omniscient.winRate), pct(a.random.trapRate),
    ' ' + a.random.topDeath + (a.exhausted ? ' (budget)' : ''),
  ].join(' ');
}
export const HEADER = ['level'.padEnd(15), 'goal', ' open', ' solve', '    sols', ' lane0', ' minLane', ' rand', ' caut', ' omni', 'traps', ' death'].join(' ');

function cli() {
  const args = process.argv.slice(2); const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const file = opt('--file', LEVELS_JS); let levels = loadPlayable(file);
  const which = opt('--level', null);
  if (which) levels = levels.filter((l, i) => l.id === which || String(i + 1) === which);
  if (!levels.length) { console.error('no such level'); process.exit(1); }
  const opts = { rollouts: +opt('--rollouts', 2000), budget: +opt('--budget', 150000), seed: +opt('--seed', 1) };
  const out = levels.map(l => l.rules === 'territory' ? analyzeTerritory(l, { ...opts, rollouts: Math.min(opts.rollouts, 1000), budget: Math.max(opts.budget, 400000) }) : analyze(l, opts));
  if (args.includes('--json')) { console.log(JSON.stringify(out, null, 1)); return; }
  let last = null;
  for (const a of out) {
    const hd = a.territory ? HEADER_T : HEADER; if (hd !== last) { console.log(hd); last = hd; }
    if (a.territory) { console.log(rowT(a)); if (args.includes('--show')) console.log(`   ${a.creatures.join(', ') || 'no creatures'} · start ${a.start.join('/')}${a.required.length ? ' · starfish ' + a.required.join(' ') : ''}\n   par line: ${a.solution ? a.solution.join(' ') : '-'} · ${a.ms} ms`); continue; }
    console.log(row(a));
    if (args.includes('--show')) {
      console.log(`   ${a.creatures.join(', ') || 'no creatures'} · terrain ${JSON.stringify(a.terrain)} · start ${a.start.join('/')}${a.required.length ? ' · required ' + a.required.join(' ') : ''}`);
      if (a.solution) console.log(`   clear: ${a.solution.join(' ')}`);
      if (a.laneFreeLine) console.log(`   lane-free clear: ${a.laneFreeLine.join(' ')}`);
      console.log(`   random deaths ${JSON.stringify(a.random.deaths)} · cautious deaths ${JSON.stringify(a.cautious.deaths)} · ${a.ms} ms`);
    }
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli();
