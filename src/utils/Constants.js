// Global game configuration and data tables.

export const GAME_STATES = Object.freeze({
  LOADING: 'loading',
  MENU: 'menu',
  EXPLORATION: 'exploration',
  COMBAT: 'combat',
  INVENTORY: 'inventory',
  CRAFTING: 'crafting',
  PAUSED: 'paused',
  DEAD: 'dead',
});

// States in which the world simulation runs and the player can act.
export const PLAY_STATES = new Set([GAME_STATES.EXPLORATION, GAME_STATES.COMBAT]);

export const WORLD = Object.freeze({
  SEED: 1337,
  BLOCKS_X: 7,
  BLOCKS_Z: 7,
  BLOCK_SIZE: 40,
  STREET_WIDTH: 14,
  ALLEY_WIDTH: 4,
  SIDEWALK_HEIGHT: 0.15,
  MIN_BUILDING_HEIGHT: 8,
  MAX_BUILDING_HEIGHT: 55,
  RUINED_CHANCE: 0.3,
  EMPTY_LOT_CHANCE: 0.12,
  CARS_PER_STREET_SEGMENT: 2,
  GROUND_ITEMS: 90,
  FIRE_BARRELS: 6,
});

export const PLAYER = Object.freeze({
  RADIUS: 0.4,
  HEIGHT: 1.8,
  WALK_SPEED: 4.5,
  SPRINT_SPEED: 8.5,
  JUMP_VELOCITY: 7,
  GRAVITY: 22,
  STEP_HEIGHT: 0.45,
  MAX_HEALTH: 100,
  MAX_STAMINA: 100,
  MAX_HUNGER: 100,
  MAX_THIRST: 100,
  STAMINA_DRAIN: 18, // per second while sprinting
  STAMINA_REGEN: 14,
  JUMP_STAMINA: 10,
  HUNGER_RATE: 100 / 900, // empties in 15 real minutes
  THIRST_RATE: 100 / 600, // empties in 10 real minutes
  STARVE_DAMAGE: 1.5, // health per second when starving or dehydrated
  REGEN_RATE: 0.5, // health per second when well fed
  INTERACT_RANGE: 2.6,
  OVERWEIGHT_THRESHOLD: 0.75, // above this fraction of capacity the player slows down
});

export const CAMERA = Object.freeze({
  FOV: 65,
  DISTANCE: 4.5,
  MIN_PITCH: -0.35,
  MAX_PITCH: 1.1,
  SHOULDER_OFFSET: 0.6,
  TARGET_HEIGHT: 1.6,
  LOOK_SENSITIVITY: 0.0025,
  GAMEPAD_LOOK_SPEED: 2.6,
});

export const ENEMY = Object.freeze({
  RADIUS: 0.45,
  MAX_HEALTH: 60,
  PATROL_SPEED: 1.2,
  CHASE_SPEED: 3.6,
  DETECT_RANGE: 14,
  LOSE_RANGE_MULT: 1.8,
  ATTACK_RANGE: 1.5,
  ATTACK_DAMAGE: 10,
  ATTACK_WINDUP: 0.4,
  ATTACK_COOLDOWN: 1.3,
  KNOCKBACK_RESIST: 1,
  HURT_TIME: 0.35,
  CORPSE_TIME: 10,
  DAY_COUNT: 16,
  NIGHT_COUNT: 28,
  SPAWN_MIN_DISTANCE: 35,
  ACTIVE_DISTANCE: 90,
  RESPAWN_INTERVAL: 5,
});

export const DAY_NIGHT = Object.freeze({
  CYCLE_MINUTES: 20, // real minutes per full 24h in-game day (configurable in settings)
  START_HOUR: 8,
  DUSK_HOUR: 19.5,
  DAWN_HOUR: 5.5,
  NIGHT_AGGRESSION: 1.6,
});

export const INVENTORY = Object.freeze({
  MAX_WEIGHT: 35,
  HOTBAR_SIZE: 5,
});

export const FIST = Object.freeze({
  name: 'Fists',
  damage: 6,
  range: 1.7,
  cooldown: 0.45,
  knockback: 2.5,
  arc: 70,
});

/**
 * Item database. `category` is one of resource | consumable | weapon | tool.
 */
export const ITEMS = Object.freeze({
  wood: { name: 'Wood', icon: '🪵', weight: 1.0, category: 'resource', color: 0x8b5a2b, description: 'Splintered planks. Useful for crafting.' },
  scrap_metal: { name: 'Scrap Metal', icon: '🔩', weight: 1.5, category: 'resource', color: 0x8a8f94, description: 'Rusty bits of metal.' },
  cloth: { name: 'Cloth', icon: '🧵', weight: 0.3, category: 'resource', color: 0xc9b79c, description: 'Torn fabric. Bandages and wraps.' },
  electronics: { name: 'Electronics', icon: '💾', weight: 0.5, category: 'resource', color: 0x2e8b57, description: 'Circuit boards and wires.' },
  battery: { name: 'Battery', icon: '🔋', weight: 0.4, category: 'resource', color: 0xe0c341, description: 'Still holds some charge.' },
  canned_food: { name: 'Canned Food', icon: '🥫', weight: 0.5, category: 'consumable', color: 0xc0392b, effects: { hunger: 25 }, description: 'Restores 25 hunger.' },
  water_bottle: { name: 'Water Bottle', icon: '💧', weight: 0.6, category: 'consumable', color: 0x3fa9f5, effects: { thirst: 35 }, description: 'Restores 35 thirst.' },
  bandage: { name: 'Bandage', icon: '🩹', weight: 0.2, category: 'consumable', color: 0xf5f5f5, effects: { health: 25 }, description: 'Restores 25 health.' },
  food_ration: { name: 'Food Ration', icon: '🍱', weight: 0.6, category: 'consumable', color: 0xd4a017, effects: { hunger: 50, thirst: 10, health: 10 }, description: 'Hearty meal. +50 hunger, +10 thirst, +10 health.' },
  crowbar: { name: 'Crowbar', icon: '🪛', weight: 2.5, category: 'weapon', color: 0xb03a2e, weapon: { damage: 22, range: 2.2, cooldown: 0.65, knockback: 4, arc: 75 }, description: 'Reliable melee weapon.' },
  baseball_bat: { name: 'Baseball Bat', icon: '🏏', weight: 2.0, category: 'weapon', color: 0xc8a165, weapon: { damage: 18, range: 2.4, cooldown: 0.55, knockback: 6, arc: 85 }, description: 'Fast swings, strong knockback.' },
  wooden_club: { name: 'Wooden Club', icon: '🏑', weight: 2.2, category: 'weapon', color: 0x7b4a1e, weapon: { damage: 15, range: 2.0, cooldown: 0.6, knockback: 5, arc: 80 }, description: 'Crude but effective.' },
  metal_pipe: { name: 'Metal Pipe', icon: '🔧', weight: 3.0, category: 'weapon', color: 0x9aa3a8, weapon: { damage: 26, range: 2.3, cooldown: 0.75, knockback: 5, arc: 75 }, description: 'Heavy hitter.' },
  spiked_bat: { name: 'Spiked Bat', icon: '⚔️', weight: 2.8, category: 'weapon', color: 0x6d4c41, weapon: { damage: 34, range: 2.4, cooldown: 0.65, knockback: 6, arc: 85 }, description: 'Bat reinforced with nails and scrap.' },
  pickaxe: { name: 'Pickaxe', icon: '⛏️', weight: 3.0, category: 'tool', tool: 'pickaxe', color: 0x607d8b, weapon: { damage: 20, range: 2.1, cooldown: 0.9, knockback: 4, arc: 60 }, description: 'Harvest scrap piles for metal and electronics.' },
  flashlight: { name: 'Flashlight', icon: '🔦', weight: 0.8, category: 'tool', tool: 'flashlight', color: 0xffe082, description: 'Press F to toggle. Essential at night.' },
});

export const RECIPES = Object.freeze([
  { id: 'bandage', output: { id: 'bandage', qty: 1 }, requires: { cloth: 2 }, category: 'Consumables' },
  { id: 'food_ration', output: { id: 'food_ration', qty: 1 }, requires: { canned_food: 2, water_bottle: 1 }, category: 'Consumables' },
  { id: 'wooden_club', output: { id: 'wooden_club', qty: 1 }, requires: { wood: 3, cloth: 1 }, category: 'Weapons' },
  { id: 'metal_pipe', output: { id: 'metal_pipe', qty: 1 }, requires: { scrap_metal: 3, cloth: 1 }, category: 'Weapons' },
  { id: 'spiked_bat', output: { id: 'spiked_bat', qty: 1 }, requires: { baseball_bat: 1, scrap_metal: 2 }, category: 'Weapons' },
  { id: 'pickaxe', output: { id: 'pickaxe', qty: 1 }, requires: { wood: 2, scrap_metal: 3 }, category: 'Tools' },
  { id: 'flashlight', output: { id: 'flashlight', qty: 1 }, requires: { electronics: 1, battery: 1, scrap_metal: 1 }, category: 'Tools' },
]);

/**
 * Loot tables for interactable containers. Each entry rolls independently.
 */
export const LOOT_TABLES = Object.freeze({
  crate: [
    { id: 'wood', min: 1, max: 3, chance: 0.8 },
    { id: 'scrap_metal', min: 1, max: 2, chance: 0.45 },
    { id: 'cloth', min: 1, max: 2, chance: 0.45 },
    { id: 'canned_food', min: 1, max: 1, chance: 0.3 },
    { id: 'crowbar', min: 1, max: 1, chance: 0.06 },
  ],
  barrel: [
    { id: 'water_bottle', min: 1, max: 2, chance: 0.55 },
    { id: 'scrap_metal', min: 1, max: 2, chance: 0.5 },
    { id: 'battery', min: 1, max: 1, chance: 0.2 },
  ],
  body: [
    { id: 'cloth', min: 1, max: 3, chance: 0.7 },
    { id: 'canned_food', min: 1, max: 1, chance: 0.35 },
    { id: 'water_bottle', min: 1, max: 1, chance: 0.35 },
    { id: 'bandage', min: 1, max: 1, chance: 0.25 },
    { id: 'battery', min: 1, max: 1, chance: 0.15 },
    { id: 'baseball_bat', min: 1, max: 1, chance: 0.1 },
  ],
  vehicle: [
    { id: 'scrap_metal', min: 1, max: 3, chance: 0.7 },
    { id: 'electronics', min: 1, max: 2, chance: 0.45 },
    { id: 'battery', min: 1, max: 1, chance: 0.3 },
    { id: 'water_bottle', min: 1, max: 1, chance: 0.2 },
    { id: 'cloth', min: 1, max: 1, chance: 0.25 },
  ],
  scrap_pile: [
    { id: 'scrap_metal', min: 1, max: 2, chance: 1 },
    { id: 'electronics', min: 1, max: 1, chance: 0.3 },
  ],
});

// Weighted distribution for loose items lying on the ground.
export const GROUND_LOOT = Object.freeze([
  { id: 'wood', weight: 5 },
  { id: 'scrap_metal', weight: 4 },
  { id: 'cloth', weight: 4 },
  { id: 'electronics', weight: 2 },
  { id: 'battery', weight: 1.5 },
  { id: 'canned_food', weight: 2 },
  { id: 'water_bottle', weight: 2.5 },
]);

export const INTERACTABLE_LABELS = Object.freeze({
  crate: 'Crate',
  barrel: 'Barrel',
  body: 'Body',
  vehicle: 'Wrecked Car',
  scrap_pile: 'Scrap Pile',
});

export const WEATHER = Object.freeze({
  TYPES: ['clear', 'fog', 'rain'],
  MIN_DURATION: 60,
  MAX_DURATION: 180,
  FOG_DENSITY: { clear: 0.007, fog: 0.022, rain: 0.013 },
  RAIN_DROPS: 2500,
});

export const QUALITY_PRESETS = Object.freeze({
  low: { pixelRatio: 1, shadows: false, shadowMapSize: 1024, bloom: false, antialias: false },
  medium: { pixelRatio: 1.5, shadows: true, shadowMapSize: 2048, bloom: true, antialias: true },
  high: { pixelRatio: 2, shadows: true, shadowMapSize: 4096, bloom: true, antialias: true },
});

export const DEFAULT_SETTINGS = Object.freeze({
  masterVolume: 0.8,
  musicVolume: 0.5,
  sfxVolume: 0.8,
  quality: 'medium',
  dayLengthMinutes: DAY_NIGHT.CYCLE_MINUTES,
  mouseSensitivity: 1,
  invertY: false,
  showFps: false,
  postProcessing: true,
});

export const SETTINGS_STORAGE_KEY = 'the-day-before:settings';
