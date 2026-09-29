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
  if (spec.ink > 0) level.ink = Math.floor(spec.ink);
  if (spec.coach) level.coach = spec.coach; // tutorial lines, see gdot.js (coach)
  const water = new Set(codes(spec.water)); for (const s of level.start) water.add(s);
  for (const t of ['reef', 'cave']) for (const k of codes(spec[t])) { level.terrain[k] = t; water.add(k); }
  for (const t of ['rock', 'algae']) for (const k of codes(spec[t])) { level.terrain[k] = t; water.delete(k); }
  if (spec.closed) { // a closed tank: only these keys are the tank (territory tanks; a starfish opens the algae around it)
    const t = new Set(water); for (const k of level.start) t.add(k); for (const k of codes(spec.rock)) t.add(k); level.tank = [...t];
  }
  for (const c of spec.creatures || []) {
    const p = GDOT.PRESETS[c.type] || {};
    const cr = { type: c.type, mover: c.mover || (c.path ? 'path' : p.mover || 'dir'), dir: c.dir || p.dir || 'E', speed: c.speed ?? p.speed ?? 1, size: c.size || p.size || 'big', prey: c.prey ?? !!p.prey, cave: c.cave ?? !!p.cave, wake: c.wake ?? !!p.wake };
    for (const k of ['eats', 'chases', 'flees', 'range', 'length', 'sweep', 'bloom', 'phase']) if (c[k] != null) cr[k] = c[k];
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
  { n: 201, retired: 'classic Shallows (territory rules since 2026-09-28)', name: 'First tank', teaches: 'press, reveal, the beat', moment: 'the 4th key is on the beat: watch it go T Y H, then take a key it is not coming back to', ...S({ goal: 4, start: 'G', water: 'F H T Y V',
      creatures: [{ type: 'shark', path: 'T Y H', loop: 'pingpong', pathIndex: 0 }] }) },
  { n: 202, retired: 'classic Shallows (territory rules since 2026-09-28)', name: 'Tail', teaches: 'the safest key is the one it just left', moment: 'it circles you; you have to grip its lane three times', ...S({ goal: 4, start: 'G', water: 'T Y H B V F',
      creatures: [{ type: 'shark', path: 'T Y H B V F', loop: 'loop', pathIndex: 0 }] }) },
  { n: 203, retired: 'classic Shallows (territory rules since 2026-09-28)', name: 'Rest turn', teaches: 'half-speed creatures rest every other turn', moment: 'it does not move on the turn you counted on', ...S({ goal: 5, start: 'G', water: 'H J V B N M', rock: 'C ,',
      creatures: [{ type: 'crab', at: 'V', dir: 'E' }] }) },
  { n: 204, retired: 'classic Shallows (territory rules since 2026-09-28)', name: 'Two beats', teaches: 'two beats at once', moment: 'both sharks are in view from the first press; the 6th key must dodge both', ...S({ goal: 6, start: 'G', water: 'R T Y U F H J K V B N',
      creatures: [{ type: 'shark', path: 'R T Y U', loop: 'pingpong', pathIndex: 1 }, { type: 'shark', path: 'V B N', loop: 'pingpong', pathIndex: 1 }] }) },
  { n: 205, retired: 'classic Shallows (territory rules since 2026-09-28)', name: 'Marked', teaches: 'a marked key must be held; spare keys buy time', moment: 'a crab sits on the mark and will not leave until you look at it; you need two spare presses while it goes', ...S({ goal: 6, start: 'A', water: 'S D F G H J K L Q W E', required: 'L',
      creatures: [{ type: 'crab', at: 'L', dir: 'E' }] }) },
  // ---- 2. Bottom feeders
  { n: 206, retired: 'classic Shallows (territory rules since 2026-09-28)', name: 'Crab walk', teaches: 'reef: small things pass over you', ...R({ goal: 6, region: 'letters', start: home, tank: [10, 12], creatures: [{ type: 'crab', near: [1, 3] }], terrain: { reef: [1, 2], rock: [1, 2] }, accept: { laneFree: false, cautious: [0.2, 0.7] } }, 6) },
  { n: 207, retired: 'classic Shallows (territory rules since 2026-09-28)', name: 'Fish', teaches: 'prey: eating reveals two rings', ...R({ goal: 6, region: 'letters', start: home, tank: [10, 13], creatures: [{ type: 'fish', near: [1, 3] }, { type: 'crab', near: [2, 4] }], terrain: { rock: [1, 2] }, accept: { laneFree: false, cautious: [0.15, 0.65] } }, 7) },
  { n: 208, retired: 'classic Rock garden (territory rules since 2026-09-28)', name: 'Chum', teaches: 'eating reveals more than you wanted', ...R({ goal: 7, region: 'letters', start: home, tank: [12, 14], creatures: [{ type: 'fish', near: [1, 3] }, { type: 'shark', mover: 'path', len: [4, 5], near: [2, 4] }], accept: { laneFree: false, cautious: [0.1, 0.6] } }, 8) },
  { n: 209, retired: 'classic Shallows (territory rules since 2026-09-28)', name: 'Pincer', teaches: 'two crabs from both ends', ...R({ goal: 6, region: 'letters', start: home, tank: [11, 13], creatures: [{ type: 'crab', dir: 'E', near: [1, 3] }, { type: 'crab', dir: 'W', near: [1, 3] }], terrain: { reef: [1, 1], rock: [2, 3] }, accept: { laneFree: false, cautious: [0.1, 0.6] } }, 9) },
  { n: 210, retired: 'classic Rock garden (territory rules since 2026-09-28)', name: 'Barracuda', teaches: 'speed 2 and the rock bounce', ...R({ goal: 7, region: 'main', start: home, tank: [12, 14], creatures: [{ type: 'barracuda', near: [2, 4] }], terrain: { rock: { count: [2, 3], walls: 1, len: [2, 2] } }, accept: { laneFree: false, cautious: [0.1, 0.6] } }, 10) },
  // ---- 3. Rocks
  { n: 11, retired: 'replaced by Crab lunch', name: 'Zigzag', teaches: 'diagonal lanes', ...R({ goal: 7, region: 'main', start: home, tank: [13, 15], creatures: [{ type: 'shark', mover: 'dir', dir: 'NE', near: [2, 4] }], terrain: { rock: [1, 2] }, accept: { laneFree: false, cautious: [0.1, 0.6] } }, 11) },
  { n: 212, retired: 'classic Rock garden (territory rules since 2026-09-28)', name: 'Pinball', teaches: 'short lanes: it is always on one of two keys', ...R({ goal: 7, region: 'main', start: home, tank: [13, 15], creatures: [{ type: 'shark', mover: 'dir', near: [2, 4] }, { type: 'barracuda', near: [2, 4] }], terrain: { rock: [4, 5] }, accept: { laneFree: false, cautious: [0.05, 0.5] } }, 12) },
  { n: 213, retired: 'classic Rock garden (territory rules since 2026-09-28)', name: 'Corridor', teaches: 'timing an entry', ...R({ goal: 7, region: 'main', start: home, tank: [13, 16], creatures: [{ type: 'barracuda', near: [2, 4] }], terrain: { rock: { count: [4, 6], walls: 2, len: [2, 3] } }, required: { count: 1, minDist: 3, onLane: true }, accept: { laneFree: false, minLane: [1, 4], cautious: [0.05, 0.5] } }, 13) },
  { n: 214, retired: 'classic Rock garden (territory rules since 2026-09-28)', name: 'Boulders', teaches: 'rocks reroute a chaser and stop a bouncer', ...R({ goal: 7, region: 'main', start: home, tank: [13, 16], creatures: [{ type: 'shark', mover: 'dir', near: [2, 4] }, { type: 'crab', near: [2, 4] }], terrain: { rock: { count: [4, 5], walls: 1, len: [3, 3] } }, accept: { laneFree: false, cautious: [0.05, 0.5] } }, 14) },
  { n: 215, retired: 'classic Rock garden (territory rules since 2026-09-28)', name: 'Tide pool', teaches: 'slack 1: every key counts', ...R({ goal: 8, region: 'main', start: home, tank: [10, 11], creatures: [{ type: 'urchin', near: [1, 2] }, { type: 'crab', near: [2, 3] }], accept: { slack: [1, 2], cautious: [0.05, 0.6] } }, 15, 150) },
  // ---- 4. Caves
  { n: 216, retired: 'classic Caves (territory rules since 2026-09-28)', name: 'The cave', teaches: 'a cave hides you from what passes', ...R({ goal: 7, region: 'main', start: home, tank: [12, 14], creatures: [{ type: 'shark', mover: 'path', len: [4, 5], near: [1, 3] }, { type: 'urchin', near: [1, 2] }], terrain: { cave: [1, 2], reef: [1, 1] }, accept: { laneFree: false, cautious: [0.1, 0.6] } }, 16) },
  { n: 217, retired: 'classic Caves (territory rules since 2026-09-28)', name: 'Something stirred', teaches: 'a sleeper wakes when touched and chases', ...R({ goal: 7, region: 'main', start: home, tank: [12, 14], creatures: [{ type: 'eel', near: [2, 3] }, { type: 'crab', near: [2, 4] }], terrain: { cave: [1, 1] }, accept: { laneFree: false, cautious: [0.05, 0.6] } }, 17) },
  { n: 218, retired: 'classic Caves (territory rules since 2026-09-28)', name: 'Two mouths', teaches: 'not every cave is empty', ...R({ goal: 7, region: 'main', start: home, tank: [12, 15], creatures: [{ type: 'eel', near: [2, 4] }, { type: 'shark', mover: 'path', len: [3, 4], near: [2, 4] }], terrain: { cave: [2, 2] }, accept: { cautious: [0.05, 0.6], fogWork: 0.03 } }, 18) },
  { n: 19, retired: 'replaced by Shark bait', name: 'Eel walk', teaches: 'leading an awake chaser around rock', ...R({ goal: 7, region: 'main', start: home, tank: [14, 16], creatures: [{ type: 'eel', wake: false, cave: false, near: [3, 5] }], terrain: { rock: { count: [3, 4], walls: 1, len: [3, 3] } }, accept: { cautious: [0.02, 0.5] } }, 19) },
  { n: 220, retired: 'classic Caves (territory rules since 2026-09-28)', name: 'Hermit', teaches: 'the safe cave is its home', ...R({ goal: 7, region: 'main', start: home, tank: [12, 14], creatures: [{ type: 'shark', mover: 'path', len: [4, 5], near: [1, 3] }, { type: 'eel', near: [2, 4] }], terrain: { cave: [1, 1] }, accept: { laneFree: false, cautious: [0.05, 0.5] } }, 20) },
  { n: 221, retired: 'classic Caves (territory rules since 2026-09-28)', name: 'Mines', teaches: 'not every cave is safe', ...R({ goal: 8, region: 'main', start: home, tank: [13, 15], creatures: [{ type: 'urchin', cave: true, near: [1, 3] }, { type: 'urchin', cave: true, near: [1, 3] }, { type: 'urchin', cave: true, near: [2, 4] }, { type: 'fish', near: [2, 3] }], terrain: { cave: [1, 2] }, accept: { cautious: [0.1, 0.5], fogWork: 0.2 } }, 21) },
  // ---- 5. Marked keys
  { n: 222, retired: 'classic Rock garden (territory rules since 2026-09-28)', name: 'Crossing', teaches: 'a mark across a lane', ...R({ goal: 7, region: 'main', start: home, tank: [12, 14], creatures: [{ type: 'crab', near: [2, 4] }, { type: 'shark', mover: 'path', len: [3, 4], near: [2, 4] }], required: { count: 1, minDist: 3, onLane: true }, accept: { laneFree: false, minLane: [1, 4], cautious: [0.05, 0.5] } }, 22) },
  { n: 223, retired: 'classic Currents (territory rules since 2026-09-28)', name: 'Barracuda lane', teaches: 'crossing a speed-2 lane', ...R({ goal: 8, region: 'main', start: home, tank: [14, 17], creatures: [{ type: 'barracuda', near: [3, 5] }, { type: 'crab', near: [3, 5] }], terrain: { rock: [2, 3] }, required: { count: 1, minDist: 3, onLane: true }, accept: { laneFree: false, minLane: [1, 4], cautious: [0.05, 0.4] } }, 23) },
  { n: 224, retired: 'classic Currents (territory rules since 2026-09-28)', name: 'Three marks', teaches: 'ordering the crossings', ...R({ goal: 8, region: 'main', tank: [16, 19], creatures: [{ type: 'crab', near: [2, 4] }, { type: 'barracuda', near: [2, 5] }, { type: 'shark', mover: 'dir', near: [2, 5] }], terrain: { rock: [2, 3] }, required: { count: 3, minDist: 2 }, accept: { laneFree: false, cautious: [0.02, 0.4] } }, 24, 150) },
  { n: 225, retired: 'classic The rim (territory rules since 2026-09-28)', name: 'F-row', teaches: 'the F-row gaps are channels', ...R({ goal: 8, region: 'all', start: { keys: codes('5 6 T Y') }, tank: [14, 17], creatures: [{ type: 'shark', mover: 'path', len: [4, 5], near: [1, 3] }, { type: 'crab', near: [2, 4] }], required: { keys: codes('F4 F3'), minDist: 1 }, accept: { laneFree: false, cautious: [0.05, 0.5] } }, 25, 200) },
  { n: 26, retired: 'replaced by Walker', name: 'Spelled', teaches: 'the marks spell it out', ...R({ goal: 8, region: 'main', start: { keys: codes('G H') }, tank: [18, 22], creatures: [{ type: 'shark', mover: 'path', len: [4, 5], near: [2, 4] }, { type: 'crab', near: [2, 5] }], required: { keys: codes('F I S H'), minDist: 1 }, accept: { laneFree: false, cautious: [0.02, 0.5] } }, 26, 300) },
  // ---- 6. Lift
  { n: 227, retired: 'classic Currents (territory rules since 2026-09-28)', name: 'Lift', teaches: 'picking a tentacle up; revealed water stays yours', ...R({ goal: 6, region: 'main', start: home, tank: [10, 12], creatures: [{ type: 'crab', near: [2, 3] }], accept: { needsPickup: true } }, 27, 200) },
  { n: 228, retired: 'classic Currents (territory rules since 2026-09-28)', name: 'Retreat', teaches: 'two crabs sweep the tank; lift and come back', ...R({ goal: 7, region: 'main', start: home, tank: [12, 14], creatures: [{ type: 'crab', near: [1, 3] }, { type: 'crab', near: [2, 4] }], terrain: { rock: [1, 2] }, accept: { needsPickup: true } }, 28, 200) },
  { n: 229, retired: 'classic Currents (territory rules since 2026-09-28)', name: 'Relocate', teaches: 'two pools joined by a neck', ...R({ goal: 7, region: 'main', tank: [14, 18], creatures: [{ type: 'eel', wake: false, cave: false, near: [3, 5] }, { type: 'crab', near: [2, 4] }], terrain: { rock: { count: [3, 5], walls: 1, len: [3, 4] } }, accept: { needsPickup: true } }, 29, 200) },
  { n: 230, retired: 'classic Currents (territory rules since 2026-09-28)', name: 'Bait', teaches: 'lead a chaser with one tentacle, then lift it', ...R({ goal: 7, region: 'main', tank: [13, 16], creatures: [{ type: 'eel', wake: false, cave: false, near: [3, 5] }, { type: 'shark', mover: 'path', len: [3, 4], near: [2, 4] }], terrain: { rock: [2, 3] }, accept: { needsPickup: true } }, 30, 200) },
  { n: 231, retired: 'classic Currents (territory rules since 2026-09-28)', name: 'Anchor', teaches: 'the mark is far away: the finger you hold has to travel', ...R({ goal: 8, region: 'main', required: { count: 1, minDist: 5 }, tank: [15, 17], creatures: [{ type: 'barracuda', near: [2, 4] }, { type: 'crab', near: [2, 4] }], terrain: { rock: [2, 3], reef: [1, 1] }, accept: { laneFree: false, cautious: [0.05, 0.4] } }, 31) },
  // ---- 7. Fog memory
  { n: 232, retired: 'classic Caves (territory rules since 2026-09-28)', name: 'Heard, not seen', teaches: 'count a beat by sound', ...R({ goal: 8, region: 'main', start: home, tank: [15, 18], creatures: [{ type: 'shark', mover: 'path', len: [7, 9], loop: 'loop', near: [1, 2] }], terrain: { algae: [2, 4] }, accept: { laneFree: false, cautious: [0.03, 0.5], fogWork: 0.05 } }, 32, 400) },
  { n: 233, retired: 'classic The rim (territory rules since 2026-09-28)', name: 'Two loops', teaches: 'periods 3 and 5 coincide', ...R({ goal: 8, region: 'main', start: home, tank: [14, 17], creatures: [{ type: 'shark', mover: 'path', len: [3, 3], loop: 'loop', near: [1, 3] }, { type: 'shark', mover: 'path', len: [5, 5], loop: 'loop', near: [2, 4] }], accept: { laneFree: false, cautious: [0.03, 0.5] } }, 33, 150) },
  { n: 234, retired: 'classic The rim (territory rules since 2026-09-28)', name: 'Crab clock', teaches: 'parity: which turn they all rest', ...R({ goal: 8, region: 'main', start: home, tank: [14, 16], creatures: [{ type: 'crab', near: [1, 3] }, { type: 'crab', near: [2, 4] }, { type: 'crab', near: [2, 4] }], terrain: { rock: [2, 3] }, accept: { laneFree: false, cautious: [0.03, 0.5] } }, 34, 150) },
  { n: 235, retired: 'classic Caves (territory rules since 2026-09-28)', name: 'Blackout', teaches: 'mines under every cave but one', ...R({ goal: 8, region: 'main', start: home, tank: [14, 16], creatures: [{ type: 'urchin', cave: true, near: [1, 3] }, { type: 'urchin', cave: true, near: [1, 3] }, { type: 'urchin', cave: true, near: [2, 4] }, { type: 'urchin', cave: true, near: [2, 4] }, { type: 'shark', mover: 'path', len: [3, 4], near: [2, 4] }], terrain: { cave: [1, 2] }, accept: { cautious: [0.05, 0.4], fogWork: 0.25 } }, 35, 200) },
  { n: 236, retired: 'classic The rim (territory rules since 2026-09-28)', name: 'Big tank', teaches: 'everything at once, goal 10', ...R({ goal: 10, region: 'main', start: home, tank: [20, 24], creatures: [{ type: 'shark', mover: 'path', len: [8, 10], loop: 'loop', near: [1, 3] }, { type: 'eel', near: [3, 5] }, { type: 'crab', near: [2, 4] }, { type: 'fish', near: [2, 4] }], terrain: { cave: [1, 1], rock: [2, 3], reef: [1, 2] }, accept: { laneFree: false, cautious: [0.02, 0.4] } }, 36, 200) },
  // ---- 8. Finale
  { n: 237, retired: 'classic The rim (territory rules since 2026-09-28)', name: 'Ctrl+Z', teaches: 'wide keys have many neighbours', ...R({ goal: 8, region: 'all', start: { keys: codes('A S Z X') }, tank: [16, 20], creatures: [{ type: 'crab', near: [2, 4] }, { type: 'barracuda', near: [2, 5] }], required: { keys: codes('Z'), minDist: 1 }, accept: { laneFree: false, cautious: [0.02, 0.5] } }, 37, 300) },
  { n: 238, retired: 'classic The rim (territory rules since 2026-09-28)', name: 'Escape', teaches: 'a dead end with one door', ...R({ goal: 8, region: 'all', start: { keys: codes('1 2 Q W') }, tank: [12, 15], creatures: [{ type: 'shark', mover: 'path', len: [4, 5], near: [1, 3] }, { type: 'crab', near: [2, 4] }], required: { count: 1, minDist: 4 }, accept: { laneFree: false, cautious: [0.02, 0.5] } }, 38, 300) },
  { n: 239, retired: 'classic The rim (territory rules since 2026-09-28)', name: 'Enter', teaches: 'a wide key reveals a lot', ...R({ goal: 8, region: 'all', start: { keys: codes('L ; K O') }, tank: [14, 17], creatures: [{ type: 'barracuda', near: [2, 4] }, { type: 'shark', mover: 'path', len: [4, 5], near: [2, 4] }], required: { count: 1, minDist: 3 }, accept: { laneFree: false, cautious: [0.02, 0.5] } }, 39, 300) },
  { n: 240, retired: 'classic The rim (territory rules since 2026-09-28)', name: 'Alt+F4', teaches: 'the chain; the last press closes the window', moment: 'you start holding F4 and one starfish is still hidden: find Alt in the fog while the shark circles Y U 8 7 6', ...S({ goal: 9, start: 'F4', water: 'H 5 T Y N M , RAlt 6 U 8 7 / . J', required: 'F4 RAlt', rock: 'G', reef: ', M',
      creatures: [{ type: 'shark', path: 'Y U 8 7 6', loop: 'loop', pathIndex: 2 }, { type: 'crab', at: '/', dir: 'W' }] }) },
  // ---- showcases for the rules added on 2026-09-26 (food chain, a tentacle cap, lifting one at a time)
  { n: 241, retired: 'classic Rock garden (territory rules since 2026-09-28)', name: 'Crab lunch', teaches: 'a crab eats an urchin', moment: 'the urchin sits on the mark; only the crab can clear it, and it keeps walking onto whatever you parked behind it', ...S({ goal: 5, start: 'Y', water: '4 5 6 R T Y', rock: '3 7', required: '5',
      creatures: [{ type: 'crab', at: '6', dir: 'W' }, { type: 'urchin', at: '5' }] }) },
  { n: 242, retired: 'classic Currents (territory rules since 2026-09-28)', name: 'Walker', teaches: 'two arms only: lift the back one to step forward', moment: 'you step onto 8 as the shark leaves it, and it comes straight back down onto the arm you left there', ...S({ goal: 2, max: 2, lift: 'one', start: '4', water: '4 5 6 7 8 9 0', required: '0',
      creatures: [{ type: 'shark', path: 'F7 8 I', loop: 'pingpong', pathIndex: 0 }] }) },
  // designed by the showcase agent on V (the builder carries it to M): the eel's cave is the mark
  { n: 243, retired: 'classic Caves (territory rules since 2026-09-28)', name: 'Shark bait', teaches: 'a shark eats a moray eel', moment: "the mark is the eel's own cave: wake it, walk it into the shark's lane, and only then take its home", ...S({ goal: 6, start: 'V', water: 'C B F G H R', cave: 'T', required: 'T',
      creatures: [{ type: 'shark', path: 'F G H', loop: 'pingpong', pathIndex: 2 }, { type: 'eel', at: 'T' }] }) },
  // ---- the Shallows, territory rules (2026-09-28): found by a search (random closed tanks around each key, scored by
  // par and by how far a greedy arrow-reading player lands above it), then picked by hand for a ramp.
  { n: 301, name: "Pacing", teaches: "arrows, a take, a key left to the creature", moment: "take R as the shark swings off it; it takes T back and ends the tank on T, so T is its own", ...S({"start":"G","water":"G B H Y T R","creatures":[{"type":"shark","path":"R T Y","loop":"pingpong","pathIndex":2,"speed":1}]}) },
  { n: 302, name: "Round trip", teaches: "a longer route: fill what it will not reach first", moment: "fill Y and B while the shark is away, let it take U, fill U again behind it", ...S({"start":"H","water":"H U I Y B K N","creatures":[{"type":"shark","path":"I U J N","loop":"pingpong","pathIndex":3,"speed":1}]}) },
  { n: 303, name: "Slow crab", teaches: "a crab rests every other press; waiting is sometimes the shortest way", moment: "wait once so the crab walks off Y, then fill behind it", ...S({"start":"F","water":"F T 7 8 9 Y","rock":"6","creatures":[{"type":"crab","at":"7","mover":"dir","dir":"SW","speed":0.5}]}) },
  { n: 304, name: "Urchin", teaches: "a creature that never moves is a wall, not a key to fill", moment: "the urchin's key is not yours: fill around it", ...S({"start":"J","water":"J K I M L O 0 9 P","creatures":[{"type":"urchin","at":"O","mover":"still","speed":0},{"type":"crab","at":"9","mover":"dir","dir":"SE","speed":0.5}]}) },
  { n: 305, name: "Fish supper", teaches: "creatures eat each other; give a creature a key for a turn", moment: "the shark eats the fish for you; give it S once and fill S last", ...S({"start":"D","water":"D X Z E S R 4 5 A","creatures":[{"type":"fish","at":"Z","mover":"flee","speed":0.5,"prey":true},{"type":"shark","path":"A Z S X","loop":"pingpong","pathIndex":3,"speed":1}]}) },
  { n: 306, name: "Two sharks", teaches: "two routes at once; planned sacrifices", moment: "two sharks cross your keys: let each take one and refill behind them", ...S({"start":"K","water":"K M L I U O P Y J","creatures":[{"type":"shark","path":"U J M N H","loop":"pingpong","pathIndex":2,"speed":1},{"type":"shark","path":"U Y 6","loop":"pingpong","pathIndex":2,"speed":1}]}) },
  { n: 307, name: "Sleeping eel", teaches: "leave a sleeper asleep; let the food chain work", moment: "do not wake the eel: the shark swims onto its cave and eats it, then take 2 and 1 behind the shark", ...S({"start":"S","water":"S W Q 1 2 A Z X E","creatures":[{"type":"eel","at":"1","mover":"chase","speed":1,"cave":true,"wake":true},{"type":"shark","path":"2 1 Q","loop":"pingpong","pathIndex":0,"speed":1}]}) },
  { n: 308, name: "Growth", teaches: "a starfish grows the tank: when to take it", moment: "take the starfish early, while the crab walks away; let the shark take E once and fill it last", ...S({"start":"A","water":"A W Q 1 E D 2 R 4","required":"E","creatures":[{"type":"shark","path":"4 R E D","loop":"pingpong","pathIndex":0,"speed":1},{"type":"crab","at":"D","mover":"dir","dir":"E","speed":0.5}]}) },
  // ---- Rock garden: territory rules (2026-09-28), found by tools search (scratch gen2.mjs), picked by hand for a ramp.
  { n: 401, name: "Glider", teaches: "a ray takes every key it crosses in a press", moment: "fill the diagonal right after it passes; the rock turns it", ...S({"start":"T","water":"T 5 4 R E F C","rock":"V","creatures":[{"type":"ray","at":"E","mover":"dir","dir":"SW","speed":2,"sweep":true}]}) },
  { n: 402, name: "Slow lane", teaches: "a turtle is a wall that moves one key every other press", moment: "one wait lets it clear the row you need", ...S({"start":"Y","water":"Y U I 9 0 O","rock":"8 K","creatures":[{"type":"turtle","at":"I","mover":"dir","dir":"W","speed":0.5}]}) },
  { n: 403, name: "Crossfire", teaches: "two movers of different speeds", moment: "the crab rests while the ray sweeps: fill behind the ray, ahead of the crab", ...S({"start":"R","water":"R D E F W C 2 Q","rock":"V","creatures":[{"type":"ray","at":"W","mover":"dir","dir":"NE","speed":2,"sweep":true},{"type":"crab","at":"C","mover":"dir","dir":"SW","speed":0.5}]}) },
  { n: 404, name: "Dart", teaches: "a barracuda leaps two keys a press between rocks", moment: "the key it leaps over is safe every press", ...S({"start":"U","water":"U I Y 7 O J 8 0","rock":"T K","creatures":[{"type":"barracuda","at":"O","mover":"dir","dir":"W","speed":2}]}) },
  { n: 405, name: "Two speeds", teaches: "a ray and a turtle share a lane", moment: "the turtle blocks the ray's bounce: the lane changes shape as they meet", ...S({"start":"E","water":"E 4 5 R 3 F T D","rock":"Y","creatures":[{"type":"ray","at":"F","mover":"dir","dir":"NW","speed":2,"sweep":true},{"type":"turtle","at":"5","mover":"dir","dir":"W","speed":0.5}]}) },
  { n: 406, name: "Bloom", teaches: "a jellyfish blooms every other press; a turtle eats it", moment: "finish on a bloom press, or let the turtle eat it first", ...S({"start":"I","water":"I O J H Y K M B","rock":"N","creatures":[{"type":"jelly","at":"B","mover":"still","speed":0,"bloom":true,"phase":1},{"type":"turtle","at":"H","mover":"dir","dir":"E","speed":0.5}]}) },
  { n: 407, name: "Boulders", teaches: "rocks reroute a ray", moment: "the ray bounces off the boulders into a short loop: fill the long way round", ...S({"start":"W","water":"W Q E 1 D 3 R 2","rock":"4 X","creatures":[{"type":"ray","at":"1","mover":"dir","dir":"NW","speed":2,"sweep":true},{"type":"crab","at":"R","mover":"dir","dir":"E","speed":0.5}]}) },
  { n: 408, name: "Starlight", teaches: "a starfish grows the tank while a ray and a turtle roam", moment: "take the starfish while the ray is at the far end", ...S({"start":"Q","water":"Q A S D X 1 2 C 3","rock":"Z","required":"S","creatures":[{"type":"ray","at":"X","mover":"dir","dir":"SW","speed":2,"sweep":true},{"type":"turtle","at":"C","mover":"dir","dir":"W","speed":0.5}]}) },
  // ---- Currents: territory rules (2026-09-28), found by tools search (scratch gen2.mjs), picked by hand for a ramp.
  { n: 411, name: "First ink", teaches: "ink: Space shields your newest tentacle's ring for two presses", moment: "ink as the shark turns back, then fill its lane behind the cloud", ...S({"start":"5","water":"5 T 4 6 7 Y R 8","ink":1,"creatures":[{"type":"shark","path":"7 6 Y U","loop":"pingpong","pathIndex":1,"speed":1}]}) },
  { n: 412, name: "Ink and dart", teaches: "ink stops a barracuda dead", moment: "the cloud is a wall it bounces off", ...S({"start":"6","water":"6 5 T 7 8 R I 4 O","ink":1,"creatures":[{"type":"barracuda","at":"4","mover":"dir","dir":"E","speed":2}]}) },
  { n: 413, name: "Cloud cover", teaches: "one squirt, two threats", moment: "place the cloud where the ray and the shark both want to go", ...S({"start":"4","water":"4 5 E R T 3 6 W A","ink":1,"creatures":[{"type":"ray","at":"T","mover":"dir","dir":"W","speed":2,"sweep":true},{"type":"shark","path":"A Z LShift","loop":"pingpong","pathIndex":2,"speed":1}]}) },
  { n: 414, name: "Two squirts", teaches: "two inks, one crab that rests", moment: "the first ink buys the corner, the second buys the lane", ...S({"start":"7","water":"7 Y 6 T 5 U I O 9 4","ink":2,"creatures":[{"type":"shark","path":"I O 9 F8","loop":"pingpong","pathIndex":0,"speed":1},{"type":"crab","at":"5","mover":"dir","dir":"E","speed":0.5}]}) },
  { n: 415, name: "Snake charmer", teaches: "a sea snake's body is its own; ink holds it in place", moment: "ink the snake's head and fill along its body", ...S({"start":"3","water":"3 4 W Q R 5 A 2 T","ink":1,"creatures":[{"type":"snake","path":"T R 5 F4 F3 4","loop":"pingpong","pathIndex":3,"speed":1,"length":3}]}) },
  { n: 416, name: "Manta pair", teaches: "two rays; two inks", moment: "ink where their sweeps cross, then fill both lanes at once", ...S({"start":"8","water":"8 7 U H Y I 9 J 6 O","ink":2,"creatures":[{"type":"ray","at":"6","mover":"dir","dir":"NW","speed":2,"sweep":true},{"type":"ray","at":"H","mover":"dir","dir":"NW","speed":2,"sweep":true}]}) },
  { n: 417, name: "Coil and fin", teaches: "a snake and a shark share the top rows", moment: "the shark swims under the snake: fill the snake side first, ink for the shark", ...S({"start":"2","water":"2 W 3 E A R T 5 4 Q D","ink":1,"creatures":[{"type":"snake","path":"R T Y 7 8 F7","loop":"pingpong","pathIndex":2,"speed":1,"length":3},{"type":"shark","path":"E R T 5","loop":"pingpong","pathIndex":2,"speed":1}]}) },
  { n: 418, name: "Tidal star", teaches: "a starfish, a ray, a snake and two inks", moment: "grow the tank away from the ray, then ink the new water before the snake turns", ...S({"start":"1","water":"1 ` Q 2 W E 3 R A D S","required":"D","ink":2,"creatures":[{"type":"ray","at":"R","mover":"dir","dir":"SW","speed":2,"sweep":true},{"type":"snake","path":"S E R D","loop":"pingpong","pathIndex":2,"speed":1,"length":3}]}) },
  // ---- Caves: territory rules (2026-09-28), found by tools search (scratch gen2.mjs), picked by hand for a ramp.
  { n: 421, name: "Hunter", teaches: "an eel sleeps in its cave until you touch next to it, then hunts your tentacles", moment: "reef keys are the ones it cannot take: build from them", ...S({"start":"B","water":"B N V H","rock":"T","reef":"J F","cave":"R","creatures":[{"type":"eel","at":"R","mover":"chase","speed":1,"cave":true,"wake":true}]}) },
  { n: 422, name: "Pulse", teaches: "a jellyfish in the dark; a cave key is safe", moment: "finish on a bloom press", ...S({"start":"N","water":"N B J M , K L H","cave":"Y","creatures":[{"type":"jelly","at":"L","mover":"still","speed":0,"bloom":true,"phase":0}]}) },
  { n: 423, name: "Coils", teaches: "a snake winding through a cave", moment: "the cave key is safe under its body", ...S({"start":"V","water":"V C F B Y N J M","reef":"T","cave":"X","creatures":[{"type":"snake","path":"M K J N","loop":"pingpong","pathIndex":3,"speed":1,"length":3}]}) },
  { n: 424, name: "Hunted", teaches: "an eel and a shark; the shark eats the eel", moment: "lead the eel into the shark's lane", ...S({"start":"M","water":"M J I , K N L B","cave":"H O","creatures":[{"type":"eel","at":"H","mover":"chase","speed":1,"cave":true,"wake":true},{"type":"shark","path":"I K J","loop":"pingpong","pathIndex":0,"speed":1}]}) },
  { n: 425, name: "Slow supper", teaches: "a turtle eats a jellyfish", moment: "fill the far side while the turtle walks in; the ring is yours after the meal", ...S({"start":"C","water":"C F D S V T X E W","reef":"R","creatures":[{"type":"jelly","at":"T","mover":"still","speed":0,"bloom":true,"phase":1},{"type":"turtle","at":"E","mover":"dir","dir":"E","speed":0.5}]}) },
  { n: 426, name: "Two dens", teaches: "a snake and a jellyfish, a cave to hide in", moment: "the cave key is safe from both; finish on a bloom press", ...S({"start":",","water":", M L K I O J U ;","cave":"H","creatures":[{"type":"snake","path":"; P [ -","loop":"pingpong","pathIndex":3,"speed":1,"length":3},{"type":"jelly","at":";","mover":"still","speed":0,"bloom":true,"phase":0}]}) },
  { n: 427, name: "Blackout", teaches: "jellyfish, turtle and ray in the dark", moment: "the turtle eats the jellyfish if you give it time; the ray sweeps the top", ...S({"start":"X","water":"X S D C F R E Z T A","cave":"Y","creatures":[{"type":"jelly","at":"E","mover":"still","speed":0,"bloom":true,"phase":1},{"type":"turtle","at":"R","mover":"dir","dir":"W","speed":0.5},{"type":"ray","at":"T","mover":"dir","dir":"SE","speed":2,"sweep":true}]}) },
  { n: 428, name: "Deep star", teaches: "a starfish, a snake and a turtle", moment: "grow the tank away from the snake; let the turtle hold a key", ...S({"start":"Z","water":"Z X S C V R F T D W Q","cave":"E","required":"S","creatures":[{"type":"snake","path":"R E W Q","loop":"pingpong","pathIndex":2,"speed":1,"length":3},{"type":"turtle","at":"D","mover":"dir","dir":"E","speed":0.5}]}) },
  // ---- The rim: territory rules (2026-09-28), found by tools search (scratch gen2.mjs), picked by hand for a ramp.
  { n: 431, name: "Edge", teaches: "the wide keys touch many; a shark and a ray on the edge", moment: "ink the corner the ray sweeps", ...S({"start":"Tab","water":"Tab Caps 1 A Q S ` W X","ink":1,"creatures":[{"type":"shark","path":"X Z S","loop":"pingpong","pathIndex":1,"speed":1},{"type":"ray","at":"S","mover":"dir","dir":"W","speed":2,"sweep":true}]}) },
  { n: 432, name: "Lock", teaches: "a snake and a crab among the modifier keys", moment: "Ctrl and Alt are one wide key each: fill them last", ...S({"start":"Caps","water":"Caps LShift LCtrl Z S LAlt A LWin X D","ink":1,"creatures":[{"type":"snake","path":"S E D X","loop":"pingpong","pathIndex":2,"speed":1,"length":3},{"type":"crab","at":"LWin","mover":"dir","dir":"NE","speed":0.5}]}) },
  { n: 433, name: "Big tank", teaches: "Space touches everything below the home row; a ray and a turtle", moment: "no ink here, Space is water: fill the bottom row behind the turtle", ...S({"start":"Space","water":"Space B , L ; / M N H P","creatures":[{"type":"ray","at":";","mover":"dir","dir":"NE","speed":2,"sweep":true},{"type":"turtle","at":"H","mover":"dir","dir":"W","speed":0.5}]}) },
  { n: 434, name: "Corner den", teaches: "the modifier keys are wide; a ray and a jellyfish, one ink", moment: "ink from Ctrl and fill the wide keys inside the cloud", ...S({"start":"LCtrl","water":"LCtrl LShift Caps A Tab LWin LAlt W S","cave":"Q","ink":1,"creatures":[{"type":"ray","at":"Caps","mover":"dir","dir":"E","speed":2,"sweep":true},{"type":"jelly","at":"Tab","mover":"still","speed":0,"bloom":true,"phase":1}]}) },
  { n: 435, name: "Escape", teaches: "a ray and a long snake along the top row, one ink", moment: "ink beside Esc and fill the F-row while the snake is away", ...S({"start":"Esc","water":"Esc ` 1 2 W F1 E 3 4","ink":1,"creatures":[{"type":"ray","at":"2","mover":"dir","dir":"W","speed":2,"sweep":true},{"type":"snake","path":"4 3 E D F R","loop":"pingpong","pathIndex":3,"speed":1,"length":3}]}) },
  { n: 436, name: "Enter", teaches: "a shark under a jellyfish, wide keys on the right", moment: "the Menu rock turns the shark: fill Enter's side first", ...S({"start":"Enter","water":"Enter RShift RWin RCtrl RAlt ' / ] Space [","reef":"Menu","creatures":[{"type":"shark","path":"RAlt Space N M K","loop":"pingpong","pathIndex":2,"speed":1},{"type":"jelly","at":"[","mover":"still","speed":0,"bloom":true,"phase":0}]}) },
  { n: 437, name: "F-row", teaches: "the F-row gaps are channels; two rays and a turtle", moment: "the rays cannot cross the gaps: fill each F-row block as they leave it", ...S({"start":"F1","water":"F1 F2 F3 3 F4 5 T W E A Y","ink":1,"creatures":[{"type":"ray","at":"E","mover":"dir","dir":"NE","speed":2,"sweep":true},{"type":"ray","at":"T","mover":"dir","dir":"NE","speed":2,"sweep":true},{"type":"turtle","at":"W","mover":"dir","dir":"E","speed":0.5}]}) },
  { n: 438, name: "Alt+F4", teaches: "everything at once: a long snake, a ray, a jellyfish, a starfish and two inks; the last press closes the window", moment: "ink first, grow the tank on the far side, finish on the bloom", ...S({"start":"F4","water":"F4 5 R E 3 S F T W 4 A 6","required":"6","ink":2,"creatures":[{"type":"snake","path":"R F T 5","loop":"pingpong","pathIndex":2,"speed":1,"length":3},{"type":"ray","at":"3","mover":"dir","dir":"SE","speed":2,"sweep":true},{"type":"jelly","at":"6","mover":"still","speed":0,"bloom":true,"phase":1}]}) },
  // ---- the Hatchery: the tutorial (zone.tutorial), territory rules since 2026-09-28. Played first, in order; a loss
  // retries the tank; coach lines walk through it (gdot.js, coach). Chosen from two designs ("see it, then use it").
  { n: 101, name: "Fill", teaches: "the first press and holding a key; tentacles stay; fill every key (the tray counts them, par is shown); fog and reach", moment: "the coach stops naming keys after the third press: you find the last ones yourself", ...S({"start":"L","water":"L K J ; '","coach":{"1":"It stays there. Tap {K} to put down the next one.","2":"The whole tank is in view now. Tap {J}.","3":"The tray counts to {goal}: every key in the tank. Fill the rest.","4":"One more key fills the tray. Find it.","letgo":"{G.} tries again.","fog":"{fog} Fog: only keys next to a {tentacle} are open.","algae":"{algae} Algae: nothing to grip, and not yours to fill.","reach":"Only keys next to a {tentacle}, or the one you just lifted.","ready":"{Hold} {L} to put down your first {tentacle}. {hold}","start":"Your first {tentacle} goes on {L}, the pulsing key.","lift":"Tapping a {tentacle} lifts it. Tap it again to put it back.","won":"Every key is yours: clear! Par, top right, is the fewest presses."}}) },
  { n: 102, name: "Taken", teaches: "creature arrows; a creature takes a key, not your life; the key is free again once it leaves", moment: "let the shark take 0 while you fill past it, then fill 0 again once it swims off", ...S({"start":"9","water":"9 0 - =","creatures":[{"type":"shark","path":"O 0 P [","loop":"pingpong","pathIndex":5}],"coach":{"1":"A {shark}! Its arrow shows its next key. Tap {0}: it swims off first.","2":"Now its arrow points at your {tentacle} on {~0}. Let it: tap {-}.","3":"{~0} is the {shark}'s while it sits there. Tap {=}.","4":"The {shark} left: {0} is free again. Fill it.","letgo":"{G.} tries again.","fog":"{fog} Fog: only keys next to a {tentacle} are open.","algae":"{algae} Algae: nothing to grip, and not yours to fill.","reach":"Only keys next to a {tentacle}, or the one you just lifted.","overrun":"Every {tentacle} was taken, so the tank starts over. {G.} tries again.","ready":"Each tank starts on its own key. {Hold} {9}. {hold}","start":"This tank starts on {9}, the pulsing key.","taken":"Taken! A creature takes the key, never your life.","lift":"Tapping a {tentacle} lifts it. Tap it again to put it back.","won":"Clear! A taken key is only a key to fill again."}}) },
  { n: 103, name: "Wait", teaches: "lifting is a press; lift and put back = a two-press wait while the sharks settle", moment: "both sharks return to keys you do not need: wait two presses and they hold them for you", ...S({"start":"P","water":"P O 9 I ; [","creatures":[{"type":"shark","path":"I U Y H","loop":"pingpong","pathIndex":1},{"type":"shark","path":"9 F7","loop":"pingpong","pathIndex":1}],"coach":{"1":"Tap {;}.","2":"Tap {[}.","3":"Tap {O}.","4":"Both {shark}s come back to {~I} and {~9}: let them have those. Wait: tap {O} to lift it.","5":"Put {O} back.","ready":"Each tank starts on its own key. {Hold} {P}. Two {shark}s pass through here. {hold}","start":"This tank starts on {P}, the pulsing key.","lift":"A lift is a press too: they moved. Put {O} back.","won":"Clear, with the {shark}s on {~I} and {~9}: a creature's key counts as its own. Lift and put back is how you wait: two presses.","taken":"Taken: that press only waited. The key is free once it leaves.","letgo":"Keep another key held while you tap one. {G.} tries again.","overrun":"Every {tentacle} was taken, so the tank starts over. {G.} tries again.","algae":"{algae} Algae: nothing to grip, and not yours to fill.","reach":"Only keys next to a {tentacle}."}}) },
  { n: 104, name: "Its own", teaches: "a creature's key counts as its own at the end", moment: "fill everything else first; the shark ends on [ and the tank clears with [ never filled", ...S({"start":"0","water":"0 - P = [","creatures":[{"type":"shark","path":"= [","loop":"pingpong","pathIndex":1}],"coach":{"1":"Tap {-} and see what swims here.","2":"It always sits on {~[} or {~=}. Leave those for last: tap {P}.","3":"Now take {=} as it leaves. The key it lands on counts as its own.","letgo":"{G.} tries again.","fog":"{fog} Fog: only keys next to a {tentacle} are open.","algae":"{algae} Algae: nothing to grip, and not yours to fill.","reach":"Only keys next to a {tentacle}, or the one you just lifted.","overrun":"Every {tentacle} was taken, so the tank starts over. {G.} tries again.","ready":"Each tank starts on its own key. {Hold} {0}. {hold}","start":"This tank starts on {0}, the pulsing key.","taken":"Taken: it keeps coming back. Leave {~[} and {~=} for last.","lift":"Tapping a {tentacle} lifts it. Tap it again to put it back: a wait.","won":"Clear with {~[} unfilled: you let the {shark} hold it."}}) },
  { n: 105, name: "Starfish", teaches: "a held starfish turns the algae around it into water; aim for par", moment: "the starfish pulls the shark's key into the tank: leave that one to the shark", ...S({"start":"/","water":"/ ' [","required":"[","creatures":[{"type":"shark","path":"] Enter","loop":"pingpong","pathIndex":1}],"coach":{"1":"Tap {'} and look around.","2":"A {starfish}! Tap {[} and watch the {algae} around it.","3":"Par is {par}. Fill the new keys, and let the {shark} hold one.","letgo":"{G.} tries again.","fog":"{fog} Fog: only keys next to a {tentacle} are open.","algae":"{algae} Algae: nothing to grip, and not yours to fill.","reach":"Only keys next to a {tentacle}, or the one you just lifted.","overrun":"Every {tentacle} was taken, so the tank starts over. {G.} tries again.","ready":"Each tank starts on its own key. {Hold} {/}. {hold}","start":"This tank starts on {/}, the pulsing key.","grow":"The {starfish} turned the algae around it into water: more to fill.","taken":"Taken: it comes back to {~]} every other press. Leave that key to it.","lift":"Tapping a {tentacle} lifts it. Tap it again to put it back: a wait.","won":"Clear! Every tank has a par now. {G.} goes to the Shallows. {next}"}}) },
];

/* ================= zones ================= */
// The Hatchery (the tutorial, played first by a new player), then five zones of eight tanks, each named after a row of keys. Order inside a zone is the order the
// tanks come up in (dying sends you to the unbeaten tank you played longest ago, ties in this order).
export const ZONES = [
  { id: 'hatchery', name: 'Hatchery', env: 'kelp', tutorial: true, rules: 'territory', keys: codes('L 9 P 0 /'),
    tanks: ['Fill','Taken','Wait','Its own','Starfish'] },
  { id: 'shallows', name: 'Shallows', env: 'sand', region: 'letters', rules: 'territory', keys: codes('G H F J D K S A'),
    tanks: ['Pacing','Round trip','Slow crab','Urchin','Fish supper','Two sharks','Sleeping eel','Growth'] },
  { id: 'rock-garden', name: 'Rock garden', env: 'stone', region: 'all', rules: 'territory', keys: codes('T Y R U E I W Q'),
    tanks: ['Glider','Slow lane','Crossfire','Dart','Two speeds','Bloom','Boulders','Starlight'] },
  { id: 'currents', name: 'Currents', env: 'blue', region: 'all', rules: 'territory', keys: codes('5 6 4 7 3 8 2 1'),
    tanks: ['First ink','Ink and dart','Cloud cover','Two squirts','Snake charmer','Manta pair','Coil and fin','Tidal star'] },
  { id: 'caves', name: 'Caves', env: 'dark', region: 'all', rules: 'territory', keys: codes('B N V M C , X Z'),
    tanks: ['Hunter','Pulse','Coils','Hunted','Slow supper','Two dens','Blackout','Deep star'] },
  { id: 'the-rim', name: 'The rim', env: 'deep', region: 'all', rules: 'territory', keys: codes('Tab Caps Space LCtrl Esc Enter F1 F4'), finale: 'Alt+F4',
    tanks: ['Edge','Lock','Big tank','Corner den','Escape','Enter','F-row','Alt+F4'] },
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
  if (slot && slot.zone.rules === 'territory') { const l = res.levels[0].level; l.tank = [...GDOT.tankWater(l)]; const r = GDOT.solvePar(GDOT.resolveLevel(l, { rules: 'territory' }), { budget: opts.parBudget || 600000 }); if (r.solved) l.par = r.par; }
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
  for (const c of g.creatures) at[c.pos] = { shark: 'S', barracuda: 'B', crab: 'C', eel: 'E', urchin: 'U', fish: 'F', snake: 'N', ray: 'R', jelly: 'J', turtle: 'T', seal: 'L', pilot: 'P' }[c.type] || '?';
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
    const zonesOut = zoneMeta().map(z => { const f = fileZones.find(q => q.id === z.id); if (!f) return z; const o = { ...f, keys: z.keys }; if (z.rules) o.rules = z.rules; else delete o.rules; if (z.tutorial) o.tutorial = true; return o; });
    for (const f of fileZones) if (!zonesOut.some(z => z.id === f.id)) zonesOut.push(f);
    if (extra.length) console.error(`kept ${extra.length} tank(s) the campaign does not own: ${extra.map(l => l.name).join(', ')}`);
    fs.writeFileSync(LEVELS_JS, GDOT.levelsSource(zonesOut, out.concat(extra)));
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli();
