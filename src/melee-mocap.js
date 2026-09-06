import * as T from 'three';
import capture from './motion/mixamo-combo.json' with {type:'json'};

const clamp=T.MathUtils.clamp;
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
export const MELEE_MOCAP=Object.freeze({source:capture.source,sourceFrames:107,clips:capture.clips.map(c=>c.name),contacts:[.48,.48,.55]});
const q=a=>new T.Quaternion(...a);
const v=a=>new T.Vector3(...a);
const euler=a=>new T.Quaternion().setFromEuler(new T.Euler(...a));
const asEuler=a=>new T.Euler().setFromQuaternion(a,'XYZ').toArray().slice(0,3);

// Resample the captured anticipation, impact and recovery independently so
// the hammer's contact still matches gameplay damage and the weapon trail.
export function sampleMeleeCapture(combo,progress){
 const step=clamp(Math.round(combo||0),0,2),c=capture.clips[step],p=clamp(progress,0,1),contact=MELEE_MOCAP.contacts[step];
 const frame=p<=contact?T.MathUtils.lerp(c.start,c.impact,p/contact):T.MathUtils.lerp(c.impact,c.end,(p-contact)/(1-contact));
 const index=clamp(frame-1,0,106),a=capture.frames[Math.floor(index)],b=capture.frames[Math.min(106,Math.floor(index)+1)],t=index%1;
 const rotations={};for(const name of Object.keys(a.rotations))rotations[name]=q(a.rotations[name]).slerp(q(b.rotations[name]),t);
 return {frame,rotations,hips:v(a.hips).lerp(v(b.hips),t),hand:v(a.hand).lerp(v(b.hand),t),weapon:q(a.weapon).slerp(q(b.weapon),t),rightPole:v(a.rightPole).lerp(v(b.rightPole),t),leftPole:v(a.leftPole).lerp(v(b.leftPole),t)};
}

export function applyMeleeCapture(pose,state){
 const p=clamp(state.progress||0,0,1),walk=clamp(state.locomotion??Math.abs(state.speed||0)/5.7,0,1);
 const weight=smooth(p/[.22,.28,.22][clamp(Math.round(state.comboStep||0),0,2)])*(1-smooth((p-.78)/.22));
 if(weight===0)return pose;
 const m=sampleMeleeCapture(state.comboStep,p);
 const sourceChest=m.rotations.hips.clone().multiply(m.rotations.spine).multiply(m.rotations.chest);
 const targetChest=new T.Quaternion();
 if(state.comboStep===2){
  // A short, head-heavy hammer needs a downward follow-through rather than
  // the long sword's late wrist roll. Keep the captured lift and hand path.
  const keys=[[0,3.05],[.14,.35],[.32,-.50],[.42,-.60],[.55,2.45],[.67,2.65],[.80,1.80],[1,3.05]];
  for(let i=1;i<keys.length;i++)if(p<=keys[i][0]){const a=keys[i-1],b=keys[i],t=smooth((p-a[0])/(b[0]-a[0]));m.weapon=euler([T.MathUtils.lerp(a[1],b[1],t),0,-.035]);break;}
  const impact=smooth((p-.40)/.15)*(1-smooth((p-.67)/.19));
  m.hand.y-=impact*.075;m.hips.y-=impact*.065;
 }
 // The generated armoured rig has a wider chest and shorter arms than X Bot.
 // Limit axial turns and blend lower-body capture with the running stride.
 for(const [name,rotation] of Object.entries(m.rotations)){
  const r=new T.Euler().setFromQuaternion(rotation,'YXZ');
  if(name==='hips'){r.x=clamp(r.x,-.20,.32);r.y=clamp(r.y,-.85,.85);r.z=clamp(r.z,-.14,.14);}
  if(name==='spine'||name==='chest'){r.x=clamp(r.x,-.28,.38);r.y=clamp(r.y,-.65,.65);r.z=clamp(r.z,-.16,.16);}
  if(name==='head'){r.x=clamp(r.x,-.30,.30);r.y=clamp(r.y,-.65,.65);r.z=clamp(r.z,-.20,.20);}
  const lower=/Thigh|Shin|Foot/.test(name),w=weight*(lower?1-walk*.8:1);
  const targetRotation=new T.Quaternion().setFromEuler(r);
  if(['hips','spine','chest'].includes(name))targetChest.multiply(targetRotation);
  pose.rotations[name]=asEuler(euler(pose.rotations[name]).slerp(targetRotation,w));
 }
 // When a captured torso turn is compressed for plate armour, bring its hands
 // with it. Otherwise a full-spin hand target stays behind the shortened turn.
 const correction=targetChest.multiply(sourceChest.invert());
 m.hand.sub(new T.Vector3(0,.67,0)).applyQuaternion(correction).add(new T.Vector3(0,.67,0));
 if(state.comboStep!==2)m.weapon.premultiply(correction);
 pose.hipsOffset=v(pose.hipsOffset).lerp(m.hips,weight).toArray();
 pose.bodyRotation=pose.bodyRotation.map(a=>a*(1-weight));
 pose.bodyOffset=pose.bodyOffset.map(a=>a*(1-weight));
 m.hand.y=Math.max(.535,m.hand.y+.025);
 pose.rightHandTarget=v(pose.rightHandTarget).lerp(m.hand,weight).toArray();
 pose.weaponRotation=asEuler(euler(pose.weaponRotation).slerp(m.weapon,weight));
 pose.mocapWeight=weight;pose.mocapFrame=m.frame;
 pose.grip=weight;
 return pose;
}
