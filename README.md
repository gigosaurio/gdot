# G. — keyboard aquarium

## Run it

```
python serve.py 8788        # then open http://localhost:8788/play.html (or /studio.html)
node test/smoke.mjs         # tests
```

Or just open play.html from disk. This repo is the game on its own; the live site deploy
(g.gigomakes.com) still goes through the gigomakes repo's shared worker for now.

Your keyboard is the tank. Every key you hold is a tentacle; each press is a turn.
Runs straight from disk: open `play.html` in a browser. No build step.

## Two rule sets

Each zone plays by one of two rule sets (`zone.rules`, or `level.rules` on one tank):

**Territory** (2026-09-28, the Hatchery and the Shallows first). Fill every open key of the tank in as
few presses as you can. Creatures show where they go next: an arrow on each, and a dashed border on the
key it will take. A creature that lands on one of your tentacles takes that key (the tentacle is gone; the
key is free again once it leaves); nothing kills you outright, and the tank is only lost when every
tentacle is taken, which plays it again. You can only grab keys next to one of your tentacles (putting back
the one you just lifted is always fine). Lifting is free; lift and put back is a one-press wait. A starfish,
once held, turns the algae around it into water: more to fill. The tank is clear when every key of the
territory (grip keys joined to the start; urchins are walls) is yours or has a creature on it. Par is the
fewest presses (`GDOT.solvePar`, an exact search; `par` is stored on each tank by tools/campaign.mjs or the
studio's Find par). The header shows par and your best; a cleared tank can be clicked in the zone strip to
play it again for par.

**Classic** (the other zones until they are rebuilt).

Current classic rules (2026-09-26): tap any revealed key to place a tentacle, it stays; tap a
tentacle to pick it up; keep at least one key held at all times. The footer's **no holding** box
(saved per browser) turns that last rule off: letting go of every key, or the window losing focus,
no longer ends a run. Leaving the page mid-run still counts as letting go, so a reload is never a
free retry. The physical mode
(every tentacle a held finger) is parked until there's an N-key-rollover keyboard.

Play draws every event: the bitten key shows the killer over the
tentacle, the key it came from shows an arrow, eaten creatures leave bones, a waking
creature gets a "!", refused presses show why (fog, algae, rock, a full tray, a lock).
The strip under the tank shows the tentacle tray, the marked keys, and after a run
where G+. goes next. Screen readers get the same events as text (`#say`).

The one line of text is the **coach line** under the tank. In the tutorial it walks you through
each tank (a line per moment, and the key it names pulses on the board). Everywhere else it shows
a tip the first time you meet each creature, terrain or rule, the first time you die each way (the
turn order, "it moved there first", is the one that needs saying), and the first time a loss sends
you to another tank. Tips show once per player (reset progress brings them back); the footer's
**tips** box turns them off.

Zones: after the Hatchery (the tutorial, below), tanks are grouped into zones named after key rows (Shallows on the home row, Rock
garden on the top row, Caves on the bottom row, Currents on the number row, The rim on the
edge keys). Every tank starts on the key it is named after (tank G starts on G), and no key
names two tanks, so the key is how you remember the puzzle. A zone's key list is also the
order its tanks come up in (Shallows starts on G). Clear every tank in a zone to open the next. Dying (or letting go, or leaving
the page mid-run) sends you to another tank of the zone you have not cleared, the one
you played longest ago, so no tank can be brute-forced. A tank marked `finale` opens
only when it is the last one left. All of this happens on play.html only: the studio plays
whatever tank you pick, retries it when you die, and never touches progress. **reset progress**
forgets every tank (in every open tab) and goes back to the intro.

Tutorial: a zone marked `tutorial`, the **Hatchery**, comes before everything for a new player:
five small tanks on L 9 P 0 / (Touch: press, hold, the tray; Spines: algae, fog, a creature bites
what is on its key; Beat: one press, one move, creatures move first; Wait: lift and put back; Starfish:
a full tray is not enough). Every creature is seen, and seen moving, before it can bite. Its
tanks come up in order, a death retries the same tank, and every tank has coach lines. It is not
part of the campaign: the footer button skips it (and later plays it again), clearing or skipping it
means it never comes back on its own, and finishing the game does not need it. A returning player
who has cleared any tank skips it automatically; one who played but cleared nothing is sent to it.

Spec and design notes: the "Octopus Keyboard — Level 1 Spec" doc in Claude.

## Files

| File | What |
|---|---|
| `play.html` | The player build: the tank, the zone strip, the icon strip, a live intro tank until G+., sound, a "?" with the rules, the telemetry ask and a link back. This is what g.gigomakes.com serves. |
| `studio.html` | The same game with the editor (live creature preview, input probes) and no intro. Hotkeys: left/right = previous/next tank in the zone strip, up/down = previous/next zone. It remembers its own tank and never redirects or records progress. Local only (kept off the site by `.assetsignore`). |
| `.assetsignore` | What the G. worker does not upload: studio.html, test/, tools/, notes. |
| `engine.js` | The rules: keyboard model, creatures, terrain, the turn loop. No DOM; loads in the page as `window.GDOT` and in Node. |
| `gdot.js` | Renderer, input, audio, zones and progress, editor. Calls into `GDOT`. |
| `levels.js` | `GDOT_ZONES` and `GDOT_LEVELS`: the zones and the campaign, in play order. Source of truth. |
| `style.css` | 90s Minesweeper look. |
| `telemetry.js` | Opt-in play data → `/api/telemetry/ingest` (events: `start`, `clear`, `death`). |
| `wrangler.gdot.jsonc` | Dedicated worker, `gdot.gigomakes.com`, own D1 `gdot-telemetry`. |
| `test/smoke.mjs` | Smoke test: the engine in Node, then `play.html` in headless Chromium with real key events. |
| `tools/solver.mjs` | Solver and analyzer: is a level solvable, shortest clear, win rates, escape routes. |
| `tools/generate.mjs` | Level generator from recipes; keeps only what the analyzer accepts. |
| `tools/campaign.mjs` | How `levels.js` was made: hand specs (keys by label) and seeded recipes, every level fenced and solver-checked. |

## Ship it

G. has its own worker, like Impulse: `wrangler.gdot.jsonc` runs the shared `worker/index.js` with
`games/gdot` as the site root, so **https://g.gigomakes.com/** opens `play.html`. The main gigomakes
site is not touched. Six files go up (play.html, style.css, engine.js, levels.js, gdot.js,
telemetry.js, about 130 KB); everything else in the folder is in `.assetsignore`.

```
npx wrangler login                                      # once, in your own terminal
npx wrangler d1 create gdot-telemetry                   # once; paste the printed id into wrangler.gdot.jsonc
npx wrangler d1 execute gdot-telemetry --remote --file=worker/telemetry-schema.sql
npx wrangler secret put TELEMETRY_KEY -c wrangler.gdot.jsonc
npx wrangler versions upload -c wrangler.gdot.jsonc     # a private preview URL to try first
npx wrangler deploy -c wrangler.gdot.jsonc              # g.gigomakes.com (the custom domain is added on first deploy)
```

Telemetry is opt-in (the footer asks once). The build is tagged `2026-09-27-tutorial` (the first round was `2026-09-26-friends`) in
`telemetry.js`; change it for each test round so rounds can be told apart. Uploads batch every
60 seconds because the worker accepts about 60 per hour per player.

Local: the `gdot` preview serves the repo with no-cache headers (`.claude/dev-serve.py`); open
`/play.html` to play and `/studio.html` to edit.

Later (noted 2026-09-26): give every game a one-letter address, g.gigomakes.com for G. and other
letters for the other games, possibly on a short domain such as g.gjmx.com / h.gjmx.com.

## Test and tools

No packages needed; plain Node 22.

```
node test/smoke.mjs                    # rules + a real browser run (uses the Playwright Chromium if installed, else skips that tier)
node tools/solver.mjs --show           # one row per level: solvable, shortest clear, win rates, lane-free escapes
node tools/solver.mjs --level the-cave --json
node tools/generate.mjs --list         # recipes; --recipe first-tank --count 3 --seed 7 --out out.json
node tools/campaign.mjs --check        # rebuild the campaign and print one analyzer row per level
node tools/campaign.mjs --show 3       # draw one level's tank; --write [--only 6,9] rewrites levels.js
```

The analyzer's "cautious" player reads the board (avoids where a visible creature is or steps next) but has no
memory and never lifts; "omniscient" also sees through fog. Their gap is what fog contributes to a level.

## Levels

Design in the editor (footer toggle), then **Copy levels.js** (or **Download levels.js**) and
replace `levels.js` with it. Until then edits live in this browser. An untouched
browser copy follows `levels.js` on every load; an edited one stays put, and the editor shows
a banner if `levels.js` changes underneath it. Every replaced copy goes to **Backups**, and
**Restore as a zone** brings any backup back as a new zone, so nothing is lost. **Undo** covers
every editor change in the session. Another tab's edits replace this tab's view instead of being
overwritten later.

Editor: **New tank** makes a closed tank on the zone's next free key (that key and its
neighbours are water, everything else is algae); paint water to grow it (click or drag).
**Key** swaps a tank with the one on another key, and **Zone** moves it to another zone. A tank
always starts on its key, and its whole layout moves with it: any letter or number key works,
because those rows form a regular grid where a moved tank is the same puzzle
(`GDOT.shiftLevel`). When a wide key or the F-row is in the way, only the start moves and the
editor says so. Per tank: goal, max tentacles,
lifting (free / one at a time / never), finale. Per zone: name, look, the keys its tanks are
named after. **Who eats whom** edits the food chain for this tank or this zone.

Level shape (every field but `id`, `start` and `creatures` is optional):

```json
{ "id": "first-tank", "name": "First tank", "zone": "shallows", "goal": 8,
  "maxTentacles": 2, "lift": "one", "finale": false,
  "start": ["KeyG","KeyH"], "required": [],
  "tank": ["KeyG","KeyH","KeyJ"],
  "terrain": { "KeyE": "algae" },
  "ecology": { "crab": { "eats": [] } },
  "creatures": [ { "type": "shark", "mover": "path", "path": ["KeyN","KeyJ","KeyI","Digit9"], "loop": "pingpong", "pathIndex": 2, "size": "big", "speed": 1 } ] }
```

Creature fields: `mover` = `path` | `dir` (+ `dir`: E W NE NW SE SW, bounces off rocks and edges) |
`chase` | `flee` | `still`; `speed` = 0.5 | 1 | 2 steps per turn; `size` = `small` (reef hides you) |
`big` (only a cave hides you); flags `prey`, `cave` (kills inside caves), `wake` (frozen until a tentacle touches it).
Terrain per key: `algae`, `rock` (no grip, blocks creatures), `reef`, `cave`. `tank` (optional)
lists the tank's keys; every other key without terrain is algae.

`coach` (tutorial tanks): the coach lines, one per moment: `ready` (before the first tentacle),
`"1"`, `"2"`, ... (after that many placements; a line stays until a later number replaces it),
`lift`, `won`, `eaten`, `letgo`, and a refusal reason (`fog`, `algae`, `rock`, `max`, `start`, `one`,
`none`). Tokens: `{L}` a key cap (that key pulses), `{shark}` any creature or terrain icon,
`{tentacle}` `{starfish}` `{fog}` `{lock}`, `{G.}` the G+. keys, `{goal}`, `{max}`, `{~L}` a key cap that does not pulse, `{next}` (says the next tank starts on G, when it does), `{Hold}` ("Hold", or "Press" with no holding) and `{hold}` (the
hold sentence, empty when no holding is ticked). The studio edits them as text, one `moment: line`
per line. A zone with `"tutorial": true` is the tutorial (see above); the studio's **tutorial zone**
box sets it.

`maxTentacles`: tentacles allowed on the board at once (placing more is refused; lift first).
Empty = no limit; the goal can't exceed it. `lift`: `any` (default), `one` (after lifting,
place before lifting again), `none`.

Food chain. Creatures that meet on a key (or cross) may eat each other; terrain protects
creatures exactly as it protects tentacles (cave: from all but cave dwellers; reef: from small
eaters). Defaults: shark eats eel, fish, seal, pilot fish; barracuda eats fish, pilot fish;
crab eats urchin; seal eats fish, pilot fish. `chase` movers go for the first kind in
`chases` that is within `range` (`tentacle` = you): the eel goes for you, the seal for fish
first (it can be distracted), the pilot fish follows sharks one key behind (it keeps one key
away from anything it doesn't eat). `flee` movers step away from anything in `flees`.
Override per creature (`eats`, `chases`, `flees`, `range`), per level (`ecology`) or per
zone (`ecology` on the zone, under the level's).

## Known gaps

- ANSI layout only; ISO (tall Enter, `IntlBackslash`) needs a second key table.
- No fullscreen / keyboard lock yet: F5, F11, F12 and Win keys still belong to the browser.
- The "Browser sees held" line under the status shows the keys the browser receives; the raw event log appears in the studio with the editor open.
- Alt+F4 finale closes the window before the clear can be shown; record it in `beforeunload`.
