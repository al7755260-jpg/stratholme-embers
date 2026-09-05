const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const prefersTouchControls = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

// Keep each contact independent: lifting the movement finger must not cancel
// an attack held by a second finger, or a camera gesture by a third.
export class TouchControls {
  constructor(game, limits) {
    this.game = game;
    this.limits = limits;
    this.movement = { x: 0, z: 0 };
    this.attacking = false;
    this.contacts = new Map();
    this.stick = game.ui.querySelector('.touch-stick');
    this.thumb = this.stick.querySelector('i');
    this.attackButton = game.ui.querySelector('#ability-j');
    const canvas = game.renderer.domElement;
    const capture = (element, e) => {
      e.preventDefault();
      game.ui.classList.add('touch-ui');
      element.setPointerCapture(e.pointerId);
    };
    this.stick.addEventListener('pointerdown', e => {
      if (game._state !== 'playing' || this.stickId != null) return;
      this.stickId = e.pointerId; capture(this.stick, e); this.moveStick(e);
    });
    this.stick.addEventListener('pointermove', e => { if (e.pointerId === this.stickId) this.moveStick(e); });
    const releaseStick = e => { if (e.pointerId === this.stickId) this.resetStick(); };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) this.stick.addEventListener(type, releaseStick);
    this.attackButton.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch' || game._state !== 'playing' || this.attackId != null) return;
      this.attackId = e.pointerId; capture(this.attackButton, e);
      this.attacking = true; this.attackButton.classList.add('held'); game.attack();
    });
    const releaseAttack = e => {
      if (e.pointerId !== this.attackId) return;
      this.attackId = null; this.attacking = false; this.attackButton.classList.remove('held');
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) this.attackButton.addEventListener(type, releaseAttack);
    this.attackButton.addEventListener('click', e => { if (e.pointerType === 'touch') e.stopImmediatePropagation(); }, true);
    canvas.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch' || game._state !== 'playing') return;
      capture(canvas, e); this.contacts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    canvas.addEventListener('pointermove', e => {
      const previous = this.contacts.get(e.pointerId);
      if (!previous || game._state !== 'playing') return;
      e.preventDefault();
      const other = [...this.contacts.entries()].find(([id]) => id !== e.pointerId)?.[1];
      if (other) {
        const before = Math.hypot(previous.x - other.x, previous.y - other.y);
        const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
        if (before > 4 && after > 4) game.distance = clamp(game.distance * before / after, limits.minDistance, limits.maxDistance);
      } else {
        game.yaw -= (e.clientX - previous.x) * .006;
        game.pitch = clamp(game.pitch + (e.clientY - previous.y) * .003, limits.minPitch, limits.maxPitch);
      }
      this.contacts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, e => this.contacts.delete(e.pointerId));
    game.ui.querySelector('.touch-recenter').addEventListener('click', () => { if (game._state === 'playing') game.resetCamera(false); });
    window.addEventListener('resize', () => this.reset());
  }
  moveStick(e) {
    const r = this.stick.getBoundingClientRect();
    const x = e.clientX - r.left - r.width / 2, z = e.clientY - r.top - r.height / 2;
    const distance = Math.hypot(x, z), radius = r.width * .32;
    const scale = distance > 0 ? Math.min(1, radius / distance) : 0;
    this.movement.x = distance > 7 ? x / distance : 0;
    this.movement.z = distance > 7 ? z / distance : 0;
    this.thumb.style.transform = `translate(${x * scale}px, ${z * scale}px)`;
  }
  resetStick() { this.stickId = null; this.movement.x = this.movement.z = 0; this.thumb.style.transform = ''; }
  reset() {
    this.resetStick(); this.attackId = null; this.attacking = false;
    this.attackButton.classList.remove('held'); this.contacts.clear();
  }
}
