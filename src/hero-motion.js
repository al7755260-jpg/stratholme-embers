import { applyMeleeCapture } from './melee-mocap.js';

/**
 * Paladin key-pose sampler for the procedural +Z-facing rig in actors.js.
 * All Euler rotations use THREE's default XYZ order, in radians. The bind arm
 * runs down -Y: negative shoulder X reaches forwards; positive shin X bends
 * the knee backwards. Offsets are fractions of actor height, not world units.
 * The caller owns root movement, foot IK, left-hand grip IK, hit timing and fade.
 * gaitPhase is displacement-driven radians (one 2π turn per complete stride).
 * No clocks or mutable playback state are retained: pausing/scrubbing is exact.
 */

export const HERO_MOTION_TUNING = Object.freeze({
  contact: Object.freeze([0.48, 0.48, 0.55]),
  capeDelay: 0.075,
  strideScale: 1,
  upperBodyStrength: 1,
  // Procedural envelope skinning is less forgiving than an artist-weighted rig.
  shoulderXLimit: 2.25,
  elbowXLimit: 1.45,
  wristLimit: 1.05,
});

const TAU = Math.PI * 2;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number.isFinite(v) ? v : lo));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const ease = (t, type = 'smooth') => type === 'accelerate' ? t * t : type === 'release' ? 1 - (1 - t) ** 2 : smooth(t);
const vecMix = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const zero = () => [0, 0, 0];

const REST = {
  hips: [0, 0, 0], spine: [.025, 0, 0], chest: [.015, 0, 0], head: [-.02, 0, 0],
  rightArm: [-.18, .03, .045], rightForearm: [-.36, 0, 0], rightHand: [.12, 0, -.06],
  leftArm: [-.13, -.02, -.07], leftForearm: [-.24, 0, 0], leftHand: [0, 0, .025],
  rightThigh: [0, 0, .018], rightShin: [.02, 0, 0], rightFoot: [-.02, 0, 0],
  leftThigh: [0, 0, -.018], leftShin: [.02, 0, 0], leftFoot: [-.02, 0, 0],
  cape: [.035, 0, 0], capeHem: [.025, 0, 0],
};
const BONES = Object.keys(REST);
const pose = (rotations = {}, hipsOffset = [0, 0, 0], bodyRotation = [0, 0, 0], bodyOffset = [0, 0, 0], grip = 0) => ({
  rotations: Object.fromEntries(BONES.map(name => [name, [...(rotations[name] || REST[name])]])),
  hipsOffset: [...hipsOffset], bodyRotation: [...bodyRotation], bodyOffset: [...bodyOffset], grip,
});
const ready = () => pose();
const key = (at, value, curve = 'smooth') => ({at, value, curve});
function blend(a, b, t) {
  return {
    rotations: Object.fromEntries(BONES.map(name => [name, vecMix(a.rotations[name], b.rotations[name], t)])),
    hipsOffset: vecMix(a.hipsOffset, b.hipsOffset, t),
    bodyRotation: vecMix(a.bodyRotation, b.bodyRotation, t),
    bodyOffset: vecMix(a.bodyOffset, b.bodyOffset, t), grip: mix(a.grip, b.grip, t),
  };
}
function sample(keys, progress) {
  const p = clamp(progress);
  if (p <= keys[0].at) return blend(keys[0].value, keys[0].value, 0);
  for (let i = 1; i < keys.length; i++) {
    if (p <= keys[i].at) {
      const a = keys[i - 1], b = keys[i];
      return blend(a.value, b.value, ease((p - a.at) / Math.max(.0001, b.at - a.at), b.curve));
    }
  }
  return blend(keys.at(-1).value, keys.at(-1).value, 0);
}

// Rightward loading, forward driving step, cross-body sweep, then recoil.
const SWEEP = [
  key(0, ready()),
  key(.15, pose({hips: [0, -.12, -.035], chest: [.02, -.28, -.04], head: [0, .15, .015], rightArm: [-.55, .28, .30], rightForearm: [-.64, .08, 0], rightHand: [.38, 0, -.12], leftArm: [-.42, -.20, -.12], leftForearm: [-.72, 0, -.12], rightThigh: [-.12, -.05, .06], rightShin: [.28, 0, 0], leftThigh: [.15, 0, -.06], leftShin: [.10, 0, 0]}, [.013, -.022, -.009], [0, -.08, -.025], zero(), .55)),
  key(.32, pose({hips: [.015, -.21, -.05], spine: [-.025, -.09, -.025], chest: [-.035, -.42, -.055], head: [.03, .28, .015], rightArm: [-.98, .50, .55], rightForearm: [-.77, .10, .03], rightHand: [.62, -.10, -.20], leftArm: [-.64, -.34, -.09], leftForearm: [-.98, 0, -.18], rightThigh: [-.16, -.08, .07], rightShin: [.35, 0, 0], leftThigh: [.18, .03, -.07], leftShin: [.10, 0, 0], cape: [.08, .12, -.045]}, [.020, -.038, -.014], [0, -.13, -.035], zero(), 1)),
  key(.48, pose({hips: [.055, .13, .025], spine: [.055, .10, .035], chest: [.085, .35, .055], head: [-.045, -.23, -.02], rightArm: [-1.10, -.40, -.03], rightForearm: [-.48, -.08, .10], rightHand: [.72, .08, -.16], leftArm: [-.82, .22, -.20], leftForearm: [-.98, .08, -.08], rightThigh: [.20, .06, .025], rightShin: [.19, 0, 0], leftThigh: [-.27, -.045, -.035], leftShin: [.38, 0, 0], cape: [.18, -.08, .05]}, [-.012, -.035, .028], [.035, .09, .04], [0, 0, .013], 1), 'accelerate'),
  key(.60, pose({hips: [.07, .21, .04], chest: [.13, .53, .07], head: [-.04, -.32, -.02], rightArm: [-.83, -.70, -.18], rightForearm: [-.56, -.12, .12], rightHand: [.62, .12, -.24], leftArm: [-.65, .32, -.15], leftForearm: [-1.05, .12, -.05], rightThigh: [.18, .03, .025], rightShin: [.23, 0, 0], leftThigh: [-.25, 0, -.04], leftShin: [.38, 0, 0], cape: [.22, -.18, .08], capeHem: [.24, -.14, .12]}, [-.018, -.042, .023], [.045, .13, .035], [0, 0, .008], .9), 'release'),
  key(.79, pose({hips: [.025, .05, 0], chest: [.04, .13, .01], rightArm: [-.45, -.18, -.03], rightForearm: [-.58, 0, 0], rightHand: [.28, 0, -.08], leftArm: [-.36, .08, -.10], leftForearm: [-.56, 0, 0], cape: [.16, -.09, .04], capeHem: [.24, -.07, .06]}, [0, -.015, .006], [0, .025, 0], zero(), .3)),
  key(1, ready()),
];

// A reverse sweep starts on the previous attack's recovery side, with the hips
// initiating before the shoulders. It is deliberately not a mirrored sine.
const REVERSE = [
  key(0, ready()),
  key(.14, pose({hips: [0, .14, .035], chest: [.015, .30, .025], head: [.01, -.18, 0], rightArm: [-.72, -.45, -.10], rightForearm: [-.78, 0, .13], rightHand: [.53, .05, -.18], leftArm: [-.61, .19, -.17], leftForearm: [-.96, 0, -.10]}, [-.012, -.020, -.006], [0, .075, .025], zero(), .65)),
  key(.31, pose({hips: [.02, .25, .035], chest: [-.015, .47, .035], head: [.015, -.31, -.015], rightArm: [-.89, -.66, -.20], rightForearm: [-1.0, -.13, .16], rightHand: [.70, .12, -.27], leftArm: [-.76, .27, -.24], leftForearm: [-1.12, .08, -.12], rightThigh: [.19, .04, .04], rightShin: [.18, 0, 0], leftThigh: [-.20, -.06, -.06], leftShin: [.32, 0, 0], cape: [.09, -.13, .06]}, [-.020, -.035, -.009], [0, .14, .035], zero(), 1)),
  key(.48, pose({hips: [.035, -.17, -.04], spine: [.07, -.12, -.02], chest: [.095, -.33, -.055], head: [-.04, .23, .02], rightArm: [-1.05, .17, .30], rightForearm: [-.44, .03, -.02], rightHand: [.58, -.08, -.05], leftArm: [-.86, -.25, -.12], leftForearm: [-.94, -.07, -.17], rightThigh: [-.25, -.05, .04], rightShin: [.36, 0, 0], leftThigh: [.24, .055, -.025], leftShin: [.21, 0, 0], cape: [.17, .10, -.07]}, [.013, -.038, .027], [.03, -.12, -.045], [0, 0, .009], 1), 'accelerate'),
  key(.61, pose({hips: [.07, -.24, -.04], chest: [.12, -.47, -.07], head: [-.04, .30, .025], rightArm: [-.71, .47, .52], rightForearm: [-.54, .07, -.05], rightHand: [.45, -.12, .03], leftArm: [-.58, -.32, -.05], leftForearm: [-1.01, -.08, -.15], rightThigh: [-.24, -.04, .05], rightShin: [.38, 0, 0], leftThigh: [.20, .04, -.03], leftShin: [.22, 0, 0], cape: [.22, .17, -.08], capeHem: [.23, .17, -.13]}, [.020, -.042, .018], [.04, -.16, -.035], zero(), .88), 'release'),
  key(.80, pose({hips: [0, -.065, -.01], chest: [.03, -.13, -.02], rightArm: [-.37, .12, .16], rightForearm: [-.53, 0, 0], leftArm: [-.29, -.10, -.08], leftForearm: [-.52, 0, 0], cape: [.13, .08, -.02], capeHem: [.21, .08, -.05]}, [.004, -.014, 0], [0, -.035, -.01], zero(), .32)),
  key(1, ready()),
];

// Double-handed vertical finisher: knees preload; chest rises only after the
// pelvis settles; the impact pose and its follow-through retain bent knees.
const OVERHEAD = [
  key(0, ready()),
  key(.15, pose({hips: [.04, -.025, 0], spine: [.03, 0, 0], chest: [.025, -.04, 0], rightArm: [-.68, .08, .14], rightForearm: [-.84, 0, 0], rightHand: [.52, 0, -.15], leftArm: [-.69, -.10, -.14], leftForearm: [-.88, 0, -.05], rightThigh: [-.28, -.035, .07], leftThigh: [-.26, .035, -.07], rightShin: [.47, 0, 0], leftShin: [.44, 0, 0]}, [0, -.054, -.012], [-.015, -.02, 0], zero(), .75)),
  key(.36, pose({hips: [-.015, -.025, 0], spine: [-.075, 0, 0], chest: [-.10, -.025, 0], head: [.055, 0, 0], rightArm: [-2.03, .07, .20], rightForearm: [-.60, .04, -.08], rightHand: [.96, 0, -.20], leftArm: [-1.88, -.10, -.17], leftForearm: [-.77, -.04, .05], leftHand: [.25, 0, .05], rightThigh: [-.12, -.035, .08], leftThigh: [-.10, .035, -.08], rightShin: [.23, 0, 0], leftShin: [.22, 0, 0], cape: [.045, 0, 0], capeHem: [.17, 0, 0]}, [0, -.023, -.023], [-.045, -.02, 0], [0, .008, -.01], 1)),
  key(.43, pose({hips: [.015, 0, 0], spine: [-.05, 0, 0], chest: [-.07, 0, 0], head: [.03, 0, 0], rightArm: [-2.12, .04, .17], rightForearm: [-.56, 0, -.06], rightHand: [.98, 0, -.17], leftArm: [-2.00, -.05, -.14], leftForearm: [-.70, 0, .05], rightThigh: [-.18, 0, .07], leftThigh: [-.17, 0, -.07], rightShin: [.30, 0, 0], leftShin: [.28, 0, 0]}, [0, -.039, -.013], [-.025, 0, 0], zero(), 1)),
  key(.55, pose({hips: [.11, 0, 0], spine: [.16, 0, 0], chest: [.25, .025, 0], head: [-.10, -.02, 0], rightArm: [-.92, -.04, .05], rightForearm: [-.39, 0, .03], rightHand: [-.94, .03, -.10], leftArm: [-1.00, .02, -.05], leftForearm: [-.70, 0, -.04], rightThigh: [-.47, -.025, .10], leftThigh: [-.42, .025, -.10], rightShin: [.77, 0, 0], leftShin: [.71, 0, 0], rightFoot: [-.22, 0, 0], leftFoot: [-.21, 0, 0], cape: [.24, 0, .02]}, [0, -.14, .032], [.095, .02, 0], [0, -.008, .022], 1), 'accelerate'),
  key(.66, pose({hips: [.13, 0, 0], spine: [.17, .015, 0], chest: [.31, .035, .015], head: [-.12, -.025, 0], rightArm: [-.64, -.09, .025], rightForearm: [-.36, 0, .035], rightHand: [-.78, .03, -.10], leftArm: [-.70, .05, -.07], leftForearm: [-.71, 0, -.03], rightThigh: [-.50, 0, .09], leftThigh: [-.46, 0, -.09], rightShin: [.83, 0, 0], leftShin: [.77, 0, 0], cape: [.28, 0, .01], capeHem: [.33, .025, .01]}, [0, -.15, .035], [.11, .025, .008], [0, -.01, .025], 1), 'release'),
  key(.83, pose({hips: [.05, 0, 0], spine: [.055, 0, 0], chest: [.10, .025, 0], rightArm: [-.44, -.02, .06], rightForearm: [-.50, 0, 0], rightHand: [.05, 0, -.08], leftArm: [-.40, 0, -.09], leftForearm: [-.57, 0, 0], rightThigh: [-.22, 0, .04], leftThigh: [-.20, 0, -.04], rightShin: [.36, 0, 0], leftShin: [.34, 0, 0], cape: [.20, 0, 0], capeHem: [.30, 0, 0]}, [0, -.045, .008], [.025, .01, 0], zero(), .55)),
  key(1, ready()),
];

const WHIRL = [
  key(0, ready()),
  key(.19, pose({hips: [.01, -.20, 0], chest: [.03, -.34, -.03], rightArm: [-.85, .28, .45], rightForearm: [-.68, 0, -.04], rightHand: [.63, 0, -.18], leftArm: [-.68, -.22, -.09], leftForearm: [-.93, 0, -.10], rightThigh: [-.27, 0, .09], leftThigh: [-.15, 0, -.08], rightShin: [.43, 0, 0], leftShin: [.30, 0, 0]}, [0, -.05, -.01], [0, -.17, 0], zero(), 1)),
  key(.38, pose({hips: [.045, .08, .025], chest: [.075, .17, .035], rightArm: [-1.12, -.02, .22], rightForearm: [-.29, 0, 0], rightHand: [.59, 0, -.14], leftArm: [-.89, .02, -.12], leftForearm: [-.79, 0, -.08], cape: [.18, -.21, .11], capeHem: [.26, -.20, .15]}, [0, -.027, 0], [.025, 1.20, .025], zero(), 1), 'accelerate'),
  key(.61, pose({hips: [.055, .09, .02], chest: [.065, .14, .025], rightArm: [-1.08, -.12, .27], rightForearm: [-.32, 0, .02], rightHand: [.54, 0, -.16], leftArm: [-.84, .09, -.13], leftForearm: [-.80, 0, -.08], cape: [.23, -.24, .14], capeHem: [.33, -.27, .20]}, [0, -.03, 0], [.025, 4.30, .02], zero(), 1)),
  key(.79, pose({hips: [.03, .05, .01], chest: [.04, .10, .01], rightArm: [-.73, -.24, .16], rightForearm: [-.44, 0, .02], rightHand: [.42, 0, -.12], leftArm: [-.61, .12, -.12], leftForearm: [-.79, 0, -.08], cape: [.17, -.20, .08], capeHem: [.29, -.20, .15]}, [0, -.035, 0], [.015, TAU, 0], zero(), .85), 'release'),
  key(1, pose({}, zero(), [0, TAU, 0])),
];

// Consecration: plant the downward hammer beside the right boot and invoke
// the Light with the free left palm. No shared overhead-attack choreography.
const CAST = [
  key(0, ready()),
  key(.20, pose({hips:[.02,0,0],chest:[.02,-.08,0],head:[-.03,.04,0],leftArm:[-.64,-.12,-.28],leftForearm:[-.90,0,-.08],leftHand:[.12,0,.10],rightThigh:[-.14,0,.08],leftThigh:[-.12,0,-.08],rightShin:[.23,0,0],leftShin:[.22,0,0]},[0,-.015,0])),
  key(.40, pose({spine:[-.035,0,0],chest:[-.07,-.11,-.02],head:[-.12,-.04,0],leftArm:[-1.66,-.14,-.37],leftForearm:[-.42,0,-.09],leftHand:[-.42,0,.16],rightThigh:[-.18,0,.08],leftThigh:[-.14,0,-.08],rightShin:[.30,0,0],leftShin:[.26,0,0],cape:[.10,0,0]},[0,-.023,0])),
  key(.58, pose({spine:[-.035,0,0],chest:[-.045,-.08,-.025],head:[-.07,-.08,0],leftArm:[-1.32,-.14,-.43],leftForearm:[-.31,0,-.07],leftHand:[-.66,0,.12],rightThigh:[-.23,0,.09],leftThigh:[-.18,0,-.09],rightShin:[.36,0,0],leftShin:[.31,0,0],cape:[.17,0,.03]},[0,-.028,0]),'accelerate'),
  key(.76, pose({chest:[-.02,-.05,-.02],head:[-.04,-.03,0],leftArm:[-1.21,-.10,-.36],leftForearm:[-.38,0,-.06],leftHand:[-.57,0,.12],rightThigh:[-.18,0,.08],leftThigh:[-.14,0,-.08],rightShin:[.29,0,0],leftShin:[.25,0,0],cape:[.13,0,.02]},[0,-.019,0])),
  key(1, ready()),
];

// Dedicated transformation poses: brace, raise the hammer, then open the free palm.
const ASCEND = [
  key(0, pose({head:[.18,0,0],chest:[.12,0,0],leftArm:[-.28,0,-.12],leftForearm:[-.75,0,0],rightThigh:[-.18,0,.10],leftThigh:[-.16,0,-.10],rightShin:[.28,0,0],leftShin:[.28,0,0]},[0,-.055,0])),
  key(.22, pose({head:[.23,0,0],chest:[.08,-.09,0],leftArm:[-.55,0,-.25],leftForearm:[-.95,0,0],rightThigh:[-.25,0,.12],leftThigh:[-.22,0,-.12],rightShin:[.4,0,0],leftShin:[.4,0,0],cape:[.18,0,0]},[0,-.065,0])),
  key(.48, pose({head:[-.18,-.08,0],spine:[-.06,0,0],chest:[-.08,-.14,0],leftArm:[-.70,0,-1.1],leftForearm:[-.25,0,0],leftHand:[-.25,0,0],rightThigh:[-.05,0,.1],leftThigh:[.04,0,-.1],cape:[.40,0,.04],capeHem:[.52,0,.02]},[0,.018,0]),'release'),
  key(.72, pose({head:[-.10,.02,0],chest:[-.05,-.06,0],leftArm:[-.48,0,-1.00],leftForearm:[-.25,0,0],leftHand:[-.32,0,.08],rightThigh:[.02,0,.09],leftThigh:[-.04,0,-.09],cape:[.33,0,.04],capeHem:[.46,0,.02]},[0,.025,0])),
  key(1, pose({head:[-.08,0,0],chest:[-.045,-.03,0],leftArm:[-.42,0,-.82],leftForearm:[-.25,0,0],leftHand:[-.28,0,.06],cape:[.26,0,0],capeHem:[.38,0,0]},[0,.02,0])),
];

const DODGE = [
  key(0, ready()),
  key(.17, pose({hips: [.085, 0, -.09], spine: [.10, 0, -.035], chest: [.12, -.04, -.065], head: [-.06, .04, .075], rightArm: [-.46, -.03, .09], rightForearm: [-.80, 0, .02], leftArm: [-.48, .03, -.10], leftForearm: [-.87, 0, -.06], rightThigh: [-.43, 0, .15], rightShin: [.76, 0, 0], leftThigh: [-.38, 0, -.08], leftShin: [.66, 0, 0]}, [-.014, -.097, .008], [.04, -.03, -.08], [-.009, 0, 0], .75)),
  key(.38, pose({hips: [.07, 0, -.08], chest: [.15, -.07, -.09], head: [-.055, .055, .08], rightArm: [-.39, -.08, .08], rightForearm: [-.83, 0, 0], leftArm: [-.42, .04, -.09], leftForearm: [-.91, 0, -.04], rightThigh: [.20, 0, .26], rightShin: [.32, 0, 0], leftThigh: [-.35, 0, -.21], leftShin: [.72, 0, 0], cape: [.23, .06, .11], capeHem: [.33, .08, .17]}, [.018, -.071, .01], [.055, -.04, -.12], [.018, .004, 0], .85), 'accelerate'),
  key(.62, pose({hips: [.09, 0, -.025], chest: [.16, -.02, -.015], head: [-.07, 0, .04], rightArm: [-.43, 0, .07], rightForearm: [-.72, 0, 0], leftArm: [-.39, 0, -.08], leftForearm: [-.80, 0, -.04], rightThigh: [-.31, 0, .14], rightShin: [.68, 0, 0], leftThigh: [-.24, 0, -.17], leftShin: [.57, 0, 0], cape: [.21, .03, .08], capeHem: [.32, .05, .12]}, [.026, -.085, .012], [.06, 0, -.055], [.012, 0, 0], .7), 'release'),
  key(.82, pose({hips: [.03, 0, .015], chest: [.06, 0, .025], rightArm: [-.27, 0, .065], rightForearm: [-.52, 0, 0], leftArm: [-.23, 0, -.08], leftForearm: [-.45, 0, 0], cape: [.15, 0, -.015], capeHem: [.22, 0, .035]}, [.007, -.032, .005], [.015, 0, .02], zero(), .2)),
  key(1, ready()),
];

// Contact -> compression -> passing -> heel contact. Positive shin flexion is
// retained in the swing leg, and the planted foot starts with toe lift.
const WALK = [
  key(0, pose({hips: [0, -.055, .025], chest: [.035, .065, -.015], rightThigh: [-.42, 0, .02], rightShin: [.12, 0, 0], rightFoot: [.15, 0, 0], leftThigh: [.36, 0, -.02], leftShin: [.23, 0, 0], leftFoot: [-.20, 0, 0], rightArm: [.09, .035, .065], rightForearm: [-.40, 0, 0], leftArm: [-.42, -.025, -.085], leftForearm: [-.30, 0, 0]}, [.006, -.010, 0])),
  key(.12, pose({hips: [.025, -.035, .03], chest: [.045, .04, -.025], rightThigh: [-.26, 0, .02], rightShin: [.33, 0, 0], rightFoot: [-.07, 0, 0], leftThigh: [.29, 0, -.02], leftShin: [.65, 0, 0], leftFoot: [-.24, 0, 0], rightArm: [.055, .03, .065], leftArm: [-.34, -.02, -.08]}, [.009, -.018, 0])),
  key(.25, pose({hips: [.02, 0, .015], chest: [.05, 0, -.01], rightThigh: [.015, 0, .02], rightShin: [.17, 0, 0], rightFoot: [-.12, 0, 0], leftThigh: [-.07, 0, -.02], leftShin: [.80, 0, 0], leftFoot: [-.21, 0, 0], rightArm: [-.14, .03, .045], leftArm: [-.11, -.02, -.07]}, [.006, .008, 0])),
  key(.38, pose({hips: [.01, .035, -.02], chest: [.035, -.04, .015], rightThigh: [.26, 0, .02], rightShin: [.16, 0, 0], rightFoot: [-.20, 0, 0], leftThigh: [-.36, 0, -.02], leftShin: [.37, 0, 0], leftFoot: [.03, 0, 0], rightArm: [-.36, .03, .045], leftArm: [.10, -.02, -.07]}, [-.006, .003, 0])),
];
// Generate the second half by swapping limbs, reversing yaw and roll.
const mirrorWalk = p => {
  const out = ready();
  for (const name of BONES) {
    const counterpart = name.startsWith('right') ? 'left' + name.slice(5) : name.startsWith('left') ? 'right' + name.slice(4) : name;
    const value = p.rotations[counterpart]; out.rotations[name] = [value[0], -value[1], -value[2]];
  }
  // Carrying the hammer suppresses right-arm pendulum amplitude.
  out.rotations.rightArm[0] = mix(REST.rightArm[0], out.rotations.rightArm[0], .78);
  out.rotations.rightForearm[0] = -.40;
  out.hipsOffset = [-p.hipsOffset[0], p.hipsOffset[1], p.hipsOffset[2]];
  return out;
};
const GAIT = [...WALK, ...WALK.map(k => key(k.at + .5, mirrorWalk(k.value))), key(1, WALK[0].value)];

const DEATH = [
  key(0, ready()),
  key(.16, pose({hips: [.045, 0, -.025], spine: [.04, 0, -.025], chest: [-.08, .025, -.045], head: [-.14, .06, 0], rightArm: [.06, 0, .13], rightForearm: [-.23, 0, 0], leftArm: [.04, 0, -.15], leftForearm: [-.17, 0, 0], rightThigh: [-.24, 0, .07], leftThigh: [-.18, 0, -.04], rightShin: [.46, 0, 0], leftShin: [.35, 0, 0]}, [.012, -.048, 0], [-.035, .015, -.075])),
  key(.36, pose({hips: [.10, .05, -.08], spine: [.12, 0, -.06], chest: [.17, .06, -.10], head: [.13, .12, -.08], rightArm: [.17, -.04, .26], rightForearm: [-.15, 0, 0], leftArm: [-.32, .08, -.29], leftForearm: [-.45, 0, 0], rightThigh: [-.57, -.07, .12], leftThigh: [-.40, .10, -.15], rightShin: [1.02, 0, 0], leftShin: [.85, 0, 0], cape: [.19, 0, .06]}, [.035, -.11, -.015], [.10, .08, -.45], [.024, .025, 0])),
  key(.62, pose({hips: [.035, .07, -.035], spine: [.08, 0, -.045], chest: [.12, .07, -.05], head: [.12, .15, -.16], rightArm: [.24, -.10, .34], rightForearm: [-.29, 0, -.12], leftArm: [-.53, .08, -.43], leftForearm: [-.66, 0, .11], rightThigh: [-.43, -.09, .09], leftThigh: [-.30, .11, -.15], rightShin: [.88, 0, 0], leftShin: [.73, 0, 0], cape: [.28, .10, .18], capeHem: [.34, .10, .20]}, [.02, -.065, -.015], [.11, .08, -1.31], [.065, .154, .015]), 'accelerate'),
  key(.76, pose({hips: [.025, .06, -.02], spine: [.06, 0, -.035], chest: [.08, .065, -.04], head: [.09, .13, -.18], rightArm: [.29, -.12, .40], rightForearm: [-.22, 0, -.15], leftArm: [-.48, .08, -.42], leftForearm: [-.65, 0, .09], rightThigh: [-.38, -.10, .08], leftThigh: [-.26, .11, -.13], rightShin: [.83, 0, 0], leftShin: [.68, 0, 0], cape: [.16, .10, .11], capeHem: [.23, .12, .14]}, [.018, -.06, -.018], [.08, .08, -1.43], [.068, .173, .015]), 'release'),
];
DEATH.push(key(.9, blend(DEATH.at(-1).value, DEATH.at(-1).value, 0)), key(1, DEATH.at(-1).value));

function layer(base, actionPose, locomotion, weight) {
  const out = blend(base, base, 0);
  for (const name of BONES) {
    const lower = /Thigh|Shin|Foot/.test(name);
    const w = weight * (lower ? 1 - locomotion * .60 : 1);
    out.rotations[name] = base.rotations[name].map((v, i) => v + (actionPose.rotations[name][i] - REST[name][i]) * w);
  }
  out.hipsOffset = base.hipsOffset.map((v, i) => v + actionPose.hipsOffset[i] * weight);
  out.bodyOffset = actionPose.bodyOffset.map(v => v * weight);
  out.bodyRotation = actionPose.bodyRotation.map(v => v * weight);
  out.grip = actionPose.grip * weight;
  return out;
}

// Authored wrist paths are normalized by actor height. The controller fits
// the shared handle to both arm reaches, independently of the support latch.
const CARRY_HAND = [.235,.535,.065];
const CARRY_WEAPON = [3.05,0,-.16];
const HAND_PATHS = {
  ascend:[[0,...CARRY_HAND],[.22,.12,.64,.20],[.48,.12,.96,.05],[.72,.16,.93,.07],[1,.17,.90,.09]],
  sweep: [[0,...CARRY_HAND],[.15,.075,.645,.17],[.32,.015,.75,.18],[.48,.025,.66,.19],[.60,-.035,.65,.18],[.79,.085,.62,.14],[1,...CARRY_HAND]],
  reverse: [[0,...CARRY_HAND],[.14,-.045,.66,.18],[.31,-.055,.715,.16],[.48,.02,.66,.20],[.61,.065,.64,.17],[.80,.10,.61,.14],[1,...CARRY_HAND]],
  overhead: [[0,...CARRY_HAND],[.15,.03,.675,.17],[.36,-.03,.87,.12],[.43,-.015,.885,.13],[.55,.005,.650,.19],[.66,.005,.650,.19],[.83,.035,.655,.16],[1,...CARRY_HAND]],
  whirl: [[0,...CARRY_HAND],[.19,-.055,.685,.14],[.38,-.04,.67,.18],[.61,-.04,.67,.18],[.79,.045,.65,.15],[1,...CARRY_HAND]],
  cast: [[0,...CARRY_HAND],[.20,.25,.511,.08],[.40,.25,.516,.08],[.58,.25,.522,.08],[.76,.25,.516,.08],[1,...CARRY_HAND]],
  dodge: [[0,...CARRY_HAND],[.17,.20,.615,.095],[.38,.20,.625,.085],[.62,.205,.61,.085],[.82,.22,.58,.075],[1,...CARRY_HAND]],
};
// The hammer axis is independent of the wrist and support-hand latch. Local
// +Y points to the head; X near PI carries that head down beside the right boot.
const WEAPON_PATHS = {
  ascend:[[0,...CARRY_WEAPON],[.22,1.35,0,-.2],[.48,-.12,0,-.28],[.72,-.10,0,-.27],[1,-.03,0,-.23]],
  sweep: [[0,...CARRY_WEAPON],[.15,1.8,0,-.55],[.32,.28,0,-.95],[.48,1.40,0,.72],[.60,1.75,0,1.05],[.79,2.25,0,.32],[1,...CARRY_WEAPON]],
  reverse: [[0,...CARRY_WEAPON],[.14,1.65,0,.65],[.31,.45,0,.85],[.48,1.42,0,-.8],[.61,1.78,0,-1.0],[.80,2.3,0,-.4],[1,...CARRY_WEAPON]],
  overhead: [[0,...CARRY_WEAPON],[.15,1.50,0,-.1],[.36,-.38,0,-.025],[.43,-.43,0,0],[.55,2.72,0,.025],[.66,2.76,0,.025],[.83,2.6,0,-.08],[1,...CARRY_WEAPON]],
  whirl: [[0,...CARRY_WEAPON],[.19,1.75,0,-.8],[.38,Math.PI/2,0,-1.15],[.61,Math.PI/2,0,-1.15],[.79,2.0,0,-.75],[1,...CARRY_WEAPON]],
  cast: [[0,...CARRY_WEAPON],[.20,Math.PI,0,-.05],[.40,Math.PI,0,-.05],[.58,Math.PI,0,-.05],[.76,Math.PI,0,-.05],[1,...CARRY_WEAPON]],
  dodge: [[0,...CARRY_WEAPON],[.17,2.8,0,-.20],[.38,2.74,0,-.23],[.62,2.8,0,-.2],[.82,2.96,0,-.18],[1,...CARRY_WEAPON]],
};
function sampleVectorPath(path, p, tables) {
  for (let i=1;i<path.length;i++) if (p<=path[i][0]) {
    const a=path[i-1],b=path[i],t=ease(clamp((p-a[0])/(b[0]-a[0])),tables[i]?.curve);
    return vecMix(a.slice(1),b.slice(1),t);
  }
  return path.at(-1).slice(1);
}
function xyzQuaternion([x,y,z]) {
  const c1=Math.cos(x/2),c2=Math.cos(y/2),c3=Math.cos(z/2);
  const s1=Math.sin(x/2),s2=Math.sin(y/2),s3=Math.sin(z/2);
  return [s1*c2*c3+c1*s2*s3,c1*s2*c3-s1*c2*s3,c1*c2*s3+s1*s2*c3,c1*c2*c3-s1*s2*s3];
}
function composeWeaponRotation(bodyEuler,weaponEuler) {
  const [ax,ay,az,aw]=xyzQuaternion(bodyEuler),[bx,by,bz,bw]=xyzQuaternion(weaponEuler);
  // q(root <- hammer) = q(root <- poseGroup) * q(poseGroup <- hammer).
  const x=aw*bx+ax*bw+ay*bz-az*by,y=aw*by-ax*bz+ay*bw+az*bx;
  const z=aw*bz+ax*by-ay*bx+az*bw,w=aw*bw-ax*bx-ay*by-az*bz;
  const m11=1-2*(y*y+z*z),m12=2*(x*y-w*z),m13=2*(x*z+w*y);
  const m22=1-2*(x*x+z*z),m23=2*(y*z-w*x),m32=2*(y*z+w*x),m33=1-2*(x*x+y*y);
  const pitch=Math.asin(clamp(m13,-1,1));
  // This is THREE.Euler's XYZ extraction, including its gimbal-lock branch.
  return Math.abs(m13)<.9999999?[Math.atan2(-m23,m33),pitch,Math.atan2(-m12,m11)]:[Math.atan2(m32,m22),pitch,0];
}
function actorLocalTarget(target,out) {
  const [x,y,z]=target.map((v,i)=>v+out.hipsOffset[i]);
  const [a,b,c]=out.bodyRotation,ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b),cc=Math.cos(c),sc=Math.sin(c);
  // Same XYZ Euler composition as THREE.Euler, without importing THREE.
  return [
    cb*cc*x-cb*sc*y+sb*z+out.bodyOffset[0],
    (sa*sb*cc+ca*sc)*x+(-sa*sb*sc+ca*cc)*y-sa*cb*z+out.bodyOffset[1],
    (-ca*sb*cc+sa*sc)*x+(ca*sb*sc+sa*cc)*y+ca*cb*z+out.bodyOffset[2],
  ];
}

export function sampleHeroMotion(s = {}) {
  const time = Number.isFinite(s.time) ? s.time : 0;
  const tuning = s.variant && typeof s.variant === 'object' ? s.variant : {};
  const walk = clamp(s.locomotion ?? Math.abs(s.speed || 0) / 5.7);
  const stride = clamp(tuning.strideScale ?? HERO_MOTION_TUNING.strideScale, .65, 1.2);
  const strength = clamp(tuning.upperBodyStrength ?? HERO_MOTION_TUNING.upperBodyStrength, .7, 1.15);
  const phase = ((s.gaitPhase || 0) / TAU % 1 + 1) % 1;
  const gait = sample(GAIT, phase);
  let out = blend(ready(), gait, walk);
  for (const name of ['rightThigh','leftThigh','rightShin','leftShin']) out.rotations[name][0] *= stride;
  // Tiny breathing and cloth settling are secondary motion; gait and attacks
  // remain explicit authored poses. Quieter at full locomotion.
  const breath = Math.sin(time * 1.75) * (1 - .7 * walk);
  out.hipsOffset[1] += breath * .0017;
  out.rotations.chest[0] += breath * .006;
  out.rotations.head[0] -= breath * .004;
  out.rotations.cape[0] += walk * .10 + Math.sin(time * 2.7 - .8) * .014;
  out.rotations.capeHem[0] += walk * .13 + Math.sin(time * 2.7 - 1.5) * .025;
  out.rotations.capeHem[2] += Math.sin((s.gaitPhase || 0) - .9) * .025 * walk;
  const p = clamp(s.progress || 0);
  const tables = s.action === 'melee' ? [SWEEP, REVERSE, OVERHEAD][clamp(Math.round(s.comboStep || 0), 0, 2)] : s.action === 'whirl' ? WHIRL : s.action === 'cast' ? CAST : s.action === 'dodge' ? DODGE : s.action === 'ascend' ? ASCEND : null;
  // Loaded arm has a small restrained pendulum; the free hand keeps its gait.
  let handTarget=[...CARRY_HAND],weaponEuler=[...CARRY_WEAPON];
  handTarget[2]+=Math.sin(s.gaitPhase||0)*.018*walk;
  handTarget[1]+=Math.sin((s.gaitPhase||0)*2)*.004*walk;
  weaponEuler[0]+=Math.sin((s.gaitPhase||0)-.3)*.06*walk;
  if (tables) {
    const a = sample(tables, p);
    // Negative right-shoulder Z / positive left-shoulder Z draw both elbows
    // inward in this bind pose. Grip IK then supplies the final wrist positions.
    if(a.grip>.05){
      a.rotations.rightArm[2]=mix(a.rotations.rightArm[2],-.19,a.grip);
      a.rotations.leftArm[2]=mix(a.rotations.leftArm[2],.14,a.grip);
    }
    // The shoulder/hip deltas are layered over the displacement-driven walk so
    // holding movement during combat keeps the lower body alive for foot IK.
    const upperWalkDamp = 1 - .85 * Math.sin(p * Math.PI);
    for (const name of ['rightArm','leftArm','rightForearm','leftForearm']) out.rotations[name] = out.rotations[name].map((v,i) => mix(REST[name][i],v,upperWalkDamp));
    out = layer(out, a, walk, strength);
    if (s.action === 'whirl') out.bodyRotation[1] = a.bodyRotation[1]; // Always exactly one turn, regardless of strength.
    const delayed = sample(tables, Math.max(0,p - (tuning.capeDelay ?? HERO_MOTION_TUNING.capeDelay)));
    const twistLag = delayed.rotations.chest[1] - a.rotations.chest[1];
    out.rotations.cape[1] += clamp(twistLag * .28, -.16, .16);
    out.rotations.capeHem[1] += clamp(twistLag * .48, -.25, .25);
    if (s.action === 'dodge' && (tuning.dodgeSide ?? (typeof s.variant === 'number' && s.variant < 0 ? -1 : 1)) < 0) {
      out.hipsOffset[0] *= -1; out.bodyOffset[0] *= -1; out.bodyRotation[2] *= -1;
      for (const name of ['hips','spine','chest','head','cape','capeHem']) out.rotations[name][2] *= -1;
    }
    const pathName=s.action==='melee'?['sweep','reverse','overhead'][clamp(Math.round(s.comboStep||0),0,2)]:s.action;
    handTarget=sampleVectorPath(HAND_PATHS[pathName],p,tables);
    weaponEuler=sampleVectorPath(WEAPON_PATHS[pathName],p,tables);
    if(s.action==='dodge')handTarget[1]+=.024*Math.sin(p*Math.PI);
    // The support hand closes before the wind-up and holds through recovery.
    if(s.action==='melee'||s.action==='whirl')out.grip=smooth(clamp(p/.16))*(1-smooth(clamp((p-.76)/.24)));
    else out.grip=0;
  }
  const hit = clamp(s.hit || 0);
  out.rotations.chest[0] -= .20 * hit;
  out.rotations.head[0] -= .12 * hit;
  out.rotations.spine[2] += .035 * hit;
  out.hipsOffset[1] -= .012 * hit;
  out.bodyOffset[2] -= .018 * hit;
  const dead = clamp(s.dead || 0);
  if (dead > 0) {
    const collapse = sample(DEATH, dead);
    out = blend(out, collapse, smooth(clamp(dead / .16)));
    out.grip = 0;
  }
  // Limits protect generated skin envelopes; the caller's grip IK should solve
  // a reachable target rather than stretching an arm to an arbitrary hammer tip.
  for (const side of ['right','left']) {
    out.rotations[side+'Arm'][0] = clamp(out.rotations[side+'Arm'][0], -HERO_MOTION_TUNING.shoulderXLimit, .8);
    out.rotations[side+'Forearm'][0] = clamp(out.rotations[side+'Forearm'][0], -HERO_MOTION_TUNING.elbowXLimit, .18);
    out.rotations[side+'Hand'] = out.rotations[side+'Hand'].map(v => clamp(v,-HERO_MOTION_TUNING.wristLimit,HERO_MOTION_TUNING.wristLimit));
    out.rotations[side+'Shin'][0] = clamp(out.rotations[side+'Shin'][0],0,1.35);
  }
  out.grip = clamp(out.grip);
  if(handTarget&&dead===0)out.rightHandTarget=actorLocalTarget(handTarget,out);
  // Carry and casting retain orientation control after the support hand releases.
  if(weaponEuler&&dead===0)out.weaponRotation=composeWeaponRotation(out.bodyRotation,weaponEuler);
  if(s.action==='melee'&&dead===0)out=applyMeleeCapture(out,s);
  return out;
}
