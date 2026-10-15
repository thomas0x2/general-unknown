# General Unknown

**A near-future RTS rogue-lite. Hold the line. Die. Go back. Try again.**

It's 2034. You are the unnamed general of a small, outgunned nation. The Hegemony — the largest
military machine on Earth — has crossed the border with armored columns, drone swarms and cruise
missiles. You cannot win. You can only hold out as long as possible.

But beneath your headquarters sits **Project LOOKING GLASS**, a prototype time machine. Every time
your HQ falls, it throws you back to the first morning of the invasion, carrying the blueprints,
doctrine and research of the timeline that died. Loop after loop you grow stronger, until one day
you stop just defending, and strike back.

## Playing

No install needed to play: it's a static web game (HTML5 canvas, plain ES modules, no runtime dependencies).

```bash
npm start            # serves the game at http://localhost:5173
npm run build        # bundles everything into one self-contained file: dist/index.html
```

`dist/index.html` can be opened directly from disk or hosted anywhere.

## Factions

Six allied nations face the same invasion. Each has its own roster, unique units and structures,
passive doctrine, research cards, **commander ability** (`G`) and its **own save profile**:
chronons, Chrono Lab unlocks and records are tracked separately per faction.

| Faction | Doctrine | Playstyle | Signature units / structures | Ability |
| --- | --- | --- | --- | --- |
| **Valdaran Defense Force** | Combined arms | Balanced; +10% research, extra reroll | Full mix of infantry, robots, drones, railguns | Artillery Barrage |
| **Iron Guard** | Total infantry | Cheap, fast, tough infantry, +8 supply; no robots | Grenadiers, Shock Troopers, Combat Medics, Mortar Teams, Field Hospital | Mass Mobilization (free reservists) |
| **Swarm Collective** | Drone swarms | Drones 25% cheaper, faster, half supply; weak infantry | Wasp gun drones, Stinger interceptors, Bomber drones, self-replicating Swarm Hive | Swarm Strike (free FPV wave) |
| **Ghostnet Directorate** | Cyber warfare | Hack and stun the enemy; +20% research, +30% EW range | Hacker Cells (convert enemy vehicles, robots, drones), EMP drones, Cyber Ops Center (shrinks waves, spoofs missiles), Disruptor Tower | Network Breach (mass stun + capture) |
| **Forge Union** | Industrial might | Cheap self-repairing buildings, +30% production, richer fabricators | Repair Crawlers, Juggernaut super-tanks, Arms Foundry, Bastion fortress | Overdrive (3× production) |
| **Sky Republic** | Air power | Strong, fast aircraft, longer-range AA; weak ground troops | Attack Helicopters, Tiltrotor Gunships, Strike Fighters, AWACS (marks targets), Airbase, Rearm Pad | Air Strike (bomber carpet run) |

### Unlocking factions

You start with the Valdaran Defense Force. Every other nation has to be earned with two demanding
goals; the later ones also require other factions first. "Lifetime" goals add up across every
timeline with any faction; "one timeline" goals must be achieved within a single run.

| Faction | Requires | Goals |
| --- | --- | --- |
| Iron Guard | — | Train 300 infantry units (lifetime) · Reach wave 12 |
| Forge Union | — | Complete 250 structures (lifetime) · Reach wave 12 |
| Swarm Collective | Iron Guard | Build 200 drones (lifetime) · Destroy 3 Forward Outposts (lifetime) |
| Sky Republic | Forge Union | Reach wave 18 · Destroy both Forward Outposts in one timeline |
| Ghostnet Directorate | Swarm Collective + Sky Republic | Reach wave 22 · Destroy 3 enemy base facilities in one timeline |

Locked factions show each goal's progress on the faction screen. You're alerted mid-run the moment
the last goal is met, and the new faction is revealed at the end of that timeline.

Saves from before factions existed are migrated into the Valdaran profile. Saves made under the
earlier, easier unlock rules have their faction unlocks re-checked against these rules once (the
faction screen says which were re-locked); chronons and Chrono Lab upgrades are always kept.

## How it works

### Each timeline (a run)
- You start with a **Command HQ**, a couple of rifle squads and a recon drone, on a map shrouded in **fog of war**.
- Build **barracks, drone bays, robotics bays, fabricators, logistics hubs**, and defenses: **sentry guns,
  bunkers, laser CIWS, interceptor arrays, EW jammers, missile batteries, railguns** and barriers.
- Train **infantry** (rifle squads, AT teams, MANPADS, snipers, exo-troopers), **robots** (quadruped
  guard dogs, Mule UGVs, Aegis laser rovers, Titan mechs) and **drones** (recon quads, FPV kamikazes,
  Harpy strike drones, Hive carriers that launch FPV swarms).
- **Waves** launch every 75 seconds and grow exponentially. From wave 4 the enemy also fires
  **cruise missiles** at your buildings; intercept them or lose your base.
- **Repair** damaged buildings for credits (3% HP per second, paid as you go), one at a time with `N`
  or base-wide with the auto-repair switch. The Forge Union repairs at half price.
- Capture **rare-earth sites** for income and grab **supply caches** scattered in the fog.
- Your **research program** periodically produces a breakthrough: pick one of three random upgrades
  rolled at **Common / Uncommon / Rare / Epic / Legendary** rarity. Legendaries include unique effects
  like *Chrono Shield*, *Hive Mind* and *Overwatch Network*.

### Striking back
Scout to find the Hegemony. Their **Forward Outposts** are where waves launch from; destroy them and the
waves have to march further. Their home base holds **facilities** that each feed the war machine:
barracks, war factory, drone nest, missile silo, fusion plants and an over-horizon radar. Every
facility you destroy permanently weakens or removes part of their attack for that timeline. Attacking
the base triggers emergency reinforcements, so early on it's suicide. Destroy **Hegemony Command** to
win the impossible war, and unlock **Escalation** levels for even harder (and more rewarding) loops.

### The Chrono Lab (permanent progression)
When a timeline ends you earn **Chronons** (waves survived, kills, outposts and facilities destroyed,
time survived). Spend them in three branches:
- **Arsenal**: unlock new units and structures (each faction has its own tree).
- **Faction doctrines**: upgrade your commander ability and the faction's specialty.
- **Doctrine**: stacking permanent bonuses (HP, damage, income, build speed, starting credits, supply…).
- **Temporal**: research speed, rarity luck, extra draft options, rerolls, free starting drafts,
  *Early Warning* (see the next wave's composition), *Chrono Cartography* (remember explored terrain from
  previous timelines) and *Temporal Recon* (know where the enemy is from the start).

Progress is saved in your browser's `localStorage`.

## Music

The soundtrack is generated live in the browser: a D-minor step sequencer with synth pads, a
galloping bass, arpeggios, a brass-like lead and martial drums. It starts quietly in the menus,
builds up during a timeline, goes to full percussion when enemies close on your base, and peaks
when your HQ is in danger. Toggle it with the ♫ button or `Shift+M`.

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` / arrows | Move along the map (hold `Shift` to move faster); screen edges, middle-drag and the minimap also work, mouse wheel zooms |
| Left click / drag | Select (Shift adds, double-click or Ctrl+click selects all of a type on screen) |
| Right click | Move / attack; with a production building selected: set rally point |
| `Q` + click | Attack-move |
| `E` / `R` (or `H`) | Stop / hold position |
| `Q E R F T Y / Z X C V B N` | Command card (train units, commands, `B` recycles, `N` repairs a building) |
| Build panel | Click a structure, then click the map (Shift to place several) |
| `Ctrl+1-9` / `1-9` | Assign / recall control group (double-tap to jump the camera) |
| `Ctrl+A` | Select the whole army |
| `Space` | Jump to the latest alert |
| `N` | Repair the selected building (credits over time); the build panel has an auto-repair switch |
| `Tab` | Open research |
| `G` | Commander ability (targeted abilities: then click scouted ground) |
| `P`, `Esc` | Pause, command menu (time machine, research log) |
| `+` / `-`, `M`, `Shift+M` | Game speed, mute all, music on/off |

## Project layout

```
index.html, style.css   page shell and UI styles
src/data.js             unit, building and enemy definitions + tuning constants
src/factions.js         playable factions: rosters, unlock trees, passives, abilities
src/game.js             simulation: orders, combat, economy, fog of war, enemy AI and waves
src/map.js              procedural map generation and flow-field pathfinding
src/upgrades.js         research cards and rarity system
src/meta.js             Chrono Lab trees, rewards and per-faction save profiles
src/render.js           canvas renderer (terrain, units, effects, fog, minimap)
src/shapes.js           vector art for every unit and structure
src/ui.js, input.js     HUD, menus, research drafts, controls
src/audio.js            synthesized sound effects (WebAudio, no assets)
src/music.js            generative, battle-reactive soundtrack (WebAudio step sequencer)
tools/                  dev server and single-file bundler
tests/                  headless simulation tests + browser smoke test
```

## Tests

```bash
npm test             # headless simulation: full bot-played timelines, invariants, upgrades, meta
npm run smoke        # drives the real game in headless Chromium (Playwright) and fails on JS errors
```
