// G. — renderer, input, audio, zones and editor. The rules (keyboard model, creatures, turn loop)
// live in engine.js as window.GDOT; the zones and levels are in levels.js.
//
// Play draws every event on the keys (who bit which tentacle and where it came from, what got eaten,
// what woke) or in the icon strip under the tank. The only sentences are the coach line under the tank:
// the tutorial's steps and a tip the first time you meet something. The same events are spoken as text
// to screen readers (#say).
const {KEYS,KEYMAP,NEI,ROWY,PRESETS,TYPES,TARGETS,L,slug}=window.GDOT;

/* ================= icons ================= */
const ICON={
  tentacle:'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 16c0-6 3-10 8-10 3 0 4 2 4 4s-2 3-3 2" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="6" cy="9.2" r="1.5" fill="currentColor"/><circle cx="9" cy="6.6" r="1.5" fill="currentColor"/><circle cx="13" cy="6.3" r="1.5" fill="currentColor"/></svg>',
  shark:'<svg viewBox="0 0 24 16" aria-hidden="true"><path d="M1 10 Q6 4 11 3 L13 9 L21 9 L23 12 L2 12 Z" fill="currentColor"/><path d="M3.5 12 l1.2-2 1.2 2 1.2-2 1.2 2" fill="none" stroke="#fff" stroke-width="1.1"/></svg>',
  barracuda:'<svg viewBox="0 0 24 16" aria-hidden="true"><path d="M4 8 L15 4.5 L23 8 L15 11.5 Z M4 8 L0 3.5 L5 8 L0 12.5 Z" fill="currentColor"/><circle cx="19" cy="7.5" r="1" fill="#fff"/></svg>',
  crab:'<svg viewBox="0 0 24 16" aria-hidden="true"><ellipse cx="12" cy="10" rx="6" ry="4" fill="currentColor"/><circle cx="4" cy="5" r="2.4" fill="currentColor"/><circle cx="20" cy="5" r="2.4" fill="currentColor"/><path d="M6 8 L4.5 6.5 M18 8 L19.5 6.5 M7 13 L4 15 M10 14 L9 16 M14 14 L15 16 M17 13 L20 15" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>',
  eel:'<svg viewBox="0 0 24 16" aria-hidden="true"><path d="M2 12 C5 2 9 18 13 8 S20 2 23 8" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/><circle cx="21" cy="7" r="1" fill="#fff"/></svg>',
  urchin:'<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="4" fill="currentColor"/><path d="M10 1 V5 M10 15 V19 M1 10 H5 M15 10 H19 M3.6 3.6 L6.5 6.5 M13.5 13.5 L16.4 16.4 M16.4 3.6 L13.5 6.5 M6.5 13.5 L3.6 16.4" stroke="currentColor" stroke-width="1.6"/></svg>',
  fish:'<svg viewBox="0 0 24 16" aria-hidden="true"><path d="M3 8 Q9 1 16 8 Q9 15 3 8 Z M16 8 L22 3 L22 13 Z" fill="currentColor"/><circle cx="6" cy="7" r="1" fill="#fff"/></svg>',
  seal:'<svg viewBox="0 0 24 16" aria-hidden="true"><path d="M1 12 Q3 6 10 5 Q16 4.5 19 7 L23 6 L22 9 L19.5 10 Q14 14 7 13 L2 14.5 Z" fill="currentColor"/><circle cx="17" cy="7.2" r="1" fill="#fff"/><path d="M8 13 L6 15.5 M12 13 L12.5 15.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  pilot:'<svg viewBox="0 0 24 16" aria-hidden="true"><path d="M4 8 Q10 3 16 8 Q10 13 4 8 Z M16 8 L21 4.5 L21 11.5 Z" fill="currentColor"/><path d="M8 5.2 V10.8 M11.5 4.8 V11.2" stroke="#fff" stroke-width="1.3"/></svg>',
  algae:'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 18c0-5-2-7 0-11M10 18c0-6 3-8 1-13M15 18c0-4-2-6 0-9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  rock:'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 16 L4 8 L10 3 L16 7 L18 15 Z" fill="currentColor"/><path d="M6 12 L9 9 M11 13 L14 10" stroke="#fff" stroke-opacity=".5" stroke-width="1.2"/></svg>',
  reef:'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 19 V10 M10 13 L5 8 M5 8 L3 9 M5 8 L6 5 M10 11 L14 6 M14 6 L17 5 M14 6 L13 3" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  cave:'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 18 V10 A8 8 0 0 1 18 10 V18 Z" fill="currentColor"/><path d="M6 18 V12 A4 4 0 0 1 14 12 V18 Z" fill="#c9cfd2"/></svg>',
  water:'<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3" width="14" height="14" fill="#e3e7e9" stroke="#7c878d"/></svg>',
  start:'<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="10" cy="10" r="2" fill="currentColor"/></svg>',
  // the starfish marks a key you must hold to clear the tank
  starfish:'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8.12 7.91 Q8.57 5.17 9.13 2.25 Q10.00 0.70 10.87 2.25 Q11.43 5.17 11.88 7.91 Q14.52 7.79 17.32 7.54 Q19.04 7.91 17.78 9.13 Q15.27 10.41 13.01 11.59 Q14.27 14.09 15.51 16.84 Q15.68 18.61 14.07 17.85 Q11.91 15.74 9.94 13.70 Q8.32 15.37 6.39 17.30 Q4.86 18.13 5.05 16.40 Q6.12 13.88 6.99 11.59 Q4.61 10.31 2.05 8.95 Q0.82 7.69 2.54 7.34 Q5.43 7.64 8.07 7.94Z" fill="currentColor"/><g fill="#fff" fill-opacity=".5"><circle cx="10.00" cy="6.76" r=".8"/><circle cx="10.00" cy="4.63" r=".62"/><circle cx="13.43" cy="9.52" r=".8"/><circle cx="15.39" cy="8.95" r=".62"/><circle cx="12.17" cy="13.60" r=".8"/><circle cx="13.41" cy="15.37" r=".62"/><circle cx="8.05" cy="13.39" r=".8"/><circle cx="6.94" cy="15.04" r=".62"/><circle cx="6.51" cy="9.43" r=".8"/><circle cx="4.51" cy="8.82" r=".62"/><circle cx="10" cy="10.5" r="1.5"/></g><circle cx="10" cy="10.5" r=".7" fill="currentColor"/></svg>',
  req:'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 4 H17 M3 16 H17" stroke="currentColor" stroke-width="3"/><path d="M10 4 V16" stroke="currentColor" stroke-width="2" stroke-dasharray="2 2"/></svg>',
  creature:'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 10 L10 3 L18 10 L10 17 Z" fill="currentColor"/></svg>',
  bones:'<svg viewBox="0 0 24 16" aria-hidden="true"><path d="M4 8 H18 M7 4 V12 M10 3.5 V12.5 M13 4 V12 M16 5 V11 M18 8 L22 4 M18 8 L22 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="3.5" cy="8" r="2" fill="currentColor"/></svg>',
  arrow:'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 10 H15 M10 4.5 L16 10 L10 15.5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  up:'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 17 V4 M4.5 9.5 L10 4 L15.5 9.5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  lock:'<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="9" width="12" height="9" rx="1.5" fill="currentColor"/><path d="M7 9 V6.5 a3 3 0 0 1 6 0 V9" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>',
  star:'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 1.8 L12.5 7.2 18.3 7.8 13.9 11.6 15.2 17.4 10 14.4 4.8 17.4 6.1 11.6 1.7 7.8 7.5 7.2 Z" fill="currentColor"/></svg>',
  q:'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6.8 7 a3.2 3.2 0 1 1 4.6 2.9 c-1.1 .6-1.4 1.2-1.4 2.4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="10" cy="15.8" r="1.5" fill="currentColor"/></svg>',
  bang:'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5 V12" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/><circle cx="10" cy="16.3" r="1.8" fill="currentColor"/></svg>',
  plus:'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4 V16 M4 10 H16" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  again:'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M15.5 10 a5.5 5.5 0 1 1 -1.8 -4.1" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M11.5 3.5 L15 5.5 L12.5 8.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  slash:'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 16 L16 4" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
};
// Pixel sprites (16x10, drawn facing right): the creatures, the terrain, your tentacle, the ink cloud.
const SPRITES={"shark":"<svg viewBox=\"0 0 16 10\" shape-rendering=\"crispEdges\" aria-hidden=\"true\"><rect x=\"7\" y=\"1\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"7\" y=\"2\" width=\"3\" height=\"1\" fill=\"currentColor\"/><rect x=\"1\" y=\"3\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"7\" y=\"3\" width=\"4\" height=\"1\" fill=\"currentColor\"/><rect x=\"1\" y=\"4\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"4\" y=\"4\" width=\"10\" height=\"1\" fill=\"currentColor\"/><rect x=\"2\" y=\"5\" width=\"13\" height=\"1\" fill=\"currentColor\"/><rect x=\"1\" y=\"6\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"4\" y=\"6\" width=\"10\" height=\"1\" fill=\"currentColor\"/><rect x=\"14\" y=\"6\" width=\"1\" height=\"1\" fill=\"#fff\" fill-opacity=\".7\"/><rect x=\"15\" y=\"6\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"1\" y=\"7\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"5\" y=\"7\" width=\"5\" height=\"1\" fill=\"currentColor\"/><rect x=\"6\" y=\"8\" width=\"2\" height=\"1\" fill=\"currentColor\"/></svg>","fish":"<svg viewBox=\"0 0 16 10\" shape-rendering=\"crispEdges\" aria-hidden=\"true\"><rect x=\"7\" y=\"1\" width=\"4\" height=\"1\" fill=\"currentColor\"/><rect x=\"5\" y=\"2\" width=\"8\" height=\"1\" fill=\"currentColor\"/><rect x=\"1\" y=\"3\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"4\" y=\"3\" width=\"4\" height=\"1\" fill=\"currentColor\"/><rect x=\"8\" y=\"3\" width=\"1\" height=\"1\" fill=\"#fff\" fill-opacity=\".7\"/><rect x=\"9\" y=\"3\" width=\"5\" height=\"1\" fill=\"currentColor\"/><rect x=\"1\" y=\"4\" width=\"14\" height=\"1\" fill=\"currentColor\"/><rect x=\"1\" y=\"5\" width=\"14\" height=\"1\" fill=\"currentColor\"/><rect x=\"1\" y=\"6\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"4\" y=\"6\" width=\"10\" height=\"1\" fill=\"currentColor\"/><rect x=\"5\" y=\"7\" width=\"8\" height=\"1\" fill=\"currentColor\"/><rect x=\"7\" y=\"8\" width=\"4\" height=\"1\" fill=\"currentColor\"/></svg>","crab":"<svg viewBox=\"0 0 16 10\" shape-rendering=\"crispEdges\" aria-hidden=\"true\"><rect x=\"1\" y=\"0\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"13\" y=\"0\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"1\" y=\"1\" width=\"3\" height=\"1\" fill=\"currentColor\"/><rect x=\"12\" y=\"1\" width=\"3\" height=\"1\" fill=\"currentColor\"/><rect x=\"2\" y=\"2\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"12\" y=\"2\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"3\" y=\"3\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"6\" y=\"3\" width=\"1\" height=\"1\" fill=\"#fff\" fill-opacity=\".7\"/><rect x=\"9\" y=\"3\" width=\"1\" height=\"1\" fill=\"#fff\" fill-opacity=\".7\"/><rect x=\"11\" y=\"3\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"4\" y=\"4\" width=\"8\" height=\"1\" fill=\"currentColor\"/><rect x=\"2\" y=\"5\" width=\"12\" height=\"1\" fill=\"currentColor\"/><rect x=\"1\" y=\"6\" width=\"14\" height=\"1\" fill=\"currentColor\"/><rect x=\"2\" y=\"7\" width=\"12\" height=\"1\" fill=\"currentColor\"/><rect x=\"2\" y=\"8\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"4\" y=\"8\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"6\" y=\"8\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"9\" y=\"8\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"11\" y=\"8\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"13\" y=\"8\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"1\" y=\"9\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"4\" y=\"9\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"7\" y=\"9\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"9\" y=\"9\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"12\" y=\"9\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"15\" y=\"9\" width=\"1\" height=\"1\" fill=\"currentColor\"/></svg>","eel":"<svg viewBox=\"0 0 16 10\" shape-rendering=\"crispEdges\" aria-hidden=\"true\"><rect x=\"4\" y=\"1\" width=\"3\" height=\"1\" fill=\"currentColor\"/><rect x=\"3\" y=\"2\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"6\" y=\"2\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"12\" y=\"2\" width=\"3\" height=\"1\" fill=\"currentColor\"/><rect x=\"2\" y=\"3\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"7\" y=\"3\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"11\" y=\"3\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"14\" y=\"3\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"15\" y=\"3\" width=\"1\" height=\"1\" fill=\"#fff\" fill-opacity=\".7\"/><rect x=\"0\" y=\"4\" width=\"3\" height=\"1\" fill=\"currentColor\"/><rect x=\"8\" y=\"4\" width=\"4\" height=\"1\" fill=\"currentColor\"/><rect x=\"14\" y=\"4\" width=\"2\" height=\"1\" fill=\"currentColor\"/></svg>","urchin":"<svg viewBox=\"0 0 16 10\" shape-rendering=\"crispEdges\" aria-hidden=\"true\"><rect x=\"4\" y=\"0\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"7\" y=\"0\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"10\" y=\"0\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"1\" y=\"1\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"5\" y=\"1\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"7\" y=\"1\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"9\" y=\"1\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"13\" y=\"1\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"2\" y=\"2\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"5\" y=\"2\" width=\"5\" height=\"1\" fill=\"currentColor\"/><rect x=\"12\" y=\"2\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"3\" y=\"3\" width=\"7\" height=\"1\" fill=\"currentColor\"/><rect x=\"11\" y=\"3\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"0\" y=\"4\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"3\" y=\"4\" width=\"9\" height=\"1\" fill=\"currentColor\"/><rect x=\"14\" y=\"4\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"3\" y=\"5\" width=\"9\" height=\"1\" fill=\"currentColor\"/><rect x=\"13\" y=\"5\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"2\" y=\"6\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"5\" y=\"6\" width=\"5\" height=\"1\" fill=\"currentColor\"/><rect x=\"12\" y=\"6\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"1\" y=\"7\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"5\" y=\"7\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"7\" y=\"7\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"9\" y=\"7\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"13\" y=\"7\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"4\" y=\"8\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"7\" y=\"8\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"10\" y=\"8\" width=\"1\" height=\"1\" fill=\"currentColor\"/></svg>","barracuda":"<svg viewBox=\"0 0 16 10\" shape-rendering=\"crispEdges\" aria-hidden=\"true\"><rect x=\"10\" y=\"2\" width=\"3\" height=\"1\" fill=\"currentColor\"/><rect x=\"1\" y=\"3\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"4\" y=\"3\" width=\"11\" height=\"1\" fill=\"currentColor\"/><rect x=\"1\" y=\"4\" width=\"14\" height=\"1\" fill=\"currentColor\"/><rect x=\"15\" y=\"4\" width=\"1\" height=\"1\" fill=\"#fff\" fill-opacity=\".7\"/><rect x=\"1\" y=\"5\" width=\"15\" height=\"1\" fill=\"currentColor\"/><rect x=\"1\" y=\"6\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"4\" y=\"6\" width=\"11\" height=\"1\" fill=\"currentColor\"/><rect x=\"10\" y=\"7\" width=\"3\" height=\"1\" fill=\"currentColor\"/></svg>","seal":"<svg viewBox=\"0 0 16 10\" shape-rendering=\"crispEdges\" aria-hidden=\"true\"><rect x=\"10\" y=\"1\" width=\"4\" height=\"1\" fill=\"currentColor\"/><rect x=\"8\" y=\"2\" width=\"6\" height=\"1\" fill=\"currentColor\"/><rect x=\"14\" y=\"2\" width=\"1\" height=\"1\" fill=\"#fff\" fill-opacity=\".7\"/><rect x=\"5\" y=\"3\" width=\"10\" height=\"1\" fill=\"currentColor\"/><rect x=\"3\" y=\"4\" width=\"12\" height=\"1\" fill=\"currentColor\"/><rect x=\"2\" y=\"5\" width=\"13\" height=\"1\" fill=\"currentColor\"/><rect x=\"1\" y=\"6\" width=\"14\" height=\"1\" fill=\"currentColor\"/><rect x=\"2\" y=\"7\" width=\"3\" height=\"1\" fill=\"currentColor\"/><rect x=\"8\" y=\"7\" width=\"3\" height=\"1\" fill=\"currentColor\"/><rect x=\"1\" y=\"8\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"3\" y=\"8\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"7\" y=\"8\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"10\" y=\"8\" width=\"1\" height=\"1\" fill=\"currentColor\"/></svg>","pilot":"<svg viewBox=\"0 0 16 10\" shape-rendering=\"crispEdges\" aria-hidden=\"true\"><rect x=\"7\" y=\"2\" width=\"4\" height=\"1\" fill=\"currentColor\"/><rect x=\"1\" y=\"3\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"5\" y=\"3\" width=\"3\" height=\"1\" fill=\"currentColor\"/><rect x=\"8\" y=\"3\" width=\"1\" height=\"1\" fill=\"#fff\" fill-opacity=\".7\"/><rect x=\"9\" y=\"3\" width=\"3\" height=\"1\" fill=\"currentColor\"/><rect x=\"1\" y=\"4\" width=\"4\" height=\"1\" fill=\"currentColor\"/><rect x=\"5\" y=\"4\" width=\"1\" height=\"1\" fill=\"#fff\" fill-opacity=\".7\"/><rect x=\"6\" y=\"4\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"7\" y=\"4\" width=\"1\" height=\"1\" fill=\"#fff\" fill-opacity=\".7\"/><rect x=\"8\" y=\"4\" width=\"4\" height=\"1\" fill=\"currentColor\"/><rect x=\"1\" y=\"5\" width=\"4\" height=\"1\" fill=\"currentColor\"/><rect x=\"5\" y=\"5\" width=\"1\" height=\"1\" fill=\"#fff\" fill-opacity=\".7\"/><rect x=\"6\" y=\"5\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"7\" y=\"5\" width=\"1\" height=\"1\" fill=\"#fff\" fill-opacity=\".7\"/><rect x=\"8\" y=\"5\" width=\"4\" height=\"1\" fill=\"currentColor\"/><rect x=\"1\" y=\"6\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"5\" y=\"6\" width=\"7\" height=\"1\" fill=\"currentColor\"/><rect x=\"7\" y=\"7\" width=\"4\" height=\"1\" fill=\"currentColor\"/></svg>","snake":"<svg viewBox=\"0 0 16 10\" shape-rendering=\"crispEdges\" aria-hidden=\"true\"><rect x=\"5\" y=\"2\" width=\"6\" height=\"1\" fill=\"currentColor\"/><rect x=\"4\" y=\"3\" width=\"8\" height=\"1\" fill=\"currentColor\"/><rect x=\"12\" y=\"3\" width=\"1\" height=\"1\" fill=\"#fff\" fill-opacity=\".7\"/><rect x=\"13\" y=\"3\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"3\" y=\"4\" width=\"11\" height=\"1\" fill=\"currentColor\"/><rect x=\"14\" y=\"4\" width=\"1\" height=\"1\" fill=\"#fff\" fill-opacity=\".7\"/><rect x=\"4\" y=\"5\" width=\"11\" height=\"1\" fill=\"currentColor\"/><rect x=\"5\" y=\"6\" width=\"8\" height=\"1\" fill=\"currentColor\"/><rect x=\"6\" y=\"7\" width=\"6\" height=\"1\" fill=\"currentColor\"/></svg>","seg":"<svg viewBox=\"0 0 16 10\" shape-rendering=\"crispEdges\" aria-hidden=\"true\"><rect x=\"5\" y=\"3\" width=\"6\" height=\"1\" fill=\"currentColor\"/><rect x=\"4\" y=\"4\" width=\"8\" height=\"1\" fill=\"currentColor\"/><rect x=\"4\" y=\"5\" width=\"3\" height=\"1\" fill=\"currentColor\"/><rect x=\"7\" y=\"5\" width=\"1\" height=\"1\" fill=\"#fff\" fill-opacity=\".7\"/><rect x=\"8\" y=\"5\" width=\"4\" height=\"1\" fill=\"currentColor\"/><rect x=\"5\" y=\"6\" width=\"6\" height=\"1\" fill=\"currentColor\"/></svg>","ray":"<svg viewBox=\"0 0 16 10\" shape-rendering=\"crispEdges\" aria-hidden=\"true\"><rect x=\"7\" y=\"1\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"5\" y=\"2\" width=\"6\" height=\"1\" fill=\"currentColor\"/><rect x=\"3\" y=\"3\" width=\"10\" height=\"1\" fill=\"currentColor\"/><rect x=\"1\" y=\"4\" width=\"14\" height=\"1\" fill=\"currentColor\"/><rect x=\"0\" y=\"5\" width=\"15\" height=\"1\" fill=\"currentColor\"/><rect x=\"15\" y=\"5\" width=\"1\" height=\"1\" fill=\"#fff\" fill-opacity=\".7\"/><rect x=\"1\" y=\"6\" width=\"14\" height=\"1\" fill=\"currentColor\"/><rect x=\"3\" y=\"7\" width=\"10\" height=\"1\" fill=\"currentColor\"/><rect x=\"5\" y=\"8\" width=\"6\" height=\"1\" fill=\"currentColor\"/><rect x=\"7\" y=\"9\" width=\"2\" height=\"1\" fill=\"currentColor\"/></svg>","jelly":"<svg viewBox=\"0 0 16 10\" shape-rendering=\"crispEdges\" aria-hidden=\"true\"><rect x=\"5\" y=\"1\" width=\"6\" height=\"1\" fill=\"currentColor\"/><rect x=\"3\" y=\"2\" width=\"10\" height=\"1\" fill=\"currentColor\"/><rect x=\"2\" y=\"3\" width=\"4\" height=\"1\" fill=\"currentColor\"/><rect x=\"6\" y=\"3\" width=\"1\" height=\"1\" fill=\"#fff\" fill-opacity=\".7\"/><rect x=\"7\" y=\"3\" width=\"5\" height=\"1\" fill=\"currentColor\"/><rect x=\"12\" y=\"3\" width=\"1\" height=\"1\" fill=\"#fff\" fill-opacity=\".7\"/><rect x=\"13\" y=\"3\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"2\" y=\"4\" width=\"12\" height=\"1\" fill=\"currentColor\"/><rect x=\"2\" y=\"5\" width=\"12\" height=\"1\" fill=\"currentColor\"/><rect x=\"3\" y=\"6\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"5\" y=\"6\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"7\" y=\"6\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"10\" y=\"6\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"12\" y=\"6\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"3\" y=\"7\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"5\" y=\"7\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"7\" y=\"7\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"10\" y=\"7\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"12\" y=\"7\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"4\" y=\"8\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"7\" y=\"8\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"10\" y=\"8\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"4\" y=\"9\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"7\" y=\"9\" width=\"1\" height=\"1\" fill=\"currentColor\"/></svg>","turtle":"<svg viewBox=\"0 0 16 10\" shape-rendering=\"crispEdges\" aria-hidden=\"true\"><rect x=\"7\" y=\"1\" width=\"6\" height=\"1\" fill=\"currentColor\"/><rect x=\"5\" y=\"2\" width=\"10\" height=\"1\" fill=\"currentColor\"/><rect x=\"4\" y=\"3\" width=\"12\" height=\"1\" fill=\"currentColor\"/><rect x=\"3\" y=\"4\" width=\"5\" height=\"1\" fill=\"currentColor\"/><rect x=\"8\" y=\"4\" width=\"1\" height=\"1\" fill=\"#fff\" fill-opacity=\".7\"/><rect x=\"9\" y=\"4\" width=\"6\" height=\"1\" fill=\"currentColor\"/><rect x=\"15\" y=\"4\" width=\"1\" height=\"1\" fill=\"#fff\" fill-opacity=\".7\"/><rect x=\"4\" y=\"5\" width=\"12\" height=\"1\" fill=\"currentColor\"/><rect x=\"5\" y=\"6\" width=\"10\" height=\"1\" fill=\"currentColor\"/><rect x=\"4\" y=\"7\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"7\" y=\"7\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"10\" y=\"7\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"13\" y=\"7\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"3\" y=\"8\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"7\" y=\"8\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"10\" y=\"8\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"14\" y=\"8\" width=\"1\" height=\"1\" fill=\"currentColor\"/></svg>","tentacle":"<svg viewBox=\"0 0 16 10\" shape-rendering=\"crispEdges\" aria-hidden=\"true\"><rect x=\"10\" y=\"1\" width=\"3\" height=\"1\" fill=\"currentColor\"/><rect x=\"8\" y=\"2\" width=\"5\" height=\"1\" fill=\"currentColor\"/><rect x=\"7\" y=\"3\" width=\"4\" height=\"1\" fill=\"currentColor\"/><rect x=\"6\" y=\"4\" width=\"4\" height=\"1\" fill=\"currentColor\"/><rect x=\"5\" y=\"5\" width=\"4\" height=\"1\" fill=\"currentColor\"/><rect x=\"4\" y=\"6\" width=\"4\" height=\"1\" fill=\"currentColor\"/><rect x=\"3\" y=\"7\" width=\"4\" height=\"1\" fill=\"currentColor\"/><rect x=\"2\" y=\"8\" width=\"1\" height=\"1\" fill=\"#fff\" fill-opacity=\".7\"/><rect x=\"3\" y=\"8\" width=\"5\" height=\"1\" fill=\"currentColor\"/><rect x=\"1\" y=\"9\" width=\"1\" height=\"1\" fill=\"#fff\" fill-opacity=\".7\"/><rect x=\"3\" y=\"9\" width=\"1\" height=\"1\" fill=\"#fff\" fill-opacity=\".7\"/></svg>","ink":"<svg viewBox=\"0 0 16 10\" shape-rendering=\"crispEdges\" aria-hidden=\"true\"><rect x=\"6\" y=\"1\" width=\"4\" height=\"1\" fill=\"currentColor\"/><rect x=\"4\" y=\"2\" width=\"8\" height=\"1\" fill=\"currentColor\"/><rect x=\"3\" y=\"3\" width=\"10\" height=\"1\" fill=\"currentColor\"/><rect x=\"2\" y=\"4\" width=\"12\" height=\"1\" fill=\"currentColor\"/><rect x=\"1\" y=\"5\" width=\"14\" height=\"1\" fill=\"currentColor\"/><rect x=\"2\" y=\"6\" width=\"12\" height=\"1\" fill=\"currentColor\"/><rect x=\"3\" y=\"7\" width=\"10\" height=\"1\" fill=\"currentColor\"/><rect x=\"5\" y=\"8\" width=\"6\" height=\"1\" fill=\"currentColor\"/></svg>","algae":"<svg viewBox=\"0 0 12 12\" shape-rendering=\"crispEdges\" aria-hidden=\"true\"><rect x=\"4\" y=\"0\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"8\" y=\"0\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"4\" y=\"1\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"7\" y=\"1\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"1\" y=\"2\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"4\" y=\"2\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"7\" y=\"2\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"1\" y=\"3\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"4\" y=\"3\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"6\" y=\"3\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"10\" y=\"3\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"1\" y=\"4\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"4\" y=\"4\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"6\" y=\"4\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"10\" y=\"4\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"2\" y=\"5\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"4\" y=\"5\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"7\" y=\"5\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"10\" y=\"5\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"2\" y=\"6\" width=\"3\" height=\"1\" fill=\"currentColor\"/><rect x=\"7\" y=\"6\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"9\" y=\"6\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"3\" y=\"7\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"7\" y=\"7\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"10\" y=\"7\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"3\" y=\"8\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"7\" y=\"8\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"10\" y=\"8\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"3\" y=\"9\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"7\" y=\"9\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"10\" y=\"9\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"2\" y=\"10\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"6\" y=\"10\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"10\" y=\"10\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"1\" y=\"11\" width=\"4\" height=\"1\" fill=\"currentColor\"/><rect x=\"6\" y=\"11\" width=\"3\" height=\"1\" fill=\"currentColor\"/><rect x=\"10\" y=\"11\" width=\"2\" height=\"1\" fill=\"currentColor\"/></svg>","rock":"<svg viewBox=\"0 0 12 12\" shape-rendering=\"crispEdges\" aria-hidden=\"true\"><rect x=\"4\" y=\"1\" width=\"2\" height=\"1\" fill=\"#fff\" fill-opacity=\".55\"/><rect x=\"2\" y=\"2\" width=\"3\" height=\"1\" fill=\"#fff\" fill-opacity=\".55\"/><rect x=\"6\" y=\"2\" width=\"2\" height=\"1\" fill=\"#fff\" fill-opacity=\".55\"/><rect x=\"1\" y=\"3\" width=\"1\" height=\"1\" fill=\"#fff\" fill-opacity=\".55\"/><rect x=\"10\" y=\"3\" width=\"1\" height=\"1\" fill=\"#fff\" fill-opacity=\".55\"/><rect x=\"5\" y=\"4\" width=\"1\" height=\"1\" fill=\"#000\" fill-opacity=\".45\"/><rect x=\"6\" y=\"5\" width=\"1\" height=\"1\" fill=\"#000\" fill-opacity=\".45\"/><rect x=\"7\" y=\"6\" width=\"1\" height=\"1\" fill=\"#000\" fill-opacity=\".45\"/><rect x=\"1\" y=\"7\" width=\"1\" height=\"1\" fill=\"#fff\" fill-opacity=\".55\"/><rect x=\"8\" y=\"7\" width=\"1\" height=\"1\" fill=\"#000\" fill-opacity=\".45\"/><rect x=\"11\" y=\"7\" width=\"1\" height=\"1\" fill=\"#fff\" fill-opacity=\".55\"/><rect x=\"3\" y=\"8\" width=\"1\" height=\"1\" fill=\"#000\" fill-opacity=\".45\"/><rect x=\"11\" y=\"8\" width=\"1\" height=\"1\" fill=\"#fff\" fill-opacity=\".55\"/><rect x=\"4\" y=\"9\" width=\"1\" height=\"1\" fill=\"#000\" fill-opacity=\".45\"/><rect x=\"10\" y=\"10\" width=\"1\" height=\"1\" fill=\"#000\" fill-opacity=\".45\"/></svg>","reef":"<svg viewBox=\"0 0 12 12\" shape-rendering=\"crispEdges\" aria-hidden=\"true\"><rect x=\"5\" y=\"0\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"2\" y=\"1\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"5\" y=\"1\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"8\" y=\"1\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"2\" y=\"2\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"4\" y=\"2\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"7\" y=\"2\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"1\" y=\"3\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"4\" y=\"3\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"7\" y=\"3\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"9\" y=\"3\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"2\" y=\"4\" width=\"3\" height=\"1\" fill=\"currentColor\"/><rect x=\"7\" y=\"4\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"9\" y=\"4\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"3\" y=\"5\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"6\" y=\"5\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"9\" y=\"5\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"3\" y=\"6\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"6\" y=\"6\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"9\" y=\"6\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"4\" y=\"7\" width=\"3\" height=\"1\" fill=\"currentColor\"/><rect x=\"9\" y=\"7\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"5\" y=\"8\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"8\" y=\"8\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"5\" y=\"9\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"7\" y=\"9\" width=\"1\" height=\"1\" fill=\"currentColor\"/><rect x=\"5\" y=\"10\" width=\"3\" height=\"1\" fill=\"currentColor\"/><rect x=\"6\" y=\"11\" width=\"1\" height=\"1\" fill=\"currentColor\"/></svg>","cave":"<svg viewBox=\"0 0 12 12\" shape-rendering=\"crispEdges\" aria-hidden=\"true\"><rect x=\"4\" y=\"1\" width=\"4\" height=\"1\" fill=\"currentColor\"/><rect x=\"2\" y=\"2\" width=\"8\" height=\"1\" fill=\"currentColor\"/><rect x=\"1\" y=\"3\" width=\"10\" height=\"1\" fill=\"currentColor\"/><rect x=\"1\" y=\"4\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"9\" y=\"4\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"0\" y=\"5\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"10\" y=\"5\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"0\" y=\"6\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"10\" y=\"6\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"0\" y=\"7\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"10\" y=\"7\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"0\" y=\"8\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"10\" y=\"8\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"0\" y=\"9\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"10\" y=\"9\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"0\" y=\"10\" width=\"2\" height=\"1\" fill=\"currentColor\"/><rect x=\"10\" y=\"10\" width=\"2\" height=\"1\" fill=\"currentColor\"/></svg>"};
delete SPRITES.tentacle; // the tentacle keeps its drawn curl: the pixel arm read badly
Object.assign(ICON,SPRITES);
const iconOf=type=>ICON[type]||ICON.creature;
const TERRAIN={algae:'Algae: no grip',rock:'Rock: no grip, creatures bounce off it',reef:'Reef: grip; small creatures pass over you',cave:'Cave: grip; hides you from everything except what lives there'};
const ENVS={stone:'Stone',sand:'Sand',kelp:'Kelp',dark:'Dark',blue:'Blue',deep:'Deep'};
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const clone=o=>JSON.parse(JSON.stringify(o));

/* ================= store: levels and zones ================= */
// The browser keeps a working copy of levels.js. Untouched, it follows levels.js on every load.
// Once the editor changes anything it is "dirty" and stays put; if levels.js then changes too, the
// editor shows a banner to choose. Nothing is thrown away: replaced copies go to a backup list.
const BUILTIN={zones:clone(window.GDOT_ZONES||[]),levels:clone(window.GDOT_LEVELS||[])};
const canon=o=>Array.isArray(o)?'['+o.map(canon).join(',')+']':o&&typeof o==='object'?'{'+Object.keys(o).sort().filter(k=>o[k]!==undefined).map(k=>JSON.stringify(k)+':'+canon(o[k])).join(',')+'}':JSON.stringify(o);
const same=(a,b)=>canon(a)===canon(b);
const sig=o=>{ const s=canon(o); let h=5381; for(let i=0;i<s.length;i++) h=((h<<5)+h+s.charCodeAt(i))|0; return (h>>>0).toString(36)+'.'+s.length; };
const BUILTIN_SIG=sig(BUILTIN);
const STORE_KEY='gdot-levels-v2', BACKUPS_KEY='gdot-levels-v2-backups', PROGRESS_KEY='gdot-progress-v1';
const LS={get(k){ try{ return JSON.parse(localStorage.getItem(k)); }catch(e){ return null; } }, set(k,v){ try{ localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }, del(k){ try{ localStorage.removeItem(k); }catch(e){} }};
let STORE, PROG;
function backups(){ return LS.get(BACKUPS_KEY)||[]; }
function backup(label,s){ if(!s||!Array.isArray(s.levels)) return; const list=backups(); list.unshift({at:Date.now(),label,levels:s.levels,zones:s.zones||null}); LS.set(BACKUPS_KEY,list.slice(0,12)); }
function freshStore(){ return {levels:clone(BUILTIN.levels),zones:clone(BUILTIN.zones),dirty:false,base:BUILTIN_SIG,baseCopy:clone(BUILTIN)}; }
// An edited copy remembers the levels.js it started from (baseCopy). When levels.js changes, the
// copy is merged with it, comparing each tank (and each zone) three ways, mine / base / levels.js:
//   untouched here -> follows levels.js (gone there -> gone here); edited here -> stays as edited;
//   same change on both sides -> fine; changed on both sides -> stays as edited, named in the banner.
//   New in levels.js -> arrives next to its neighbour there; deleted here -> stays deleted; a tank made
//   here whose id levels.js also uses -> both kept, this one renamed.
// Order: if this copy never reordered tanks, levels.js's order wins, else this copy's order is kept
// (and named if levels.js reordered too). Afterwards any tank not starting on its key is named.
function merge3(){
  const base=STORE.baseCopy, up=BUILTIN, idx=a=>new Map((a||[]).map(x=>[x.id,x]));
  const B=idx(base.levels), U=idx(up.levels), keep=new Map(), renamed={}, clash=[];
  const freshId=id=>{ let n=2, v=id+'-mine'; while(keep.has(v)||U.has(v)||B.has(v)) v=id+'-mine-'+(n++); return v; };
  for(const l of STORE.levels){
    const b=B.get(l.id), u=U.get(l.id);
    if(!b){ if(u&&!same(u,l)){ const c=clone(l); c.id=freshId(l.id); renamed[l.id]=c.id; keep.set(c.id,c); } else keep.set(l.id,u?clone(u):l); continue; }
    if(same(l,b)){ if(u) keep.set(l.id,clone(u)); continue; }
    if(u&&same(l,u)){ keep.set(l.id,clone(u)); continue; }
    keep.set(l.id,l); if(!u||!same(u,b)) clash.push(l.name);
  }
  for(const u of up.levels) if(!B.has(u.id)&&!keep.has(u.id)) keep.set(u.id,clone(u));
  const mineIds=STORE.levels.map(l=>renamed[l.id]||l.id), upIds=up.levels.map(l=>l.id), baseIds=(base.levels||[]).map(l=>l.id);
  const sharedMine=mineIds.filter(id=>B.has(id)), sharedBase=baseIds.filter(id=>sharedMine.includes(id));
  const reordered=sharedMine.join()!==sharedBase.join();
  const upShared=upIds.filter(id=>B.has(id)), baseShared=baseIds.filter(id=>U.has(id));
  if(reordered&&upShared.join()!==baseShared.join()) clash.push('the order of the tanks');
  const order=(reordered?mineIds:upIds).filter(id=>keep.has(id));
  const place=(id,src)=>{ if(order.includes(id)) return; const i=src.indexOf(id); let at=-1; for(let j=i-1;j>=0&&at<0;j--) at=order.indexOf(src[j]); order.splice(at+1,0,id); };
  for(const id of upIds) if(keep.has(id)) place(id,upIds);
  for(const id of mineIds) if(keep.has(id)) place(id,mineIds);
  STORE.levels=order.map(id=>keep.get(id));
  const BZ=idx(base.zones), UZ=idx(up.zones), zones=[];
  for(const z of STORE.zones){ const b=BZ.get(z.id), u=UZ.get(z.id);
    if(!b){ zones.push(z); continue; }
    if(same(z,b)){ if(u) zones.push(clone(u)); continue; }
    if(u&&same(z,u)){ zones.push(clone(u)); continue; }
    zones.push(z); if(!u||!same(u,b)) clash.push('zone '+z.name); }
  up.zones.forEach((u,i)=>{ if(!BZ.has(u.id)&&!zones.some(z=>z.id===u.id)) zones.splice(Math.min(i,zones.length),0,clone(u)); });
  STORE.zones=zones;
  for(const l of STORE.levels){ const k=slotKey(l); if(k&&!(l.start&&l.start.length===1&&l.start[0]===k)) clash.push(l.name+' (not on its key '+L(k)+')'); }
  STORE.baseCopy=clone(up); STORE.base=BUILTIN_SIG; STORE.clash=clash; saveStore();
}
function loadStore(fromOtherTab){
  if(fromOtherTab){ const t=LS.get(STORE_KEY); if(t&&Array.isArray(t.levels)&&t.levels.length){ STORE=t; if(!Array.isArray(STORE.zones)) STORE.zones=clone(BUILTIN.zones); delete STORE.cur; } return; }
  const legacy=LS.get(STORE_KEY+'-backup'); if(legacy&&Array.isArray(legacy.levels)){ backup('the five original levels',legacy); LS.del(STORE_KEY+'-backup'); }
  const s=LS.get(STORE_KEY);
  // copies saved before zones existed (no base) were never a deliberate fork: back them up, follow levels.js
  if(s&&Array.isArray(s.levels)&&s.levels.length&&s.dirty&&s.base===undefined){ backup(`your browser copy (${s.levels.length} tanks, before zones)`,s); STORE=freshStore(); saveStore(); return; }
  if(s&&Array.isArray(s.levels)&&s.levels.length&&s.dirty){ STORE=s; if(!Array.isArray(STORE.zones)) STORE.zones=clone(BUILTIN.zones); delete STORE.cur;
    if(STORE.base!==BUILTIN_SIG&&STORE.baseCopy) merge3(); return; }
  if(s&&Array.isArray(s.levels)&&s.levels.length&&s.dirty===undefined){ backup('browser copy',s); STORE=freshStore(); saveStore(); return; }
  STORE=freshStore();
}
function saveStore(){ if(STORE.dirty&&sig({zones:STORE.zones,levels:STORE.levels})===BUILTIN_SIG){ STORE.dirty=false; STORE.base=BUILTIN_SIG; STORE.baseCopy=clone(BUILTIN); STORE.clash=[]; } LS.set(STORE_KEY,STORE); }
function loadProgress(){ PROG=Object.assign({beaten:{},played:{},tick:0,cur:null},LS.get(PROGRESS_KEY)||{}); if(!PROG.tips||typeof PROG.tips!=='object') PROG.tips={};
  if(tutorialAdopt()&&!STUDIO) saveProgress(); }
function saveProgress(){ LS.set(PROGRESS_KEY,PROG); }
// Player settings (this browser). nohold: you never have to keep a key held down, so letting go of every
// key, or the window losing focus, no longer ends a run (leaving the page still does). tips: first-time
// tips in the coach line.
const SETTINGS_KEY='gdot-settings-v1';
const readSettings=()=>Object.assign({nohold:false,tips:true},LS.get(SETTINGS_KEY)||{});
let SET=readSettings();
const saveSettings=()=>LS.set(SETTINGS_KEY,SET);
const mustHold=()=>!SET.nohold;

/* ================= zones ================= */
// A zone is a set of tanks named after keys (the home row, the top row...). Tanks are the levels
// whose "zone" is that zone, in levels.js order; the n-th tank carries the zone's n-th key.
// Dying sends you to another tank of the zone you have not beaten, the one you played longest ago,
// so no single tank can be brute-forced. A tank marked "finale" opens only when it is the last one.
const LOOSE={id:'unsorted',name:'Unsorted',keys:[],env:'stone'};
const zoneById=id=>STORE.zones.find(z=>z.id===id)||null;
const zoneOf=l=>zoneById(l&&l.zone)||LOOSE;
function zones(){ const z=STORE.zones.slice(); if(STORE.levels.some(l=>!zoneById(l.zone))) z.push(LOOSE); return z; }
function tanks(z){ const out=[]; STORE.levels.forEach((l,i)=>{ if(zoneOf(l).id===z.id) out.push({l,i}); }); return out; }
function tankLabel(l){ const z=zoneOf(l), n=tanks(z).findIndex(t=>t.l===l), k=z.keys&&z.keys[n]; return k?L(k):String(n+1); }
const levelIndex=id=>STORE.levels.findIndex(l=>l.id===id);
const beaten=l=>!!PROG.beaten[l.id];
function zoneDone(z){ if(isTut(z)&&PROG.tutorial&&PROG.tutorial!=='replay') return true; const t=tanks(z); return t.length>0&&t.every(x=>beaten(x.l)); }
function finaleLocked(l){ return !!l.finale&&tanks(zoneOf(l)).some(t=>t.l!==l&&!beaten(t.l)); }
const NEWGAME='__new__'; // where G+. goes once every tank is cleared: a fresh game
const campaignDone=()=>{ const l=STORE.levels.filter(x=>!isTut(zoneOf(x))); return l.length>0&&l.every(beaten); }; // the tutorial is not part of it
function newCampaign(){ PROG={beaten:{},played:{},tick:0,cur:null,finished:(PROG.finished||0)+1,tutorial:PROG.tutorial||'done',tips:PROG.tips||{}}; saveProgress(); NEXT=null; setCur(levelIndex(pickNext(null))); T('newgame',{finished:PROG.finished}); }
// The tutorial: a zone marked "tutorial" comes first for a new player. Its tanks come up in order, a
// death retries the same tank, and each tank's coach lines (level.coach) guide it. It is not part of the
// campaign: skip it, or clear it, and it never comes up again unless you ask (the footer button).
// PROG.tutorial: missing = still to do, 'replay' = playing it again (asked for), 'done' = cleared,
// 'skipped' = skipped, or you already had cleared tanks (or finished the game) when it arrived.
const isTut=z=>!!(z&&z.tutorial);
const isTerr=l=>!!l&&(l.rules||zoneOf(l).rules)==='territory'; // territory rules: fill every key, par, creatures take keys
const tutTanks=()=>STORE.levels.filter(l=>isTut(zoneOf(l)));
const tutorialOn=()=>(!PROG.tutorial||PROG.tutorial==='replay')&&tutTanks().length>0;
function tutorialAdopt(){ // true when it changed PROG
  if(PROG.tutorial||!tutTanks().length) return false;
  const real=id=>{ const l=STORE.levels.find(x=>x.id===id); return !!l&&!isTut(zoneOf(l)); };
  if(PROG.finished>0||Object.keys(PROG.beaten).some(real)){ PROG.tutorial='skipped'; return true; }
  if(PROG.cur&&real(PROG.cur)){ PROG.cur=null; return true; } // played a little, cleared nothing: the tutorial first
  return false;
}
function pickNext(fromId){
  if(tutorialOn()){ const t=tutTanks().find(l=>!beaten(l)); if(t) return t.id; }
  const from=STORE.levels.find(l=>l.id===fromId), list=zones().filter(z=>!isTut(z));
  const order=from&&!isTut(zoneOf(from))?[zoneOf(from),...list.filter(z=>z.id!==zoneOf(from).id)]:list;
  for(const z of order){
    const left=tanks(z).filter(t=>!beaten(t.l)); if(!left.length) continue;
    let pool=left.filter(t=>!t.l.finale); if(!pool.length) pool=left;
    const others=pool.filter(t=>t.l.id!==fromId); if(others.length) pool=others;
    pool.sort((a,b)=>(PROG.played[a.l.id]||0)-(PROG.played[b.l.id]||0)||a.i-b.i);
    return pool[0].l.id;
  }
  return fromId;
}

/* ================= audio ================= */
const panOf=code=>{ const k=KEYMAP[code]; return k?((k.x+k.w/2)/15)*2-1:0; };
const audio={ctx:null,on:true,
  unlock(){ if(!this.ctx){ try{this.ctx=new (window.AudioContext||window.webkitAudioContext)();}catch(e){} } if(this.ctx&&this.ctx.state==='suspended') this.ctx.resume(); },
  tone(f0,dur,type='square',gain=.08,pan=0,t0=0,f1){
    if(!this.on||!this.ctx) return; const c=this.ctx,t=c.currentTime+t0;
    const o=c.createOscillator(),g=c.createGain(); o.type=type; o.frequency.setValueAtTime(f0,t);
    if(f1) o.frequency.exponentialRampToValueAtTime(f1,t+dur);
    g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(gain,t+.006); g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    let last=g; if(c.createStereoPanner){const p=c.createStereoPanner();p.pan.value=pan;g.connect(p);last=p;}
    last.connect(c.destination); o.connect(g); o.start(t); o.stop(t+dur+.03);
  },
  tick(){this.tone(1400,.035,'square',.035);},
  step(c){ const key=KEYMAP[c.pos]; if(!key) return; const f=180*Math.pow(2,(5-key.row)/4);
    const type=c.prey?'sine':c.type==='eel'?'sawtooth':'triangle'; this.tone(f,.13,type,c.prey?.09:.14,panOf(c.pos)); if(!c.prey) this.tone(f*2,.04,'square',.04,panOf(c.pos)); },
  crunch(code){ const p=panOf(code); this.tone(220,.06,'square',.12,p,0,110); this.tone(160,.09,'sawtooth',.1,p,.05,70); },
  eat(){this.tone(600,.08,'sine',.12,0,0,900); this.tone(900,.12,'sine',.1,0,.08,1400);},
  wake(){this.tone(160,.4,'sawtooth',.12,0,0,90);},
  refuse(code){this.tone(130,.09,'square',.06,panOf(code));},
  eaten(){this.tone(90,.55,'sawtooth',.22,0,0,40); this.tone(700,.08,'square',.1);},
  letgo(){this.tone(420,.5,'sine',.15,0,0,120);},
  ink(){this.tone(300,.18,'sine',.12,0,0,90); this.tone(140,.3,'triangle',.09,0,.05,60);},
  win(){[523,659,784,1047].forEach((f,i)=>this.tone(f,.18,'square',.07,0,i*.11));}
};

/* ================= runtime ================= */
// G = engine state; LV = the stored level it was built from. held = keys physically down now;
// refused = keys held down that did not take a tentacle, with the reason drawn on them.
// CUE = what the last action left to draw (cleared by the next placement).
let G, LV, CUR=0, NEXT=null, CUE={}, held=new Set(), refused=new Map();
const els={}; const $=id=>document.getElementById(id);
// play.html has no editor panel: that is the player build. studio.html has everything.
const STUDIO=!!$('panel');
const on=(id,ev,fn)=>{ const el=$(id); if(el) el.addEventListener(ev,fn); };
// Ask by clicking twice, never with a browser dialog (a blocked dialog silently cancels): the first
// click arms the button for 4 seconds and says what will happen, the second click does it.
function armed(btn,ask,run){
  if(btn.dataset.armed==='1'){ clearTimeout(btn._armT); btn.dataset.armed=''; btn.textContent=btn.dataset.label; btn.classList.remove('armed'); run(); return; }
  if(!btn.dataset.label) btn.dataset.label=btn.textContent;
  btn.dataset.armed='1'; btn.textContent=ask; btn.classList.add('armed');
  btn._armT=setTimeout(()=>{ btn.dataset.armed=''; btn.textContent=btn.dataset.label; btn.classList.remove('armed'); },4000);
}
const isEdit=()=>document.body.classList.contains('edit');
// The studio (studio.html) never redirects you or records progress: it plays whatever tank you pick.
// play.html is the only place where the zone rules and progress count.
const free=()=>STUDIO;
const STUDIO_CUR_KEY='gdot-studio-cur';
const T=(ev,data)=>{ try{ window.Telemetry&&window.Telemetry.track&&window.Telemetry.track(ev,LV.id,data||{}); }catch(e){} };
function say(text){ const a=$('say'), b=$('why'); if(a) a.textContent=text; if(b) b.textContent=text; }

function setCur(i){ CUR=Math.max(0,Math.min(i,STORE.levels.length-1)); const l=STORE.levels[CUR]; if(!l) return; if(STUDIO) LS.set(STUDIO_CUR_KEY,l.id); else { PROG.cur=l.id; saveProgress(); } }
let lastLvId=null;
function buildRuntime(){
  if(G&&inIntro()) introEnd();
  if(!STORE.levels[CUR]) CUR=0;
  LV=STORE.levels[CUR];
  GDOT.normalizeLevel(LV);
  if(LV.id!==lastLvId){ lastLvId=LV.id; if(typeof E!=='undefined'){ E.drawing=false; E.placing=false; E.capture=false; E.sel=null; } }
  G=GDOT.createGame(GDOT.resolveLevel(LV,zoneOf(LV))); refused=new Map(); CUE={}; NEXT=null; for(const k in pressAt) delete pressAt[k];
  document.body.dataset.env=zoneOf(LV).env||'stone';
  $('board').classList.remove('dead','won');
  say(G.START.includes('KeyG')?'Hold G and tap . to start.':`Start on ${G.START.map(L).join(' or ')}.`);
  coachReady();
  if(STUDIO) pvReset();
  render();
}
function refuse(code,reason){ refused.set(code,reason); audio.refuse(code); say({reach:'Only keys next to your tentacles.',fog:'Still fog there.',algae:'Algae. Nothing to grip.',rock:'Rock. Nothing to grip.',max:`All ${G.MAX} tentacles are down. Lift one first.`,start:`Start on ${G.START.map(L).join(' or ')}.`}[reason]||''); coachSet(reason); tip(reason); render(); }

function place(code){
  const ev=GDOT.place(G,code);
  if(ev.type==='noop') return;
  if(ev.type==='refused') return refuse(code,ev.reason);
  settle(ev);
}
// Ink (Space, in tanks that give it): everything moves, then a cloud lands around your newest tentacle.
function squirt(){
  const ev=GDOT.squirt(G);
  if(ev.type==='refused'){ refused.set('Space','ink'); audio.refuse('Space'); say(ev.why==='empty'?'No ink left.':'Ink needs a tentacle to shield.'); coachSet('ink'); render(); return; }
  CUE.cloud=ev.cloud.slice(); audio.ink(); T('ink',{turn:G.turn,left:G.inkLeft});
  settle(ev); if(G.phase==='play'){ coachSet('ink'); tip('ink-used'); render(); }
}
function settle(ev){
  if(G.turn>1) tipsDone(); // tips stay up until the next tentacle goes down (the first one of a run keeps the ready tips)
  CUE={meals:ev.meals||[],ate:(ev.ate||[]).map(c=>c.pos),woke:(ev.woke||[]).map(c=>c.pos),spot:(ev.newly||[]).map(c=>c.pos)};
  audio.tick(); (ev.stepped||[]).forEach(c=>{ if(c.alive) audio.step(c); }); (ev.meals||[]).forEach(m=>audio.crunch(m.key));
  if(ev.type==='dead'&&ev.taken&&ev.taken.length>1) CUE.taken=ev.taken.map(t=>t.key).filter(k=>k!==ev.key);
  if(ev.type==='dead'){ T('death',{turn:G.turn,tentacles:G.fingers.size,by:ev.by?ev.by.type:ev.cause,key:ev.key,kind:ev.kind}); return die(ev); }
  if(ev.ate.length) audio.eat(); if(ev.woke.length) audio.wake();
  if(ev.taken&&ev.taken.length){ CUE.taken=ev.taken.map(t=>t.key); audio.crunch(ev.taken[0].key); tip('taken'); }
  if(ev.grew&&ev.grew.length){ CUE.grew=ev.grew.slice(); audio.eat(); tip('grow'); }
  coachSeen(ev);
  if(G.MODE!=='territory'&&ev.type==='placed'&&G.fingers.size>=G.GOAL&&ev.reqLeft>0&&G.REQ.some(k=>!G.revealed.has(k))) tip('tray-full'); // full, but a starfish is still out there
  if(ev.type==='won') return win();
  coachSet(G.turn); if(ev.taken&&ev.taken.length) coachSet('taken'); else if(ev.grew&&ev.grew.length) coachSet('grow');
  const parts=[];
  if(ev.taken&&ev.taken.length) parts.push(ev.taken.map(t=>`The ${t.by.label.toLowerCase()} took ${L(t.key)}.`).join(' '));
  if(ev.grew&&ev.grew.length) parts.push(`The starfish opened ${ev.grew.map(L).join(' ')}.`);
  if(ev.meals.length) parts.push(ev.meals.map(m=>`The ${m.eater.label.toLowerCase()} ate the ${m.victim.label.toLowerCase()}.`).join(' '));
  if(ev.ate.length) parts.push(`Ate the ${ev.ate[0].label.toLowerCase()}.`);
  if(ev.woke.length) parts.push(`Something stirred near ${L(ev.woke[0].pos)}.`);
  if(ev.newly.length) parts.push(`A ${ev.newly[0].label.toLowerCase()}.`);
  parts.push(G.MODE==='territory'?`${G.GOAL-G.left} of ${G.GOAL} keys filled.`:`${G.fingers.size} of ${G.GOAL} down${G.REQ.length?`, ${ev.reqLeft} marked left`:''}.`);
  say(parts.join(' ')); render();
}
function destination(){ // where G+. goes after this run ends
  if(free()) return G.phase==='won'&&STORE.levels[CUR+1]?STORE.levels[CUR+1].id:LV.id;
  if(G.phase==='won') PROG.beaten[LV.id]=1;
  if(PROG.ret&&(G.phase==='won'||LV.id===PROG.ret)&&beaten(LV)&&LV.id!==PROG.ret){ const r=PROG.ret; delete PROG.ret; if(G.phase==='won'&&levelIndex(r)>=0&&!beaten(STORE.levels[levelIndex(r)])){ PROG.cur=r; saveProgress(); return r; } } // a replay won: back to where you were
  if(G.phase==='won'&&tutorialOn()&&tutTanks().every(beaten)){ PROG.tutorial='done'; T('tutorial',{action:'done'}); }
  if(G.phase==='won'&&!tutorialOn()&&campaignDone()){ saveProgress(); return NEWGAME; }
  if(G.phase==='dead'&&isTerr(LV)){ PROG.cur=LV.id; saveProgress(); return LV.id; } // territory: a lost tank is played again
  const next=pickNext(LV.id); PROG.cur=next; saveProgress(); return next;
}
function die(ev){
  if(G.phase!=='dead') GDOT.kill(G,ev.why,ev.cause);
  if(ev.by){ const f=KEYMAP[ev.from], k=KEYMAP[ev.key];
    CUE.hurt={key:ev.key,type:ev.by.type,cid:ev.by.id,from:ev.from,moved:!!ev.from&&ev.from!==ev.key,kind:ev.kind,
      deg:f&&k?Math.round(Math.atan2((ROWY[k.row]-ROWY[f.row]),((k.x+k.w/2)-(f.x+f.w/2)))*180/Math.PI):0}; audio.eaten(); }
  else { CUE.letgo=true; audio.letgo(); }
  NEXT=destination();
  const sentOn=!free()&&NEXT!==LV.id&&NEXT!==NEWGAME&&!isTut(zoneOf(LV));
  COACH.tip=[]; coachSet(ev.kind==='overrun'?'overrun':ev.by?'eaten':'letgo');
  if(ev.cause==='leave'||document.visibilityState==='hidden'){ unseen={kind:ev.by?ev.kind:(ev.cause||'letgo'),sent:sentOn}; if(sentOn){ PROG.left=1; saveProgress(); } } // nobody saw it (the page is going away or hidden): said when they are back
  else { const firstSent=sentOn&&tipsOn()&&!(PROG.tips||{}).sent; tip('dead-'+(ev.by?ev.kind:(ev.cause||'letgo')),isTut(zoneOf(LV))||firstSent); if(sentOn) tip('sent'); }
  $('board').classList.add('dead');
  say(`${ev.why} ${NEXT===LV.id?'G+. to try again.':`G+. goes to tank ${tankLabel(STORE.levels[levelIndex(NEXT)])}.`}`); render();
}
function win(){
  audio.win(); T('clear',{turn:G.turn,tentacles:G.fingers.size,par:LV.par||null});
  if(G.MODE==='territory'&&!free()){ const b=PROG.best||(PROG.best={}); if(!b[LV.id]||G.turn<b[LV.id]) b[LV.id]=G.turn; }
  NEXT=destination(); CUE.won=true; $('board').classList.add('won');
  COACH.tip=[]; coachSet('won'); if(!isTut(zoneOf(LV))) tip('won'); if(G.MODE==='territory'&&LV.par&&G.turn>LV.par&&!zoneDone(zoneOf(LV))) tip('over-par');
  say(`${LV.name} clear in ${G.turn} turns${G.MODE==='territory'&&LV.par?` (par ${LV.par})`:''}. ${NEXT===NEWGAME?'Every tank is clear. G+. starts the game again from the beginning.':NEXT===LV.id?'That was the last tank.':`G+. goes to tank ${tankLabel(STORE.levels[levelIndex(NEXT)])}.`}`); render();
}
function startRun(){ GDOT.start(G); T('start',{hold:mustHold()}); if(!free()){ PROG.played[LV.id]=++PROG.tick; saveProgress(); } }
function letGo(why,cause){ T('death',{turn:G.turn,tentacles:G.fingers.size,by:cause}); die({why,cause,by:null}); }

/* ================= live preview in the editor ================= */
// With the editor open and no run going, the tank's creatures move on their own so the layout reads
// at a glance. It is a separate copy of the tank: every creature counts as seen and awake (sleepers
// stay asleep until touched, as in play), a ghost tentacle on each start key gives hunters and
// fleers something to react to and cannot be hurt, and the food chain plays out. The loop starts
// over every PV_LOOP steps and after any edit; it pauses while you place a creature or draw a path.
const PV_MS=600, PV_LOOP=24;
let PV=null, pvTimer=null, pvStepN=0, pvPaused=false, pvCue={};
const pvActive=()=>!!PV&&isEdit()&&!!G&&G.phase==='ready'&&!E.drawing&&!E.placing;
function pvReset(){
  if(!isEdit()||!LV||LV===INTRO){ PV=null; return; }
  PV=GDOT.createGame(GDOT.resolveLevel(LV,zoneOf(LV))); PV.phase='preview';
  for(const k of PV.START) PV.fingers.add(k);
  for(const c of PV.creatures){ // as in play: a sleeper wakes when a tentacle touches it; what hides in a cave stays unseen
    if(!c.awake&&(PV.fingers.has(c.pos)||NEI[c.pos].some(n=>PV.fingers.has(n)))) c.awake=true;
    c.seen=c.wake?c.awake:PV.TER[c.pos]!=='cave';
  }
  pvStepN=0; pvCue={}; pvInfo();
}
function pvStep(){
  if(!PV) pvReset(); if(!PV) return;
  if(pvStepN>=PV_LOOP) pvReset();
  pvStepN++;
  for(const c of PV.creatures) c.prev=c.pos;
  pvCue={meals:GDOT.stepAll(PV).meals};
  render(); pvInfo();
}
function pvInfo(){ const i=$('pv-info'), b=$('pv-play'); if(i) i.textContent=PV?`step ${pvStepN} of ${PV_LOOP}${pvActive()?'':' (paused while you place, draw or play)'}`:''; if(b) b.textContent=pvPaused?'Play':'Pause'; }
function pvTick(){ if(document.hidden||pvPaused||!pvActive()) return; pvStep(); }
function pvStart(){ if(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches) pvPaused=true; if(!pvTimer) pvTimer=setInterval(pvTick,PV_MS); pvInfo(); }
function pvStop(){ if(pvTimer) clearInterval(pvTimer); pvTimer=null; PV=null; pvInfo(); }

/* ================= intro: a live tank until the first G. ================= */
// Everything is revealed and everything moves: sharks on their loops, a pilot fish trailing one, a
// crab walking to its urchin lunch, a barracuda on the top row, a seal after the fish, an eel that
// leaves its cave to go for the octopus. A small octopus puts tentacles down and gets bitten.
// Hold G and tap . to start (the G and . keys pulse). Reduced motion shows one still frame.
const INTRO={id:'intro',name:'',goal:99,start:['KeyG'],required:[],
  terrain:{KeyQ:'algae',KeyA:'algae',Digit1:'algae',KeyP:'algae',BracketLeft:'algae',Quote:'algae',KeyE:'rock',Digit9:'rock',Minus:'rock',KeyS:'rock',KeyX:'reef',KeyC:'reef',KeyL:'cave'},
  creatures:[
    {type:'shark',mover:'path',path:['KeyT','KeyY','KeyU','KeyJ','KeyM','KeyN','KeyB','KeyV','KeyF','KeyR'],loop:'loop',pathIndex:6,size:'big',speed:1},
    {type:'pilot',mover:'chase',at:'KeyN',size:'small',speed:1,prey:true},
    {type:'barracuda',mover:'dir',dir:'E',at:'Digit3',size:'small',speed:2},
    {type:'crab',mover:'dir',dir:'E',at:'KeyZ',size:'small',speed:0.5},
    {type:'urchin',mover:'still',at:'Comma',size:'big',speed:0},
    {type:'barracuda',mover:'dir',dir:'W',at:'KeyO',size:'small',speed:2},
    {type:'fish',mover:'flee',at:'KeyW',size:'small',speed:0.5,prey:true},
    {type:'seal',mover:'chase',at:'Backslash',size:'big',speed:1},
    {type:'eel',mover:'chase',at:'KeyL',size:'big',speed:1,cave:true},
    {type:'crab',mover:'dir',dir:'E',at:'F5',size:'small',speed:0.5},
  ]};
// the octopus in the intro: tentacles go down one by one, then all lift (ticks within a loop)
const INTRO_ARMS={3:'KeyH',6:'Semicolon',9:'Slash',12:'KeyW',15:'KeyI'};
const INTRO_LOOP=40, INTRO_MS=650;
let introTimer=null, introTick=0;
function introGame(){
  const g=GDOT.createGame(INTRO); g.phase='intro';
  for(const k of KEYS) g.revealed.add(k.code);
  for(const c of g.creatures){ c.seen=true; c.awake=true; }
  return g;
}
function introStep(){
  const t=introTick++%INTRO_LOOP;
  if(t===0){ G=introGame(); CUE={}; }
  if(t===INTRO_LOOP-4) G.fingers.clear();
  for(const c of G.creatures){ c.prev=c.pos; c.vis0=true; }
  const {stepped,meals}=GDOT.stepAll(G);
  CUE={meals};
  if(INTRO_ARMS[t]&&!G.creatures.some(c=>c.alive&&c.pos===INTRO_ARMS[t])) G.fingers.add(INTRO_ARMS[t]);
  for(const c of G.creatures){ // the demo octopus gets bitten too, and eats what it lands on
    if(!c.alive||!G.fingers.has(c.pos)) continue;
    if(c.prey){ c.alive=false; CUE.ate=[c.pos]; continue; }
    if(GDOT.hidden(G,c,c.pos)) continue;
    const r=c.route||[c.prev], from=r.length>1?r[r.length-2]:c.prev, f=KEYMAP[from], k=KEYMAP[c.pos];
    CUE.hurt={key:c.pos,type:c.type,from,moved:from!==c.pos,kind:'swung',deg:f&&k?Math.round(Math.atan2(ROWY[k.row]-ROWY[f.row],(k.x+k.w/2)-(f.x+f.w/2))*180/Math.PI):0};
    G.fingers.delete(c.pos); break;
  }
  render();
}
function introStart(){
  if(introTimer) clearInterval(introTimer); $('board').classList.remove('dead','won'); refused.clear(); unseen=null;
  LV=INTRO; G=introGame(); CUE={}; introTick=0; document.body.classList.add('intro');
  say('Hold G and tap . to start.');
  const still=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(still){ for(let i=0;i<14;i++) introStep(); return; }
  introStep(); introTimer=setInterval(()=>{ if(!document.hidden) introStep(); },INTRO_MS);
}
function introEnd(){ if(introTimer) clearInterval(introTimer); introTimer=null; document.body.classList.remove('intro'); CUE={}; }
const inIntro=()=>G&&G.phase==='intro';

/* ================= coach: one line under the tank ================= */
// Tutorial tanks carry their own lines in level.coach, keyed by moment: ready (before the first
// tentacle), 1, 2, ... (after that many placements; a line stays until a later number replaces it),
// lift, won, eaten, letgo, and the reason a press was refused: fog, algae, rock, max, start, one, none.
// Elsewhere the line shows a tip the first time you meet something (once per player, PROG.tips; the
// footer's "tips" turns them off). A death always explains itself in the tutorial.
// Tokens: {L} a key cap (that key pulses on the board while the line is up, unless it is in fog),
// {shark} an icon, {G.} the G+. combo, {fog} a fog key, {goal} the goal, {max} the tentacle cap,
// {hold} the hold sentence (empty with "no holding").
// line: the tutorial step; msg: the reply to one press (a refusal, a lift), gone at the next move;
// tip: queued tip ids, two shown at a time, counted as seen once they have really been on screen.
const COACH={line:'',msg:'',tip:[],shown:[],keys:[]};
const DANGER_LINE='Not safe right now: something would get bitten this turn. Watch where each creature goes next.';
const INTRO_LINE='Your keyboard is a fish tank, and you are the octopus. You will meet these creatures one at a time. Hold {G} and tap {.} to start.';
// the hold rule, said in full: any key counts, even the G still down from G+.
const TIPS={
  shark:'{shark} Shark: swims one fixed route, back and forth or round a loop, and bites any {tentacle} on a key it swims onto. Watch where it goes before you get close.',
  'g-start':'Keep holding {G}! This tank starts on {G}, so your first {tentacle} is already down.',
  barracuda:'{barracuda} Barracuda: two keys a turn, leaping over the one between.',
  crab:'{crab} Crab: one key every other turn, bouncing off rock and edges.',
  eel:'{eel} Moray eel: sleeps until you touch next to it, then hunts you.',
  urchin:'{urchin} Urchin: never moves. Just don\'t grab its key.',
  fish:'{fish} Fish: food. Grab its key to eat it and see further.',
  seal:'{seal} Seal: hunts fish first, then you.',
  pilot:'{pilot} Pilot fish: food that trails a shark.',
  reef:'{reef} Reef: small creatures pass over a tentacle here.',
  cave:'{cave} Cave: only what lives in it can reach you here.',
  rock:'{rock} Rock: no grip, and creatures bounce off it.',
  starfish:'{starfish} Starfish: you need a tentacle on it to clear the tank.',
  algae:'{algae} Algae: nothing to grip.',
  fog:'{fog} Fog: you can only grab keys you have uncovered. Each tentacle uncovers the keys around it.',
  left:'You left mid-run, which counts as a loss, so the tank sent you on.',
  max:'Only {max} tentacles here: lift one to move it.',
  'lift-one':'One lift at a time here: put it down before lifting another.',
  'lift-none':'{lock} Tentacles stay where they land here.',
  won:'Clear! Each cleared tank shows as a {tentacle} in the zone bar up top. Clear them all to open the next zone.',
  sent:'A loss sends you to another tank of this zone. Clear them all to move on.',
  'dead-going':'It moved onto that key first: creatures move, then your tentacle lands.',
  'dead-there':'You grabbed the key it was sitting on.',
  'dead-hiding':'{cave} Something was hiding in there.',
  'dead-caught':'Hunters chase your tentacles, and it reached one.',
  'dead-swung':'It moved onto a tentacle you had down. Watch where things go next.',
  'dead-letgo':'You let go of every key. Keep one held, or tick "no holding" below.',
  'dead-blur':'The window lost focus, so you let go.',
  snake:'{snake} Sea snake: its body trails two keys behind its head, and all of it is its own.',
  ray:'{ray} Ray: glides two keys a press and takes any {tentacle} on the keys it crosses.',
  jelly:'{jelly} Jellyfish: every other press it blooms over the keys around it. Finish while it blooms and those keys count as its own.',
  turtle:'{turtle} Turtle: slow, and it eats jellyfish.',
  ink:'This tank gives you {ink} ink: tap {Space}. Everything moves, then a cloud around your newest {tentacle} keeps creatures out for two presses. It costs a press.',
  'ink-used':'{ink} Inked: no creature can enter the cloud for two presses. Fill inside it.',
  territory:'Fill every open key: the tray counts them. A creature\'s key is its own. Par is the fewest presses.',
  taken:'A creature took that {tentacle}. Its key is free again once it leaves: fill it then.',
  grow:'The {starfish} turned the algae around it into water: more to fill.',
  'dead-overrun':'Every {tentacle} was taken. Keep one out of every creature\'s way.',
  reach:'Only keys next to one of your {tentacle}s.',
  'over-par':'Cleared above par. While you are in this zone, click the tank up top to try for par again.',
  'dead-leave':'You left the page mid-run, which counts as letting go.',
  'tray-full':'Full tray, but not clear: a {starfish} is still hidden in the fog. Find it and put a {tentacle} on it.',
};
// the same creatures, in territory words (they take keys rather than bite)
const TIPS_T={
  shark:'{shark} Shark: swims one fixed route. Its arrow points at its next key: a {tentacle} there is taken.',
  barracuda:'{barracuda} Barracuda: two keys a turn, leaping over the one between. It takes the {tentacle} it lands on.',
  crab:'{crab} Crab: one key every other turn (a dash means it rests), bouncing off rock and edges. It takes what it lands on.',
  eel:'{eel} Moray eel: sleeps until you touch next to it, then hunts your {tentacle}s and takes them.',
  urchin:'{urchin} Urchin: never moves. Its key is not yours to fill.',
  seal:'{seal} Seal: hunts fish first, then your {tentacle}s.',
  starfish:'{starfish} Starfish: hold it and the algae around it turns into water: more tank to fill.',
  won:'Clear! Every open key was yours. Par is the fewest presses: see it top right.',
  fish:'{fish} Fish: food. Grab its key to eat it and see further.',
};
const tipText=id=>id.startsWith('t-')?TIPS_T[id.slice(2)]:TIPS[id];
const BYLABEL={}; for(const k of KEYS) if(k.label&&!BYLABEL[k.label]) BYLABEL[k.label]=k.code; BYLABEL.Space='Space';
// icon tokens, with the word a screen reader says for each (anything else in braces is a key)
const TOKEN_ICONS={tentacle:'tentacle',starfish:'starfish',lock:'lock',bones:'bones',algae:'algae',rock:'rock',reef:'reef',cave:'cave',ink:'ink cloud',seg:'body'};
for(const t of TYPES) TOKEN_ICONS[t]=PRESETS[t].label.toLowerCase();
// a tutorial moment (see above); a moment the tank has no line for keeps the current line, except
// ready / a turn / the end of a run, which clear it
function coachSet(m){
  const c=LV&&LV.coach&&typeof LV.coach==='object'?LV.coach:null;
  if(typeof m==='number'){ let best=-1; if(c) for(const k in c) if(/^\d+$/.test(k)&&+k<=m&&+k>best) best=+k; COACH.line=best>=0?String(c[best]):''; COACH.msg=''; COACH.hide=false; return; }
  if(m==='ready'||m==='won'||m==='eaten'||m==='letgo'||m==='overrun'){ COACH.line=c&&c[m]!=null?String(c[m]):''; COACH.msg=''; COACH.hide=false; return; }
  COACH.msg=c&&c[m]!=null?String(c[m]):''; // a refusal or a lift: shown with the step, which stays
  COACH.hide=m==='lift'&&!!COACH.msg; // ...except after a lift: the step may be the one that asked for it
}
const tipsOn=()=>!STUDIO&&SET.tips!==false&&!(LV&&isTut(zoneOf(LV)));
// queue a tip; once per player (force: every time, e.g. a death explained in the tutorial)
function tip(id,force,first){
  if(G&&G.MODE==='territory'&&TIPS_T[id]) id='t-'+id; // the territory wording is a tip of its own
  if(!tipText(id)) return;
  if(!force&&(!tipsOn()||(PROG.tips||{})[id])) return;
  if(!COACH.tip.includes(id)){ if(first) COACH.tip.unshift(id); else COACH.tip.push(id); } // first: said before anything already queued
}
// a placement retires the tips that were on screen; ones queued but not yet drawn stay
const END_TIP=id=>/^(t-)?(dead-|sent$|won$|left$|over-par$)/.test(id); // said on the end screen: seen once shown
function markSeen(ids){ if(STUDIO||!ids.length) return; const seen=PROG.tips||(PROG.tips={}); let ch=false; for(const id of ids) if(!seen[id]){ seen[id]=1; ch=true; } if(ch) saveProgress(); }
function tipsDone(){ markSeen(COACH.shown); COACH.tip=COACH.tip.filter(id=>!COACH.shown.includes(id)); COACH.shown=[]; }
const realCleared=()=>Object.keys(PROG.beaten||{}).filter(id=>{ const l=STORE.levels.find(x=>x.id===id); return l&&!isTut(zoneOf(l)); }).length;
function coachReady(){ COACH.tip=[]; COACH.shown=[]; unseen=null; coachSet('ready'); if(G.MODE==='territory') tip('territory'); if(G.inkLeft>0) tip('ink');
  if(!COACH.line&&!(LV.coach&&LV.coach.ready)&&!isTut(zoneOf(LV))&&tipsOn()&&realCleared()<3&&G.START[0]) COACH.line=`{Hold} {${G.START[0]}} to start. {hold}`; // until three real tanks are cleared
  if(booted&&PROG.left&&!STUDIO&&document.visibilityState!=='hidden'){ delete PROG.left; saveProgress(); tip('left',true); } // only the page on screen takes it
  if(G.MAX) tip('max'); if(G.LIFT!=='any') tip('lift-'+G.LIFT); }
// first sight of a creature, a terrain or a starfish
function coachSeen(ev){
  for(const c of [...(ev.newly||[]),...(ev.woke||[])]) tip(c.type);
  for(const k of G.revealed){ const t=G.TER[k]; if(t==='reef'||t==='cave'||t==='rock') tip(t); if(G.REQ.includes(k)) tip('starfish'); }
}
const KEYNAMES={';':'semicolon',"'":'quote','[':'left bracket',']':'right bracket','-':'minus','=':'equals','/':'slash','.':'period',',':'comma','\\':'backslash','`':'backtick'};
const keyCap=(code,pulse)=>{ const l=L(code); return `<span class="cap${pulse?' ck':''}" role="img" aria-label="${esc(KEYNAMES[l]||l)} key">${esc(l)}</span>`; };
function keyToken(t){ const raw=t.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&amp;/g,'&'); return KEYMAP[raw]?raw:(BYLABEL[raw]||BYLABEL[raw.toUpperCase()]||null); }
function coachTokens(text,keys){
  return esc(text).replace(/\{([^{}]+)\}/g,(m,t)=>{
    if(t==='hold') return mustHold()?`Keep a key held down (any key, even ${keyCap('KeyG')}). Let go of every key and you lose the tank.`:'';
    if(t[0]==='~'&&t.length>1){ const c=keyToken(t.slice(1)); if(c) return keyCap(c,false); } // named, not pulsing
    if(t==='par') return LV&&LV.par?String(LV.par):'';
    if(t==='next'){ const l=NEXT&&NEXT!==NEWGAME?STORE.levels[levelIndex(NEXT)]:null; return l&&mustHold()&&(l.start||[]).includes('KeyG')?`The next tank starts on ${keyCap('KeyG')}: after ${gdotCombo()}, keep ${keyCap('KeyG')} held.`:''; }
    if(t==='Hold') return mustHold()?'Hold':'Press';
    if(t==='goal') return G?String(G.GOAL):'';
    if(t==='max') return G&&G.MAX?String(G.MAX):'';
    if(t==='G.') return gdotCombo();
    if(t==='fog') return '<span class="cap fogcap" role="img" aria-label="fog key" title="fog"></span>';
    if(TOKEN_ICONS[t]) return `<i class="ci ${t}" role="img" aria-label="${TOKEN_ICONS[t]}">${ICON[t]||iconOf(t)}</i>`;
    const code=keyToken(t);
    if(code){ keys.push(code); return keyCap(code,true); }
    return m;
  });
}
function renderCoach(){
  const el=$('coach'); COACH.keys=[]; if(!el) return;
  let text='', shown=[];
  if(G&&inIntro()) text=STUDIO?'':INTRO_LINE;
  else if(!(STUDIO&&isEdit())){ shown=COACH.tip.slice(0,2);
    let line=COACH.hide?'':COACH.line;
    if(line&&G&&G.phase==='play'){
      line=line.replace(/([.!?])\s+/g,'$1\u0001').split('\u0001').filter(sn=>{ const named=[]; coachTokens(sn,named); const k=named.filter(c=>c!=='KeyG'&&c!=='Period'); return !(k.length&&k.every(c=>!G.revealed.has(c))); }).join(' ');
      // off the script (an extra wait, a key taken early) a step can name a key that is deadly this turn: say so instead
      const named=[]; coachTokens(line,named);
      if(named.some(c=>!G.fingers.has(c)&&G.revealed.has(c)&&GDOT.place(GDOT.cloneGame(G),c).type==='dead')) line=DANGER_LINE;
    }
    text=[...shown.map(tipText),COACH.msg,line].filter(Boolean).join(' '); }
  const h=text?coachTokens(text,COACH.keys).replace(/\s+/g,' ').trim()
    .replace(/(<span class="cap[^>]*>[^<]*<\/span>|<i class="ci [^>]*>(?:(?!<\/i>)[\s\S])*<\/i>)([.,:;!?)]+)/g,'<span class="nw">$1$2</span>'):''; // a cap or icon keeps its punctuation
  if(el.dataset.h!==h){ el.innerHTML=h; el.dataset.h=h; }
  el.classList.toggle('on',!!h);
  // a tip counts as seen once it has really been on screen (not while the page is hidden)
  if(shown.length&&document.visibilityState!=='hidden'){ COACH.shown=shown; markSeen(shown.filter(END_TIP)); }
}
// the footer's tutorial button: skip it while it is on, play it again once it is not
function renderTutBtn(){
  const b=$('tutorial'); if(!b) return; const has=!STUDIO&&tutTanks().length>0; b.hidden=!has; if(!has) return;
  const t=tutorialOn()?'skip tutorial':'play the tutorial'; if(b.textContent!==t) b.textContent=t;
}

/* ================= input ================= */
// Keys belong to the game unless you are typing in a field or choosing from a list.
const isField=e=>{ const t=e.target; if(!t||!t.tagName) return false; if(t.tagName==='TEXTAREA'||t.tagName==='SELECT') return true; return t.tagName==='INPUT'&&!/^(checkbox|radio|button|submit|reset)$/i.test(t.type); };
// raw event log (studio, editor open): every keydown/keyup the browser delivers, before any game rule
const EVLOG=[]; let evT0=0;
function logEv(e){ const t=performance.now(); if(!evT0||t-evT0>5000) evT0=t; EVLOG.push(`${e.type==='keydown'?'↓':'↑'}${e.code||'?'}${e.repeat?'(rep)':''}@${Math.round(t-evT0)}ms`); if(EVLOG.length>14) EVLOG.shift();
  const el=$('evlog'); if(el) el.textContent='Raw events: '+EVLOG.join('  '); }
window.addEventListener('keydown',logEv,true); window.addEventListener('keyup',logEv,true);
window.addEventListener('keydown',e=>{
  if(STUDIO&&E.capture&&!e.repeat&&KEYMAP[e.code]&&!(e.target&&/^(INPUT|TEXTAREA)$/.test(e.target.tagName))){ e.preventDefault(); E.capture=false; setTankKey(e.code); return; }
  if(STUDIO&&/^Arrow(Left|Right|Up|Down)$/.test(e.code)&&!(e.target&&/^(INPUT|TEXTAREA)$/.test(e.target.tagName))){ e.preventDefault(); if(e.target&&e.target.blur) e.target.blur(); if(!e.repeat) hop(e.code); return; } // a focused dropdown never eats them
  if(isField(e)) return;
  const code=e.code; if(!KEYMAP[code]) return; e.preventDefault(); if(e.repeat||held.has(code)) return;
  held.add(code); audio.unlock();
  // G. — hold G, tap . : restart; after a run ends, go where the run sent you
  if(code==='Period'&&held.has('KeyG')){
    let gaveUp=false; const fresh=!free()&&!tutorialOn()&&((G.phase==='won'&&NEXT===NEWGAME)||(inIntro()&&campaignDone()));
    if(inIntro()){ introEnd(); }
    if(fresh) newCampaign();
    if(G.phase==='play'&&G.turn>1&&!free()&&isTerr(LV)){ T('death',{turn:G.turn,tentacles:G.fingers.size,by:'restart'}); NEXT=LV.id; } // territory: start the tank again
    else if(G.phase==='play'&&G.turn>1&&!free()){ // giving up mid-run is leaving the tank: you are sent on, like a death
      T('death',{turn:G.turn,tentacles:G.fingers.size,by:'restart'}); NEXT=pickNext(LV.id); PROG.cur=NEXT; saveProgress(); gaveUp=NEXT!==LV.id&&!isTut(zoneOf(LV)); }
    if((G.phase==='dead'||G.phase==='won'||G.phase==='play')&&NEXT&&NEXT!==LV.id){ const i=levelIndex(NEXT); if(i>=0) setCur(i); refreshEditor(); }
    buildRuntime(); refused.set('Period','combo'); if(gaveUp) tip('sent');
    if(G.START.includes('KeyG')){ startRun(); place('KeyG'); if(G.phase==='play'&&mustHold()){ tip('g-start',false,true); render(); } } else { G.fingers.clear(); render(); }
    return;
  }
  if(inIntro()){ render(); return; }
  if(G.phase==='ready'){ if(G.START.includes(code)){ startRun(); place(code); } else refuse(code,'start'); return; }
  if(G.phase==='dead'||G.phase==='won'){ refused.set(code,'over'); render(); return; }
  if(code==='Space'&&G.MODE==='territory'&&G.phase==='play'&&(G.inkLeft>0||(LV.ink>0&&G.turn>0))&&!G.fingers.has('Space')&&!GDOT.territory(G).has('Space')){ squirt(); return; }
  if(G.fingers.has(code)){ pressAt[code]=performance.now(); render(); return; } // quick tap = lift (on release); a long press is an anchor finger
  place(code);
});
const TAP_MS=300, pressAt={};
window.addEventListener('keyup',e=>{
  if(isField(e)) return; const code=e.code; if(KEYMAP[code]) e.preventDefault();
  held.delete(code); refused.delete(code);
  if(G.phase==='play'){
    if(pressAt[code]!=null){ const dt=performance.now()-pressAt[code]; delete pressAt[code];
      if(dt<TAP_MS&&G.fingers.has(code)){
        const block=GDOT.liftBlock(G,code);
        if(block){ CUE.nolift=code; audio.refuse(code); say(block==='none'?'Tentacles stay where they land here.':'One at a time: place the lifted tentacle first.'); coachSet(block); tip('lift-'+block); }
        else { GDOT.pickup(G,code); CUE={}; say(`Lifted from ${L(code)}.`); coachSet('lift'); }
      } }
    if(held.size===0&&mustHold()) return letGo('You let go.','letgo');
  }
  render();
});
function lostFocus(){
  held.clear(); refused.clear(); if(!G) return;
  if(G.phase==='play'&&mustHold()){ letGo('The window lost focus, so you let go.','blur'); }
  else render();
}
// Leaving the page mid-run is letting go, held keys or not, so a reload is never a free retry.
window.addEventListener('pagehide',()=>{ if(G&&G.phase==='play'&&!free()){ letGo('You left the tank.','leave'); try{ window.Telemetry&&Telemetry.flush&&Telemetry.flush(); }catch(e){} } },true);
// back on a page whose run ended while it was hidden: say what happened
function backAgain(){ if(!PROG||!G||inIntro()||STUDIO) return;
  loadProgress(); // another tab (or a later page) may have saved meanwhile: never write back a stale copy
  if(unseen&&G.phase==='dead'){ const u=unseen; unseen=null; if(PROG.left){ delete PROG.left; saveProgress(); } tip(u.sent?'left':'dead-'+u.kind,true); render(); } }
let unseen=null; // a death that happened while the page was hidden or going away
window.addEventListener('blur',lostFocus);
document.addEventListener('visibilitychange',()=>{ if(document.hidden) lostFocus(); else backAgain(); });
window.addEventListener('focus',()=>{ if(G) render(); });
on('plate','click',()=>{ if(!isEdit()) $('plate').focus(); });
on('sound','change',e=>{audio.on=e.target.checked; e.target.blur();});
on('nohold','change',e=>{ SET.nohold=e.target.checked; saveSettings(); e.target.blur(); T('setting',{nohold:SET.nohold}); if(G) render(); });
on('tips','change',e=>{ SET.tips=e.target.checked; saveSettings(); e.target.blur(); if(!SET.tips) COACH.tip=[]; if(G) render(); });
window.addEventListener('storage',e=>{ if(e.key!==SETTINGS_KEY) return; SET=readSettings(); if($('nohold')) $('nohold').checked=!!SET.nohold; if($('tips')) $('tips').checked=SET.tips!==false; if(G) render(); });
on('tutorial','click',e=>{ e.target.blur(); if(STUDIO) return;
  const skip=tutorialOn();
  if(skip) PROG.tutorial='skipped'; else { PROG.tutorial='replay'; for(const l of tutTanks()) delete PROG.beaten[l.id]; }
  T('tutorial',{action:skip?'skip':'replay'});
  NEXT=null; const i=levelIndex(pickNext(null)); saveProgress();
  if(i<0||isTut(zoneOf(STORE.levels[i]))&&!tutorialOn()){ if(inIntro()) render(); else introStart(); return; } // nothing left: the intro, where G+. starts a new game
  setCur(i);
  if(inIntro()){ render(); return; } // the intro keeps running; G+. now goes there
  buildRuntime(); });
on('editor','change',e=>{ document.body.classList.toggle('edit',e.target.checked); $('panel').hidden=!e.target.checked; e.target.blur(); if(e.target.checked){ refreshEditor(); pvReset(); pvStart(); } else pvStop(); fit(); render(); }); // the tank you were editing stays
// a list or checkbox you just used gives the keys back to the tank (no type-ahead into selects)
on('panel','change',e=>{ const t=e.target; if(t.tagName==='SELECT'||t.type==='checkbox') t.blur(); });
on('reset-progress','click',e=>{ e.target.blur(); armed(e.target,'click again to forget every tank',()=>{
  PROG={beaten:{},played:{},tick:0,cur:null,tips:{}}; saveProgress(); COACH.tip=[];
  if(STUDIO){ buildRuntime(); refreshEditor(); return; }
  setCur(levelIndex(pickNext(null))); buildRuntime(); const h=document.querySelector('.howto'); if(h) h.open=false; introStart(); }); });
// another tab reset or changed progress: pick it up (a run in progress keeps going)
window.addEventListener('storage',e=>{ if(e.key!==PROGRESS_KEY||!PROG) return; loadProgress();
  if(!STUDIO&&G&&!inIntro()&&G.phase!=='play'){ const keep=COACH.tip.slice(), i=levelIndex(PROG.cur); CUR=i>=0?i:Math.max(0,levelIndex(pickNext(null))); buildRuntime(); for(const id of keep) if(!COACH.tip.includes(id)) COACH.tip.push(id); render(); } else if(G) render(); });
on('zone','click',e=>{ const t=e.target.closest('[data-i]'); if(!t) return;
  if(!free()){ const l=STORE.levels[+t.dataset.i]; if(!l||!G||G.phase==='play'||inIntro()) return;
    if(l.id===PROG.ret){ delete PROG.ret; } // back to the tank you left for a replay
    else { if(!beaten(l)||!isTerr(l)) return; if(!PROG.ret&&LV&&!beaten(LV)) PROG.ret=LV.id; } } // players: replay a cleared territory tank for par
  setCur(+t.dataset.i); buildRuntime(); refreshEditor(); });

/* ================= render ================= */
function build(){
  const b=$('board'); b.innerHTML='';
  for(const k of KEYS){
    const d=document.createElement('div'); d.className='k fog'; d.dataset.code=k.code;
    d.style.left=`calc(var(--u)*${k.x})`; d.style.top=`calc(var(--u)*${ROWY[k.row]})`; d.style.width=`calc(var(--u)*${k.w})`;
    d.addEventListener('mousedown',ev=>{ if(!isEdit()) return; ev.preventDefault(); paint.on=true; paint.seen=new Set(); onKeyPaint(k.code,true); });
    d.addEventListener('mouseenter',()=>{ if(isEdit()&&paint.on) onKeyPaint(k.code,false); });
    b.appendChild(d); els[k.code]=d;
  }
  const cl=document.createElement('div'); cl.id='critters'; b.appendChild(cl);
  const bb=document.createElement('div'); bb.className='bubbles'; for(let i=0;i<7;i++){ const s=document.createElement('i'); s.className='bubble'; s.style.left=(6+i*13.5)%94+'%'; s.style.animationDelay=(i*1.7)%7+'s'; s.style.animationDuration=(6+(i*2.3)%4)+'s'; bb.appendChild(s); } b.parentElement.insertBefore(bb,b);
  window.addEventListener('mouseup',()=>{ paint.on=false; });
  const lg=$('legend'); if(!lg) return; lg.innerHTML='';
  const add=(icon,color,text)=>{const s=document.createElement('div');s.innerHTML=`<i style="color:${color}">${ICON[icon]}</i>${text}`;lg.appendChild(s);};
  add('tentacle','var(--held)','tentacle'); add('shark','var(--danger)','predator'); add('fish','var(--prey)','food');
  add('ink','var(--ink)','ink (Space)'); add('starfish','var(--mark)','starfish'); add('algae','var(--algae)','algae'); add('rock','var(--rock)','rock'); add('reef','var(--reef)','reef'); add('cave','var(--cave)','cave');
}
const mark=(cls,icon)=>`<span class="mark ${cls}">${icon}</span>`;
const REASON_ICON={ink:ICON.ink,reach:ICON.q,fog:ICON.q,algae:ICON.algae,rock:ICON.rock,max:ICON.tentacle+`<span class="x">${ICON.slash}</span>`,start:ICON.start,over:'',combo:''};
function render(){
  const edit=isEdit(), debug=edit;
  renderCoach(); renderTutBtn(); const ck=new Set(COACH.keys);
  const {fingers,revealed,creatures,TER,START,REQ,phase}=G;
  const pv=pvActive()?PV:null; // the editor's live preview, when it is running
  const occ={}; for(const c of (pv?pv.creatures:creatures)){ if(c.alive&&(debug||GDOT.isVisible(G,c))) occ[c.pos]=c; }
  const lane=new Set(), badge={};
  if(debug) for(const c of creatures){ if(c.alive) for(const p of GDOT.lane(G,c)) lane.add(p); }
  if(!debug&&G.MODE==='territory') for(const c of creatures){ if(c.alive&&c.seen&&c.awake) for(const p of GDOT.lane(G,c)) lane.add(p); } // territory: every fixed route is shown in full (chasers have none)
  let selPos=null;
  if(edit&&E.sel!=null){ const lc=LV.creatures[E.sel]; if(lc){ selPos=lc.mover==='path'?(lc.path||[])[0]:lc.at; if(lc.mover==='path') (lc.path||[]).forEach((p,i)=>{badge[p]=(badge[p]?badge[p]+',':'')+(i+1);}); } }
  const INT=new Map(), aim=new Set(), blind=new Set(); // aim: every key a creature will cover after your next press; blind: from somewhere you cannot see
  if(phase==='play'||phase==='ready') for(const t of GDOT.intents(G)){ const c=G.creatures[t.id], vis=GDOT.isVisible(G,c); if(vis) INT.set(t.from,t);
    for(const k of (t.keys||[t.to])) if(k!==t.from){ aim.add(k); if(!vis) blind.add(k); } }
  const hurt=CUE.hurt, meals=new Map(((pv?pvCue.meals:CUE.meals)||[]).map(m=>[m.key,m])), ate=new Set(CUE.ate||[]), woke=new Set(CUE.woke||[]), spot=new Set(CUE.spot||[]);
  for(const k of KEYS){
    const d=els[k.code]; const code=k.code; let cls='k',html='';
    const t=TER[code]; const seen=revealed.has(code)||debug;
    if(hurt&&hurt.key===code){ // the bite: the killer, drawn over the tentacle it took
      cls+=' hurt'+(t?' t-'+t:''); html=iconOf(hurt.type)+mark('hm',ICON.tentacle)+(hurt.kind==='hiding'?mark('hq',ICON.q):'');
    } else if(hurt&&hurt.moved&&hurt.from===code){ // where it came from, and which way
      cls+=' trail'; html=`<span class="ghost">${iconOf(hurt.type)}</span><span class="arrow" style="transform:rotate(${hurt.deg}deg)">${ICON.arrow}</span>`;
    } else if(fingers.has(code)){
      cls+=' held'; if(held.has(code)) cls+=' anchor'; if(t) cls+=' t-'+t;
      if(CUE.letgo) cls+=' gone'; if(CUE.won) cls+=' glow';
      html=ICON.tentacle+(CUE.nolift===code?mark('lk',ICON.lock):'');
    } else if(phase==='play'&&G.lifted===code){ cls+=' open lifted'; html=`<span class="ghost">${ICON.tentacle}</span>`; }
    else if(phase==='ready'&&START.includes(code)&&!edit){ cls+=' open start'; html=k.label; }
    else if(!seen){ cls+=' fog'; }
    else if(occ[code]){ const c=occ[code]; cls+=' occ '+(c.prey?'prey':'pred'); if(t) cls+=' t-'+t; html=`<span class="sub">${k.label}</span>`; }
    else if(t==='algae'||t==='rock'){ cls+=' occ t-'+t; html=ICON[t]; }
    else if(t==='reef'||t==='cave'){ cls+=' occ t-'+t; html=ICON[t]+`<span class="sub">${k.label}</span>`; }
    else { cls+=' open'; html=k.label; }
    if(seen&&meals.has(code)){ cls+=' meal'; html+=mark('mb',ICON.bones); }
    if(ate.has(code)){ cls+=' yum'; }
    if(CUE.taken&&CUE.taken.includes(code)&&!(hurt&&hurt.key===code)){ cls+=' taken'; html+=mark('tk',ICON.tentacle); } // a creature took this tentacle
    if(CUE.grew&&CUE.grew.includes(code)) cls+=' grew';
    if(G.ink&&G.ink[code]&&seen){ cls+=' inked'+(G.ink[code]>=GDOT.INK_TURNS?' fresh':''); html+=mark('inkm',ICON.ink); }
    if(woke.has(code)){ cls+=' woke'; html+=mark('wk',ICON.bang); }
    if(spot.has(code)&&!hurt) cls+=' spot';
    if(refused.has(code)){ const r=refused.get(code); if(r!=='combo'&&r!=='over'){ cls+=' bad'; html=`<span class="lbl">${esc(k.label)}</span>`+(REASON_ICON[r]?mark('why',REASON_ICON[r]):''); } }
    if(lane.has(code)) cls+=' lane';
    if(REQ.includes(code)&&(seen||edit)){ // a starfish is found, never shown through fog; it fills its key
      const onTop=fingers.has(code)||!!occ[code]||(hurt&&(hurt.key===code||(hurt.moved&&hurt.from===code)))||refused.has(code);
      cls+=' req'+(fingers.has(code)?' got':'')+(onTop?' under':'');
      html=onTop?`<span class="starfish">${ICON.starfish}</span>`+html:ICON.starfish+`<span class="sub">${esc(k.label)}</span>`;
    }
    if(edit){ if(START.includes(code)) cls+=' start'; if(badge[code]) html+=`<span class="badge">${badge[code]}</span>`; if(selPos===code) cls+=' sel'; }
    if(!edit&&INT.has(code)&&occ[code]){ const t=INT.get(code); if(t.to===t.from) html+=mark('stay',ICON.slash.replace('M4 16 L16 4','M5 10 H15')); else { const f=KEYMAP[t.from], k=KEYMAP[t.to], deg=Math.round(Math.atan2(ROWY[k.row]-ROWY[f.row],(k.x+k.w/2)-(f.x+f.w/2))*180/Math.PI); html+=`<span class="mark intent" style="transform:rotate(${deg}deg)">${ICON.arrow}</span>`; } }
    if(!edit&&aim.has(code)&&revealed.has(code)){ cls+=' aimed'; if(blind.has(code)&&!occ[code]&&!fingers.has(code)){ cls+=' blind'; html+=mark('bq',ICON.q); } } // a creature arrives here after your next press (from the fog: a ?)
    if(pv&&START.includes(code)&&!occ[code]){ cls+=' pvghost'; html+=`<span class="ghost pvg">${ICON.tentacle}</span>`; }
    if(phase==='intro'&&(code==='KeyG'||code==='Period')) cls+=' start';
    if(ck.has(code)&&!edit&&!/ fog\b/.test(cls)) cls+=' coachk'; // the key the coach line names
    if(phase==='play'&&held.has(code)&&!fingers.has(code)&&!refused.has(code)) cls+=' pressed'; // a finger on a key with no tentacle: it still counts as holding
    if(k.w>1.2) cls+=' wide';
    if(d.dataset.c!==cls){d.className=cls;d.dataset.c=cls;}
    if(d.dataset.h!==html){d.innerHTML=html;d.dataset.h=html;}
  }
  renderCritters(pv||G,debug);
  $('turn').textContent=G.turn;
  { const pb=$('parbox'), on=!!LV&&G.MODE==='territory'&&LV.par>0; if(pb){ pb.hidden=!on; if(on){ $('par').textContent=LV.par; const b=(PROG.best||{})[LV.id]; $('bestbox').hidden=!b; if(b) $('best').textContent=b; } else $('bestbox').hidden=true; } }
  renderStrip(); renderZone();
  const hk=[...held]; if($('probe')) $('probe').textContent=`Browser sees held (${hk.length}): ${hk.map(c=>L(c)+(fingers.has(c)?'(anchor)':refused.has(c)?'(refused)':'')).join('  ')||'—'}`;
  if(isEdit()) renderEcology();
}
// The creature layer: one sprite per visible creature (and per body segment), moved with a CSS transition so it
// glides from key to key; it faces the way it goes. A blooming jellyfish swells; a sleeper is faded.
function renderCritters(src,debug){
  const layer=$('critters'); if(!layer) return;
  const want=new Map(), hurtId=CUE.hurt&&CUE.hurt.cid;
  for(const c of src.creatures){
    if(!c.alive||!(debug||GDOT.isVisible(src,c))) continue; if(hurtId!=null&&c.id===hurtId&&G.phase==='dead') continue;
    want.set('c'+c.id,{type:c.type,key:c.pos,cls:(c.prey?'prey':'pred')+(GDOT.bloomNow(src,c)?' bloom':'')+(c.wake&&!c.awake?' asleep':''),dir:c.dir,seg:false});
    GDOT.body(c).forEach((k,i)=>{ if(debug||src.revealed.has(k)) want.set('c'+c.id+'b'+i,{type:'seg',key:k,cls:'seg pred',dir:c.dir,seg:true}); });
  }
  for(const el of [...layer.children]) if(!want.has(el.dataset.id)) el.remove();
  for(const [id,w] of want){
    const k=KEYMAP[w.key]; if(!k) continue; let el=layer.querySelector(`[data-id="${id}"]`);
    if(!el){ el=document.createElement('div'); el.dataset.id=id; el.dataset.x=k.x+(k.w-1)/2; el.style.setProperty('--d',((id.length*7+id.charCodeAt(1))%6)*.35+'s'); layer.appendChild(el); }
    if(el.dataset.type!==w.type){ el.dataset.type=w.type; el.innerHTML=`<i>${w.type==='seg'?ICON.seg:iconOf(w.type)}</i>`; }
    const x=k.x+(k.w-1)/2, y=ROWY[k.row], px=+el.dataset.x; let flip=el.classList.contains('w');
    if(x<px) flip=true; else if(x>px) flip=false; else if(!w.seg&&w.dir){ if(/W/.test(w.dir)) flip=true; else if(/E/.test(w.dir)) flip=false; }
    el.dataset.x=x; el.style.transform=`translate(calc(var(--u)*${x}),calc(var(--u)*${y}))`;
    el.className='cr t-'+w.type+' '+w.cls+(flip?' w':'');
  }
}
// The icon strip under the tank: what to press, how many tentacles, what happened.
const cap=(label,cls='')=>`<span class="cap ${cls}">${esc(label)}</span>`;
const gdotCombo=()=>`<span class="combo">${cap('G','down')}<i class="ico">${ICON.plus}</i>${cap('.')}</span>`;
// The tray: one slot per tentacle the tank needs. A starfish you have uncovered takes one of those
// slots (a tentacle on it counts toward the goal), drawn as its key cap at the end of the tray, so
// "3 down, starfish still open" never reads as a full tray. Only uncovered starfish are shown: how
// many there are is part of the exploring.
function tray(){
  if(G.MODE==='territory'){ const n=Math.max(0,G.GOAL-(G.left||0)), slots=G.GOAL;
    let h='<span class="tray terr">'; for(let i=0;i<slots;i++) h+=`<i class="slot${i<n?' on':''}">${ICON.tentacle}</i>`;
    h+=`<b class="tcount">${n}/${G.GOAL}</b>`;
    const found=G.REQ.filter(k=>G.revealed.has(k)||G.fingers.has(k)||isEdit());
    if(found.length) h+='<span class="reqs">'+found.map(k=>`<span class="cap req${G.grown.has(k)?' down':''}"><i class="cstar">${ICON.starfish}</i>${esc(L(k))}</span>`).join('')+'</span>';
    h+='</span>';
    if(G.liftPending) h+=`<span class="chip lifted"><i class="ico">${ICON.up}</i><i class="ico">${ICON.tentacle}</i>${G.LIFT==='one'?`<i class="ico lockd">${ICON.lock}</i>`:''}</span>`;
    if(G.inkLeft>0||(LV.ink>0&&G.phase==='play')) h+=`<span class="chip inkc${G.inkLeft?'':' out'}" title="ink: tap Space">${cap('Space')}${'<i class="ico inki">'+ICON.ink+'</i>'.repeat(Math.max(0,G.inkLeft))}</span>`;
    return h; }
  const found=G.REQ.filter(k=>G.revealed.has(k)||G.fingers.has(k)||isEdit());
  const onStar=found.filter(k=>G.fingers.has(k)).length, plain=G.fingers.size-onStar;
  const need=Math.max(0,G.GOAL-found.length), room=G.MAX?Math.max(0,G.MAX-found.length):0;
  const slots=Math.max(need,plain,room);
  let h='<span class="tray'+(refusedReason('max')?' full':'')+'">';
  for(let i=0;i<slots;i++) h+=`<i class="slot${i<plain?' on':''}${i===need-1&&slots>need?' goal':''}">${ICON.tentacle}</i>`;
  if(found.length) h+='<span class="reqs">'+found.map(k=>`<span class="cap req${G.fingers.has(k)?' down':''}"><i class="cstar">${ICON.starfish}</i>${esc(L(k))}</span>`).join('')+'</span>';
  h+='</span>';
  if(G.LIFT==='none') h+=`<i class="ico lockd" title="tentacles cannot be lifted">${ICON.lock}</i>`;
  else if(G.liftPending) h+=`<span class="chip lifted"><i class="ico">${ICON.up}</i><i class="ico">${ICON.tentacle}</i>${G.LIFT==='one'?`<i class="ico lockd">${ICON.lock}</i>`:''}</span>`;
  return h;
}
function refusedReason(r){ for(const v of refused.values()) if(v===r) return true; return false; }
function goChip(){
  if(!NEXT) return '';
  if(NEXT===NEWGAME) return `<span class="chip done"><i class="ico win">${ICON.star}</i><i class="ico win">${ICON.star}</i><i class="ico win">${ICON.star}</i></span><i class="ico">${ICON.again}</i>${cap(tankLabel(STORE.levels[levelIndex(pickNext(null))]||LV),'next')}`;
  if(NEXT===LV.id) return `<i class="ico">${ICON.again}</i>`;
  const l=STORE.levels[levelIndex(NEXT)]; if(!l) return '';
  const z=zoneOf(l), other=z.id!==zoneOf(LV).id;
  return `<i class="ico">${ICON.arrow}</i>${cap(tankLabel(l),'next'+(other?' zone':''))}`;
}
function renderStrip(){
  let h='';
  if(G.phase==='intro') h=(campaignDone()&&!free()&&!tutorialOn()?`<span class="chip done"><i class="ico win">${ICON.star}</i></span><i class="ico">${ICON.again}</i>`:'')+gdotCombo();
  else if(G.phase==='ready') h=G.START.includes('KeyG')?gdotCombo():G.START.map(k=>cap(L(k),'pulse')).join('');
  else if(G.phase==='play') h=tray();
  else if(G.phase==='dead') h=`<span class="chip bite">${CUE.hurt?`<i class="ico pred">${iconOf(CUE.hurt.type)}</i><i class="ico hurtt">${ICON.tentacle}</i>`:`<i class="ico">${ICON.up}</i><i class="ico gonet">${ICON.tentacle}</i>`}</span>${goChip()}${gdotCombo()}`;
  else if(G.phase==='won') h=`<i class="ico win">${ICON.star}</i>${G.MODE==='territory'&&LV.par?`<span class="chip parc${G.turn<=LV.par?' made':''}" title="presses / par">${G.turn}<small>/${LV.par}</small></span>`:''}${tray()}${goChip()}${gdotCombo()}`;
  const s=$('status'); if(s.dataset.h!==h){ s.innerHTML=h; s.dataset.h=h; }
  s.className='status '+G.phase;
}
// Studio hotkeys: left and right go to the tank before or after in the zone strip (on into the next or
// previous zone at the ends), up and down to the first tank of the zone before or after. Nothing is played.
function zoneTanksShown(z){ const pos=k=>{ const q=KEYMAP[k]; return q?q.row*100+q.x:1e9; }; const list=tanks(z).map((t,n)=>Object.assign({key:(z.keys||[])[n]},t)); return isTut(z)?list:list.sort((a,b)=>pos(a.key)-pos(b.key)||a.i-b.i); } // the tutorial: in play order
function hop(code){
  const list=zones().filter(z=>tanks(z).length); if(!list.length) return;
  let zi=Math.max(0,list.findIndex(z=>z.id===zoneOf(LV).id)), ts=zoneTanksShown(list[zi]), ti=Math.max(0,ts.findIndex(t=>t.i===CUR));
  if(code==='ArrowRight'){ if(ti<ts.length-1) ti++; else { zi=(zi+1)%list.length; ts=zoneTanksShown(list[zi]); ti=0; } }
  else if(code==='ArrowLeft'){ if(ti>0) ti--; else { zi=(zi-1+list.length)%list.length; ts=zoneTanksShown(list[zi]); ti=ts.length-1; } }
  else { zi=(zi+(code==='ArrowDown'?1:-1)+list.length)%list.length; ts=zoneTanksShown(list[zi]); ti=0; }
  refused.clear(); setCur(ts[ti].i); buildRuntime(); refreshEditor();
}
function renderZone(){
  const z=zoneOf(LV), list=zones();
  let h=`<span class="zname">${esc(z.name)}</span><span class="tanks">`;
  // caps in keyboard order (the zone's key list is the order tanks come up in)
  for(const t of zoneTanksShown(z)){
    const c=['tank']; if(beaten(t.l)) c.push('won'); if(beaten(t.l)&&t.l.par&&(PROG.best||{})[t.l.id]<=t.l.par) c.push('par'); if(!free()&&((beaten(t.l)&&isTerr(t.l))||t.l.id===PROG.ret)) c.push('replay'); if(t.l.id===PROG.ret) c.push('ret'); if(t.i===CUR) c.push('cur'); if(NEXT&&t.l.id===NEXT&&NEXT!==LV.id) c.push('next'); if(finaleLocked(t.l)) c.push('locked');
    h+=`<span class="${c.join(' ')}" data-i="${t.i}" title="${free()?esc(t.l.name):''}">${beaten(t.l)?ICON.tentacle:esc(tankLabel(t.l))}</span>`;
  }
  h+='</span><span class="zdots">'+list.map(q=>`<i class="zdot${zoneDone(q)?' done':''}${q.id===z.id?' cur':''}"></i>`).join('')+'</span>';
  h+=`<span class="lname">${esc(LV.name)}</span>`;
  const el=$('zone'); if(el.dataset.h!==h){ el.innerHTML=h; el.dataset.h=h; }
}
function fit(){
  const edit=isEdit();
  const cw=document.documentElement.clientWidth;
  const w=Math.min(cw,1380)-32-6-(edit&&cw>980?376:0);
  const u=Math.max(19,Math.min(56,Math.floor(w/15.75)));
  document.documentElement.style.setProperty('--u',u+'px');
}
window.addEventListener('resize',fit);

/* ================= editor ================= */
const E={brush:'water',sel:null,drawing:false,placing:false,capture:false,ecoScope:'level'};
const paint={on:false,seen:new Set()};
const UNDO=[];
const BRUSHES=[['water','Water','water'],['algae','Algae','algae'],['rock','Rock','rock'],['reef','Reef','reef'],['cave','Cave','cave'],['start','Start','start'],['req','Starfish','starfish'],['creature','Creature','creature']];
function snapshot(){ return JSON.stringify({levels:STORE.levels,zones:STORE.zones,cur:CUR}); }
// Every editor change goes through edit(): undo point, mark dirty, save, rebuild.
// Every tank in a zone starts on the key it is named after. After any change, a tank whose key
// changed is moved so its layout comes with it (any letter or number key, any row); if that cannot
// be done (a wide key or the F-row is involved) the layout stays and only the start moves, and the
// note says so, so the designer can repaint.
function slotKey(l){ const z=zoneOf(l); const n=tanks(z).findIndex(t=>t.l===l); return (z.keys&&z.keys[n])||null; }
function syncStarts(){
  const stranded=[];
  for(const l of STORE.levels){
    const k=slotKey(l); if(!k) continue;
    const st=l.start||[]; if(st.length===1&&st[0]===k) continue;
    const o=st.length?GDOT.latticeOffset(st[0],k):null, moved=o?GDOT.shiftLevel(l,o[0],o[1]):null;
    if(moved){ moved.start=[k]; for(const key of Object.keys(l)) delete l[key]; Object.assign(l,moved); continue; }
    l.start=[k]; l.terrain=l.terrain||{}; if(l.terrain[k]==='algae'||l.terrain[k]==='rock') delete l.terrain[k];
    if(Array.isArray(l.tank)&&!l.tank.includes(k)) l.tank.push(k);
    stranded.push(l.name+' → '+L(k));
  }
  return stranded;
}
function edit(fn,merge){ const before=snapshot(); const lv0=LV, was=LV?JSON.stringify(Object.assign({},LV,{par:0,name:0})):null; fn();
  if(lv0&&lv0===LV&&lv0.par&&isTerr(lv0)&&JSON.stringify(Object.assign({},lv0,{par:0,name:0}))!==was){ delete lv0.par; setTimeout(()=>note('This tank changed, so its par was cleared: click Find par.'),0); } const stranded=syncStarts(); if(!merge) UNDO.push(before); if(UNDO.length>400) UNDO.shift(); STORE.dirty=true; saveStore(); buildRuntime(); refreshEditor();
  if(stranded.length) note('Could not move the layout with it (a wide key or the F-row is in the way), so only the start moved; repaint around it: '+stranded.join(', ')+'.'); }
function undo(){ const s=UNDO.pop(); if(!s) return note('Nothing to undo.'); const v=JSON.parse(s); STORE.levels=v.levels; STORE.zones=v.zones; STORE.dirty=true; saveStore(); setCur(v.cur); E.drawing=false; E.placing=false; buildRuntime(); refreshEditor(); note('Undone.'); }
function note(t){ $('e-msg').textContent=t; }
// Coach lines as text, one per line: "ready: Press {L}." (moments: ready, 1, 2, ..., lift, won, eaten,
// letgo, fog, algae, rock, max, start, one, none).
const COACH_ORDER=['ready','1','2','3','4','5','6','7','8','9','10','lift','taken','grow','ink','won','eaten','overrun','letgo','fog','algae','rock','reach','max','start','one','none'];
function coachText(c){ if(!c||typeof c!=='object') return ''; const r=k=>{ const i=COACH_ORDER.indexOf(k); return i<0?999:i; };
  return Object.keys(c).sort((a,b)=>r(a)-r(b)||(+a)-(+b)).map(k=>k+': '+c[k]).join('\n'); }
function parseCoach(s){ const o={}; for(const line of String(s||'').split(/\r?\n/)){ const m=line.match(/^\s*([a-z0-9-]+)\s*:\s*(.*\S)\s*$/i); if(m) o[m[1].toLowerCase()]=m[2]; } return Object.keys(o).length?o:null; }
function newId(base){ let id=slug(base), n=2; while(STORE.levels.some(l=>l.id===id)) id=slug(base)+'-'+(n++); return id; }
// A tank leaving its zone (deleted or moved away) frees its key: the key goes to the back of the
// zone's list, so every other tank keeps the key it had and the next new tank gets the free one.
function releaseSlot(l){ const z=zoneOf(l); if(z===LOOSE||!z.keys) return; const n=tanks(z).findIndex(t=>t.l===l); if(n>=0&&n<z.keys.length) z.keys.push(z.keys.splice(n,1)[0]); }
// Move level l to slot n of zone z (0-based), keeping every other zone's levels where they are.
function placeInZone(l,z,n){
  if(STORE.levels.includes(l)&&zoneOf(l).id!==z.id) releaseSlot(l);
  l.zone=z.id===LOOSE.id?undefined:z.id; if(l.zone===undefined) delete l.zone;
  const rest=STORE.levels.filter(x=>x!==l), members=rest.filter(x=>zoneOf(x).id===z.id);
  n=Math.max(0,Math.min(n,members.length));
  let at; if(!members.length){ const zi=zones().findIndex(q=>q.id===z.id); const after=rest.map((x,i)=>zones().findIndex(q=>q.id===zoneOf(x).id)<=zi?i:-1).filter(i=>i>=0); at=after.length?after[after.length-1]+1:0; }
  else at=n<members.length?rest.indexOf(members[n]):rest.indexOf(members[members.length-1])+1;
  rest.splice(at,0,l); STORE.levels=rest; CUR=STORE.levels.indexOf(l);
}
function initEditor(){
  const b=$('brush');
  for(const [id,name,icon] of BRUSHES){ const bt=document.createElement('button'); bt.className='b-'+id; bt.innerHTML=`<i>${ICON[icon]}</i>${name}`; bt.addEventListener('click',()=>{E.brush=id;E.drawing=false;E.placing=false;refreshEditor();}); bt.dataset.id=id; b.appendChild(bt); }
  for(const sel of [$('e-ctype'),$('c-type')]) for(const [id,p] of Object.entries(PRESETS)){ const o=document.createElement('option'); o.value=id; o.textContent=p.label+(p.prey?' (food)':''); sel.appendChild(o); }
  for(const sel of [$('c-go1'),$('c-go2')]){ sel.innerHTML='<option value="">—</option>'+TARGETS.map(t=>`<option value="${t}">${t==='tentacle'?'your tentacles':PRESETS[t].label}</option>`).join(''); }
  $('z-env').innerHTML=Object.entries(ENVS).map(([v,n])=>`<option value="${v}">${n}</option>`).join('');
  $('e-levels').addEventListener('change',e=>{ setCur(+e.target.value); E.sel=null; E.drawing=false; E.placing=false; buildRuntime(); refreshEditor(); });
  $('e-new').addEventListener('click',()=>edit(()=>{
    const z=zoneOf(LV), n=tanks(z).length, k=(z.keys&&z.keys[n])||'KeyG';
    const l={id:newId('tank-'+Date.now().toString(36)),name:'New tank',zone:z.id,goal:4,start:[k],required:[],tank:[k,...NEI[k].filter(q=>!/^Meta/.test(q))],terrain:{},creatures:[]};
    STORE.levels.push(l); placeInZone(l,z,n); E.sel=null; E.brush='water';
    note(z.keys&&z.keys[n]?`New tank on ${L(k)}, the zone's next free key. Paint water to grow it; everything outside is algae. Use Key to swap it with another tank.`:'New tank at the end of the zone; the zone has no key left for it (add one under Tank keys). Paint water to grow it.');
  }));
  $('e-dup').addEventListener('click',()=>edit(()=>{ const c=clone(LV); c.name+=' copy'; c.id=newId(c.id+'-copy'); const z=zoneOf(LV); STORE.levels.push(c); placeInZone(c,z,tanks(z).length); }));
  $('e-del').addEventListener('click',e=>{ if(STORE.levels.length<=1) return; armed(e.target,'Delete it?',()=>edit(()=>{ releaseSlot(LV); STORE.levels.splice(CUR,1); CUR=Math.max(0,CUR-1); E.sel=null; })); });
  $('e-undo').addEventListener('click',undo);
  $('e-zone').addEventListener('change',e=>{ const z=zones().find(q=>q.id===e.target.value); if(z) edit(()=>placeInZone(LV,z,tanks(z).filter(t=>t.l!==LV).length)); });
  on('e-setkey','click',e=>{ e.target.blur(); E.capture=!E.capture; refreshEditor(); if(E.capture) note('Press the key this tank should start on. Click Set key again to cancel.'); });
  $('e-slot').addEventListener('change',e=>edit(()=>{ // swap with the tank on that key (their layouts move with them along the row)
    const zl=tanks(zoneOf(LV)), other=zl[+e.target.value]; if(!other||other.l===LV) return;
    const i=STORE.levels.indexOf(LV), j=other.i; STORE.levels[i]=other.l; STORE.levels[j]=LV; CUR=j; }));
  $('e-name').addEventListener('change',e=>edit(()=>{ LV.name=e.target.value||'Tank'; }));
  $('e-goal').addEventListener('change',e=>edit(()=>{ LV.goal=Math.max(1,Math.min(20,Math.floor(+e.target.value)||4)); if(LV.maxTentacles&&LV.goal>LV.maxTentacles) LV.maxTentacles=LV.goal; }));
  $('e-max').addEventListener('change',e=>edit(()=>{ const v=Math.floor(+e.target.value); if(v>0){ LV.maxTentacles=v; if(LV.goal>v) LV.goal=v; } else delete LV.maxTentacles; }));
  $('e-lift').addEventListener('change',e=>edit(()=>{ if(e.target.value==='any') delete LV.lift; else LV.lift=e.target.value; }));
  $('e-finale').addEventListener('change',e=>edit(()=>{ if(e.target.checked) LV.finale=true; else delete LV.finale; }));
  $('e-closed').addEventListener('change',e=>edit(()=>{
    if(e.target.checked){ const s=new Set(); for(const k of LV.start||[]){ s.add(k); NEI[k].forEach(n=>{ if(!LV.terrain[n]) s.add(n); }); } for(const k of LV.required||[]) s.add(k); LV.tank=[...s]; note('Closed: only the start keys and their neighbours are water now. Paint water to grow the tank.'); }
    else { delete LV.tank; note('Open: every key without terrain is water again.'); }
  }));
  $('e-test').addEventListener('click',()=>{ buildRuntime(); $('plate').focus(); });
  $('z-name').addEventListener('change',e=>{ const z=zoneOf(LV); if(z===LOOSE) return; edit(()=>{ z.name=e.target.value||z.name; }); });
  $('z-env').addEventListener('change',e=>{ const z=zoneOf(LV); if(z===LOOSE) return; edit(()=>{ z.env=e.target.value; }); });
  on('z-rules','change',e=>{ const z=zoneOf(LV); if(z===LOOSE) return; edit(()=>{ if(e.target.value) z.rules=e.target.value; else delete z.rules; }); });
  on('e-par','change',e=>edit(()=>{ const v=Math.floor(+e.target.value); if(v>0) LV.par=v; else delete LV.par; }));
  on('e-findpar','click',e=>{ e.target.blur(); const lv=GDOT.resolveLevel(LV,zoneOf(LV)); if(lv.rules!=='territory') return note('Par is for territory tanks: set the zone rules to territory.');
    note('Finding par (up to 4 s)...'); setTimeout(()=>{ const r=GDOT.solvePar(lv,{budget:400000,ms:4000}); if(!r.solved) return note(r.exhausted?`Too big to search in 4 s (${r.nodes} states). Set par by hand, or run tools/campaign.mjs.`:'This tank cannot be cleared.');
      edit(()=>{ LV.par=r.par; }); note(`Par ${r.par}: `+r.moves.map(a=>(a.pickup?(a.pickup===a.place?'wait ':'lift '+L(a.pickup)+', '):'')+L(a.place)).join(' · ')); },30); });
  on('z-tut','change',e=>{ const z=zoneOf(LV); if(z===LOOSE) return; edit(()=>{ if(e.target.checked) z.tutorial=true; else delete z.tutorial; }); });
  on('e-coach','change',e=>edit(()=>{ const c=parseCoach(e.target.value); if(c) LV.coach=c; else delete LV.coach; }));
  $('z-keys').addEventListener('change',e=>{ const z=zoneOf(LV); if(z===LOOSE) return;
    const byLabel={}; KEYS.forEach(k=>{ byLabel[(k.label||'Space').toUpperCase()]=k.code; });
    const keys=e.target.value.trim().split(/\s+/).filter(Boolean).map(s=>KEYMAP[s]?s:byLabel[s.toUpperCase()]).filter(Boolean);
    edit(()=>{ z.keys=keys; }); });
  $('z-new').addEventListener('click',()=>{ const name='New zone'; note('New zone made with this tank in it; rename it and give it keys below.'); edit(()=>{ const z={id:newZoneId(name),name,keys:[],env:'stone'}; STORE.zones.push(z); placeInZone(LV,z,0); }); });
  $('z-del').addEventListener('click',e=>{ const z=zoneOf(LV); if(z===LOOSE) return; armed(e.target,'Delete zone? (tanks go to Unsorted)',()=>edit(()=>{ STORE.zones=STORE.zones.filter(q=>q!==z); STORE.levels.forEach(l=>{ if(l.zone===z.id) delete l.zone; }); })); });
  $('z-up').addEventListener('click',()=>moveZone(-1)); $('z-down').addEventListener('click',()=>moveZone(1));
  $('e-creatures').addEventListener('change',e=>{ E.sel=+e.target.value; E.drawing=false; E.placing=false; refreshEditor(); render(); });
  $('e-cadd').addEventListener('click',()=>edit(()=>{ const t=$('e-ctype').value; const p=Object.assign({},PRESETS[t]); delete p.label; delete p.eats; delete p.chases; delete p.flees;
    LV.creatures.push({type:t,at:G.START[0]&&NEI[G.START[0]][0]||'KeyJ',path:[],loop:'pingpong',pathIndex:0,...p}); E.sel=LV.creatures.length-1; E.brush='creature'; E.placing=true; }));
  $('e-cdel').addEventListener('click',()=>{ if(E.sel==null) return; edit(()=>{ LV.creatures.splice(E.sel,1); E.sel=LV.creatures.length?Math.min(E.sel,LV.creatures.length-1):null; }); });
  const bind=(id,key,fn)=>$(id).addEventListener('change',e=>{ const c=LV.creatures[E.sel]; if(!c) return; edit(()=>{ c[key]=fn?fn(e.target):e.target.value; }); });
  bind('c-type','type'); bind('c-mover','mover'); bind('c-dir','dir'); bind('c-speed','speed',t=>+t.value); bind('c-size','size'); bind('c-loop','loop');
  bind('c-prey','prey',t=>t.checked); bind('c-cave','cave',t=>t.checked); bind('c-wake','wake',t=>t.checked);
  bind('c-length','length',t=>Math.max(1,Math.min(6,Math.floor(+t.value)||1))); bind('c-sweep','sweep',t=>t.checked); bind('c-bloom','bloom',t=>t.checked); bind('c-phase','phase',t=>+t.value);
  on('e-ink','change',e=>edit(()=>{ const v=Math.floor(+e.target.value); if(v>0) LV.ink=v; else delete LV.ink; }));
  bind('c-range','range',t=>Math.max(1,Math.min(20,+t.value||7)));
  const goes=()=>{ const c=LV.creatures[E.sel]; if(!c) return; const rest=GDOT.ecologyOf(c,GDOT.resolveLevel(LV,zoneOf(LV))).chases.slice(2); edit(()=>{ c.chases=[...new Set([$('c-go1').value,$('c-go2').value,...rest].filter(Boolean))]; if(!c.chases.length) delete c.chases; }); };
  $('c-go1').addEventListener('change',goes); $('c-go2').addEventListener('change',goes);
  $('c-eats').addEventListener('change',e=>{ const c=LV.creatures[E.sel]; if(!c) return; edit(()=>{ c.eats=[...$('c-eats').querySelectorAll('input:checked')].map(i=>i.value); }); });
  $('c-flees').addEventListener('change',e=>{ const c=LV.creatures[E.sel]; if(!c) return; edit(()=>{ c.flees=[...$('c-flees').querySelectorAll('input:checked')].map(i=>i.value); }); });
  $('c-ecodef').addEventListener('click',()=>{ const c=LV.creatures[E.sel]; if(!c) return; edit(()=>{ delete c.eats; delete c.chases; delete c.flees; delete c.range; }); });
  $('c-draw').addEventListener('click',()=>{ const c=LV.creatures[E.sel]; if(!c) return; if(E.drawing){ E.drawing=false; refreshEditor(); } else edit(()=>{ c.mover='path'; c.path=[]; E.drawing=true; E.placing=false; E.brush='creature'; }); });
  $('c-clear').addEventListener('click',()=>{ const c=LV.creatures[E.sel]; if(!c) return; edit(()=>{ c.path=[]; E.drawing=false; }); });
  $('c-place').addEventListener('click',()=>{ if(E.sel==null) return; E.placing=!E.placing; E.drawing=false; E.brush='creature'; refreshEditor(); render(); pvInfo(); });
  on('pv-play','click',()=>{ pvPaused=!pvPaused; pvInfo(); });
  on('pv-step','click',()=>{ pvPaused=true; pvStep(); pvInfo(); });
  on('pv-restart','click',()=>{ pvReset(); render(); });
  $('eco-scope').addEventListener('change',e=>{ E.ecoScope=e.target.value; renderEcology(); });
  $('eco').addEventListener('click',e=>{ const cell=e.target.closest('[data-eater]'); if(!cell) return; toggleEats(cell.dataset.eater,cell.dataset.victim); });
  $('e-copy').addEventListener('click',()=>copyText(JSON.stringify(LV,null,1),'This tank copied as JSON.'));
  $('e-copyall').addEventListener('click',()=>copyText(GDOT.levelsSource(STORE.zones,STORE.levels),'levels.js copied. Replace games/gdot/levels.js with it.'));
  $('e-download').addEventListener('click',()=>{ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([GDOT.levelsSource(STORE.zones,STORE.levels)],{type:'text/javascript'})); a.download='levels.js'; document.body.appendChild(a); a.click(); a.remove(); note('levels.js downloaded. Replace games/gdot/levels.js with it.'); });
  $('e-show').addEventListener('click',()=>{ $('e-json').value=JSON.stringify(LV,null,1); note('This tank as JSON.'); });
  $('e-load').addEventListener('click',e=>loadText(e.target));
  $('e-reset').addEventListener('click',e=>armed(e.target,'Replace with levels.js? (yours goes to Backups)',useBuiltins));
  $('e-restore').addEventListener('click',restoreBackup);
  $('b-use').addEventListener('click',e=>armed(e.target,'Sure? (yours goes to Backups)',useBuiltins));
  $('b-keep').addEventListener('click',()=>{ STORE.base=BUILTIN_SIG; STORE.baseCopy=clone(BUILTIN); STORE.clash=[]; saveStore(); refreshEditor(); });
}
// Give this tank a key of your choice: press Set key, then the key. If another tank of the zone has
// it, the two swap; if it is a free key of the zone, or new to the zone, this tank takes it (its old
// key stays in the zone as a free key). A tank past the zone's last key gets the next slot. Its layout
// moves with it (syncStarts). A key used by another zone is allowed but named, since keys should not repeat.
function setTankKey(code){
  const z=zoneOf(LV); if(z===LOOSE){ note('Put this tank in a zone first, then give it a key.'); refreshEditor(); return; }
  const elsewhere=STORE.zones.filter(q=>q!==z&&(q.keys||[]).includes(code)).map(q=>q.name);
  edit(()=>{
    z.keys=z.keys||[]; const zl=tanks(z), n=zl.findIndex(t=>t.l===LV), at=z.keys.indexOf(code);
    if(at===n) return;
    if(at>=0&&at<zl.length){ const other=zl[at], i=STORE.levels.indexOf(LV), j=other.i; STORE.levels[i]=other.l; STORE.levels[j]=LV; CUR=j; return; }
    if(at>=0) z.keys.splice(at,1);
    if(n<z.keys.length){ const old=z.keys[n]; z.keys[n]=code; if(old&&!z.keys.includes(old)) z.keys.push(old); }
    else { placeInZone(LV,z,z.keys.length); z.keys.push(code); }
  });
  note(`${LV.name} now starts on ${L(code)}.`+(elsewhere.length?` ${L(code)} is also a tank key in ${elsewhere.join(', ')}; keys should not repeat.`:''));
}
function newZoneId(name){ let id=slug(name), n=2; while(id===LOOSE.id||STORE.zones.some(z=>z.id===id)) id=slug(name)+'-'+(n++); return id; }
function moveZone(d){ const z=zoneOf(LV), i=STORE.zones.indexOf(z), j=i+d; if(i<0||j<0||j>=STORE.zones.length) return;
  edit(()=>{ [STORE.zones[i],STORE.zones[j]]=[STORE.zones[j],STORE.zones[i]]; const ordered=[]; for(const q of zones()) ordered.push(...STORE.levels.filter(l=>zoneOf(l).id===q.id)); STORE.levels=ordered; CUR=STORE.levels.indexOf(LV); }); }
function useBuiltins(){ backup('browser copy replaced by levels.js',STORE); const id=LV&&LV.id; UNDO.push(snapshot()); STORE=freshStore(); saveStore(); const i=levelIndex(id); setCur(i>=0?i:0); buildRuntime(); refreshEditor(); note('Using levels.js. Your old copy is in Backups.'); }
function restoreBackup(){
  const list=backups(), b=list[+$('e-backups').value]; if(!b) return note('No backup selected.');
  edit(()=>{ const day=new Date(b.at).toLocaleDateString(), map={}, first=STORE.levels.length;
    for(const z of b.zones||[]){ const nz=Object.assign(clone(z),{id:newZoneId(z.id+'-restored'),name:z.name+' (restored '+day+')'}); map[z.id]=nz.id; STORE.zones.push(nz); }
    let loose=null;
    for(const l of clone(b.levels)){ l.id=newId(l.id||l.name); if(map[l.zone]) l.zone=map[l.zone]; else { if(!loose){ loose={id:newZoneId('recovered'),name:'Recovered '+day,keys:[],env:'stone'}; STORE.zones.push(loose); } l.zone=loose.id; } STORE.levels.push(l); }
    CUR=first; });
  note(`Added ${b.levels.length} tanks from the backup, in their own zones.`);
}
function loadText(btn){
  const txt=$('e-json').value.trim(); let v;
  try{ if(/GDOT_LEVELS/.test(txt)){ const w={}; new Function('window',txt)(w); v={zones:w.GDOT_ZONES||[],levels:w.GDOT_LEVELS||[]}; } else v=JSON.parse(txt); }
  catch(err){ return note('That is not valid JSON or levels.js: '+err.message); }
  if(Array.isArray(v)) v={levels:v};
  if(v&&Array.isArray(v.levels)){
    const good=v.levels.filter(l=>l&&typeof l==='object'&&!Array.isArray(l));
    if(!good.length) return note('Nothing to load: the list has no tanks.');
    if(btn&&btn.dataset.armed!=='1'){ armed(btn,`Load again to replace all ${STORE.levels.length} tanks`,()=>{}); return; }
    if(btn) armed(btn,'',()=>{});
    backup('before Load replaced every tank',STORE);
    edit(()=>{ const seen=new Set(); for(const l of good){ GDOT.normalizeLevel(l); while(seen.has(l.id)) l.id=l.id+'-2'; seen.add(l.id); } STORE.levels=good; if(Array.isArray(v.zones)&&v.zones.length) STORE.zones=v.zones; CUR=0; E.sel=null; }); return note('Loaded.'); }
  if(v&&typeof v==='object'&&(v.creatures||v.start||v.terrain)){ edit(()=>{ GDOT.normalizeLevel(v); if(STORE.levels.some((l,i)=>i!==CUR&&l.id===v.id)) v.id=newId(v.id); if(!v.zone&&LV.zone) v.zone=LV.zone; STORE.levels[CUR]=v; E.sel=null; }); return note('Loaded into this tank.'); }
  note('Nothing to load.');
}
function copyText(text,done){ $('e-json').value=text; const ta=$('e-json'); ta.select(); const ok=()=>note(done); if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok,()=>{document.execCommand&&document.execCommand('copy');ok();}); else {document.execCommand&&document.execCommand('copy');ok();} }
function toggleEats(eater,victim){
  const z=zoneOf(LV); const scope=E.ecoScope==='zone'&&z!==LOOSE?(z.ecology=z.ecology||{}):(LV.ecology=LV.ecology||{});
  const cur=GDOT.ecologyOf({type:eater},E.ecoScope==='zone'&&z!==LOOSE?{ecology:z.ecology||{}}:GDOT.resolveLevel(LV,z)).eats;
  edit(()=>{ const e=scope[eater]=scope[eater]||{}; e.eats=cur.includes(victim)?cur.filter(t=>t!==victim):cur.concat(victim); });
}
function renderEcology(){
  const z=zoneOf(LV), lvl=E.ecoScope==='zone'&&z!==LOOSE?{ecology:z.ecology||{}}:GDOT.resolveLevel(LV,z);
  let h='<table><tr><th></th>'+TYPES.map(t=>`<th title="${PRESETS[t].label}"><i>${iconOf(t)}</i></th>`).join('')+'</tr>';
  for(const a of TYPES){ const eats=GDOT.ecologyOf({type:a},lvl).eats;
    h+=`<tr><th title="${PRESETS[a].label}"><i>${iconOf(a)}</i></th>`+TYPES.map(b=>`<td data-eater="${a}" data-victim="${b}" class="${eats.includes(b)?'on':''}">${eats.includes(b)?ICON.bones:''}</td>`).join('')+'</tr>'; }
  const el=$('eco'); const html=h+'</table>'; if(el.dataset.h!==html){ el.innerHTML=html; el.dataset.h=html; }
}
function refreshEditor(){
  if(!isEdit()) return;
  setTimeout(()=>{ render(); pvInfo(); },0);
  // banner: the browser copy and levels.js disagree
  const bn=$('e-banner'); const diverged=STORE.dirty&&(STORE.base!==BUILTIN_SIG||(STORE.clash&&STORE.clash.length));
  bn.hidden=!diverged; if(diverged){ const U=new Map(BUILTIN.levels.map(l=>[l.id,l])); const differ=STORE.levels.filter(l=>!U.has(l.id)||!same(U.get(l.id),l)).map(l=>l.name);
    $('b-text').textContent=STORE.clash&&STORE.clash.length?`levels.js changed tanks you also edited here; this browser kept your version of: ${STORE.clash.join(', ')}.`:`This browser's copy was edited before it could follow levels.js. It differs in: ${differ.slice(0,8).join(', ')}${differ.length>8?' and '+(differ.length-8)+' more':''}.`; }
  const ls=$('e-levels'); let opts='';
  for(const z of zones()){ opts+=`<optgroup label="${esc(z.name)}">`+tanks(z).map(t=>`<option value="${t.i}">${esc(tankLabel(t.l))} · ${esc(t.l.name)}${beaten(t.l)?' ✓':''}</option>`).join('')+'</optgroup>'; }
  if(ls.dataset.h!==opts){ ls.innerHTML=opts; ls.dataset.h=opts; } ls.value=CUR;
  const z=zoneOf(LV), zl=tanks(z);
  $('e-zone').innerHTML=zones().map(q=>`<option value="${q.id}">${esc(q.name)}</option>`).join(''); $('e-zone').value=z.id;
  $('e-slot').innerHTML=zl.map((t,n)=>`<option value="${n}">${esc((z.keys&&z.keys[n])?L(z.keys[n]):'#'+(n+1))}${t.l===LV?' (this tank)':' · swap with '+esc(t.l.name)}</option>`).join(''); $('e-slot').value=String(zl.findIndex(t=>t.l===LV));
  $('e-name').value=LV.name; $('e-goal').value=LV.goal||8; $('e-max').value=LV.maxTentacles||''; $('e-lift').value=LV.lift||'any'; $('e-finale').checked=!!LV.finale; $('e-closed').checked=Array.isArray(LV.tank);
  const dupKeys=(z.keys||[]).filter(k=>STORE.zones.some(q=>q!==z&&(q.keys||[]).includes(k)));
  $('z-hint').textContent=dupKeys.length?'Also used by another zone: '+dupKeys.map(L).join(' ')+'. Try to give every tank its own key.':'Each tank starts on its key. Order = the order tanks come up in.';
  if($('z-rules')){ $('z-rules').value=z.rules||''; $('z-rules').disabled=z===LOOSE; }
  if($('e-ink')) $('e-ink').value=LV.ink||'';
  if($('e-par')){ $('e-par').value=LV.par||''; $('e-par').disabled=$('e-findpar').disabled=GDOT.resolveLevel(LV,z).rules!=='territory'; }
  if($('z-tut')){ $('z-tut').checked=!!z.tutorial; $('z-tut').disabled=z===LOOSE; }
  if($('e-coach')&&document.activeElement!==$('e-coach')) $('e-coach').value=coachText(LV.coach);
  $('z-name').value=z.name; $('z-env').value=z.env||'stone'; $('z-keys').value=(z.keys||[]).map(L).join(' '); for(const id of ['z-name','z-env','z-keys','z-del','z-up','z-down']) $(id).disabled=z===LOOSE;
  for(const bt of $('brush').children) bt.classList.toggle('on',bt.dataset.id===E.brush);
  $('brush-hint').textContent=E.brush==='creature'?(E.drawing?'Drawing a path: click keys in order, then Done.':E.placing?'Click a key to place the selected creature.':'Select a creature, then Place or Draw path.'):E.brush==='water'?(Array.isArray(LV.tank)?'Click or drag: add water to the tank.':'Click or drag: clear terrain.'):E.brush==='start'?'Click keys to toggle start keys.':E.brush==='req'?'Click keys to toggle starfish (keys that must be held to clear).':TERRAIN[E.brush]+' (click or drag)';
  const cs=$('e-creatures'); cs.innerHTML=(LV.creatures||[]).map((c,i)=>{ const pos=c.mover==='path'?(c.path&&c.path[0]?L(c.path[0]):'no path'):L(c.at||'?'); return `<option value="${i}">${i+1}. ${esc((PRESETS[c.type]||{}).label||c.type)} @ ${esc(pos)}</option>`; }).join('');
  if(E.sel==null&&LV.creatures.length) E.sel=0; if(E.sel!=null&&!LV.creatures[E.sel]) E.sel=null;
  const c=E.sel!=null?LV.creatures[E.sel]:null; $('cfields').style.opacity=c?1:.4;
  if(c){ cs.value=E.sel; $('c-type').value=c.type; $('c-mover').value=c.mover||'dir'; $('c-dir').value=c.dir||'E'; $('c-speed').value=String(c.speed==null?1:c.speed); $('c-size').value=c.size||'big'; $('c-loop').value=c.loop||'pingpong'; $('c-prey').checked=!!c.prey; $('c-cave').checked=!!c.cave; $('c-wake').checked=!!c.wake;
    const pr=PRESETS[c.type]||{}; $('c-length').value=c.length!=null?c.length:(pr.length||1); $('c-sweep').checked=c.sweep!=null?!!c.sweep:!!pr.sweep; $('c-bloom').checked=c.bloom!=null?!!c.bloom:!!pr.bloom; $('c-phase').value=String((+c.phase||0)&1);
    const eco=GDOT.ecologyOf(c,GDOT.resolveLevel(LV,z));
    $('c-go1').value=eco.chases[0]||''; $('c-go2').value=eco.chases[1]||''; $('c-range').value=eco.range;
    $('c-eats').innerHTML=TYPES.map(t=>`<label title="${PRESETS[t].label}"><input type="checkbox" value="${t}"${eco.eats.includes(t)?' checked':''}><i>${iconOf(t)}</i></label>`).join('');
    $('c-flees').innerHTML=TARGETS.map(t=>`<label title="${t==='tentacle'?'your tentacles':PRESETS[t].label}"><input type="checkbox" value="${t}"${eco.flees.includes(t)?' checked':''}><i>${t==='tentacle'?ICON.tentacle:iconOf(t)}</i></label>`).join('');
    const custom=['eats','chases','flees','range'].some(k=>c[k]!=null);
    $('c-ecodef').hidden=!custom;
    for(const r of document.querySelectorAll('.only-chase')) r.hidden=c.mover!=='chase';
    for(const r of document.querySelectorAll('.only-flee')) r.hidden=c.mover!=='flee';
    $('c-path').textContent=c.mover==='path'?((c.path||[]).length?(c.path.map(L).join(' → ')+(c.loop==='pingpong'?' (and back)':' (loop)')):'No path yet. Click Draw path.'):`Starts at ${L(c.at||'?')}${c.mover==='dir'?', heading '+(c.dir||'E')+', bounces off rocks and edges':''}.`; }
  else $('c-path').textContent='No creature selected.';
  $('c-draw').textContent=E.drawing?'Done':'Draw path'; $('c-draw').classList.toggle('on',E.drawing); $('c-place').classList.toggle('on',E.placing);
  $('e-undo').disabled=!UNDO.length;
  if($('e-setkey')){ $('e-setkey').textContent=E.capture?'Press a key…':'Set key'; $('e-setkey').classList.toggle('on',E.capture); }
  if(LV.maxTentacles&&(LV.required||[]).length>LV.maxTentacles) note(`Warning: ${LV.required.length} marked keys but only ${LV.maxTentacles} tentacles allowed, so this tank cannot be cleared.`);
  const bl=backups(); $('e-backups').innerHTML=bl.length?bl.map((b,i)=>`<option value="${i}">${esc(b.label)} · ${b.levels.length} tanks · ${new Date(b.at).toLocaleString()}</option>`).join(''):'<option value="">No backups</option>'; $('e-restore').disabled=!bl.length;
  $('eco-scope').value=E.ecoScope; renderEcology();
}
// Brushes. Terrain and water paint while dragging; start, marked and creature act on click.
function onKeyPaint(code,first){
  if(paint.seen.has(code)) return; paint.seen.add(code);
  const b=E.brush;
  if(!first&&!['water','algae','rock','reef','cave'].includes(b)) return;
  edit(()=>{
    if(b==='creature'){ const c=LV.creatures[E.sel]; if(c&&!Array.isArray(c.path)) c.path=[]; if(!c){ note('Add a creature first.'); return; }
      if(E.drawing){ if(c.path[c.path.length-1]!==code) c.path.push(code); }
      else if(E.placing){ c.at=code; if(c.mover==='path') c.path=[code]; E.placing=false; }
      else c.at=code;
      return; }
    const tank=Array.isArray(LV.tank)?LV.tank:null, inTank=k=>{ if(tank&&!tank.includes(k)) tank.push(k); };
    if(b==='start'&&slotKey(LV)){ note(`This tank starts on its key, ${L(slotKey(LV))}. To change it, swap it to another key or change the zone's tank keys.`); return; }
    if(b==='start'){ const i=LV.start.indexOf(code); if(i>=0) LV.start.splice(i,1); else { LV.start.push(code); inTank(code); } return; }
    if(b==='req'){ LV.required=LV.required||[]; const i=LV.required.indexOf(code); if(i>=0) LV.required.splice(i,1); else { LV.required.push(code); inTank(code); } return; }
    LV.terrain=LV.terrain||{};
    if(b==='water'){ delete LV.terrain[code]; inTank(code); }
    else if(b==='algae'&&tank){ delete LV.terrain[code]; const i=tank.indexOf(code); if(i>=0) tank.splice(i,1); }
    else { LV.terrain[code]=b; if(b!=='algae') inTank(code); }
  },!first);
}

// Another tab (usually the studio) saved tanks: take them. The intro keeps running and a run in
// progress keeps going; the new version applies from the next start.
window.addEventListener('storage',e=>{ if(e.key!==STORE_KEY||!STORE) return; loadStore(true); UNDO.length=0; if(!STUDIO&&PROG&&tutorialAdopt()) saveProgress(); if(STORE.base!==BUILTIN_SIG&&isEdit()) setTimeout(()=>note('levels.js changed since this tab was opened: reload this tab.'),0); if(!STORE.levels[CUR]) CUR=0;
  if(inIntro()||G.phase==='play'){ render(); return; } buildRuntime(); refreshEditor(); if(isEdit()) note('Another tab changed the tanks; this tab now shows its version.'); });
function start(){
  loadStore(); loadProgress();
  const i=levelIndex(STUDIO?LS.get(STUDIO_CUR_KEY):PROG.cur); CUR=i>=0?i:Math.max(0,levelIndex(pickNext(null)));
  fit(); build(); if(STUDIO) initEditor();
  if($('nohold')) $('nohold').checked=!!SET.nohold; if($('tips')) $('tips').checked=SET.tips!==false;
  buildRuntime();
  if(!STUDIO) introStart();
  booted=true;
}
let booted=false;
window.claude?.hot?.ready ? window.claude.hot.ready(start) : start();
