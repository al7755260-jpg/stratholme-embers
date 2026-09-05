// Heights are the total, normalized mesh heights supplied by actors.create(kind).
// Game applies size once to the actor root and uses the same factor for collision,
// melee reach, damage labels and health bars. Hero combat tuning lives in game.js.
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};

export const ENEMY_TYPES = freeze({
  zombie: {
    name: '染疫腐尸', height: 1.75, size: [.85, 1.15], radius: .46,
    hp: 65, speed: [1.55, 2], large: false, heal: 0, stun: .32, knockScale: 1,
    attack: { duration: .78, contact: .58, damage: 1, startRange: 1.28, hitRange: 1.75, cooldown: [1.7, 2.5], variants: 2 },
    map: { color: '#b55042', radius: 2, shape: 'circle' }, barColor: 0xb55042,
    sound: { groan: 'zombie', gain: .42, pitch: 1, killGain: .42, killPitch: 1 },
  },
  forsaken: {
    name: '不死亡者', height: 2.35, size: [.85, 1.15], radius: .58,
    hp: 100, speed: [1.8, 2.15], large: false, heal: 0, stun: .32, knockScale: .9,
    attack: { duration: .68, contact: .58, damage: 1, startRange: 1.52, hitRange: 2.0, cooldown: [1.5, 2.05], variants: 2 },
    map: { color: '#77a69a', radius: 2.5, shape: 'diamond' }, barColor: 0x77a69a,
    sound: { groan: 'zombie', gain: .45, pitch: .82, killGain: .46, killPitch: .9 },
  },
  abomination: {
    name: '缝合憎恶', height: 3.5, size: [.90, 1.03], radius: .98,
    hp: 205, speed: [1.1, 1.3], large: true, heal: 0, stun: .32, knockScale: 1,
    attack: { duration: .95, contact: .58, damage: 1, startRange: 2.05, hitRange: 2.7, cooldown: [2, 2.7], variants: 2 },
    map: { color: '#c97044', radius: 3.1, shape: 'square' }, barColor: 0xc97044,
    sound: { groan: 'brute', gain: .42, pitch: .9, killGain: .65, killPitch: .78 },
  },
  dreadlord: {
    name: '恐惧魔王', height: 3.35, size: [.92, 1], radius: .87,
    hp: 430, speed: [1.4, 1.65], large: true, heal: 0, stun: .18, knockScale: .55,
    attack: { duration: 1.12, contact: .58, damage: 1, startRange: 2.3, hitRange: 3.1, cooldown: [2.2, 2.65], variants: 2 },
    map: { color: '#aa82af', radius: 4, shape: 'diamond' }, barColor: 0xaa82af,
    sound: { groan: 'brute', gain: .50, pitch: .72, killGain: .70, killPitch: .72 },
    boss: {
      name: '恐惧魔王 · 长夜领主', size: [1.06, 1.06], hp: 1500,
      speed: [1.3, 1.3], heal: 0, stun: .05, knockScale: .25,
      attack: { duration: 1.22, contact: .58, damage: 1, startRange: 2.6, hitRange: 3.4, cooldown: [2.8, 2.8], variants: 2 },
      map: { color: '#e99049', radius: 5, shape: 'diamond' }, barColor: 0xe99049,
      impact: { radius: 3.3, color: 0xab542d, sound: 'heavy', gain: .7 },
      announcement: '长夜领主', subtitle: '恐惧魔王降临 · 圣光将审判他',
    },
  },
});

export const ENEMY_LIMITS = freeze({ high: 60, low: 44, large: 6, corpsesHigh: 9, corpsesLow: 6 });
export const ENEMY_CORPSE = freeze({ fall: 1, hold: .4, fade: .8, crowdedFade: .35 });

const sampleRange = (range, random) => range[0] + (range[1] - range[0]) * Math.min(1, Math.max(0, random()));

/** Actor state is independent from animation: update receives the normalized
 * attack progress plus attack.contact, so new rigs can align their own poses. */
export function createEnemyStats(kind, boss = false, random = Math.random) {
  const type = ENEMY_TYPES[kind];
  if (!type) throw new Error(`Unknown enemy kind: ${kind}`);
  if (boss && !type.boss) throw new Error(`Enemy kind has no boss configuration: ${kind}`);
  const config = boss ? { ...type, ...type.boss } : type;
  const size = sampleRange(config.size, random);
  return {
    name: config.name, size, height: config.height * size, radius: config.radius * size,
    hp: config.hp, maxHp: config.hp, speed: sampleRange(config.speed, random),
    large: config.large, heal: config.heal, stunDuration: config.stun, knockScale: config.knockScale,
    attack: { ...config.attack, startRange: config.attack.startRange * size, hitRange: config.attack.hitRange * size },
    healthBarHeight: (config.height + .18) * size,
    healthBarWidth: (config.large ? 1.35 : .92) * size,
    impactHeight: config.height * .60 * size,
    map: config.map, barColor: config.barColor, sound: config.sound,
    impact: config.impact ? { ...config.impact, radius: config.impact.radius * size } : null,
    announcement: config.announcement, subtitle: config.subtitle,
  };
}

export function enemyDeathState(enemy) {
  const fadeStart = ENEMY_CORPSE.fall + (enemy.fastDecay ? 0 : ENEMY_CORPSE.hold);
  const fadeDuration = enemy.fastDecay ? ENEMY_CORPSE.crowdedFade : ENEMY_CORPSE.fade;
  return {
    dead: Math.min(1, enemy.deathAge / ENEMY_CORPSE.fall),
    fade: Math.min(1, Math.max(0, (enemy.deathAge - fadeStart) / fadeDuration)),
    expired: enemy.deathAge >= fadeStart + fadeDuration,
  };
}
