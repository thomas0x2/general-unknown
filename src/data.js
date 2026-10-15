// Static game data: units, buildings, enemy roster, tuning constants.
// All numbers in pixels / seconds unless noted. One tile = TILE px.

export const TILE = 32;
export const MAP_W = 80;
export const MAP_H = 80;

export const TEAM_PLAYER = 0;
export const TEAM_ENEMY = 1;

export const COLORS = {
  player: '#39d5ff',
  playerDim: '#1b6f88',
  enemy: '#ff4d3a',
  enemyDim: '#8a2a20',
  neutral: '#d8c26a',
};

// Damage multipliers per armor class. `missile` = can hit (intercept) missiles.
export const VS = {
  smallArms: { inf: 1, light: 0.55, armor: 0.15, air: 0.6, struct: 0.3 },
  heavyMG: { inf: 1.1, light: 0.85, armor: 0.3, air: 0.8, struct: 0.45 },
  antiTank: { inf: 0.45, light: 1.3, armor: 1.6, air: 0, struct: 1.1 },
  antiAir: { inf: 0, light: 0, armor: 0, air: 1.4, struct: 0, missile: 1 },
  autocannon: { inf: 0.9, light: 1.2, armor: 0.6, air: 0.7, struct: 0.7 },
  explosive: { inf: 1.2, light: 1.0, armor: 0.85, air: 0, struct: 1.3 },
  precision: { inf: 1.7, light: 0.6, armor: 0.25, air: 0.3, struct: 0.3 },
  laser: { inf: 0.8, light: 0.6, armor: 0.3, air: 1.3, struct: 0.35, missile: 1 },
  kinetic: { inf: 1, light: 1.4, armor: 2.0, air: 0, struct: 1.2 },
  kamikaze: { inf: 1, light: 1.3, armor: 1.4, air: 0, struct: 1.25 },
  interceptor: { inf: 0, light: 0, armor: 0, air: 1.2, struct: 0, missile: 1.5 },
};

export const ARMOR_NAMES = {
  inf: 'Infantry',
  light: 'Light vehicle',
  armor: 'Armored',
  air: 'Air',
  struct: 'Structure',
};

// ---------------------------------------------------------------------------
// Player units
// weapon.type: bullet (hitscan tracer) | laser (hitscan beam) | rocket (homing projectile)
//              | shell (ballistic, splash) | missile (homing, interceptable) | kamikaze
// weapon.targets: ground | air | both
// ---------------------------------------------------------------------------
export const UNITS = {
  rifle: {
    name: 'Rifle Squad', cls: 'infantry', armor: 'inf', hp: 110, speed: 52, radius: 8, sight: 230,
    cost: 50, time: 6, supply: 1, shape: 'squad',
    weapon: { range: 160, dmg: 9, cd: 0.7, vs: VS.smallArms, targets: 'both', type: 'bullet' },
    desc: 'Conscripts with smart rifles and ballistic-AI scopes. Cheap, flexible, can plink at drones.',
  },
  at_team: {
    name: 'AT Team', cls: 'infantry', armor: 'inf', hp: 90, speed: 48, radius: 8, sight: 240,
    cost: 90, time: 8, supply: 1, shape: 'squad_at',
    weapon: { range: 205, dmg: 48, cd: 2.4, vs: VS.antiTank, targets: 'ground', type: 'rocket', projSpeed: 330 },
    desc: 'Fire-and-forget top-attack missiles. Shreds vehicles, poor against infantry.',
  },
  manpads: {
    name: 'MANPADS Team', cls: 'infantry', armor: 'inf', hp: 85, speed: 50, radius: 8, sight: 300,
    cost: 95, time: 8, supply: 1, shape: 'squad_aa', unlock: 'manpads',
    weapon: { range: 270, dmg: 60, cd: 2.4, vs: VS.antiAir, targets: 'air', type: 'rocket', projSpeed: 420 },
    desc: 'Shoulder-fired AI-guided missiles. Deletes drones and gunships. Cannot hit ground targets.',
  },
  sniper: {
    name: 'Ghost Recon', cls: 'infantry', armor: 'inf', hp: 75, speed: 54, radius: 7, sight: 380,
    cost: 110, time: 10, supply: 1, shape: 'sniper', unlock: 'sniper',
    weapon: { range: 300, dmg: 46, cd: 2.6, vs: VS.precision, targets: 'ground', type: 'bullet' },
    desc: 'Adaptive-camo recon snipers. Huge sight range, lethal against infantry.',
  },
  exo: {
    name: 'Exo-Trooper', cls: 'infantry', armor: 'light', hp: 320, speed: 50, radius: 10, sight: 250,
    cost: 170, time: 12, supply: 2, shape: 'exo', unlock: 'exo',
    weapon: { range: 175, dmg: 15, cd: 0.38, vs: VS.heavyMG, targets: 'both', type: 'bullet' },
    desc: 'Powered exoskeleton infantry with solid-state armor and a rotary gun. Hits air and ground.',
  },
  dog: {
    name: 'Guard Dog', cls: 'robot', armor: 'light', hp: 130, speed: 92, radius: 8, sight: 260,
    cost: 70, time: 6, supply: 1, shape: 'dog', unlock: 'robotics',
    weapon: { range: 125, dmg: 7, cd: 0.32, vs: VS.smallArms, targets: 'ground', type: 'bullet' },
    desc: 'Quadruped robot with a mounted carbine. Fast, cheap, expendable.',
  },
  mule: {
    name: 'Mule UGV', cls: 'robot', armor: 'light', hp: 380, speed: 64, radius: 12, sight: 250,
    cost: 165, time: 12, supply: 2, shape: 'ugv', unlock: 'mule',
    weapon: { range: 200, dmg: 21, cd: 0.8, vs: VS.autocannon, targets: 'both', type: 'bullet' },
    desc: 'Autonomous tracked ground vehicle with a 30mm autocannon. Good all-rounder.',
  },
  titan: {
    name: 'Titan Mech', cls: 'robot', armor: 'armor', hp: 1400, speed: 40, radius: 17, sight: 280,
    cost: 420, time: 26, supply: 4, shape: 'mech', unlock: 'titan',
    weapon: { range: 230, dmg: 75, cd: 1.6, vs: VS.antiTank, targets: 'ground', type: 'shell', splash: 42, projSpeed: 520 },
    desc: 'Bipedal assault mech with a coil cannon. Slow, armored, devastating.',
  },
  aegis: {
    name: 'Aegis Rover', cls: 'robot', armor: 'light', hp: 260, speed: 60, radius: 11, sight: 280,
    cost: 190, time: 14, supply: 2, shape: 'rover', unlock: 'aegis',
    weapon: { range: 230, dmg: 9, cd: 0.14, vs: VS.laser, targets: 'air', type: 'laser', intercept: true },
    desc: 'Mobile laser point-defense. Burns drones and shoots down missiles heading for your troops.',
  },
  recon: {
    name: 'Recon Drone', cls: 'drone', armor: 'air', air: true, hp: 45, speed: 150, radius: 7, sight: 400,
    cost: 40, time: 5, supply: 1, shape: 'quad',
    weapon: null,
    desc: 'Unarmed long-endurance quadcopter. Your eyes in the fog of war.',
  },
  fpv: {
    name: 'FPV Kamikaze', cls: 'drone', armor: 'air', air: true, hp: 30, speed: 175, radius: 5, sight: 220,
    cost: 35, time: 3, supply: 1, shape: 'fpv', unlock: 'fpv',
    weapon: { range: 14, dmg: 130, cd: 1, vs: VS.kamikaze, targets: 'ground', type: 'kamikaze', splash: 34 },
    desc: 'One-way attack drone with a shaped charge. Dies on impact. Brutal against armor.',
  },
  harpy: {
    name: 'Harpy Strike Drone', cls: 'drone', armor: 'air', air: true, hp: 170, speed: 115, radius: 11, sight: 320,
    cost: 160, time: 14, supply: 2, shape: 'wing', unlock: 'harpy',
    weapon: { range: 240, dmg: 46, cd: 2.2, vs: VS.antiTank, targets: 'ground', type: 'rocket', projSpeed: 380 },
    desc: 'Loitering strike drone with micro-missiles. Hunts vehicles beyond the front line.',
  },
  hive: {
    name: 'Hive Carrier', cls: 'drone', armor: 'air', air: true, hp: 650, speed: 70, radius: 16, sight: 320,
    cost: 380, time: 24, supply: 4, shape: 'carrier', unlock: 'hive',
    weapon: null, spawner: { unit: 'fpv', every: 7, max: 4 },
    desc: 'Airborne drone mothership. Continuously launches FPV kamikazes at nearby enemies.',
  },
};

// ---------------------------------------------------------------------------
// Player buildings. w/h in tiles.
// ---------------------------------------------------------------------------
export const BUILDINGS = {
  hq: {
    name: 'Command HQ', w: 3, h: 3, hp: 3500, cost: 0, time: 0, sight: 320, income: 6, supply: 12,
    trains: ['rifle', 'recon'], shape: 'hq', noBuild: true,
    weapon: { range: 220, dmg: 13, cd: 0.45, vs: VS.heavyMG, targets: 'both', type: 'bullet' },
    desc: 'Your headquarters. Houses the time machine. If it falls, the timeline collapses.',
  },
  barracks: {
    name: 'Barracks', w: 2, h: 2, hp: 900, cost: 150, time: 14, sight: 220, cat: 'base',
    trains: ['rifle', 'at_team', 'manpads', 'sniper', 'exo'], shape: 'barracks',
    desc: 'Trains infantry.',
  },
  robotics: {
    name: 'Robotics Bay', w: 2, h: 2, hp: 1100, cost: 240, time: 20, sight: 220, cat: 'base', unlock: 'robotics',
    trains: ['dog', 'mule', 'aegis', 'titan'], shape: 'factory',
    desc: 'Assembles ground robots and mechs.',
  },
  dronebay: {
    name: 'Drone Bay', w: 2, h: 2, hp: 800, cost: 180, time: 16, sight: 240, cat: 'base',
    trains: ['recon', 'fpv', 'harpy', 'hive'], shape: 'dronebay',
    desc: 'Prints and launches aerial drones.',
  },
  fabricator: {
    name: 'Fabricator', w: 2, h: 2, hp: 700, cost: 200, time: 18, sight: 180, cat: 'base', income: 3.5,
    shape: 'fabricator', costStep: 75,
    desc: 'Automated micro-factory. Generates +3.5 credits per second. Each additional Fabricator costs 75 more.',
  },
  logistics: {
    name: 'Logistics Hub', w: 2, h: 2, hp: 700, cost: 110, time: 12, sight: 180, cat: 'base', supply: 8,
    shape: 'logistics',
    desc: 'Autonomous supply depot. +8 supply cap.',
  },
  lab: {
    name: 'Research Lab', w: 2, h: 2, hp: 700, cost: 250, time: 22, sight: 180, cat: 'base', unlock: 'lab',
    research: 0.7, shape: 'lab',
    desc: 'AI-driven research cluster. Speeds up the research program.',
  },
  radar: {
    name: 'Radar Station', w: 2, h: 2, hp: 600, cost: 160, time: 14, sight: 620, cat: 'base', unlock: 'radar',
    shape: 'radar',
    desc: 'AESA radar. Reveals a huge area around it.',
  },
  repair: {
    name: 'Nanite Repair Bay', w: 2, h: 2, hp: 700, cost: 220, time: 18, sight: 200, cat: 'base', unlock: 'repair',
    repair: { radius: 190, rate: 0.025 }, shape: 'repair',
    desc: 'Nanite cloud repairs nearby units and buildings (2.5% HP/s).',
  },
  barrier: {
    name: 'Barrier', w: 1, h: 1, hp: 650, cost: 25, time: 3, sight: 64, cat: 'defense', shape: 'barrier', wall: true,
    desc: 'Graphene-reinforced barrier. Blocks and delays ground forces. Hold Shift to place several.',
  },
  sentry: {
    name: 'Sentry Gun', w: 1, h: 1, hp: 520, cost: 120, time: 10, sight: 240, cat: 'defense', tags: ['defense'],
    shape: 'turret',
    weapon: { range: 210, dmg: 11, cd: 0.36, vs: VS.heavyMG, targets: 'both', type: 'bullet' },
    desc: 'Autonomous machine-gun turret. Hits ground and air.',
  },
  bunker: {
    name: 'Bunker', w: 2, h: 2, hp: 2200, cost: 220, time: 18, sight: 240, cat: 'defense', tags: ['defense'], unlock: 'bunker',
    shape: 'bunker',
    weapon: { range: 200, dmg: 32, cd: 0.9, vs: VS.autocannon, targets: 'ground', type: 'bullet' },
    desc: 'Heavily armored strongpoint with an automated autocannon.',
  },
  ciws: {
    name: 'Laser CIWS', w: 1, h: 1, hp: 450, cost: 170, time: 12, sight: 260, cat: 'defense', tags: ['defense'], unlock: 'ciws',
    shape: 'laser',
    weapon: { range: 240, dmg: 10, cd: 0.13, vs: VS.laser, targets: 'air', type: 'laser', intercept: true },
    desc: 'Directed-energy close-in weapon system. Burns drones and missiles out of the sky.',
  },
  interceptor: {
    name: 'Interceptor Array', w: 2, h: 2, hp: 900, cost: 300, time: 22, sight: 300, cat: 'defense', tags: ['defense'], unlock: 'interceptor',
    shape: 'sam',
    weapon: { range: 440, dmg: 120, cd: 1.6, vs: VS.interceptor, targets: 'air', type: 'rocket', projSpeed: 620, intercept: true, prioritizeMissiles: true },
    desc: 'Long-range missile defense. Prioritises incoming missiles, then aircraft.',
  },
  battery: {
    name: 'Missile Battery', w: 2, h: 2, hp: 900, cost: 360, time: 26, sight: 220, cat: 'defense', tags: ['defense'], unlock: 'battery',
    shape: 'launcher',
    weapon: { range: 560, dmg: 130, cd: 5.5, vs: VS.explosive, targets: 'ground', type: 'missile', splash: 58, projSpeed: 260, salvo: 2 },
    desc: 'Long-range guided rocket launcher. Fires salvos at anything you can see (pair with drones or radar).',
  },
  jammer: {
    name: 'EW Jammer', w: 1, h: 1, hp: 500, cost: 210, time: 14, sight: 260, cat: 'defense', tags: ['defense'], unlock: 'jammer',
    jammer: { radius: 260, slow: 0.45, dps: 6, deflect: 0.35 }, shape: 'jammer',
    desc: 'Electronic warfare. Slows and fries enemy drones nearby and can spoof incoming missiles.',
  },
  railgun: {
    name: 'Railgun', w: 2, h: 2, hp: 1200, cost: 480, time: 30, sight: 260, cat: 'defense', tags: ['defense'], unlock: 'railgun',
    shape: 'railgun',
    weapon: { range: 620, dmg: 260, cd: 4.2, vs: VS.kinetic, targets: 'ground', type: 'laser', pierce: true },
    desc: 'Electromagnetic railgun. Hypersonic slugs punch through armor at extreme range.',
  },
};

export const BUILD_ORDER = [
  'barracks', 'dronebay', 'robotics', 'fabricator', 'logistics', 'lab', 'radar', 'repair',
  'barrier', 'sentry', 'bunker', 'ciws', 'interceptor', 'jammer', 'battery', 'railgun',
];

// ---------------------------------------------------------------------------
// Enemy: "The Hegemony"
// ---------------------------------------------------------------------------
export const ENEMY_UNITS = {
  trooper: {
    name: 'Hegemony Trooper', cls: 'infantry', armor: 'inf', hp: 100, speed: 54, radius: 8, sight: 230, cost: 40,
    src: 'barracks', minWave: 1, weight: 10, shape: 'squad',
    weapon: { range: 150, dmg: 9, cd: 0.75, vs: VS.smallArms, targets: 'both', type: 'bullet' },
  },
  rocketeer: {
    name: 'Rocket Trooper', cls: 'infantry', armor: 'inf', hp: 90, speed: 50, radius: 8, sight: 230, cost: 70,
    src: 'barracks', minWave: 3, weight: 5, shape: 'squad_at',
    weapon: { range: 200, dmg: 42, cd: 2.4, vs: VS.antiTank, targets: 'ground', type: 'rocket', projSpeed: 320 },
  },
  ifv: {
    name: 'IFV', cls: 'vehicle', armor: 'light', hp: 480, speed: 70, radius: 13, sight: 250, cost: 150,
    src: 'factory', minWave: 4, weight: 4, shape: 'ifv',
    weapon: { range: 195, dmg: 19, cd: 0.7, vs: VS.autocannon, targets: 'both', type: 'bullet' },
  },
  tank: {
    name: 'Battle Tank', cls: 'vehicle', armor: 'armor', hp: 1350, speed: 52, radius: 16, sight: 260, cost: 320,
    src: 'factory', minWave: 6, weight: 3, shape: 'tank',
    weapon: { range: 240, dmg: 85, cd: 2.2, vs: VS.antiTank, targets: 'ground', type: 'shell', splash: 30, projSpeed: 600 },
  },
  walker: {
    name: 'Siege Walker', cls: 'vehicle', armor: 'armor', hp: 3800, speed: 34, radius: 22, sight: 300, cost: 950,
    src: 'factory', minWave: 12, weight: 1.5, shape: 'walker',
    weapon: { range: 300, dmg: 140, cd: 2.0, vs: VS.explosive, targets: 'ground', type: 'shell', splash: 60, projSpeed: 500 },
  },
  adrone: {
    name: 'Attack Drone', cls: 'drone', armor: 'air', air: true, hp: 75, speed: 115, radius: 7, sight: 240, cost: 55,
    src: 'nest', minWave: 3, weight: 4, shape: 'quad',
    weapon: { range: 160, dmg: 11, cd: 0.6, vs: VS.smallArms, targets: 'ground', type: 'bullet' },
  },
  kdrone: {
    name: 'Lancet Drone', cls: 'drone', armor: 'air', air: true, hp: 38, speed: 165, radius: 6, sight: 260, cost: 50,
    src: 'nest', minWave: 5, weight: 3, shape: 'fpv', prefersBuildings: true,
    weapon: { range: 14, dmg: 170, cd: 1, vs: VS.kamikaze, targets: 'ground', type: 'kamikaze', splash: 36 },
  },
  gunship: {
    name: 'Gunship', cls: 'drone', armor: 'air', air: true, hp: 950, speed: 75, radius: 18, sight: 300, cost: 430,
    src: 'nest', minWave: 9, weight: 1.5, shape: 'gunship',
    weapon: { range: 230, dmg: 38, cd: 1.0, vs: VS.explosive, targets: 'ground', type: 'rocket', projSpeed: 360 },
  },
};

// Enemy structures. share = fraction of wave budget this facility contributes.
export const ENEMY_BUILDINGS = {
  cc: {
    name: 'Hegemony Command', w: 3, h: 3, hp: 15000, sight: 320, share: 0.35, shape: 'hq',
    weapon: { range: 270, dmg: 45, cd: 0.45, vs: VS.heavyMG, targets: 'both', type: 'bullet' },
    desc: 'Enemy command center. Destroying it ends the war.',
  },
  ebarracks: { name: 'Hegemony Barracks', w: 2, h: 2, hp: 3600, sight: 220, share: 0.15, enables: 'barracks', shape: 'barracks', desc: 'Produces enemy infantry.' },
  factory: { name: 'War Factory', w: 3, h: 3, hp: 5000, sight: 220, share: 0.15, enables: 'factory', shape: 'factory', desc: 'Produces armored vehicles and walkers.' },
  nest: { name: 'Drone Nest', w: 2, h: 2, hp: 3200, sight: 220, share: 0.1, enables: 'nest', shape: 'dronebay', desc: 'Produces drones and gunships.' },
  silo: { name: 'Missile Silo', w: 2, h: 2, hp: 3400, sight: 220, share: 0, enables: 'silo', shape: 'silo', desc: 'Launches cruise missiles at your base.' },
  power: { name: 'Fusion Plant', w: 2, h: 2, hp: 2800, sight: 200, share: 0.125, shape: 'power', desc: 'Powers the enemy war machine. Each one boosts wave strength.' },
  eradar: { name: 'Over-Horizon Radar', w: 2, h: 2, hp: 1400, sight: 400, share: 0, enables: 'radar', shape: 'radar', desc: 'Guides enemy missiles. Without it their strikes lose accuracy.' },
  eturret: {
    name: 'Heavy Turret', w: 1, h: 1, hp: 2300, sight: 260, share: 0, shape: 'turret', defense: true,
    weapon: { range: 240, dmg: 36, cd: 0.6, vs: VS.autocannon, targets: 'ground', type: 'bullet' },
  },
  eaa: {
    name: 'AA Battery', w: 1, h: 1, hp: 1100, sight: 300, share: 0, shape: 'sam', defense: true,
    weapon: { range: 300, dmg: 55, cd: 1.1, vs: VS.antiAir, targets: 'air', type: 'rocket', projSpeed: 520, intercept: true },
  },
  edome: {
    name: 'Missile Shield', w: 2, h: 2, hp: 1600, sight: 320, share: 0, shape: 'laser', defense: true,
    weapon: { range: 420, dmg: 12, cd: 0.12, vs: VS.laser, targets: 'air', type: 'laser', intercept: true, prioritizeMissiles: true },
    desc: 'Laser missile shield. Intercepts your missile salvos.',
  },
  outpost: {
    name: 'Forward Outpost', w: 2, h: 2, hp: 3400, sight: 260, share: 0, shape: 'bunker', outpost: true,
    weapon: { range: 220, dmg: 24, cd: 0.7, vs: VS.autocannon, targets: 'both', type: 'bullet' },
    desc: 'Forward staging base. Enemy waves launch from the closest outpost.',
  },
};

export const CRUISE_MISSILE = {
  dmg: 380, splash: 64, hp: 55, speed: 175,
  vs: { inf: 0.45, light: 0.6, armor: 0.5, air: 0, struct: 1.3 },
};

// Wave tuning
export const WAVE = {
  first: 100, // seconds until first wave
  interval: 75,
  baseBudget: 270,
  growth: 1.27,
  linear: 45,
  eliteFrom: 10, // after this wave, enemy units get +hp/dmg per wave
  eliteStep: 0.06,
  missileFrom: 4,
  reinforceEvery: 18, // seconds between emergency reinforcements while the enemy base is under attack
  reinforceShare: 0.55, // fraction of a wave budget sent each time
};

export const RESEARCH = { base: 0.85, first: 50, growth: 1.22, killFactor: 0.05 };

export const SITE_INCOME = 2.5; // credits/s per captured resource site
