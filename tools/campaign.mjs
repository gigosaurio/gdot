#!/usr/bin/env node
// G. campaign builder. The campaign is authored here as small tanks: a hand-written spec (keys by
// label) for the levels whose moment has to be exact, and a generator recipe with a fixed seed for
// the rest. Every level is fenced (algae on every key next to the tank; two rings when there is prey
// to eat) so the player can only grip a handful of keys, and every level is checked by the solver.
//
//   node games/gdot/tools/campaign.mjs --check              build all, print the analyzer row per level
//   node games/gdot/tools/campaign.mjs --check --only 1-5   a range or list (1,3,7)
//   node games/gdot/tools/campaign.mjs --show 3             draw a level's tank
//   node games/gdot/tools/campaign.mjs --write [--only ..]  write games/gdot/levels.js (merging --only into the file)
//
// levels.js stays the source of truth for the game and the editor; this file is how it was made.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { analyze, row, HEADER, analyzeTerritory, rowT, HEADER_T, LEVELS_JS, loadLevels, loadZones, laneKeys } from './solver.mjs';
import { generate } from './generate.mjs';

const require = createRequire(import.meta.url);
const GDOT = require('../engine.js');

/* ================= keys by label ================= */
const BYLABEL = {}; for (const k of GDOT.KEYS) BYLABEL[k.label] = k.code;
Object.assign(BYLABEL, { Space: 'Space', LShift: 'ShiftLeft', RShift: 'ShiftRight', LCtrl: 'ControlLeft', RCtrl: 'ControlRight', LAlt: 'AltLeft', RAlt: 'AltRight', LWin: 'MetaLeft', RWin: 'MetaRight', Menu: 'ContextMenu', Bksp: 'Backspace', Esc: 'Escape', Caps: 'CapsLock' });
export const codes = s => (Array.isArray(s) ? s : String(s || '').trim().split(/\s+/).filter(Boolean)).map(t => { if (GDOT.KEYMAP[t]) return t; if (BYLABEL[t]) return BYLABEL[t]; throw new Error('unknown key ' + t); });

/* ================= hand spec → level ================= */
// spec: {id, name, goal, start, water, rock, reef, cave, algae, required, creatures:[{type, path|at, loop, pathIndex, dir, speed, ...}]}
export function expand(spec) {
  const level = { id: spec.id, name: spec.name, goal: spec.goal || 8, start: codes(spec.start), required: codes(spec.required), terrain: {}, creatures: [] };
  if (spec.max) level.maxTentacles = spec.max;
  if (spec.lift && spec.lift !== 'any') level.lift = spec.lift;
  if (spec.ecology) level.ecology = spec.ecology;
  if (spec.coach) level.coach = spec.coach; // tutorial lines, see gdot.js (coach)
  if (spec.closed) { // a closed tank: only these keys are the tank (territory tanks; a starfish opens the algae around it)
    const t = new Set(water); for (const k of codes(spec.rock)) t.add(k); level.tank = [...t];
  }
  const water = new Set(codes(spec.water)); for (const s of level.start) water.add(s);
  for (const t of ['reef', 'cave']) for (const k of codes(spec[t])) { level.terrain[k] = t; water.add(k); }
  for (const t of ['rock', 'algae']) for (const k of codes(spec[t])) { level.terrain[k] = t; water.delete(k); }
  for (const c of spec.creatures || []) {
    const p = GDOT.PRESETS[c.type] || {};
    const cr = { type: c.type, mover: c.mover || (c.path ? 'path' : p.mover || 'dir'), dir: c.dir || p.dir || 'E', speed: c.speed ?? p.speed ?? 1, size: c.size || p.size || 'big', prey: c.prey ?? !!p.prey, cave: c.cave ?? !!p.cave, wake: c.wake ?? !!p.wake };
    for (const k of ['eats', 'chases', 'flees', 'range']) if (c[k] != null) cr[k] = c[k];
    if (c.path) {
      cr.path = codes(c.path); cr.loop = c.loop || 'pingpong'; cr.pathIndex = c.pathIndex || 0; cr.at = cr.path[0];
      for (let i = 1; i < cr.path.length; i++) if (!GDOT.NEI[cr.path[i - 1]].includes(cr.path[i])) console.warn(`${spec.id}: path "${c.path}" jumps at ${GDOT.L(cr.path[i])}`);
    } else { cr.at = codes(c.at)[0]; cr.path = []; cr.loop = 'pingpong'; cr.pathIndex = 0; }
    level.creatures.push(cr);
  }
  const rings = level.creatures.some(c => c.prey) ? 2 : (spec.rings || 1);
  let frontier = new Set(water); const fenced = new Set();
  for (let r = 0; r < rings; r++) {
    const next = new Set();
    for (const k of frontier) for (const n of GDOT.NEI[k]) if (!water.has(n) && !level.terrain[n] && !fenced.has(n)) { level.terrain[n] = 'algae'; fenced.add(n); next.add(n); }
    frontier = next;
  }
  return level;
}

/* ================= the campaign ================= */
// n, name, then either spec (hand) or recipe + seed (generated). "teaches" and "moment" are the design notes.
const S = (sp) => ({ spec: sp });
const R = (recipe, seed, tries = 80) => ({ recipe, seed, tries });
const home = { keys: codes('F G H J') };
export const CAMPAIGN = [
  // ---- 1. Tank basics: press, reveal, the beat
  { n: 1, name: 'First tank', teaches: 'press, reveal, the beat', moment: 'the 4th key is on the beat: watch it go T Y H, then take a key it is not coming back to', ...S({ goal: 4, start: 'G', water: 'F H T Y V',
      creatures: [{ type: 'shark', path: 'T Y H', loop: 'pingpong', pathIndex: 0 }] }) },
  { n: 2, name: 'Tail', teaches: 'the safest key is the one it just left', moment: 'it circles you; you have to grip its lane three times', ...S({ goal: 4, start: 'G', water: 'T Y H B V F',
      creatures: [{ type: 'shark', path: 'T Y H B V F', loop: 'loop', pathIndex: 0 }] }) },
  { n: 3, name: 'Rest turn', teaches: 'half-speed creatures rest every other turn', moment: 'it does not move on the turn you counted on', ...S({ goal: 5, start: 'G', water: 'H J V B N M', rock: 'C ,',
      creatures: [{ type: 'crab', at: 'V', dir: 'E' }] }) },
  { n: 4, name: 'Two beats', teaches: 'two beats at once', moment: 'both sharks are in view from the first press; the 6th key must dodge both', ...S({ goal: 6, start: 'G', water: 'R T Y U F H J K V B N',
      creatures: [{ type: 'shark', path: 'R T Y U', loop: 'pingpong', pathIndex: 1 }, { type: 'shark', path: 'V B N', loop: 'pingpong', pathIndex: 1 }] }) },
  { n: 5, name: 'Marked', teaches: 'a marked key must be held; spare keys buy time', moment: 'a crab sits on the mark and will not leave until you look at it; you need two spare presses while it goes', ...S({ goal: 6, start: 'A', water: 'S D F G H J K L Q W E', required: 'L',
      creatures: [{ type: 'crab', at: 'L', dir: 'E' }] }) },
  // ---- 2. Bottom feeders
  { n: 6, name: 'Crab walk', teaches: 'reef: small things pass over you', ...R({ goal: 6, region: 'letters', start: home, tank: [10, 12], creatures: [{ type: 'crab', near: [1, 3] }], terrain: { reef: [1, 2], rock: [1, 2] }, accept: { laneFree: false, cautious: [0.2, 0.7] } }, 6) },
  { n: 7, name: 'Fish', teaches: 'prey: eating reveals two rings', ...R({ goal: 6, region: 'letters', start: home, tank: [10, 13], creatures: [{ type: 'fish', near: [1, 3] }, { type: 'crab', near: [2, 4] }], terrain: { rock: [1, 2] }, accept: { laneFree: false, cautious: [0.15, 0.65] } }, 7) },
  { n: 8, name: 'Chum', teaches: 'eating reveals more than you wanted', ...R({ goal: 7, region: 'letters', start: home, tank: [12, 14], creatures: [{ type: 'fish', near: [1, 3] }, { type: 'shark', mover: 'path', len: [4, 5], near: [2, 4] }], accept: { laneFree: false, cautious: [0.1, 0.6] } }, 8) },
  { n: 9, name: 'Pincer', teaches: 'two crabs from both ends', ...R({ goal: 6, region: 'letters', start: home, tank: [11, 13], creatures: [{ type: 'crab', dir: 'E', near: [1, 3] }, { type: 'crab', dir: 'W', near: [1, 3] }], terrain: { reef: [1, 1], rock: [2, 3] }, accept: { laneFree: false, cautious: [0.1, 0.6] } }, 9) },
  { n: 10, name: 'Barracuda', teaches: 'speed 2 and the rock bounce', ...R({ goal: 7, region: 'main', start: home, tank: [12, 14], creatures: [{ type: 'barracuda', near: [2, 4] }], terrain: { rock: { count: [2, 3], walls: 1, len: [2, 2] } }, accept: { laneFree: false, cautious: [0.1, 0.6] } }, 10) },
  // ---- 3. Rocks
  { n: 11, retired: 'replaced by Crab lunch', name: 'Zigzag', teaches: 'diagonal lanes', ...R({ goal: 7, region: 'main', start: home, tank: [13, 15], creatures: [{ type: 'shark', mover: 'dir', dir: 'NE', near: [2, 4] }], terrain: { rock: [1, 2] }, accept: { laneFree: false, cautious: [0.1, 0.6] } }, 11) },
  { n: 12, name: 'Pinball', teaches: 'short lanes: it is always on one of two keys', ...R({ goal: 7, region: 'main', start: home, tank: [13, 15], creatures: [{ type: 'shark', mover: 'dir', near: [2, 4] }, { type: 'barracuda', near: [2, 4] }], terrain: { rock: [4, 5] }, accept: { laneFree: false, cautious: [0.05, 0.5] } }, 12) },
  { n: 13, name: 'Corridor', teaches: 'timing an entry', ...R({ goal: 7, region: 'main', start: home, tank: [13, 16], creatures: [{ type: 'barracuda', near: [2, 4] }], terrain: { rock: { count: [4, 6], walls: 2, len: [2, 3] } }, required: { count: 1, minDist: 3, onLane: true }, accept: { laneFree: false, minLane: [1, 4], cautious: [0.05, 0.5] } }, 13) },
  { n: 14, name: 'Boulders', teaches: 'rocks reroute a chaser and stop a bouncer', ...R({ goal: 7, region: 'main', start: home, tank: [13, 16], creatures: [{ type: 'shark', mover: 'dir', near: [2, 4] }, { type: 'crab', near: [2, 4] }], terrain: { rock: { count: [4, 5], walls: 1, len: [3, 3] } }, accept: { laneFree: false, cautious: [0.05, 0.5] } }, 14) },
  { n: 15, name: 'Tide pool', teaches: 'slack 1: every key counts', ...R({ goal: 8, region: 'main', start: home, tank: [10, 11], creatures: [{ type: 'urchin', near: [1, 2] }, { type: 'crab', near: [2, 3] }], accept: { slack: [1, 2], cautious: [0.05, 0.6] } }, 15, 150) },
  // ---- 4. Caves
  { n: 16, name: 'The cave', teaches: 'a cave hides you from what passes', ...R({ goal: 7, region: 'main', start: home, tank: [12, 14], creatures: [{ type: 'shark', mover: 'path', len: [4, 5], near: [1, 3] }, { type: 'urchin', near: [1, 2] }], terrain: { cave: [1, 2], reef: [1, 1] }, accept: { laneFree: false, cautious: [0.1, 0.6] } }, 16) },
  { n: 17, name: 'Something stirred', teaches: 'a sleeper wakes when touched and chases', ...R({ goal: 7, region: 'main', start: home, tank: [12, 14], creatures: [{ type: 'eel', near: [2, 3] }, { type: 'crab', near: [2, 4] }], terrain: { cave: [1, 1] }, accept: { laneFree: false, cautious: [0.05, 0.6] } }, 17) },
  { n: 18, name: 'Two mouths', teaches: 'not every cave is empty', ...R({ goal: 7, region: 'main', start: home, tank: [12, 15], creatures: [{ type: 'eel', near: [2, 4] }, { type: 'shark', mover: 'path', len: [3, 4], near: [2, 4] }], terrain: { cave: [2, 2] }, accept: { cautious: [0.05, 0.6], fogWork: 0.03 } }, 18) },
  { n: 19, retired: 'replaced by Shark bait', name: 'Eel walk', teaches: 'leading an awake chaser around rock', ...R({ goal: 7, region: 'main', start: home, tank: [14, 16], creatures: [{ type: 'eel', wake: false, cave: false, near: [3, 5] }], terrain: { rock: { count: [3, 4], walls: 1, len: [3, 3] } }, accept: { cautious: [0.02, 0.5] } }, 19) },
  { n: 20, name: 'Hermit', teaches: 'the safe cave is its home', ...R({ goal: 7, region: 'main', start: home, tank: [12, 14], creatures: [{ type: 'shark', mover: 'path', len: [4, 5], near: [1, 3] }, { type: 'eel', near: [2, 4] }], terrain: { cave: [1, 1] }, accept: { laneFree: false, cautious: [0.05, 0.5] } }, 20) },
  { n: 21, name: 'Mines', teaches: 'not every cave is safe', ...R({ goal: 8, region: 'main', start: home, tank: [13, 15], creatures: [{ type: 'urchin', cave: true, near: [1, 3] }, { type: 'urchin', cave: true, near: [1, 3] }, { type: 'urchin', cave: true, near: [2, 4] }, { type: 'fish', near: [2, 3] }], terrain: { cave: [1, 2] }, accept: { cautious: [0.1, 0.5], fogWork: 0.2 } }, 21) },
  // ---- 5. Marked keys
  { n: 22, name: 'Crossing', teaches: 'a mark across a lane', ...R({ goal: 7, region: 'main', start: home, tank: [12, 14], creatures: [{ type: 'crab', near: [2, 4] }, { type: 'shark', mover: 'path', len: [3, 4], near: [2, 4] }], required: { count: 1, minDist: 3, onLane: true }, accept: { laneFree: false, minLane: [1, 4], cautious: [0.05, 0.5] } }, 22) },
  { n: 23, name: 'Barracuda lane', teaches: 'crossing a speed-2 lane', ...R({ goal: 8, region: 'main', start: home, tank: [14, 17], creatures: [{ type: 'barracuda', near: [3, 5] }, { type: 'crab', near: [3, 5] }], terrain: { rock: [2, 3] }, required: { count: 1, minDist: 3, onLane: true }, accept: { laneFree: false, minLane: [1, 4], cautious: [0.05, 0.4] } }, 23) },
  { n: 24, name: 'Three marks', teaches: 'ordering the crossings', ...R({ goal: 8, region: 'main', tank: [16, 19], creatures: [{ type: 'crab', near: [2, 4] }, { type: 'barracuda', near: [2, 5] }, { type: 'shark', mover: 'dir', near: [2, 5] }], terrain: { rock: [2, 3] }, required: { count: 3, minDist: 2 }, accept: { laneFree: false, cautious: [0.02, 0.4] } }, 24, 150) },
  { n: 25, name: 'F-row', teaches: 'the F-row gaps are channels', ...R({ goal: 8, region: 'all', start: { keys: codes('5 6 T Y') }, tank: [14, 17], creatures: [{ type: 'shark', mover: 'path', len: [4, 5], near: [1, 3] }, { type: 'crab', near: [2, 4] }], required: { keys: codes('F4 F3'), minDist: 1 }, accept: { laneFree: false, cautious: [0.05, 0.5] } }, 25, 200) },
  { n: 26, retired: 'replaced by Walker', name: 'Spelled', teaches: 'the marks spell it out', ...R({ goal: 8, region: 'main', start: { keys: codes('G H') }, tank: [18, 22], creatures: [{ type: 'shark', mover: 'path', len: [4, 5], near: [2, 4] }, { type: 'crab', near: [2, 5] }], required: { keys: codes('F I S H'), minDist: 1 }, accept: { laneFree: false, cautious: [0.02, 0.5] } }, 26, 300) },
  // ---- 6. Lift
  { n: 27, name: 'Lift', teaches: 'picking a tentacle up; revealed water stays yours', ...R({ goal: 6, region: 'main', start: home, tank: [10, 12], creatures: [{ type: 'crab', near: [2, 3] }], accept: { needsPickup: true } }, 27, 200) },
  { n: 28, name: 'Retreat', teaches: 'two crabs sweep the tank; lift and come back', ...R({ goal: 7, region: 'main', start: home, tank: [12, 14], creatures: [{ type: 'crab', near: [1, 3] }, { type: 'crab', near: [2, 4] }], terrain: { rock: [1, 2] }, accept: { needsPickup: true } }, 28, 200) },
  { n: 29, name: 'Relocate', teaches: 'two pools joined by a neck', ...R({ goal: 7, region: 'main', tank: [14, 18], creatures: [{ type: 'eel', wake: false, cave: false, near: [3, 5] }, { type: 'crab', near: [2, 4] }], terrain: { rock: { count: [3, 5], walls: 1, len: [3, 4] } }, accept: { needsPickup: true } }, 29, 200) },
  { n: 30, name: 'Bait', teaches: 'lead a chaser with one tentacle, then lift it', ...R({ goal: 7, region: 'main', tank: [13, 16], creatures: [{ type: 'eel', wake: false, cave: false, near: [3, 5] }, { type: 'shark', mover: 'path', len: [3, 4], near: [2, 4] }], terrain: { rock: [2, 3] }, accept: { needsPickup: true } }, 30, 200) },
  { n: 31, name: 'Anchor', teaches: 'the mark is far away: the finger you hold has to travel', ...R({ goal: 8, region: 'main', required: { count: 1, minDist: 5 }, tank: [15, 17], creatures: [{ type: 'barracuda', near: [2, 4] }, { type: 'crab', near: [2, 4] }], terrain: { rock: [2, 3], reef: [1, 1] }, accept: { laneFree: false, cautious: [0.05, 0.4] } }, 31) },
  // ---- 7. Fog memory
  { n: 32, name: 'Heard, not seen', teaches: 'count a beat by sound', ...R({ goal: 8, region: 'main', start: home, tank: [15, 18], creatures: [{ type: 'shark', mover: 'path', len: [7, 9], loop: 'loop', near: [1, 2] }], terrain: { algae: [2, 4] }, accept: { laneFree: false, cautious: [0.03, 0.5], fogWork: 0.05 } }, 32, 400) },
  { n: 33, name: 'Two loops', teaches: 'periods 3 and 5 coincide', ...R({ goal: 8, region: 'main', start: home, tank: [14, 17], creatures: [{ type: 'shark', mover: 'path', len: [3, 3], loop: 'loop', near: [1, 3] }, { type: 'shark', mover: 'path', len: [5, 5], loop: 'loop', near: [2, 4] }], accept: { laneFree: false, cautious: [0.03, 0.5] } }, 33, 150) },
  { n: 34, name: 'Crab clock', teaches: 'parity: which turn they all rest', ...R({ goal: 8, region: 'main', start: home, tank: [14, 16], creatures: [{ type: 'crab', near: [1, 3] }, { type: 'crab', near: [2, 4] }, { type: 'crab', near: [2, 4] }], terrain: { rock: [2, 3] }, accept: { laneFree: false, cautious: [0.03, 0.5] } }, 34, 150) },
  { n: 35, name: 'Blackout', teaches: 'mines under every cave but one', ...R({ goal: 8, region: 'main', start: home, tank: [14, 16], creatures: [{ type: 'urchin', cave: true, near: [1, 3] }, { type: 'urchin', cave: true, near: [1, 3] }, { type: 'urchin', cave: true, near: [2, 4] }, { type: 'urchin', cave: true, near: [2, 4] }, { type: 'shark', mover: 'path', len: [3, 4], near: [2, 4] }], terrain: { cave: [1, 2] }, accept: { cautious: [0.05, 0.4], fogWork: 0.25 } }, 35, 200) },
  { n: 36, name: 'Big tank', teaches: 'everything at once, goal 10', ...R({ goal: 10, region: 'main', start: home, tank: [20, 24], creatures: [{ type: 'shark', mover: 'path', len: [8, 10], loop: 'loop', near: [1, 3] }, { type: 'eel', near: [3, 5] }, { type: 'crab', near: [2, 4] }, { type: 'fish', near: [2, 4] }], terrain: { cave: [1, 1], rock: [2, 3], reef: [1, 2] }, accept: { laneFree: false, cautious: [0.02, 0.4] } }, 36, 200) },
  // ---- 8. Finale
  { n: 37, name: 'Ctrl+Z', teaches: 'wide keys have many neighbours', ...R({ goal: 8, region: 'all', start: { keys: codes('A S Z X') }, tank: [16, 20], creatures: [{ type: 'crab', near: [2, 4] }, { type: 'barracuda', near: [2, 5] }], required: { keys: codes('Z'), minDist: 1 }, accept: { laneFree: false, cautious: [0.02, 0.5] } }, 37, 300) },
  { n: 38, name: 'Escape', teaches: 'a dead end with one door', ...R({ goal: 8, region: 'all', start: { keys: codes('1 2 Q W') }, tank: [12, 15], creatures: [{ type: 'shark', mover: 'path', len: [4, 5], near: [1, 3] }, { type: 'crab', near: [2, 4] }], required: { count: 1, minDist: 4 }, accept: { laneFree: false, cautious: [0.02, 0.5] } }, 38, 300) },
  { n: 39, name: 'Enter', teaches: 'a wide key reveals a lot', ...R({ goal: 8, region: 'all', start: { keys: codes('L ; K O') }, tank: [14, 17], creatures: [{ type: 'barracuda', near: [2, 4] }, { type: 'shark', mover: 'path', len: [4, 5], near: [2, 4] }], required: { count: 1, minDist: 3 }, accept: { laneFree: false, cautious: [0.02, 0.5] } }, 39, 300) },
  { n: 40, name: 'Alt+F4', teaches: 'the chain; the last press closes the window', moment: 'you start holding F4 and one starfish is still hidden: find Alt in the fog while the shark circles Y U 8 7 6', ...S({ goal: 9, start: 'F4', water: 'H 5 T Y N M , RAlt 6 U 8 7 / . J', required: 'F4 RAlt', rock: 'G', reef: ', M',
      creatures: [{ type: 'shark', path: 'Y U 8 7 6', loop: 'loop', pathIndex: 2 }, { type: 'crab', at: '/', dir: 'W' }] }) },
  // ---- showcases for the rules added on 2026-09-26 (food chain, a tentacle cap, lifting one at a time)
  { n: 41, name: 'Crab lunch', teaches: 'a crab eats an urchin', moment: 'the urchin sits on the mark; only the crab can clear it, and it keeps walking onto whatever you parked behind it', ...S({ goal: 5, start: 'Y', water: '4 5 6 R T Y', rock: '3 7', required: '5',
      creatures: [{ type: 'crab', at: '6', dir: 'W' }, { type: 'urchin', at: '5' }] }) },
  { n: 42, name: 'Walker', teaches: 'two arms only: lift the back one to step forward', moment: 'you step onto 8 as the shark leaves it, and it comes straight back down onto the arm you left there', ...S({ goal: 2, max: 2, lift: 'one', start: '4', water: '4 5 6 7 8 9 0', required: '0',
      creatures: [{ type: 'shark', path: 'F7 8 I', loop: 'pingpong', pathIndex: 0 }] }) },
  // designed by the showcase agent on V (the builder carries it to M): the eel's cave is the mark
  { n: 43, name: 'Shark bait', teaches: 'a shark eats a moray eel', moment: "the mark is the eel's own cave: wake it, walk it into the shark's lane, and only then take its home", ...S({ goal: 6, start: 'V', water: 'C B F G H R', cave: 'T', required: 'T',
      creatures: [{ type: 'shark', path: 'F G H', loop: 'pingpong', pathIndex: 2 }, { type: 'eel', at: 'T' }] }) },
  // ---- the Hatchery: the tutorial (zone.tutorial). Played first, in order; a death retries the tank; coach
  // lines walk through it (see gdot.js, coach). Chosen from three designs by two judges (2026-09-27): every
  // creature is seen, and seen moving, before it can bite, and each danger tank has one mistake key.
  { n: 101, name: 'Touch', teaches: 'first press on the pulsing key, keep one key held, tentacles stay, the tray is the goal', ...S({ goal: 4, start: 'L', water: 'L K J H',
      coach: {"1":"Tap {K}. {hold}","2":"Every {tentacle} stays where you put it. Tap {J}.","3":"The tray below counts to {goal}. Tap {H} to fill it.","start":"Your first {tentacle} goes on {L}, the pulsing key.","letgo":"{G.} tries again.","lift":"Tapping a {tentacle} lifts it. Tap it again to put it back.","fog":"{fog} Fog: tap a key next to a {tentacle}.","algae":"{algae} Algae: nothing to grip. Tap the pulsing key.","ready":"{Hold} {L} to put down your first {tentacle}. {hold}","won":"Tray full: tank clear! You can let go now. {G.} opens the next one."} }) },
  { n: 102, name: 'Spines', teaches: 'algae has no grip, fog and uncovering, a creature bites a tentacle on its key', moment: 'the urchin shows on the 2nd press, on an ordinary-looking key; pressing it is the cheap death', ...S({ goal: 5, start: '9', water: '9 8 I 7 J U',
      creatures: [{ type: 'urchin', at: 'U' }],
      coach: {"1":"{algae} keys have nothing to grip: a tap there does nothing. Tap {8}.","2":"An {urchin}! It never moves, and only bites a {tentacle} on its own key. Tap {7}.","3":"Each {tentacle} uncovers the keys around it. Find more open keys, but keep off the {urchin}.","4":"One more {tentacle} fills the tray.","start":"Each tank starts on its own key: {9}.","letgo":"{G.} tries again.","lift":"Tapping a {tentacle} lifts it. Tap it again to put it back.","fog":"{fog} Fog: tap a key next to a {tentacle}.","algae":"{algae} Algae: nothing to grip. Tap an open key.","ready":"Each tank starts on its own key. {Hold} {9}. This tray needs {goal}. {hold}","won":"Clear! A creature only bites a {tentacle} on its own key.","eaten":"An {urchin} never leaves, so its key is never safe."} }) },
  { n: 103, name: 'Beat', teaches: 'one press, one move; creatures move first, then your tentacle lands', moment: 'the last key is the one the shark is on, and it swims off before you land', ...S({ goal: 4, start: 'P', water: 'P ; / [',
      creatures: [{ type: 'shark', path: '[ -', loop: 'pingpong', pathIndex: 0 }],
      coach: {"1":"A {shark}! Tap {;} and watch it.","2":"It moved because you pressed. It swims {~[} and {~-}, back and forth, and bites any {tentacle} on a key it swims onto. Tap {/}.","3":"Only {[} is left. Creatures move first: the {shark} swims off it before your {tentacle} lands.","start":"Each tank starts on its own key: {P}.","letgo":"{G.} tries again.","lift":"Tapping a {tentacle} lifts it. Tap it again to put it back.","fog":"{fog} Fog: tap a key next to a {tentacle}.","algae":"{algae} Algae: nothing to grip. Tap an open key.","ready":"{Hold} {P}. {hold}","won":"Clear! Take a creature's key as it leaves.","eaten":"Take a key the {shark} is leaving this turn, never one it is swimming onto."} }) },
  { n: 104, name: 'Wait', teaches: 'lifting is free; lift and put back = wait one turn', moment: 'the last key opens as the shark is one step from it; only a wait gets through', ...S({ goal: 4, start: '0', water: '0 - = ]',
      creatures: [{ type: 'shark', path: 'O P [ ]', loop: 'pingpong', pathIndex: 0 }],
      coach: {"1":"The {shark} swims over {algae} too. Tap {-}.","2":"It is heading your way. Tap {=}.","3":"The {shark} swims onto {~]} next and would bite a {tentacle} there. Wait a turn: tap {-} to lift it, then tap {-} again.","4":"That was a turn. Take {]} now: the {shark} leaves first.","start":"Each tank starts on its own key: {0}.","letgo":"Hold another key down while you tap one. {G.} tries again.","lift":"Lifting is free: nothing moved, and the tray dropped by one. Tap it again to wait a turn.","fog":"{fog} Fog: tap a key next to a {tentacle}.","algae":"{algae} Algae: nothing to grip. Tap an open key.","ready":"{Hold} {0}. Something swims close by. {hold}","won":"Lift and put back: that is how you wait a turn.","eaten":"Wait first: lift a {tentacle} and put it back."} }) },
  { n: 105, name: 'Starfish', teaches: 'a starfish must hold a tentacle too: a full tray is not enough', moment: 'the tray is full on the 3rd press but the tank is not clear; take the starfish as the shark leaves it', ...S({ goal: 3, start: '/', water: "/ ; L '", required: "'",
      creatures: [{ type: 'shark', path: "' [", loop: 'pingpong', pathIndex: 0 }],
      coach: {"1":"A {starfish} under the {shark}. Save it for last: tap {;}.","2":"The {shark} swims back onto it next. Wait a turn: lift {;} and put it back.","3":"The {starfish} needs a {tentacle} too. Take {'} now: the {shark} swims off it first.","start":"Each tank starts on its own key: {/}.","letgo":"{G.} tries again.","lift":"Tapping a {tentacle} lifts it. Tap it again to put it back.","fog":"{fog} Fog: tap a key next to a {tentacle}.","algae":"{algae} Algae: nothing to grip. Tap an open key.","ready":"{Hold} {/}. Look for the {starfish}. {hold}","won":"Tray full and {starfish} covered: clear! {G.} takes you to the real tanks. {next}","eaten":"Cover the {starfish} as the {shark} leaves it, not as it swims back."} }) },
];

/* ================= zones ================= */
// The Hatchery (the tutorial, played first by a new player), then five zones of eight tanks, each named after a row of keys. Order inside a zone is the order the
// tanks come up in (dying sends you to the unbeaten tank you played longest ago, ties in this order).
export const ZONES = [
  { id: 'hatchery', name: 'Hatchery', env: 'kelp', tutorial: true, keys: codes('L 9 P 0 /'),
    tanks: ['Touch', 'Spines', 'Beat', 'Wait', 'Starfish'] },
  { id: 'shallows', name: 'Shallows', env: 'sand', region: 'letters', keys: codes('G H F J D K S A'),
    tanks: ['First tank', 'Tail', 'Rest turn', 'Crab walk', 'Fish', 'Two beats', 'Pincer', 'Marked'] },
  { id: 'rock-garden', name: 'Rock garden', env: 'stone', region: 'main', keys: codes('T Y R U E I W Q'),
    tanks: ['Barracuda', 'Crab lunch', 'Chum', 'Tide pool', 'Corridor', 'Boulders', 'Pinball', 'Crossing'] },
  { id: 'currents', name: 'Currents', env: 'blue', region: 'main', keys: codes('5 6 4 7 3 8 2 1'),
    tanks: ['Lift', 'Retreat', 'Walker', 'Relocate', 'Bait', 'Anchor', 'Barracuda lane', 'Three marks'] },
  { id: 'caves', name: 'Caves', env: 'dark', region: 'main', keys: codes('B N V M C , X Z'),
    tanks: ['The cave', 'Something stirred', 'Two mouths', 'Shark bait', 'Hermit', 'Mines', 'Heard, not seen', 'Blackout'] },
  { id: 'the-rim', name: 'The rim', env: 'deep', region: 'all', keys: codes('Tab Caps Space LCtrl Esc Enter F1 F4'), finale: 'Alt+F4',
    tanks: ['Two loops', 'Crab clock', 'Big tank', 'Ctrl+Z', 'Escape', 'Enter', 'F-row', 'Alt+F4'] },
];
export function slotOf(name) { for (const z of ZONES) { const i = z.tanks.indexOf(name); if (i >= 0) return { zone: z, key: z.keys[i] }; } return null; }
// A level moved so that it starts on its tank key: sideways along the row when that is possible
// (the layout carries over exactly), otherwise null (the tank has to be rebuilt around its key).
export function onKey(level, key) {
  if (!key) return level;
  if (level.start.length === 1 && level.start[0] === key) return level;
  const o = GDOT.latticeOffset(level.start[0], key);
  if (!o) return null;
  const moved = GDOT.shiftLevel(level, o[0], o[1]);
  if (moved) moved.start = [key];
  return moved;
}
export const zoneMeta = () => ZONES.map(({ id, name, env, keys, tutorial, rules }) => Object.assign({ id, name, env, keys }, tutorial ? { tutorial: true } : {}, rules ? { rules } : {}));
// The written campaign: zone order, then tank order; each level gets its zone (and the finale flag).
export function arrange(byName) {
  const out = [], missing = [];
  for (const z of ZONES) for (const name of z.tanks) {
    const l = byName.get(name); if (!l) { missing.push(name); continue; }
    const lv = { ...l, zone: z.id }; if (z.finale === name) lv.finale = true; else delete lv.finale;
    out.push(lv);
  }
  return { levels: out, missing };
}

/* ================= build ================= */
export function buildLevel(entry, opts = {}) {
  const slot = slotOf(entry.name);
  if (entry.spec) {
    const terr = !!(slot && slot.zone.rules === 'territory');
    const l = expand({ id: GDOT.slug(entry.name), name: entry.name, ...(terr ? { closed: true } : {}), ...entry.spec });
    const moved = slot ? onKey(l, slot.key) : l;
    if (!moved) return { level: null, analysis: null, rejected: { 'start is not on the row of its key': 1 }, attempts: 0 };
    if (terr) { const r = GDOT.solvePar(GDOT.resolveLevel(moved, { rules: 'territory' }), { budget: opts.parBudget || 600000 }); if (r.solved) moved.par = r.par; else delete moved.par; }
    return { level: moved, analysis: null };
  }
  const recipe = { ...entry.recipe, name: entry.name, id: GDOT.slug(entry.name) };
  if (slot) { recipe.start = { keys: [slot.key] }; if (slot.zone.region) recipe.region = slot.zone.region; }
  const res = generate(recipe, { seed: entry.seed, count: 1, tries: entry.tries, rollouts: opts.rollouts || 600, budget: opts.budget || 60000, progress: !!opts.progress });
  if (!res.levels.length) return { level: null, analysis: null, rejected: res.rejected, attempts: res.attempts };
  return res.levels[0];
}
export function parseOnly(s) {
  if (!s) return null; const set = new Set();
  for (const part of s.split(',')) { const m = part.match(/^(\d+)-(\d+)$/); if (m) for (let i = +m[1]; i <= +m[2]; i++) set.add(i); else set.add(+part); }
  return set;
}

/* ================= drawing ================= */
export function draw(level) {
  const g = GDOT.createGame(level); const lanes = laneKeys(level); const at = {};
  for (const c of g.creatures) at[c.pos] = { shark: 'S', barracuda: 'B', crab: 'C', eel: 'E', urchin: 'U', fish: 'F' }[c.type] || '?';
  const rows = [];
  for (let r = 0; r < 6; r++) {
    let line = '';
    for (const k of GDOT.KEYS.filter(k => k.row === r)) {
      const col = Math.round(k.x * 3); while (line.length < col) line += ' ';
      const t = g.TER[k.code]; let s;
      if (at[k.code]) s = at[k.code];
      else if (g.START.includes(k.code)) s = '@';
      else if (g.REQ.includes(k.code)) s = '!';
      else if (t === 'algae') s = '~'; else if (t === 'rock') s = '#'; else if (t === 'reef') s = '%'; else if (t === 'cave') s = 'O';
      else if (lanes.has(k.code)) s = '*';
      else s = '.';
      const lab = (k.label || 'Sp').slice(0, 1);
      line += lab + s + ' ';
    }
    rows.push(line.replace(/\s+$/, ''));
  }
  const open = GDOT.KEYS.filter(k => !g.TER[k.code] || g.TER[k.code] === 'reef' || g.TER[k.code] === 'cave').length;
  return rows.join('\n') + `\n  @ start  ! marked  ~ algae  # rock  % reef  O cave  * lane  letters = creature start (S shark B barracuda C crab E eel U urchin F fish)`;
}

/* ================= levels.js ================= */
export function writeLevels(levels, file = LEVELS_JS) {
  fs.writeFileSync(file, GDOT.levelsSource(zoneMeta(), levels));
}

/* ================= cli ================= */
function cli() {
  const args = process.argv.slice(2); const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const only = parseOnly(opt('--only', null));
  const entries = CAMPAIGN.filter(e => (!only || only.has(e.n)) && !e.retired);
  for (const e of CAMPAIGN) if (!e.retired && !slotOf(e.name)) console.error(`warning: ${e.name} is in no zone, so it will not be written`);
  for (const z of ZONES) for (const name of z.tanks) if (!CAMPAIGN.some(e => e.name === name)) console.error(`note: ${name} (zone ${z.name}) has no spec or recipe yet`);
  if (args.includes('--show')) { const n = +opt('--show'); const e = CAMPAIGN.find(e => e.n === n); const { level } = buildLevel(e, { progress: true }); if (!level) { console.log('no level'); return; } console.log(`${e.n}. ${e.name} — ${e.teaches}${e.moment ? ' · ' + e.moment : ''}`); console.log(draw(level)); console.log(JSON.stringify(level)); return; }
  const built = [];
  const existing = new Map((fs.existsSync(LEVELS_JS) ? loadLevels() : []).map(l => [l.id, l]));
  const fresh = args.includes('--fresh');
  for (const e of entries) {
    const slot = slotOf(e.name), old = existing.get(GDOT.slug(e.name));
    if (!fresh && !only && e.recipe && old && slot) { const moved = onKey(old, slot.key); if (moved) { process.stderr.write(`${String(e.n).padStart(2)} ${e.name.padEnd(18)} kept${moved === old ? '' : ' (moved to ' + GDOT.L(slot.key) + ')'}
`); built.push({ e, level: moved }); continue; } }
    process.stderr.write(`${String(e.n).padStart(2)} ${e.name.padEnd(18)} `);
    const r = buildLevel(e, { progress: true });
    if (!r.level) { process.stderr.write(` FAILED after ${r.attempts} tries: ${JSON.stringify(r.rejected)}\n`); continue; }
    if (e.spec) process.stderr.write('\n');
    built.push({ e, level: r.level });
  }
  if (args.includes('--check')) {
    console.log(HEADER);
    let last = null;
    for (const { e, level } of built) { const z = (slotOf(e.name) || {}).zone; const terr = z && z.rules === 'territory';
      const hd = terr ? HEADER_T : HEADER; if (hd !== last) { console.log(hd); last = hd; }
      if (terr) { const a = analyzeTerritory(GDOT.resolveLevel(level, { rules: 'territory' }), { rollouts: 600 }); console.log(rowT(a)); if (args.includes('--line')) console.log('   ' + (a.solution || []).join(' ')); continue; }
      const a = analyze(level, { rollouts: +opt('--rollouts', 1500), budget: +opt('--budget', 100000) }); console.log(row(a) + (a.solvableWithPickups && !a.solvable ? ' (needs lift: ' + a.pickupTurns + ' turns)' : '')); }
  }
  if (args.includes('--write')) {
    // assemble in campaign order: what was built now, else (with --only) the level already in the file with that id
    const byId = new Map((fs.existsSync(LEVELS_JS) ? loadLevels() : []).map(l => [l.id, l]));
    const byName = new Map();
    for (const e of CAMPAIGN) { const l = (built.find(b => b.e.n === e.n) || {}).level || (only ? byId.get(GDOT.slug(e.name)) : null); if (l) byName.set(e.name, l); }
    for (const [name, l] of byName) { const slot = slotOf(name); if (slot && !(l.start.length === 1 && l.start[0] === slot.key)) console.error(`warning: ${name} does not start on ${GDOT.L(slot.key)}`); }
    const { levels: out, missing } = arrange(byName);
    // keep what the campaign does not own: tanks made in the editor, extra zones, zone names/looks/ecology
    const fileZones = fs.existsSync(LEVELS_JS) ? loadZones() : [];
    const owned = new Set(out.map(l => l.id)), campaignNames = new Set(CAMPAIGN.map(e => GDOT.slug(e.name)));
    const extra = [...byId.values()].filter(l => !owned.has(l.id) && !campaignNames.has(l.id));
    const zonesOut = zoneMeta().map(z => { const f = fileZones.find(q => q.id === z.id); return f ? { ...f, keys: z.keys } : z; });
    for (const f of fileZones) if (!zonesOut.some(z => z.id === f.id)) zonesOut.push(f);
    if (extra.length) console.error(`kept ${extra.length} tank(s) the campaign does not own: ${extra.map(l => l.name).join(', ')}`);
    fs.writeFileSync(LEVELS_JS, GDOT.levelsSource(zonesOut, out.concat(extra)));
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli();
