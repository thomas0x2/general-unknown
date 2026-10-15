// Playable factions: each is a small nation with its own doctrine, roster, unlock tree,
// commander ability, research cards and save profile.
import { addMod } from './upgrades.js';

// Arsenal node helper: unlocks = unit/building ids that become available.
const node = (id, name, desc, cost, unlocks, group, req) => ({ id, name, desc, cost: [cost], unlocks, group, req });

export const FACTIONS = {
  valdara: {
    id: 'valdara',
    name: 'Valdaran Defense Force',
    short: 'Valdara',
    nation: 'Republic of Valdara',
    color: '#39d5ff',
    doctrine: 'Combined Arms',
    motto: 'Every tool, every front.',
    desc: 'A balanced modern military. Infantry, robots, drones and fortifications all work together. Nothing is exceptional, nothing is missing.',
    playstyle: ['Balanced roster across infantry, robots and drones', 'Better research odds, one extra reroll every timeline', 'Ability: Artillery Barrage'],
    difficulty: 1,
    emblem: 'titan',
    start: ['rifle', 'rifle', 'recon'],
    units: ['rifle', 'at_team', 'manpads', 'sniper', 'exo', 'dog', 'mule', 'aegis', 'titan', 'recon', 'fpv', 'harpy', 'hive'],
    buildings: ['barracks', 'dronebay', 'robotics', 'mine', 'refinery', 'fob', 'datacenter', 'uplink', 'logistics', 'lab', 'radar', 'repair', 'barrier', 'sentry', 'bunker', 'ciws', 'interceptor', 'jammer', 'battery', 'railgun'],
    arsenal: [
      node('manpads', 'MANPADS Team', 'Unlock anti-air missile infantry.', 30, ['manpads'], 'Infantry'),
      node('sniper', 'Ghost Recon', 'Unlock long-range recon snipers.', 55, ['sniper'], 'Infantry', ['manpads']),
      node('exo', 'Exo-Troopers', 'Unlock powered-exoskeleton heavy infantry.', 140, ['exo'], 'Infantry', ['sniper']),
      node('robotics', 'Robotics Bay', 'Unlock the Robotics Bay and Guard Dog quadrupeds.', 60, ['robotics', 'dog'], 'Robots'),
      node('mule', 'Mule UGV', 'Unlock autonomous autocannon ground vehicles.', 90, ['mule'], 'Robots', ['robotics']),
      node('aegis', 'Aegis Rover', 'Unlock mobile laser point-defense rovers.', 110, ['aegis'], 'Robots', ['mule']),
      node('titan', 'Titan Mech', 'Unlock heavy bipedal assault mechs.', 240, ['titan'], 'Robots', ['mule']),
      node('fpv', 'FPV Kamikazes', 'Unlock cheap one-way attack drones.', 30, ['fpv'], 'Drones'),
      node('harpy', 'Harpy Strike Drone', 'Unlock missile-armed loitering drones.', 110, ['harpy'], 'Drones', ['fpv']),
      node('hive', 'Hive Carrier', 'Unlock the FPV-launching drone mothership.', 220, ['hive'], 'Drones', ['harpy']),
      node('bunker', 'Bunker', 'Unlock heavily armored autocannon bunkers.', 35, ['bunker'], 'Structures'),
      node('ciws', 'Laser CIWS', 'Unlock anti-air / anti-missile laser turrets.', 55, ['ciws'], 'Structures'),
      node('interceptor', 'Interceptor Array', 'Unlock long-range missile defense.', 100, ['interceptor'], 'Structures', ['ciws']),
      node('jammer', 'EW Jammer', 'Unlock electronic warfare against drones and missiles.', 80, ['jammer'], 'Structures', ['ciws']),
      node('radar', 'Radar Station', 'Unlock wide-area radar coverage.', 45, ['radar'], 'Structures'),
      node('lab', 'Research Lab', 'Unlock labs that raise the rarity of research results.', 65, ['lab'], 'Structures'),
      node('repair', 'Nanite Repair Bay', 'Unlock area repair for units and buildings.', 100, ['repair'], 'Structures', ['lab']),
      node('battery', 'Missile Battery', 'Unlock long-range guided missile launchers.', 120, ['battery'], 'Structures', ['radar']),
      node('railgun', 'Railgun', 'Unlock hypersonic electromagnetic railguns.', 280, ['railgun'], 'Structures', ['battery']),
    ],
    passive(g) {
      g.mods.luck += 0.5;
      g.research.rerolls += 1;
    },
    ability: {
      id: 'barrage', name: 'Artillery Barrage', cooldown: 90, target: true, radius: 170,
      desc: 'Rocket artillery saturates the target area with 14 guided shells over 4 seconds.',
    },
    special: {
      name: 'Joint Staff College', desc: '+3% HP and damage for all units per level.', cost: [30, 55, 85, 120],
      apply: (g, lv) => { addMod(g.mods, 'hp', 'unit', 0.03 * lv); addMod(g.mods, 'dmg', 'unit', 0.03 * lv); },
    },
  },

  ironguard: {
    id: 'ironguard',
    name: 'Iron Guard',
    short: 'Iron Guard',
    nation: 'Free Cantons of Karst',
    color: '#5fe0a0',
    doctrine: 'Total Infantry',
    motto: 'Every citizen a soldier.',
    desc: 'A mountain nation with universal conscription. It cannot afford machines, but it can field more troops per square kilometer than anyone alive.',
    playstyle: ['Infantry 20% cheaper, 25% faster to train, +10% HP', '+8 supply; drones cost 20% more; no robots', 'Unique: Grenadiers, Shock Troopers, Medics, Mortars, Field Hospital', 'Ability: Mass Mobilization'],
    difficulty: 1,
    unlock: {
      hint: 'The Cantons only trust a general who has bled alongside the infantry.',
      goals: [
        { stat: 'infantry', need: 300, text: 'Train 300 infantry units' },
        { stat: 'bestWave', need: 12, text: 'Reach wave 12' },
      ],
    },
    emblem: 'shock',
    start: ['rifle', 'rifle', 'rifle', 'grenadier', 'recon'],
    units: ['rifle', 'grenadier', 'at_team', 'medic', 'manpads', 'mortar', 'shock', 'sniper', 'exo', 'recon', 'fpv'],
    buildings: ['barracks', 'dronebay', 'mine', 'refinery', 'fob', 'datacenter', 'uplink', 'logistics', 'hospital', 'lab', 'radar', 'barrier', 'sentry', 'bunker', 'ciws', 'interceptor', 'battery'],
    arsenal: [
      node('medic', 'Combat Medics', 'Unlock healers that keep your squads alive.', 30, ['medic'], 'Infantry'),
      node('manpads', 'MANPADS Team', 'Unlock anti-air missile infantry.', 30, ['manpads'], 'Infantry'),
      node('mortar', 'Mortar Teams', 'Unlock long-range infantry artillery.', 60, ['mortar'], 'Infantry'),
      node('shock', 'Shock Troopers', 'Unlock armored close-assault infantry.', 70, ['shock'], 'Infantry', ['medic']),
      node('sniper', 'Ghost Recon', 'Unlock long-range recon snipers.', 55, ['sniper'], 'Infantry', ['manpads']),
      node('exo', 'Exo-Troopers', 'Unlock powered-exoskeleton heavy infantry.', 150, ['exo'], 'Infantry', ['shock']),
      node('fpv', 'FPV Kamikazes', 'Unlock cheap one-way attack drones.', 40, ['fpv'], 'Support'),
      node('hospital', 'Field Hospital', 'Unlock large-area infantry healing.', 70, ['hospital'], 'Support', ['medic']),
      node('ciws', 'Laser CIWS', 'Unlock anti-air / anti-missile laser turrets.', 55, ['ciws'], 'Structures'),
      node('interceptor', 'Interceptor Array', 'Unlock long-range missile defense.', 100, ['interceptor'], 'Structures', ['ciws']),
      node('radar', 'Radar Station', 'Unlock wide-area radar coverage.', 45, ['radar'], 'Structures'),
      node('lab', 'Research Lab', 'Unlock labs that raise the rarity of research results.', 65, ['lab'], 'Structures'),
      node('battery', 'Missile Battery', 'Unlock long-range guided missile launchers.', 120, ['battery'], 'Structures', ['radar']),
    ],
    passive(g) {
      const m = g.mods;
      addMod(m, 'cost', 'infantry', 0.2);
      addMod(m, 'build', 'infantry', 0.25);
      addMod(m, 'hp', 'infantry', 0.1);
      addMod(m, 'cost', 'drone', -0.2);
      m.supply += 8;
    },
    ability: {
      id: 'mobilize', name: 'Mass Mobilization', cooldown: 100, target: false,
      desc: 'Reservists answer the call: free Rifle Squads and Grenadiers muster at your HQ. The levy grows with each wave. They cost no supply.',
    },
    special: {
      name: 'Veteran Cadres', desc: '+6% HP and damage for infantry per level.', cost: [30, 55, 85, 120],
      apply: (g, lv) => { addMod(g.mods, 'hp', 'infantry', 0.06 * lv); addMod(g.mods, 'dmg', 'infantry', 0.06 * lv); },
    },
  },

  swarm: {
    id: 'swarm',
    name: 'Swarm Collective',
    short: 'Swarm',
    nation: 'Lumen Free State',
    color: '#c8f04a',
    doctrine: 'Drone Swarms',
    motto: 'A thousand wings, no pilots.',
    desc: 'A tech-hub city state that turned its consumer drone industry into a war machine. Fragile, cheap and overwhelming in numbers.',
    playstyle: ['Drones 25% cheaper, 30% faster to build, half supply', 'Infantry 15% more expensive and 10% weaker; no robots', 'Unique: Wasps, Stingers, Bomber Drones, Swarm Hive', 'Ability: Swarm Strike'],
    difficulty: 2,
    hqTrains: ['rifle', 'recon', 'fpv'],
    supplyMult: { drone: 0.5 },
    unlock: {
      requires: ['ironguard'],
      hint: 'Lumen will only release its swarms to a proven veteran who can take the fight forward.',
      goals: [
        { stat: 'drones', need: 200, text: 'Build 200 drones' },
        { stat: 'outposts', need: 3, text: 'Destroy 3 Forward Outposts' },
      ],
    },
    emblem: 'wasp',
    start: ['rifle', 'recon', 'wasp', 'wasp', 'wasp'],
    units: ['rifle', 'manpads', 'recon', 'fpv', 'wasp', 'stinger', 'bomber', 'harpy', 'hive'],
    buildings: ['barracks', 'dronebay', 'swarmhive', 'mine', 'refinery', 'fob', 'datacenter', 'uplink', 'logistics', 'lab', 'radar', 'helipad', 'barrier', 'sentry', 'ciws', 'jammer', 'interceptor'],
    arsenal: [
      node('stinger', 'Stinger Interceptors', 'Unlock kamikaze anti-air drones.', 30, ['stinger'], 'Drones'),
      node('bomber', 'Bomber Drones', 'Unlock heavy bomb-dropping drones.', 80, ['bomber'], 'Drones'),
      node('harpy', 'Harpy Strike Drone', 'Unlock missile-armed loitering drones.', 110, ['harpy'], 'Drones', ['bomber']),
      node('hive', 'Hive Carrier', 'Unlock the FPV-launching drone mothership.', 220, ['hive'], 'Drones', ['harpy']),
      node('swarmhive', 'Swarm Hive', 'Unlock self-replicating hives that print free drones.', 70, ['swarmhive'], 'Infrastructure'),
      node('helipad', 'Rearm Pad', 'Unlock pads that repair drones in the field.', 50, ['helipad'], 'Infrastructure'),
      node('manpads', 'MANPADS Team', 'Unlock anti-air missile infantry.', 35, ['manpads'], 'Infrastructure'),
      node('radar', 'Radar Station', 'Unlock wide-area radar coverage.', 45, ['radar'], 'Infrastructure'),
      node('lab', 'Research Lab', 'Unlock labs that raise the rarity of research results.', 65, ['lab'], 'Infrastructure'),
      node('ciws', 'Laser CIWS', 'Unlock anti-air / anti-missile laser turrets.', 55, ['ciws'], 'Structures'),
      node('jammer', 'EW Jammer', 'Unlock electronic warfare against drones and missiles.', 70, ['jammer'], 'Structures', ['ciws']),
      node('interceptor', 'Interceptor Array', 'Unlock long-range missile defense.', 100, ['interceptor'], 'Structures', ['ciws']),
    ],
    passive(g) {
      const m = g.mods;
      addMod(m, 'cost', 'drone', 0.25);
      addMod(m, 'build', 'drone', 0.3);
      m.compute += 4;
      addMod(m, 'cost', 'infantry', -0.15);
      addMod(m, 'hp', 'infantry', -0.1);
    },
    ability: {
      id: 'swarm', name: 'Swarm Strike', cooldown: 80, target: true, radius: 140,
      desc: 'Launch a free wave of FPV kamikazes from your HQ at the target. The swarm grows with each wave.',
    },
    special: {
      name: 'Distributed Swarm Mind', desc: '+6% damage and +5% speed for drones per level.', cost: [30, 55, 85, 120],
      apply: (g, lv) => { addMod(g.mods, 'dmg', 'drone', 0.06 * lv); addMod(g.mods, 'speed', 'drone', 0.05 * lv); },
    },
  },

  ghostnet: {
    id: 'ghostnet',
    name: 'Ghostnet Directorate',
    short: 'Ghostnet',
    nation: 'Union of Aster',
    color: '#c08cff',
    doctrine: 'Cyber Warfare',
    motto: 'Their machines are our machines.',
    desc: 'A small, wired nation whose real army lives in its networks. It hacks, jams and stuns the Hegemony\'s machines and turns their robots and drones against them.',
    playstyle: ['Hackers convert enemy vehicles, robots and drones', 'Much better research odds, sight +15%, EW range +30%; units deal 10% less damage', 'Unique: Hacker Cells, EMP Drones, Cyber Ops Center, Disruptor Tower', 'Ability: Network Breach'],
    difficulty: 3,
    unlock: {
      requires: ['swarm', 'skyrep'],
      hint: 'Aster\'s Directorate reveals itself only to a commander who has struck the Hegemony at its heart.',
      goals: [
        { stat: 'bestWave', need: 22, text: 'Reach wave 22' },
        { stat: 'facilitiesRun', need: 3, text: 'Destroy 3 enemy base facilities in one timeline' },
      ],
    },
    emblem: 'empdrone',
    start: ['rifle', 'rifle', 'hacker', 'recon'],
    units: ['rifle', 'at_team', 'hacker', 'sniper', 'recon', 'empdrone', 'dog', 'mule', 'aegis'],
    buildings: ['barracks', 'dronebay', 'robotics', 'mine', 'refinery', 'fob', 'datacenter', 'uplink', 'logistics', 'cyberops', 'lab', 'radar', 'barrier', 'sentry', 'jammer', 'disruptor', 'ciws', 'interceptor'],
    arsenal: [
      node('empdrone', 'EMP Drones', 'Unlock drones that stun everything in a wide radius.', 40, ['empdrone'], 'Cyber'),
      node('cyberops', 'Cyber Ops Center', 'Unlock the building that shrinks enemy waves and spoofs their missiles.', 90, ['cyberops'], 'Cyber'),
      node('disruptor', 'Disruptor Tower', 'Unlock EMP towers that stun attackers.', 70, ['disruptor'], 'Cyber'),
      node('sniper', 'Ghost Recon', 'Unlock long-range recon snipers.', 55, ['sniper'], 'Cyber'),
      node('robotics', 'Robotics Bay', 'Unlock the Robotics Bay and Guard Dog quadrupeds.', 70, ['robotics', 'dog'], 'Robots'),
      node('mule', 'Mule UGV', 'Unlock autonomous autocannon ground vehicles.', 90, ['mule'], 'Robots', ['robotics']),
      node('aegis', 'Aegis Rover', 'Unlock mobile laser point-defense rovers.', 110, ['aegis'], 'Robots', ['mule']),
      node('ciws', 'Laser CIWS', 'Unlock anti-air / anti-missile laser turrets.', 55, ['ciws'], 'Structures'),
      node('interceptor', 'Interceptor Array', 'Unlock long-range missile defense.', 100, ['interceptor'], 'Structures', ['ciws']),
      node('lab', 'Research Lab', 'Unlock labs that raise the rarity of research results.', 65, ['lab'], 'Structures'),
    ],
    passive(g) {
      const m = g.mods;
      m.luck += 1;
      addMod(m, 'sight', 'all', 0.15);
      addMod(m, 'range', 'jammer', 0.3);
      addMod(m, 'range', 'disruptor', 0.15);
      addMod(m, 'dmg', 'unit', -0.1);
    },
    ability: {
      id: 'breach', name: 'Network Breach', cooldown: 100, target: true, radius: 230,
      desc: 'Hack every system in the target area: all enemy units and structures are stunned for 8 seconds, and the most valuable enemy drones and vehicles are turned to your side.',
    },
    special: {
      name: 'Offensive Cyber Command', desc: '+15% hacking speed and +10% stun duration per level.', cost: [30, 55, 85, 120],
      apply: (g, lv) => { addMod(g.mods, 'hack', 'all', 0.15 * lv); addMod(g.mods, 'stun', 'all', 0.1 * lv); },
    },
  },

  forge: {
    id: 'forge',
    name: 'Forge Union',
    short: 'Forge',
    nation: 'Industrial Commonwealth of Brenn',
    color: '#ffc94a',
    doctrine: 'Industrial Might',
    motto: 'Outbuild. Outlast.',
    desc: 'A heavy-industry powerhouse with fully automated factories. Its soldiers are few, but its assembly lines never stop.',
    playstyle: ['Buildings 20% cheaper with +15% HP, self-repair, and half-price repairs', 'Production and construction +30%, mines yield 40% more', 'Unique: Repair Crawlers, Juggernauts, Arms Foundry, Bastion', 'Ability: Overdrive'],
    difficulty: 1,
    unlock: {
      hint: 'The Commonwealth\'s industrialists back only commanders who build on a grand scale.',
      goals: [
        { stat: 'buildings', need: 250, text: 'Complete 250 structures' },
        { stat: 'bestWave', need: 12, text: 'Reach wave 12' },
      ],
    },
    emblem: 'juggernaut',
    start: ['rifle', 'dog', 'dog', 'recon'],
    units: ['rifle', 'at_team', 'recon', 'fpv', 'dog', 'mule', 'crawler', 'aegis', 'titan', 'juggernaut'],
    buildings: ['barracks', 'robotics', 'dronebay', 'mine', 'refinery', 'fob', 'datacenter', 'uplink', 'foundry', 'logistics', 'lab', 'repair', 'barrier', 'sentry', 'bunker', 'bastion', 'ciws', 'interceptor', 'battery', 'railgun'],
    incomeBonus: { mine: 0.4 },
    arsenal: [
      node('crawler', 'Repair Crawler', 'Unlock robots that repair robots and buildings.', 40, ['crawler'], 'Robots'),
      node('aegis', 'Aegis Rover', 'Unlock mobile laser point-defense rovers.', 100, ['aegis'], 'Robots'),
      node('titan', 'Titan Mech', 'Unlock heavy bipedal assault mechs.', 200, ['titan'], 'Robots'),
      node('juggernaut', 'Juggernaut', 'Unlock super-heavy autonomous tanks.', 320, ['juggernaut'], 'Robots', ['titan']),
      node('fpv', 'FPV Kamikazes', 'Unlock cheap one-way attack drones.', 30, ['fpv'], 'Robots'),
      node('foundry', 'Arms Foundry', 'Unlock heavy industry that speeds up all production.', 60, ['foundry'], 'Industry'),
      node('repair', 'Nanite Repair Bay', 'Unlock area repair for units and buildings.', 90, ['repair'], 'Industry'),
      node('lab', 'Research Lab', 'Unlock labs that raise the rarity of research results.', 65, ['lab'], 'Industry'),
      node('bunker', 'Bunker', 'Unlock heavily armored autocannon bunkers.', 35, ['bunker'], 'Fortifications'),
      node('bastion', 'Bastion', 'Unlock prefabricated twin-cannon fortresses.', 110, ['bastion'], 'Fortifications', ['bunker']),
      node('ciws', 'Laser CIWS', 'Unlock anti-air / anti-missile laser turrets.', 55, ['ciws'], 'Fortifications'),
      node('interceptor', 'Interceptor Array', 'Unlock long-range missile defense.', 100, ['interceptor'], 'Fortifications', ['ciws']),
      node('battery', 'Missile Battery', 'Unlock long-range guided missile launchers.', 120, ['battery'], 'Fortifications', ['lab']),
      node('railgun', 'Railgun', 'Unlock hypersonic electromagnetic railguns.', 280, ['railgun'], 'Fortifications', ['battery']),
    ],
    passive(g) {
      const m = g.mods;
      addMod(m, 'cost', 'building', 0.2);
      addMod(m, 'hp', 'building', 0.15);
      addMod(m, 'regen', 'building', 0.003);
      addMod(m, 'build', 'all', 0.3);
      addMod(m, 'cost', 'robot', 0.1);
      addMod(m, 'dmg', 'infantry', -0.1);
      g.repairCostMult = 0.5;
    },
    ability: {
      id: 'overdrive', name: 'Overdrive', cooldown: 110, target: false, duration: 20,
      desc: 'Push every factory past its limits: for 20 seconds all production and construction run 3× faster and your buildings repair 2% HP per second.',
    },
    special: {
      name: 'Automated Supply Chain', desc: '+8% production speed and 4% cheaper buildings per level.', cost: [30, 55, 85, 120],
      apply: (g, lv) => { addMod(g.mods, 'build', 'all', 0.08 * lv); addMod(g.mods, 'cost', 'building', 0.04 * lv); },
    },
  },

  skyrep: {
    id: 'skyrep',
    name: 'Sky Republic',
    short: 'Sky Republic',
    nation: 'Archipelago of Meridia',
    color: '#9db8ff',
    doctrine: 'Air Power',
    motto: 'Own the sky, own the war.',
    desc: 'An island nation that could never match a continental army on the ground, so it invested everything in aircraft. Fast, hard-hitting and expensive.',
    playstyle: ['Aircraft +15% HP, +10% speed and damage; Airbase 25% cheaper; +150 starting credits', 'Anti-air defenses +25% range; ground infantry 10% weaker', 'Unique: Attack Helicopters, Tiltrotors, Strike Fighters, AWACS', 'Ability: Air Strike'],
    difficulty: 2,
    unlock: {
      requires: ['forge'],
      hint: 'Meridia\'s air fleet needs a long-held front line before it will commit.',
      goals: [
        { stat: 'bestWave', need: 18, text: 'Reach wave 18' },
        { stat: 'outpostsRun', need: 2, text: 'Destroy both Forward Outposts in one timeline' },
      ],
    },
    emblem: 'fighter',
    start: ['rifle', 'rifle', 'manpads', 'recon'],
    units: ['rifle', 'at_team', 'manpads', 'recon', 'harpy', 'helo', 'tiltrotor', 'fighter', 'awacs'],
    buildings: ['barracks', 'dronebay', 'airbase', 'helipad', 'mine', 'refinery', 'fob', 'datacenter', 'uplink', 'logistics', 'lab', 'radar', 'barrier', 'sentry', 'ciws', 'interceptor', 'battery'],
    arsenal: [
      node('helipad', 'Rearm Pad', 'Unlock pads that repair aircraft in the field.', 35, ['helipad'], 'Aviation'),
      node('fighter', 'Strike Fighters', 'Unlock fast multirole jets.', 80, ['fighter'], 'Aviation'),
      node('awacs', 'AWACS', 'Unlock airborne radar that marks enemies for extra damage.', 90, ['awacs'], 'Aviation', ['fighter']),
      node('tiltrotor', 'Tiltrotor Gunship', 'Unlock heavily armed tiltrotor gunships.', 160, ['tiltrotor'], 'Aviation', ['fighter']),
      node('harpy', 'Harpy Strike Drone', 'Unlock missile-armed loitering drones.', 110, ['harpy'], 'Aviation'),
      node('ciws', 'Laser CIWS', 'Unlock anti-air / anti-missile laser turrets.', 55, ['ciws'], 'Ground'),
      node('interceptor', 'Interceptor Array', 'Unlock long-range missile defense.', 90, ['interceptor'], 'Ground', ['ciws']),
      node('radar', 'Radar Station', 'Unlock wide-area radar coverage.', 45, ['radar'], 'Ground'),
      node('lab', 'Research Lab', 'Unlock labs that raise the rarity of research results.', 65, ['lab'], 'Ground'),
      node('battery', 'Missile Battery', 'Unlock long-range guided missile launchers.', 120, ['battery'], 'Ground', ['radar']),
    ],
    passive(g) {
      const m = g.mods;
      addMod(m, 'hp', 'aircraft', 0.15);
      addMod(m, 'speed', 'aircraft', 0.1);
      addMod(m, 'dmg', 'aircraft', 0.1);
      addMod(m, 'cost', 'airbase', 0.25);
      addMod(m, 'range', 'ciws', 0.25);
      addMod(m, 'range', 'interceptor', 0.25);
      addMod(m, 'hp', 'infantry', -0.1);
      g.credits += 150;
    },
    ability: {
      id: 'airstrike', name: 'Air Strike', cooldown: 85, target: true, radius: 60, length: 360,
      desc: 'A stealth bomber flies over the target and carpets a 360 m line with 9 guided bombs.',
    },
    special: {
      name: 'Air Superiority Doctrine', desc: '+6% HP and damage for aircraft per level.', cost: [30, 55, 85, 120],
      apply: (g, lv) => { addMod(g.mods, 'hp', 'aircraft', 0.06 * lv); addMod(g.mods, 'dmg', 'aircraft', 0.06 * lv); },
    },
  },
};

// Listed in unlock order: two independent starts, then the chains.
export const FACTION_ORDER = ['valdara', 'ironguard', 'forge', 'swarm', 'skyrep', 'ghostnet'];

// Lifetime milestone stats (shared by all factions) and how a finished timeline adds to them.
// mode 'sum' accumulates over every timeline; 'max' must be achieved within a single timeline.
export const MILESTONES = {
  infantry: { label: 'infantry trained', fromRun: (g) => g.stats.infantry, mode: 'sum' },
  drones: { label: 'drones built', fromRun: (g) => g.stats.drones, mode: 'sum' },
  buildings: { label: 'structures completed', fromRun: (g) => g.stats.built, mode: 'sum' },
  outposts: { label: 'outposts destroyed', fromRun: (g) => g.stats.outposts, mode: 'sum' },
  bestWave: { label: 'best wave', fromRun: (g) => g.wave.n, mode: 'max' },
  outpostsRun: { label: 'outposts in one timeline', fromRun: (g) => g.stats.outposts, mode: 'max' },
  facilitiesRun: { label: 'facilities in one timeline', fromRun: (g) => g.stats.facilities, mode: 'max' },
};

// id -> arsenal node id required to use it (anything absent is available from the start)
export function lockMap(faction) {
  if (faction._locks) return faction._locks;
  const m = {};
  for (const n of faction.arsenal) for (const u of n.unlocks) m[u] = n.id;
  faction._locks = m;
  return m;
}
