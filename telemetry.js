// telemetry.js — anonymous playtest data, opt-in.
//
// Posts to /api/telemetry/ingest on the same origin (the gdot worker, D1
// "gdot-telemetry"). Copied from games/impulse/telemetry.js, re-keyed. Nothing is sent until the player answers the one-time
// ask; the switch in settings turns it off again at any time.
//
// No accounts and no personal data: a random id, which level, what happened in
// a run, and how long it took. Events are queued and flushed with sendBeacon so
// leaving the page doesn't lose them.
(() => {
  'use strict';
  const STORE = 'gdot-telemetry-v1';
  const ENDPOINT = '/api/telemetry/ingest';
  const MAX_QUEUE = 20;          // flush at this many events
  const FLUSH_MS = 60000;        // ...or this often (the worker takes 60 uploads per hour per player)
  const BUILD = '2026-09-28-alive'; // territory rules everywhere, new creatures, ink, animated creature layer
  // (earlier rounds: '2026-09-27-tutorial' the Hatchery tutorial and tips; '2026-09-26-friends' the first 40 classic tanks)
  // (first round: '2026-09-26-friends', 40 tanks in 5 zones, intro, icon-only feedback)

  const state = { consent: null, id: null };
  try { Object.assign(state, JSON.parse(localStorage.getItem(STORE)) || {}); } catch (e) {}
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {} };

  const newId = () => {
    const a = new Uint8Array(8);
    (crypto.getRandomValues ? crypto : { getRandomValues: x => x.forEach((_, i) => (x[i] = Math.random() * 256)) }).getRandomValues(a);
    return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
  };

  let queue = [], timer = null;

  function flush(useBeacon) {
    if (!queue.length || state.consent !== true) { queue = []; return; }
    const body = JSON.stringify({ playerId: state.id, games: queue.splice(0, MAX_QUEUE) });
    try {
      if (useBeacon && navigator.sendBeacon) navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
      else fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    } catch (e) {} // telemetry must never break play
  }

  function track(event, levelId, data) {
    if (state.consent !== true) return;
    if (!state.id) { state.id = newId(); save(); }
    queue.push({
      levelId: String(levelId || 'none'), event, build: BUILD,
      device: matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse',
      at: Date.now(), ...data,
    });
    if (queue.length >= MAX_QUEUE) flush(false);
    else if (!timer) timer = setTimeout(() => { timer = null; flush(false); }, FLUSH_MS);
  }

  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true); });
  addEventListener('pagehide', () => flush(true));

  window.Telemetry = {
    track,
    get consent() { return state.consent; },
    // true = share, false = don't. Answering "no" drops anything queued.
    set(on) { state.consent = !!on; if (!on) queue = []; if (on && !state.id) state.id = newId(); save(); },
    asked() { return state.consent !== null; },
    flush() { flush(true); }, // send what is queued now (the page is going away)
  };
})();
