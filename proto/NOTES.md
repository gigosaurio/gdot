# Why G. is not clicking, and three ways out

Three playable prototypes live next to this file: `a.html`, `b.html`, `c.html` (`index.html` links them).
Serve the repo (`python serve.py 8790`) and open `/proto/`. Nothing here touches the game.

## The diagnosis

Minesweeper is clear because one press does one thing: it turns an unknown cell into a fact that stays true
forever. You never simulate, you never lose ground, and every number is about the cells right next to it.

The current G. breaks all three at once:

- **You must simulate.** To judge a press you run every creature forward in your head. Arrows and lanes
  help, but the work is still forward simulation, and that is the part people find hard to parse.
- **Progress is not monotonic.** Creatures take tentacles, keys flip back and forth, the tank never feels
  conquered. Deduction puzzles only add; this one adds and subtracts.
- **Too many languages.** Arrows, lanes, dashed and dotted borders, `?`, bloom rings, ink clouds, fog,
  sleepers, par. Each needs teaching before the first interesting decision.
- **The reveal killed the exploring.** Showing the whole tank on the first press removed surprise, but it also
  removed the reason to probe. What is left is a scheduling puzzle with a lot of state.
- **The keyboard is scenery.** Its best property, that every key has a different neighbourhood (Space touches
  ten keys, Q touches four), barely matters to the current rules.

## What is worth keeping

The keyboard as the tank and the tactile press. The octopus and its arms. Fog as *the* source of hidden
information. Creatures with characters. Clear-the-tank as the goal. The retro aquarium look. Par and best.

## Direction 1 — Still water (prototypes A and B)

Nothing moves until you touch it. Creatures are asleep and hidden. Each arm you place *feels* its
neighbourhood and reports. Press a creature and it bites. Fill every key they do not hold.

This is the Minesweeper family, and what the aquarium adds on top is real:

- **Shapes.** An eel is three keys in a row. Knowing a shape lets you deduce beyond the numbers (Battleships).
- **Habitats.** Jellyfish float at the surface row, crabs sit by rocks, eels sleep in caves. Habitats are
  Sudoku-style global constraints: they make chains of deduction longer and guessing rarer.
- **A roster.** You know what lives in the tank. That is what makes endgames solvable, not lucky.
- **Keyboard neighbourhoods.** Where you feel is a choice. A wide key feels a lot and tells you little per
  key; a corner key tells you exactly which neighbour it is. Minesweeper has no such choice.
- **Something good to find.** A starfish is harmless and lights its ring: a hidden reward you can reason your
  way to, which Minesweeper lacks.
- **Creatures interacting, statically.** "The shark never shares a row with a crab", "fish school next to
  other fish". Rules like these are what the solver uses; they are the interactions, written as facts.

**A · Feel** is the plain version: one number per arm (creature keys touching it). It exists so you can feel
the baseline.

**B · Senses** replaces the number with typed senses: a crab is a claw (one per crab), a jellyfish is a sting
(sharp if touching, faint from two keys away), the shark pulls along its whole row (an arrow). Each creature is
a different kind of clue, so each is a different kind of deduction, and the key exclusivity ties them together.
More to learn, but the learning is per creature and that is exactly the campaign we already have (one creature
per zone).

Both generators refuse any tank that needs a guess. Tab shows what is currently certain; it uses the same
solver, so it can also power a real hint system and an auto-check that a hand-made tank is fair.

What to look for: does a press feel like it *told* you something? Do you find yourself reasoning out loud
("if that is the eel then...")? Is B's extra language worth it, or is A's single number cleaner?

## Direction 2 — Visible tides (prototype C)

The current rules, minus everything hidden, minus interactions, plus the future drawn on every key (a five-tick
strip, red when something will be there). Creatures ignore you entirely, so the whole future is a table and
the game never asks you to simulate. Everything moves, then your arm lands, so you fill the wake behind a
creature.

This is a planning puzzle (Into the Breach, not Minesweeper). It is here as the control: if C feels better
than today's G., the rules were fine and only the information was missing. If A or B feels better than C, the
problem was the moving world itself.

What to look for: do you read the strips, or do you still stare at the creatures? Does "fewest presses"
pull you back for a replay?

## Direction 3 — not built: hidden movers (Hunt the Wumpus)

One shark, hidden, swimming a round you do not know. Arms feel its pull, so each press gives a bearing, and
the puzzle is to track it over time and claim the keys behind it. Genuinely new, but it is deduction over
time and will be harder to read than A or B. Worth trying only after still water is proven, as a late zone.

## Recommendation

Still water. B if its senses read well after five minutes, A otherwise; either way the campaign structure
survives (a creature per zone, a tank per key, a finale with everything at once), the fog comes back for a
reason, and par becomes "fewest presses to a certain fill", which is a real score for a deduction game.

The moving creatures are not lost: they can return as *reactions*. Touch a crab's neighbour and it scuttles
one key away, visibly, once. That keeps "alive" without asking anyone to simulate.
