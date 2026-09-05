import { ENEMY_LIMITS } from './enemy-config.js';

// Time and kills both increase pressure. Crowd/FX allocations remain bounded;
// reinforcement cadence and enemy resilience keep rising after the crowd cap.
export function hordePressure(seconds = 0, kills = 0, quality = 'high') {
  const level = Math.floor(Math.max(0, seconds) / 50 + Math.max(0, kills) / 45);
  return {
    stage: level + 1,
    cap: Math.min(ENEMY_LIMITS[quality === 'low' ? 'low' : 'high'], (quality === 'low' ? 24 : 30) + level * 3),
    interval: Math.max(.16, .60 / (1 + level * .16)),
    batch: Math.min(3, 1 + Math.floor(level / 6)),
    largeCap: Math.min(ENEMY_LIMITS.large, 2 + Math.floor(level / 3)),
    largeChance: level < 1 ? 0 : Math.min(.30, .06 + level * .016),
    dreadChance: level < 3 ? 0 : Math.min(.10, (level - 2) * .012),
    healthScale: 1 + level * .035,
    speedScale: 1 + Math.min(.24, level * .012),
    bossInterval: Math.max(90, 180 - level * 4),
  };
}

export class EndlessHorde {
  constructor(random = Math.random) { this.random = random; this.reset(); }
  reset() { this.timer = 3.5; this.nextBossAt = 180; this.spawned = 0; this.bossesSpawned = 0; }
  update(dt, seconds, kills, quality, census) {
    const pressure = hordePressure(seconds, kills, quality), entries = [];
    this.timer = Math.max(0, this.timer - dt);
    if (this.timer > 0 || census.living >= pressure.cap) return { pressure, entries };
    let large = census.large, bossAlive = census.boss;
    for (let i = 0; i < Math.min(pressure.batch, pressure.cap - census.living); i++) {
      let kind, boss = false;
      if (!bossAlive && seconds >= this.nextBossAt && large < pressure.largeCap) {
        kind = 'dreadlord'; boss = true; bossAlive = true; large++;
        this.nextBossAt = seconds + pressure.bossInterval; this.bossesSpawned++;
      } else {
        const roll = this.random();
        if (large < pressure.largeCap && roll < pressure.dreadChance) { kind = 'dreadlord'; large++; }
        else if (large < pressure.largeCap && roll < pressure.largeChance) { kind = 'abomination'; large++; }
        else kind = this.random() < Math.min(.38, .22 + (pressure.stage - 1) * .01) ? 'forsaken' : 'zombie';
      }
      entries.push({ kind, boss });
    }
    // Never bank a spawn backlog while a street is full or the game is paused.
    this.timer = pressure.interval; this.spawned += entries.length;
    return { pressure, entries };
  }
}

export function formatSurvivalTime(value) {
  const seconds = Math.floor(Math.max(0, Number.isFinite(value) ? value : 0));
  const s = String(seconds % 60).padStart(2, '0'), m = Math.floor(seconds / 60);
  return m < 60 ? `${String(m).padStart(2, '0')}:${s}` : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${s}`;
}

export const RECORD_KEY = 'stratholme.endless.record.v1';
const validRecord = value => value && Number.isSafeInteger(value.seconds) && value.seconds >= 0 && Number.isSafeInteger(value.kills) && value.kills >= 0;
const localStore = () => { try { return globalThis.localStorage; } catch { return null; } };
export class SurvivalRecord {
  constructor(storage = localStore()) {
    this.storage = storage; this.best = { seconds: 0, kills: 0 }; this.persistent = Boolean(storage);
    try { const saved = JSON.parse(storage?.getItem(RECORD_KEY) || 'null'); if (validRecord(saved)) this.best = { seconds: saved.seconds, kills: saved.kills }; } catch { /* Damaged/disabled storage cannot block a run. */ }
    this.begin();
  }
  begin() { this.baseline = this.best.seconds; }
  save(seconds, kills) {
    const run = { seconds: Math.floor(seconds), kills: Math.floor(kills) };
    if (!validRecord(run) || run.seconds === 0 || run.seconds < this.best.seconds || (run.seconds === this.best.seconds && run.kills <= this.best.kills)) return false;
    this.best = run;
    try { this.storage?.setItem(RECORD_KEY, JSON.stringify(run)); } catch { this.persistent = false; }
    return true;
  }
}
