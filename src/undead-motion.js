// Procedural performance for the existing +Z-forward, Y-up undead skeleton.
// gaitPhase is radians: 2 PI is one complete left/right stride, driven by distance.
// Rotations are absolute LOCAL Euler XYZ radians relative to the bind pose.
// Offsets are in units of total character height; never add them cumulatively.
const TAU = Math.PI * 2;
const BONES = [
  'hips', 'spine', 'chest', 'head',
  'rightArm', 'rightForearm', 'rightHand', 'rightThigh', 'rightShin', 'rightFoot',
  'leftArm', 'leftForearm', 'leftHand', 'leftThigh', 'leftShin', 'leftFoot',
  'rightWing', 'rightWingTip', 'leftWing', 'leftWingTip',
];
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
const fract = v => v - Math.floor(v);
const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
const range = (a, b, v) => smooth((v - a) / (b - a));
const lerp = (a, b, t) => t <= 0 ? a : t >= 1 ? b : a + (b - a) * t;
const v3 = (a, b, t) => a.map((x, i) => lerp(x, b[i], t));

function pose(rotations = {}, hipsOffset = [0, 0, 0], bodyOffset = [0, 0, 0], bodyRotation = [0, 0, 0]) {
  return { rotations: Object.fromEntries(BONES.map(name => [name, [...(rotations[name] || [0, 0, 0])]])),
    hipsOffset: [...hipsOffset], bodyOffset: [...bodyOffset], bodyRotation: [...bodyRotation] };
}
function derive(base, rotations = {}, hipsOffset = base.hipsOffset, bodyOffset = base.bodyOffset, bodyRotation = base.bodyRotation) {
  return pose({ ...base.rotations, ...rotations }, hipsOffset, bodyOffset, bodyRotation);
}
function blend(a, b, t) {
  const out = pose();
  for (const name of BONES) out.rotations[name] = v3(a.rotations[name], b.rotations[name], t);
  out.hipsOffset = v3(a.hipsOffset, b.hipsOffset, t);
  out.bodyOffset = v3(a.bodyOffset, b.bodyOffset, t);
  out.bodyRotation = v3(a.bodyRotation, b.bodyRotation, t);
  return out;
}
function frames(keys, t) {
  t = clamp(t);
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i][0]) {
      const [a, p] = keys[i - 1], [b, q] = keys[i];
      return blend(p, q, smooth((t - a) / (b - a)));
    }
  }
  return derive(keys[keys.length - 1][1]);
}
function numbers(keys, t) {
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) {
    const a = keys[i - 1], b = keys[i], f = smooth((t - a[0]) / (b[0] - a[0]));
    return a.slice(1).map((n, j) => lerp(n, b[j + 1], f));
  }
  return keys[keys.length - 1].slice(1);
}

const ZOMBIE = pose({
  hips: [0, -.035, .045], spine: [.060, -.055, -.055], chest: [.025, .08, .04], head: [-.035, -.10, -.10],
  rightArm: [-.32, -.07, -.37], rightForearm: [-.40, .05, -.08], rightHand: [.28, -.08, -.10],
  leftArm: [-.57, .06, .41], leftForearm: [-.52, -.06, .10], leftHand: [.34, .06, .11],
  rightThigh: [-.10, .03, .035], rightShin: [.21, 0, 0], rightFoot: [-.10, -.035, 0],
  leftThigh: [-.17, -.02, -.06], leftShin: [.30, 0, 0], leftFoot: [-.10, .07, -.035],
}, [0, -.018, 0]);

const ABOMINATION = pose({
  hips: [0, .025, 0], spine: [.060, -.02, 0], chest: [.025, -.02, 0], head: [-.065, .045, .055],
  rightArm: [-.13, -.07, -.31], rightForearm: [-.25, .08, -.11], rightHand: [.20, -.12, -.08],
  leftArm: [-.19, .05, .31], leftForearm: [-.33, -.05, .12], leftHand: [.24, .10, .10],
  rightThigh: [-.13, .04, .12], rightShin: [.28, 0, 0], rightFoot: [-.14, -.13, -.07],
  leftThigh: [-.13, -.04, -.12], leftShin: [.28, 0, 0], leftFoot: [-.14, .13, .07],
}, [0, -.031, 0]);

// These remain local pose deltas. The new GLBs supply their own measured joint
// centres; no coordinates or limb proportions are borrowed from the old bodies.
const FORSAKEN = pose({
  hips: [0, .018, 0], spine: [.065, -.025, 0], chest: [.025, .035, 0], head: [-.025, -.025, .015],
  rightArm: [-.17, -.025, -.14], rightForearm: [-.32, .035, -.025], rightHand: [.15, -.045, -.03],
  leftArm: [-.22, .035, .14], leftForearm: [-.36, -.035, .025], leftHand: [.16, .045, .03],
  rightThigh: [-.065, .025, .055], rightShin: [.15, 0, 0], rightFoot: [-.075, -.045, 0],
  leftThigh: [-.065, -.025, -.055], leftShin: [.15, 0, 0], leftFoot: [-.075, .045, 0],
}, [0, -.012, 0]);

const DREADLORD = pose({
  spine: [-.018, 0, 0], chest: [-.025, 0, 0], head: [.035, 0, 0],
  rightArm: [-.12, -.04, -.09], rightForearm: [-.28, .02, 0], rightHand: [.10, -.05, -.035],
  leftArm: [-.14, .04, .09], leftForearm: [-.29, -.02, 0], leftHand: [.10, .05, .035],
  rightThigh: [-.035, .02, .045], rightShin: [.10, 0, 0], rightFoot: [-.05, -.025, 0],
  leftThigh: [-.035, -.02, -.045], leftShin: [.10, 0, 0], leftFoot: [-.05, .025, 0],
  rightWing: [0, .045, .025], rightWingTip: [0, .025, -.015],
  leftWing: [0, -.045, -.025], leftWingTip: [0, -.025, .015],
});

// Front contact -> planted foot passing the body -> toe drag -> recovery swing.
// The left zombie leg has a longer support/drag phase and a substantially shorter stride.
const LONG_STEP = [[0, -.58, .16, .11], [.13, -.43, .24, -.02], [.53, .42, .10, -.22],
  [.63, .46, .53, -.34], [.79, -.64, 1.10, -.37], [.93, -.70, .32, .10], [1, -.58, .16, .11]];
const DRAG_STEP = [[0, -.29, .28, -.01], [.17, -.21, .36, -.05], [.63, .32, .12, -.30],
  [.78, .23, .41, -.42], [.92, -.35, .53, -.19], [1, -.29, .28, -.01]];
const HEAVY_STEP = [[0, -.48, .20, .12], [.085, -.38, .40, -.02], [.25, -.12, .23, -.08],
  [.59, .36, .16, -.22], [.70, .37, .68, -.30], [.85, -.59, .99, -.29], [1, -.48, .20, .12]];

function locomotion(kind, time, phase, amount, variant) {
  if (kind === 'forsaken' || kind === 'dreadlord') return uprightLocomotion(kind, time, phase, amount, variant);
  const heavy = kind === 'abomination', base = heavy ? ABOMINATION : ZOMBIE;
  const out = derive(base), r = out.rotations, breath = Math.sin(time * (heavy ? 1.35 : 1.75) + variant * 1.7);
  const c = fract(phase / TAU), leftCycle = fract(c + (heavy ? .5 : .53));
  const right = numbers(heavy ? HEAVY_STEP : LONG_STEP, c);
  const left = numbers(heavy ? HEAVY_STEP : DRAG_STEP, leftCycle);
  for (const [side, sample] of [['right', right], ['left', left]]) {
    r[side + 'Thigh'][0] = lerp(base.rotations[side + 'Thigh'][0], sample[0], amount);
    r[side + 'Shin'][0] = lerp(base.rotations[side + 'Shin'][0], sample[1], amount);
    r[side + 'Foot'][0] = lerp(base.rotations[side + 'Foot'][0], sample[2], amount);
  }
  if (heavy) {
    const sway = Math.sin(phase), delayed = Math.sin(phase - .8), shoulderLag = Math.sin(phase - 1.25);
    const drop = numbers([[0, -.037], [.09, -.061], [.25, -.018], [.5, -.037], [.59, -.061], [.75, -.018], [1, -.037]], c)[0];
    out.hipsOffset = [sway * .023 * amount, lerp(-.031, drop, amount) + breath * .002, 0];
    r.hips[2] = sway * .052 * amount;
    // Opposing pelvis and delayed spine motion makes the abdomen lag behind the planted hip.
    r.spine[0] += breath * .024 + Math.sin(phase * 2 - .55) * .036 * amount;
    r.spine[1] += delayed * .065 * amount; r.spine[2] -= delayed * .087 * amount;
    r.chest[1] -= shoulderLag * .065 * amount; r.chest[2] += shoulderLag * .046 * amount;
    r.head[2] += Math.sin(time * .67) * .025 - shoulderLag * .036 * amount;
    r.rightArm[0] += shoulderLag * .30 * amount; r.leftArm[0] -= shoulderLag * .27 * amount;
    r.rightForearm[0] -= Math.max(0, -delayed) * .17 * amount;
    r.leftForearm[0] -= Math.max(0, delayed) * .17 * amount;
    out.bodyRotation[1] = Math.sin(phase - .35) * .025 * amount;
  } else {
    const sway = Math.sin(phase + .2), shoulderLag = Math.sin(phase - .85), armLag = Math.sin(phase - 1.20);
    const drop = numbers([[0, -.025], [.15, -.035], [.40, .006], [.53, -.052], [.70, -.040], [.9, -.012], [1, -.025]], c)[0];
    out.hipsOffset = [sway * .018 * amount, lerp(-.018, drop, amount) + breath * .0025, 0];
    r.hips[1] += sway * .11 * amount; r.hips[2] += sway * .055 * amount;
    r.spine[0] += breath * .025 + Math.sin(phase * 2 - .6) * .025 * amount;
    r.chest[1] -= shoulderLag * .16 * amount; r.chest[2] -= shoulderLag * .045 * amount;
    r.rightArm[0] += armLag * .41 * amount; r.leftArm[0] -= armLag * .28 * amount;
    r.rightForearm[0] -= Math.max(0, -shoulderLag) * .25 * amount;
    r.leftHand[0] += Math.sin(phase - 1.5) * .12 * amount;
    r.head[1] += Math.sin(time * .75 + variant) * .07 - shoulderLag * .035 * amount;
    r.head[2] += Math.sin(time * .91 + .8) * .045;
    out.bodyRotation[0] = .015 * amount;
  }
  return out;
}

function uprightLocomotion(kind, time, phase, amount, variant) {
  const lord = kind === 'dreadlord', base = lord ? DREADLORD : FORSAKEN;
  const out = derive(base), r = out.rotations, c = fract(phase / TAU);
  const breath = Math.sin(time * (lord ? 1.25 : 1.65) + variant * 1.7);
  for (const [side, shift] of [['right', 0], ['left', .5]]) {
    const stride = numbers(lord ? LONG_STEP : HEAVY_STEP, fract(c + shift));
    r[side + 'Thigh'][0] = lerp(base.rotations[side + 'Thigh'][0], stride[0] * (lord ? .86 : .92), amount);
    r[side + 'Shin'][0] = lerp(base.rotations[side + 'Shin'][0], stride[1] * (lord ? .76 : .87), amount);
    r[side + 'Foot'][0] = lerp(base.rotations[side + 'Foot'][0], stride[2], amount);
  }
  const sway = Math.sin(phase), lag = Math.sin(phase - .68);
  out.hipsOffset = [sway * (lord ? .012 : .019) * amount,
    (lord ? -.014 : -.021) * amount - Math.cos(phase * 2) * .007 * amount + breath * .0015, 0];
  r.hips[1] += sway * (lord ? .055 : .08) * amount;
  r.hips[2] += sway * (lord ? .018 : .035) * amount;
  r.spine[0] += breath * .009;
  r.chest[1] -= lag * (lord ? .07 : .12) * amount;
  r.head[1] += Math.sin(time * .61 + variant) * .027 - r.chest[1] * .22;
  r.rightArm[0] += lag * (lord ? .18 : .31) * amount;
  r.leftArm[0] -= lag * (lord ? .18 : .31) * amount;
  r.rightForearm[0] -= Math.max(0, -lag) * .13 * amount;
  r.leftForearm[0] -= Math.max(0, lag) * .13 * amount;
  if (lord) {
    // A wing root and a delayed tip articulate each membrane independently.
    // Mirrored roll lifts both sides together; yaw gives a slight closing motion.
    const flap = Math.sin(time * 1.48), tip = Math.sin(time * 1.48 - .72);
    for (const [side, sign] of [['right', 1], ['left', -1]]) {
      r[side + 'Wing'][1] += sign * (flap * .023 + amount * .025);
      r[side + 'Wing'][2] += sign * flap * (.028 + amount * .020);
      r[side + 'WingTip'][1] += sign * tip * .021;
      r[side + 'WingTip'][2] += sign * tip * (.031 + amount * .015);
    }
  }
  return out;
}

// Attack time is normalized. Every authored attack reaches its contact key at .58.
const ZOMBIE_CLAW = [
  [0, ZOMBIE],
  [.22, derive(ZOMBIE, { chest: [-.02, -.28, -.08], head: [.05, .18, -.14], rightArm: [-.52, -.30, -.52], rightForearm: [-1.18, .12, -.16], leftArm: [-.40, .09, .50], rightThigh: [-.25, .04, .05], rightShin: [.40, 0, 0] }, [-.013, -.04, -.026])],
  [.43, derive(ZOMBIE, { hips: [-.035, -.15, .035], chest: [-.08, -.44, -.09], head: [.02, .29, -.10], rightArm: [-1.56, -.36, -.22], rightForearm: [-.89, .05, -.15], rightHand: [.50, -.18, -.20], leftArm: [-.31, .10, .57], leftThigh: [-.24, -.02, -.07], leftShin: [.43, 0, 0] }, [-.012, -.05, -.04], [0, 0, -.025])],
  [.58, derive(ZOMBIE, { hips: [.04, .10, -.025], spine: [.30, .08, .03], chest: [.17, .33, .07], head: [-.16, -.12, -.10], rightArm: [-1.34, .29, -.18], rightForearm: [-.10, -.10, -.06], rightHand: [-.30, -.24, .10], leftArm: [-.61, .10, .45], rightThigh: [-.44, .03, .035], rightShin: [.47, 0, 0], leftThigh: [.22, -.04, -.07], leftShin: [.17, 0, 0] }, [0, -.034, .021], [0, 0, .055], [.045, 0, 0])],
  [.71, derive(ZOMBIE, { spine: [.35, .13, .06], chest: [.21, .49, .10], head: [-.14, -.19, -.13], rightArm: [-.75, .51, -.39], rightForearm: [-.30, -.20, -.05], rightHand: [-.18, -.15, .14], leftArm: [-.70, .14, .45], rightThigh: [-.32, .03, .035], rightShin: [.45, 0, 0] }, [.012, -.05, .025], [.009, 0, .065], [.07, 0, .025])],
  [.89, derive(ZOMBIE, { chest: [.13, .18, .03], rightArm: [-.47, .15, -.38], rightForearm: [-.65, -.04, -.12], head: [-.08, -.18, -.13] }, [.004, -.032, .008])],
  [1, ZOMBIE],
];

function mirrored(base) {
  const out = pose();
  for (const name of BONES) {
    const other = name.startsWith('right') ? name.replace('right', 'left') : name.startsWith('left') ? name.replace('left', 'right') : name;
    const [x, y, z] = base.rotations[other]; out.rotations[name] = [x, -y, -z];
  }
  out.hipsOffset = [-base.hipsOffset[0], base.hipsOffset[1], base.hipsOffset[2]];
  out.bodyOffset = [-base.bodyOffset[0], base.bodyOffset[1], base.bodyOffset[2]];
  out.bodyRotation = [base.bodyRotation[0], -base.bodyRotation[1], -base.bodyRotation[2]];
  return out;
}
const ZOMBIE_LEFT_CLAW = ZOMBIE_CLAW.map(([time, p]) => [time, mirrored(p)]);
// The second claw catches the body after the left-hand lunge, rather than repeating a symmetric windmill.
ZOMBIE_LEFT_CLAW[4][1].rotations.rightArm = [-.92, -.06, -.35];
ZOMBIE_LEFT_CLAW[4][1].rotations.rightForearm = [-.45, 0, -.12];
ZOMBIE_LEFT_CLAW[0][1] = ZOMBIE; ZOMBIE_LEFT_CLAW[ZOMBIE_LEFT_CLAW.length - 1][1] = ZOMBIE;

const HEAVY_SMASH = [
  [0, ABOMINATION],
  [.18, derive(ABOMINATION, { spine: [.23, -.035, -.035], chest: [.12, -.13, -.045], head: [-.05, .12, .06], rightArm: [-.38, -.18, -.42], leftArm: [-.45, .12, .43], rightThigh: [-.34, .06, .15], leftThigh: [-.34, -.06, -.15], rightShin: [.63, 0, 0], leftShin: [.63, 0, 0] }, [0, -.073, -.016])],
  [.40, derive(ABOMINATION, { hips: [-.07, -.04, -.025], spine: [-.085, -.06, -.04], chest: [-.16, -.15, -.055], head: [.16, .12, .02], rightArm: [-2.43, -.19, -.22], leftArm: [-2.28, .16, .25], rightForearm: [-.62, .05, -.06], leftForearm: [-.71, -.06, .07], rightThigh: [-.24, .07, .17], leftThigh: [-.24, -.07, -.17], rightShin: [.46, 0, 0], leftShin: [.46, 0, 0] }, [-.01, -.053, -.028], [0, 0, -.018])],
  [.49, derive(ABOMINATION, { spine: [-.03, -.03, -.01], chest: [-.07, -.08, -.02], head: [.08, .05, .02], rightArm: [-2.24, -.12, -.18], leftArm: [-2.13, .12, .19], rightForearm: [-.43, 0, -.05], leftForearm: [-.48, 0, .06], rightThigh: [-.30, .06, .16], leftThigh: [-.30, -.06, -.16], rightShin: [.55, 0, 0], leftShin: [.55, 0, 0] }, [0, -.062, -.012])],
  [.58, derive(ABOMINATION, { hips: [.10, .06, .025], spine: [.50, .07, .035], chest: [.32, .12, .025], head: [-.24, -.02, .035], rightArm: [-.57, .15, -.15], leftArm: [-.66, -.11, .17], rightForearm: [-.08, -.06, -.05], leftForearm: [-.12, .06, .05], rightHand: [-.25, -.05, -.05], leftHand: [-.28, .04, .06], rightThigh: [-.59, .07, .17], leftThigh: [-.53, -.07, -.17], rightShin: [.95, 0, 0], leftShin: [.88, 0, 0], rightFoot: [-.28, -.14, -.08], leftFoot: [-.28, .14, .08] }, [.012, -.114, .02], [0, 0, .04], [.06, 0, .012])],
  [.68, derive(ABOMINATION, { hips: [.10, .08, .032], spine: [.54, .11, .048], chest: [.20, .09, .03], head: [-.21, -.09, .06], rightArm: [-.34, .12, -.17], leftArm: [-.45, -.07, .20], rightForearm: [-.23, -.02, -.08], leftForearm: [-.29, .02, .09], rightThigh: [-.60, .07, .17], leftThigh: [-.54, -.07, -.17], rightShin: [.98, 0, 0], leftShin: [.91, 0, 0] }, [.016, -.125, .03], [.004, 0, .043], [.075, 0, .018])],
  [.87, derive(ABOMINATION, { spine: [.26, -.03, -.01], chest: [.15, -.035, -.02], head: [-.14, .04, .06], rightArm: [-.26, -.10, -.32], leftArm: [-.32, .09, .34], rightThigh: [-.26, .05, .14], leftThigh: [-.26, -.05, -.14], rightShin: [.49, 0, 0], leftShin: [.49, 0, 0] }, [.004, -.060, .01])],
  [1, ABOMINATION],
];

// The muscular forsaken loads one shoulder, drives its weight through a long
// reaching claw, and arrests the follow-through with the opposite planted leg.
const FORSAKEN_GRAB = [
  [0, FORSAKEN],
  [.20, derive(FORSAKEN, { hips: [0, -.09, -.018], chest: [.01, -.24, -.035], head: [-.015, .15, 0], rightArm: [-.54, -.16, -.28], rightForearm: [-.85, .08, -.04], leftArm: [-.35, .06, .17], leftForearm: [-.58, -.04, .03], rightThigh: [-.18, .025, .06], rightShin: [.32, 0, 0] }, [-.009, -.025, -.016])],
  [.42, derive(FORSAKEN, { hips: [-.025, -.16, -.025], spine: [.015, -.05, 0], chest: [-.035, -.37, -.045], head: [.005, .24, .015], rightArm: [-1.28, -.26, -.16], rightForearm: [-.83, .04, -.03], rightHand: [.40, -.16, -.07], leftArm: [-.47, .11, .20], leftForearm: [-.76, -.04, .03], rightThigh: [-.25, .03, .06], rightShin: [.39, 0, 0], leftThigh: [.16, -.03, -.06] }, [-.012, -.036, -.022])],
  [.58, derive(FORSAKEN, { hips: [.055, .12, .015], spine: [.15, .055, .02], chest: [.15, .29, .035], head: [-.11, -.17, -.015], rightArm: [-1.48, .20, -.10], rightForearm: [-.10, -.06, -.025], rightHand: [-.23, -.12, .04], leftArm: [-.42, -.08, .20], leftForearm: [-.61, .03, .02], rightThigh: [-.35, .03, .07], rightShin: [.49, 0, 0], leftThigh: [.23, -.03, -.055], leftShin: [.16, 0, 0] }, [.009, -.027, .026], [0, 0, .045], [.025, 0, 0])],
  [.71, derive(FORSAKEN, { hips: [.05, .16, .02], spine: [.16, .06, .015], chest: [.17, .39, .045], head: [-.105, -.21, -.015], rightArm: [-.86, .35, -.23], rightForearm: [-.37, -.09, -.04], rightHand: [-.10, -.08, .03], leftArm: [-.51, -.04, .20], rightThigh: [-.27, .03, .055], rightShin: [.40, 0, 0] }, [.012, -.034, .019], [0, 0, .035])],
  [.88, derive(FORSAKEN, { chest: [.065, .10, .015], rightArm: [-.37, .06, -.17], rightForearm: [-.48, .025, -.03], leftArm: [-.28, .025, .15] }, [0, -.018, .005])],
  [1, FORSAKEN],
];
const FORSAKEN_LEFT_GRAB = FORSAKEN_GRAB.map(([t, p]) => [t, mirrored(p)]);
FORSAKEN_LEFT_GRAB[0][1] = FORSAKEN;
FORSAKEN_LEFT_GRAB[FORSAKEN_LEFT_GRAB.length - 1][1] = FORSAKEN;

// A deliberate open-handed command keeps the tall silhouette readable. Wings
// flare at the preparation and settle behind the body during the forward cast.
const DREADLORD_GESTURE = [
  [0, DREADLORD],
  [.22, derive(DREADLORD, { hips: [0, -.045, 0], chest: [-.045, -.13, -.02], head: [.015, .075, 0], rightArm: [-.53, -.07, -.18], rightForearm: [-.69, .04, -.025], rightHand: [.23, -.08, -.06], leftArm: [-.31, .08, .18], leftForearm: [-.38, -.03, .02], rightWing: [0, -.06, .08], rightWingTip: [0, -.025, .03], leftWing: [0, .06, -.08], leftWingTip: [0, .025, -.03] }, [0, -.009, -.004])],
  [.43, derive(DREADLORD, { chest: [-.065, -.22, -.025], head: [.005, .12, 0], rightArm: [-1.22, -.14, -.16], rightForearm: [-.61, .035, -.035], rightHand: [.24, -.14, -.05], leftArm: [-.48, .12, .23], leftForearm: [-.47, -.03, .025], rightWing: [0, -.115, .135], rightWingTip: [0, -.055, .065], leftWing: [0, .115, -.135], leftWingTip: [0, .055, -.065] }, [0, -.014, -.008])],
  [.58, derive(DREADLORD, { hips: [.018, .055, 0], spine: [.025, .02, 0], chest: [.06, .14, .02], head: [-.055, -.085, 0], rightArm: [-1.43, .11, -.08], rightForearm: [-.13, -.035, -.015], rightHand: [-.21, -.07, .025], leftArm: [-.34, .04, .23], leftForearm: [-.40, 0, .025], rightWing: [0, .035, .095], rightWingTip: [0, -.03, .085], leftWing: [0, -.035, -.095], leftWingTip: [0, .03, -.085], rightThigh: [-.14, .02, .05], rightShin: [.24, 0, 0], leftThigh: [.10, -.02, -.045] }, [0, -.018, .014], [0, 0, .021])],
  [.73, derive(DREADLORD, { chest: [.04, .17, .015], head: [-.035, -.11, 0], rightArm: [-1.00, .17, -.11], rightForearm: [-.28, -.02, -.02], rightHand: [-.08, -.04, .025], leftArm: [-.30, .04, .17], rightWing: [0, .085, .04], rightWingTip: [0, .045, .06], leftWing: [0, -.085, -.04], leftWingTip: [0, -.045, -.06] }, [0, -.011, .008])],
  [.90, derive(DREADLORD, { chest: [-.01, .035, 0], rightArm: [-.30, .015, -.10], rightForearm: [-.42, .02, 0], rightWing: [0, .06, .022], rightWingTip: [0, .04, .005], leftWing: [0, -.06, -.022], leftWingTip: [0, -.04, -.005] })],
  [1, DREADLORD],
];
const DREADLORD_LEFT_GESTURE = DREADLORD_GESTURE.map(([t, p]) => [t, mirrored(p)]);
DREADLORD_LEFT_GESTURE[0][1] = DREADLORD;
DREADLORD_LEFT_GESTURE[DREADLORD_LEFT_GESTURE.length - 1][1] = DREADLORD;

function deathKeys(base, heavy) {
  const knees = heavy ? 1.40 : 1.55;
  const buckle = derive(base, { hips: [.06, -.05, .04], spine: [.30, .05, .04], chest: [-.08, -.13, -.06], head: [-.25, .09, -.16], rightThigh: [-.42, .05, .09], leftThigh: [-.50, -.05, -.09], rightShin: [.83, 0, 0], leftShin: [.97, 0, 0], rightArm: [-.25, -.03, -.51], leftArm: [-.38, .07, .51] }, [0, -.105, 0]);
  const kneel = derive(base, { hips: [.10, -.18, .10], spine: [.40, -.08, .13], chest: [.18, -.28, .12], head: [.16, -.20, -.08], rightThigh: [-.78, .08, .13], leftThigh: [-.91, -.08, -.17], rightShin: [knees, 0, 0], leftShin: [knees + .10, 0, 0], rightFoot: [-.48, -.05, -.02], leftFoot: [-.50, .13, .05], rightArm: [-.72, -.22, -.54], leftArm: [-.29, .14, .34], rightForearm: [-.31, 0, -.13], leftForearm: [-.43, 0, .09] }, [-.022, -.205, .025], [0, 0, .015], [.05, -.03, .16]);
  const fall = derive(base, { hips: [.05, -.25, .17], spine: [.30, .14, .20], chest: [.15, -.35, .15], head: [.23, -.28, -.20], rightThigh: [-.76, .09, .16], leftThigh: [-.98, -.09, -.22], rightShin: [1.40, 0, 0], leftShin: [1.63, 0, 0], rightFoot: [-.39, -.08, -.07], leftFoot: [-.41, .15, .06], rightArm: [-.50, -.14, -.74], leftArm: [-.12, .20, .54], rightForearm: [-.65, .10, -.19], leftForearm: [-.48, -.08, .14] }, [-.027, -.18, .035], [-.025, .015, .045], [.14, -.10, .84]);
  const landed = derive(base, { hips: [.04, -.18, .10], spine: [.22, .12, .11], chest: [.12, -.29, .10], head: [.19, -.20, -.17], rightThigh: [-.72, .11, .12], leftThigh: [-.93, -.06, -.20], rightShin: [1.30, 0, 0], leftShin: [1.57, 0, 0], rightFoot: [-.34, -.09, -.06], leftFoot: [-.41, .13, .05], rightArm: [-.23, -.16, -.82], leftArm: [-.12, .16, .40], rightForearm: [-.83, .14, -.11], leftForearm: [-.64, -.08, .14], rightHand: [.08, -.04, -.10], leftHand: [.10, .05, .08] }, [-.022, -.14, .036], [-.055, heavy ? .095 : .071, .065], [.16, -.10, 1.46]);
  const settle = derive(landed, { head: [.24, -.21, -.19], rightForearm: [-.88, .14, -.14] }, landed.hipsOffset, [-.057, heavy ? .089 : .067, .065], [.17, -.10, 1.49]);
  return [[0, base], [.16, buckle], [.35, kneel], [.59, fall], [.73, landed], [.84, settle], [1, settle]];
}
const DEATH = { zombie: deathKeys(ZOMBIE, false), forsaken: deathKeys(FORSAKEN, false), abomination: deathKeys(ABOMINATION, true), dreadlord: deathKeys(DREADLORD, false) };
for (const [t, p] of DEATH.dreadlord) {
  const fold = range(.04, .69, t);
  for (const [side, sign] of [['right', 1], ['left', -1]]) {
    p.rotations[side + 'Wing'] = [0, sign * lerp(.045, 1.12, fold), sign * lerp(.025, -.09, fold)];
    p.rotations[side + 'WingTip'] = [0, sign * lerp(.025, .58, fold), sign * lerp(-.015, -.16, fold)];
  }
}
const DEATH_OTHER = Object.fromEntries(Object.entries(DEATH).map(([kind, keys]) => [kind, keys.map(([t, p]) => [t, mirrored(p)])]));

/**
 * Stateless sampler: s={time,dt,gaitPhase,locomotion,speed,action,progress,variant,hit,dead}.
 * variant must stay fixed during an individual attack/death; alternate it between attacks.
 * .58 is the contact time for all four monsters. Death >=.84 is a fixed corpse pose.
 * The owner handles root translation, hit timing, alpha, disposal, and optional foot IK.
 */
export function sampleUndeadMotion(kind, s = {}) {
  if (!DEATH[kind]) throw new Error(`Unknown undead motion kind: ${kind}`);
  const time = finite(s.time), phase = finite(s.gaitPhase), variant = Math.abs(Math.trunc(finite(s.variant))) % 2;
  const dead = clamp(finite(s.dead)), hit = clamp(finite(s.hit));
  const normalSpeed = { zombie: 1.8, forsaken: 2.0, abomination: 1.2, dreadlord: 1.55 }[kind];
  const amount = clamp(finite(s.locomotion, Math.abs(finite(s.speed)) / normalSpeed));
  let out = locomotion(kind, time, phase, amount, variant);
  if (s.action === 'attack') {
    const p = clamp(finite(s.progress));
    const keys = kind === 'abomination' ? HEAVY_SMASH
      : kind === 'forsaken' ? (variant ? FORSAKEN_LEFT_GRAB : FORSAKEN_GRAB)
      : kind === 'dreadlord' ? (variant ? DREADLORD_LEFT_GESTURE : DREADLORD_GESTURE)
      : variant ? ZOMBIE_LEFT_CLAW : ZOMBIE_CLAW;
    const envelope = range(0, .12, p) * (1 - range(.87, 1, p));
    out = blend(out, frames(keys, p), envelope);
  }
  if (hit > 0 && dead === 0) {
    // Large bodies absorb impact in the torso; they do not hop or shift their root.
    const weight = hit * ({ zombie: 1, forsaken: .75, abomination: .55, dreadlord: .40 }[kind]), side = variant ? -1 : 1;
    out.rotations.spine[0] -= .16 * weight; out.rotations.chest[0] -= .20 * weight;
    out.rotations.chest[1] += side * .11 * weight; out.rotations.head[0] -= .19 * weight;
    out.rotations.head[2] += side * .10 * weight;
  }
  if (dead > 0) {
    const keys = variant ? DEATH_OTHER[kind] : DEATH[kind];
    // Blending the initial buckle avoids snapping out of the current stride or swing.
    out = blend(out, frames(keys, dead), range(0, .12, dead));
  }
  return out;
}
