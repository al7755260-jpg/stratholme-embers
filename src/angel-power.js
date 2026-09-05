export const ANGEL = Object.freeze({ killsRequired: 12, cinematicSeconds: 2, activeSeconds: 5 });

// The game owns both clocks. No wall-clock callbacks can outlive pause/restart.
export class AngelPower {
  constructor() { this.reset(); }
  reset() { this.phase = 'charging'; this.charge = 0; this.elapsed = 0; this.remaining = 0; this.activations = 0; }
  get active() { return this.phase === 'active'; }
  get protected() { return this.phase !== 'charging'; }
  get summary() { return { phase: this.phase, charge: this.charge, required: ANGEL.killsRequired, cinematicElapsed: this.phase === 'cinematic' ? this.elapsed : 0, remaining: this.remaining, activations: this.activations }; }
  earnKill() {
    if (this.phase !== 'charging') return false;
    this.charge = Math.min(ANGEL.killsRequired, this.charge + 1);
    if (this.charge < ANGEL.killsRequired) return false;
    this.phase = 'pending'; return true;
  }
  begin() { if (this.phase !== 'pending') return false; this.phase = 'cinematic'; this.elapsed = 0; return true; }
  advanceCinematic(dt) {
    if (this.phase !== 'cinematic' || !Number.isFinite(dt) || dt <= 0) return false;
    this.elapsed = Math.min(ANGEL.cinematicSeconds, this.elapsed + dt);
    if (this.elapsed < ANGEL.cinematicSeconds - 1e-7) return false;
    this.phase = 'active'; this.elapsed = 0; this.charge = 0; this.remaining = ANGEL.activeSeconds; this.activations++; return true;
  }
  advanceActive(dt) {
    if (!this.active || !Number.isFinite(dt) || dt <= 0) return false;
    this.elapsed += Math.min(dt, this.remaining); this.remaining = Math.max(0, this.remaining - dt);
    if (this.remaining > 1e-7) return false;
    this.phase = 'charging'; this.elapsed = 0; this.remaining = 0; return true;
  }
}
