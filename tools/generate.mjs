#!/usr/bin/env node
// G. level generator. Builds random levels from a recipe (what creatures, what terrain, how many
// marked keys) and keeps only the ones the analyzer in solver.mjs accepts (solvable, not clearable
// by ignoring every creature, a win rate in the wanted band). Output is the levels.js shape.
//
//   node games/gdot/tools/generate.mjs --list                          the built-in recipes
//   node games/gdot/tools/generate.mjs --recipe first-tank --count 3   three candidates
//   node games/gdot/tools/generate.mjs --recipe minefield --seed 9 --out mine.json
//   node games/gdot/tools/generate.mjs --spec '{"name":"X","creatures":[{"type":"shark","mover":"path"}]}'
//   --tries N (default 200)  --rollouts N (600)  --budget N (60000)  --goal N
//
// Recipe fields (every range is [min,max] inclusive, a single number is fixed):
//   region     'letters' | 'main' (digit row to the bottom letter row) | 'all' | [codes]
//   start      {count:[1,2], keys?:[codes]}
//   tank       [12,16]: grow that many connected keys from the start, fence the rest with algae
//              (open water − goal is the level's slack; the shipped levels have 57+, these get 2–8)
//   terrain    {algae:[4,8]} or {algae:{count:[4,8], walls:1, len:[3,5]}}   walls = straight runs
//   creatures  [{type, mover?, dir?, speed?, size?, near:[2,4] (keys from the start), len:[3,5] (path), loop?}]
//   required   {count:[0,2], minDist:3, onLane:true} or {keys:[codes]} for fixed marks
//   accept     {laneFree:false, minLane:[1,3], cautious:[0.2,0.6], random:[0,1], fogWork:0.1, slack:[1,6],
//               needsPickup:true (only clearable by lifting a tentacle), solutionsMax:N}
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { analyze, solve, rng, openWater, laneKeys, row, HEADER } from './solver.mjs';

const require = createRequire(import.meta.url);
const GDOT = require('../engine.js');

export const REGION = {
  letters: GDOT.KEYS.filter(k => k.row >= 2 && k.row <= 4 && k.w === 1).map(k => k.code),
  main: GDOT.KEYS.filter(k => k.row >= 1 && k.row <= 4 && k.w === 1).map(k => k.code),
  all: GDOT.KEYS.filter(k => !/^Meta/.test(k.code)).map(k => k.code),
};

// Every recipe fences a small tank (tank = how many keys it grows from the start); with the whole
// board open there is always a lane-free walk to the F-row, which is what the shipped levels suffer from.
export const RECIPES = {
  'first-tank': { name: 'First tank', goal: 8, region: 'letters', start: { count: 2 }, tank: [12, 14],
    creatures: [{ type: 'shark', mover: 'path', len: [4, 5], loop: 'pingpong', near: [1, 3] }],
    terrain: { algae: [1, 2] },
    accept: { laneFree: false, minLane: [1, 3], cautious: [0.25, 0.7], slack: [2, 6] } },
  'crab-walk': { name: 'Crab walk', goal: 8, region: 'letters', start: { count: 1 }, tank: [13, 16],
    creatures: [{ type: 'crab', near: [2, 4] }, { type: 'crab', near: [2, 4] }, { type: 'fish', near: [1, 3] }],
    terrain: { reef: [2, 3] },
    accept: { laneFree: false, cautious: [0.15, 0.6] } },
  'the-cave': { name: 'The cave', goal: 8, region: 'main', start: { count: 2 }, tank: [13, 16],
    creatures: [{ type: 'shark', mover: 'path', len: [4, 5], near: [1, 3] }, { type: 'eel', near: [2, 4] }, { type: 'urchin', near: [1, 2] }],
    terrain: { cave: [1, 2], rock: [2, 3], reef: [1, 2] },
    accept: { laneFree: false, cautious: [0.1, 0.55] } },
  'barracuda-lane': { name: 'Barracuda lane', goal: 8, region: 'main', start: { count: 2 }, tank: [15, 19],
    creatures: [{ type: 'barracuda', near: [3, 5] }, { type: 'crab', near: [3, 5] }],
    terrain: { rock: [2, 3] }, required: { count: 1, minDist: 3, onLane: true },
    accept: { laneFree: false, minLane: [1, 4], cautious: [0.05, 0.4] } },
  'gauntlet': { name: 'Gauntlet', goal: 8, region: 'main', start: { count: 1 }, tank: [15, 19],
    creatures: [{ type: 'barracuda', near: [2, 4] }, { type: 'barracuda', near: [2, 4] }, { type: 'shark', mover: 'path', len: [3, 4], near: [2, 4] }],
    terrain: { rock: { count: [3, 5], walls: 1, len: [2, 3] } }, required: { count: 1, minDist: 3 },
    accept: { laneFree: false, cautious: [0.03, 0.35] } },
  'minefield': { name: 'Minefield', goal: 8, region: 'letters', start: { count: 1 }, tank: [12, 15],
    // a visible urchin never threatens a careful player; one inside a cave does (it kills what grips its cave)
    creatures: [{ type: 'urchin', cave: true, near: [1, 3] }, { type: 'urchin', cave: true, near: [1, 3] }, { type: 'urchin', cave: true, near: [2, 4] }, { type: 'fish', near: [2, 3] }],
    terrain: { cave: [2, 3] },
    accept: { cautious: [0.1, 0.5], fogWork: 0.1 } },
  'eel-nest': { name: 'Eel nest', goal: 8, region: 'main', start: { count: 1 }, tank: [13, 16],
    creatures: [{ type: 'eel', near: [2, 3] }, { type: 'eel', near: [3, 5] }, { type: 'crab', near: [2, 4] }],
    terrain: { cave: [2, 3] },
    accept: { laneFree: false, cautious: [0.05, 0.5], fogWork: 0.1 } },
  'fog-beat': { name: 'Fog beat', goal: 8, region: 'main', start: { count: 1 }, tank: [14, 18],
    creatures: [{ type: 'shark', mover: 'path', len: [6, 8], loop: 'loop', near: [1, 2] }, { type: 'crab', near: [3, 5] }],
    terrain: { algae: [1, 3] },
    accept: { laneFree: false, cautious: [0.05, 0.5], fogWork: 0.15 } },
};

/* ================= random helpers ================= */
const range = (rand, r) => Array.isArray(r) ? r[0] + Math.floor(rand() * (r[1] - r[0] + 1)) : (r == null ? 0 : r);
const pick = (rand, arr) => arr.length ? arr[Math.floor(rand() * arr.length)] : null;
function sample(rand, arr, n) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); }

/* ================= building one candidate ================= */
function shortestWalk(from, to, region) { // BFS over the region's adjacency; returns the keys of the walk, or null
  const prev = new Map(); const q = [...from]; for (const s of from) prev.set(s, null);
  while (q.length) {
    const k = q.shift(); if (k === to) { const walk = []; for (let c = k; c; c = prev.get(c)) walk.push(c); return walk; }
    for (const n of GDOT.NEI[k]) if (!prev.has(n) && (region.includes(n) || n === to)) { prev.set(n, k); q.push(n); }
  }
  return null;
}
function wall(rand, region, len, type, level, keep) {
  const free = region.filter(k => !level.terrain[k] && !keep.has(k));
  let k = pick(rand, free); if (!k) return 0;
  const dir = pick(rand, GDOT.HEADINGS); let n = 0;
  while (k && n < len && region.includes(k) && !keep.has(k) && !level.terrain[k]) { level.terrain[k] = type; n++; k = GDOT.DIRS[k][dir]; }
  return n;
}
function makeCreature(spec, rand, level, region) {
  const p = GDOT.PRESETS[spec.type] || {};
  const c = { type: spec.type, mover: spec.mover || p.mover || 'dir', dir: spec.dir || p.dir || 'E', speed: spec.speed ?? p.speed ?? 1, size: spec.size || p.size || 'big',
    prey: spec.prey ?? !!p.prey, cave: spec.cave ?? !!p.cave, wake: spec.wake ?? !!p.wake };
  const g = GDOT.createGame(level); const dist = GDOT.distMap(g, level.start, 12);
  const near = spec.near || [2, 4];
  const taken = new Set(level.creatures.flatMap(o => [o.at, ...(o.path || [])]));
  const pool = region.filter(k => dist[k] != null && dist[k] >= near[0] && dist[k] <= near[1] && GDOT.passable(g, k) && !level.start.includes(k) && !taken.has(k));
  if (c.cave) { // a cave dweller needs a cave: reuse one in range, or dig one
    let caves = pool.filter(k => level.terrain[k] === 'cave');
    if (!caves.length) { const k = pick(rand, pool.filter(k => !level.terrain[k])); if (!k) return null; level.terrain[k] = 'cave'; caves = [k]; }
    c.at = pick(rand, caves); return c;
  }
  if (c.mover === 'path') {
    const len = range(rand, spec.len || [3, 5]);
    const head = pick(rand, pool.filter(k => level.terrain[k] !== 'cave')); if (!head) return null;
    const path = [head]; let cur = head;
    for (let i = 1; i < len; i++) { const nx = GDOT.NEI[cur].filter(n => !path.includes(n) && GDOT.passable(g, n) && region.includes(n) && !taken.has(n)); if (!nx.length) break; cur = pick(rand, nx); path.push(cur); }
    if (path.length < 2) return null;
    c.path = path; c.loop = spec.loop || (rand() < 0.6 ? 'pingpong' : 'loop'); c.pathIndex = Math.floor(rand() * path.length); return c;
  }
  const at = pick(rand, pool.filter(k => !level.terrain[k] || level.terrain[k] === 'reef')); if (!at) return null;
  c.at = at; if (c.mover === 'dir' && !spec.dir) c.dir = pick(rand, GDOT.HEADINGS);
  return c;
}
export function build(recipe, rand) {
  let region = Array.isArray(recipe.region) ? recipe.region : REGION[recipe.region || 'main'];
  const level = { id: '', name: recipe.name || 'Generated', goal: recipe.goal || 8, start: [], required: [], terrain: {}, creatures: [] };
  const st = recipe.start || {};
  level.start = sample(rand, st.keys || region, range(rand, st.count || [1, 2]));
  if (recipe.tank) { // grow a connected pool of keys from the start and fence everything else with algae
    const size = range(rand, recipe.tank);
    const tank = new Set(level.start);
    for (const m of (recipe.required && recipe.required.keys) || []) { // fixed marks must be inside: add a walk to each
      const walk = shortestWalk(level.start, m, region); if (!walk) return null; for (const k of walk) tank.add(k);
    }
    const frontier = new Set([...tank].flatMap(s => GDOT.NEI[s]).filter(k => region.includes(k) && !tank.has(k)));
    while (tank.size < size && frontier.size) { const k = pick(rand, [...frontier]); frontier.delete(k); tank.add(k); for (const n of GDOT.NEI[k]) if (region.includes(n) && !tank.has(n)) frontier.add(n); }
    const ring1 = new Set(); for (const k of tank) for (const n of GDOT.NEI[k]) if (!tank.has(n)) ring1.add(n);
    const ring2 = new Set(); // eating reveals two rings, so prey needs a second fence
    if ((recipe.creatures || []).some(c => c.prey ?? (GDOT.PRESETS[c.type] || {}).prey)) for (const k of ring1) for (const n of GDOT.NEI[k]) if (!tank.has(n) && !ring1.has(n)) ring2.add(n);
    for (const k of [...ring1, ...ring2]) level.terrain[k] = 'algae';
    region = [...tank];
  }
  const keep = new Set(level.start); for (const s of level.start) for (const n of GDOT.NEI[s]) keep.add(n); // the start stays breathable
  for (const [type, spec] of Object.entries(recipe.terrain || {})) {
    const s = Array.isArray(spec) || typeof spec === 'number' ? { count: spec } : spec;
    const want = range(rand, s.count); let placed = 0;
    for (let w = 0; w < (s.walls || 0); w++) placed += wall(rand, region, range(rand, s.len || [3, 5]), type, level, keep);
    while (placed < want) { const k = pick(rand, region.filter(k => !level.terrain[k] && !keep.has(k))); if (!k) break; level.terrain[k] = type; placed++; }
  }
  for (const spec of recipe.creatures || []) { const c = makeCreature(spec, rand, level, region); if (!c) return null; level.creatures.push(c); }
  const rq = recipe.required; const n = rq ? (rq.keys ? rq.keys.length : range(rand, rq.count)) : 0;
  if (n) {
    const g = GDOT.createGame(level); const dist = GDOT.distMap(g, level.start, 20); const lanes = laneKeys(level);
    let pool = [...openWater(level).keys].filter(k => !level.start.includes(k) && (dist[k] || 0) >= (rq.minDist || 3));
    if (rq.keys) { if (!rq.keys.every(k => pool.includes(k))) return null; pool = rq.keys.slice(); } // fixed marks must all be reachable water
    else if (rq.onLane) { const onl = pool.filter(k => lanes.has(k)); if (onl.length) pool = onl; }
    level.required = sample(rand, pool, n); if (level.required.length < n) return null;
  }
  if (openWater(level).placeable < level.goal + 2) return null;
  for (const s of level.start) if (openWater({ ...level, start: [s] }).placeable < level.goal + 1) return null; // no dead pools behind a start key
  return level;
}
export function reject(a, acc = {}) {
  if (acc.needsPickup) { if (a.solvable) return 'clears-without-lifting'; if (!a.solvableWithPickups) return 'unsolvable'; }
  else if (!a.solvable) return 'unsolvable';
  if (acc.laneFree === false && a.laneFree) return 'lane-free';
  if (acc.minLane && (a.minLane == null || a.minLane < acc.minLane[0] || a.minLane > acc.minLane[1])) return 'minLane';
  if (acc.cautious && (a.cautious.winRate < acc.cautious[0] || a.cautious.winRate > acc.cautious[1])) return 'cautious';
  if (acc.random && (a.random.winRate < acc.random[0] || a.random.winRate > acc.random[1])) return 'random';
  if (acc.fogWork != null && a.fogWork < acc.fogWork) return 'fogWork';
  if (acc.solutionsMax && a.solutions > acc.solutionsMax) return 'solutions';
  if (acc.slack && (a.slack < acc.slack[0] || a.slack > acc.slack[1])) return 'slack';
  return null;
}
export function generate(recipe, opts = {}) {
  const rand = rng(opts.seed || 1); const count = opts.count || 1, tries = opts.tries || 200;
  const out = [], rejected = {}; let attempts = 0;
  while (out.length < count && attempts < tries) {
    attempts++;
    const level = build(recipe, rand);
    if (!level) { rejected.build = (rejected.build || 0) + 1; continue; }
    const acc = recipe.accept || {};
    const quick = solve(level, { budget: opts.budget || 60000, pickups: !!acc.needsPickup, wait: false }); // cheap gate before the full analysis
    if (!quick.solved) { rejected.unsolvable = (rejected.unsolvable || 0) + 1; if (opts.progress) process.stderr.write('.'); continue; }
    const a = analyze(level, { rollouts: opts.rollouts || 600, budget: opts.budget || 60000, seed: attempts, count: false });
    const why = reject(a, recipe.accept || {});
    if (opts.progress) process.stderr.write(why ? '.' : '#');
    if (why) { rejected[why] = (rejected[why] || 0) + 1; continue; }
    const base = recipe.id || GDOT.slug(recipe.name || 'generated');
    level.id = count > 1 ? `${base}-${out.length + 1}` : base; level.name = count > 1 ? `${recipe.name} ${out.length + 1}` : recipe.name;
    a.id = level.id; a.name = level.name;
    out.push({ level, analysis: a });
  }
  if (opts.progress) process.stderr.write('\n');
  return { levels: out, attempts, rejected };
}

/* ================= cli ================= */
function cli() {
  const args = process.argv.slice(2); const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  if (args.includes('--list')) { for (const [id, r] of Object.entries(RECIPES)) console.log(id.padEnd(16), r.creatures.map(c => c.type).join(', '), '·', Object.keys(r.terrain || {}).join(', '), r.required ? '· marked keys' : ''); return; }
  let recipe = null;
  if (args.includes('--spec')) recipe = JSON.parse(opt('--spec'));
  else recipe = RECIPES[opt('--recipe', 'first-tank')];
  if (!recipe) { console.error('unknown recipe; --list shows them'); process.exit(1); }
  if (args.includes('--goal')) recipe = { ...recipe, goal: +opt('--goal') };
  const res = generate(recipe, { seed: +opt('--seed', 1), count: +opt('--count', 1), tries: +opt('--tries', 200), rollouts: +opt('--rollouts', 600), budget: +opt('--budget', 60000), progress: true });
  console.error(`${res.levels.length} accepted in ${res.attempts} tries · rejected ${JSON.stringify(res.rejected)}`);
  if (res.levels.length) { console.error(HEADER); for (const { analysis } of res.levels) console.error(row(analysis)); }
  const json = JSON.stringify(res.levels.map(x => x.level), null, 1);
  const out = opt('--out', null);
  if (out) { fs.writeFileSync(out, json); console.error('wrote ' + out); } else console.log(json);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli();
