import * as THREE from 'three';
import { sampleHeroMotion } from './hero-motion.js';
import { sampleUndeadMotion } from './undead-motion.js';

const clamp=THREE.MathUtils.clamp, TAU=Math.PI*2;
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};

// Two-bone analytic IK. The elbow/knee pole and target are both world-space.
// Rotating the existing bind directions avoids assuming a T-pose or a bone axis.
function solveLimb(upper,lower,end,target,pole,weight=1,rollReference=null){
 const start=upper.getWorldPosition(new THREE.Vector3());
 const mid=lower.getWorldPosition(new THREE.Vector3());
 const tip=end.getWorldPosition(new THREE.Vector3());
 const a=start.distanceTo(mid),b=mid.distanceTo(tip);
 const direction=target.clone().sub(start),length=direction.length();
 if(length<.0001||a<.0001||b<.0001)return;
 direction.normalize();
 const d=clamp(length,Math.abs(a-b)+.0001,(a+b)*.998);
 const toward=pole.clone().sub(start);toward.addScaledVector(direction,-toward.dot(direction));
 if(toward.lengthSq()<.00001)toward.set(0,0,1).addScaledVector(direction,-direction.z);
 toward.normalize();
 const along=(a*a-b*b+d*d)/(2*d),height=Math.sqrt(Math.max(0,a*a-along*along));
 const elbow=start.clone().addScaledVector(direction,along).addScaledVector(toward,height);
 const goal=start.clone().addScaledVector(direction,d);
 function aim(bone,child,point){
  const origin=bone.getWorldPosition(new THREE.Vector3());
  const current=child.getWorldPosition(new THREE.Vector3()).sub(origin).normalize();
  const desired=point.clone().sub(origin).normalize();
  let q;
  if(rollReference){
   // The elbow bend plane defines roll for both arm segments. Unlike a fixed
   // reference axis, its normal is perpendicular to every solved limb pose.
   const localAxis=child.position.clone().normalize();
   const localSide=new THREE.Vector3().crossVectors(lower.position,end.position).normalize();
   const worldSide=new THREE.Vector3().crossVectors(toward,direction).normalize();
   const bindFrame=new THREE.Matrix4().makeBasis(localAxis,localSide,new THREE.Vector3().crossVectors(localAxis,localSide));
   const worldFrame=new THREE.Matrix4().makeBasis(desired,worldSide,new THREE.Vector3().crossVectors(desired,worldSide));
   q=new THREE.Quaternion().setFromRotationMatrix(worldFrame.multiply(bindFrame.transpose()));
  }else {
   q=new THREE.Quaternion().setFromUnitVectors(current,desired);
   q.multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
  }
  q.premultiply(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert());
  bone.quaternion.slerp(q,weight);bone.updateWorldMatrix(false,true);
 }
 aim(upper,lower,elbow);aim(lower,end,goal);
}

export function createMotionController({kind,root,pose,rig,bones,desc,h,hammer}){
 const joints=Object.fromEntries(desc.map(d=>[d.name,new THREE.Vector3(...d.p).multiplyScalar(h)]));
 const baseHips=rig.hips.position.clone();
 const variant=Math.random()>.5?1:0,phaseOffset=Math.random()*TAU;
 let gaitPhase=phaseOffset,locomotion=0,lastKey='',blendAge=1,previousDead=0;
 let fromRotations=bones.map(b=>b.quaternion.clone());
 let fromRightTarget=null,fromRightPole=null,fromWeaponRotation=null,fromRightPalmRotation=null,carryPalmFrame=null;
 const euler=new THREE.Euler(),quaternion=new THREE.Quaternion();
 const gaitProfiles={zombie:{speed:1.8,stride:.78,lift:.073},forsaken:{speed:2,stride:.86,lift:.08},abomination:{speed:1.2,stride:.64,lift:.055},dreadlord:{speed:1.55,stride:.76,lift:.065}};
 const gait=gaitProfiles[kind]||gaitProfiles.zombie;
 const normalSpeed=kind==='arthas'?5.3:gait.speed;
 const cycleDistance=h*(kind==='arthas'?1.08:gait.stride);
 const toWorld=v=>root.localToWorld(new THREE.Vector3(...v).multiplyScalar(h));
 function update(dt,state={}){
  let footError=0,gripError=0,stanceDrop=0;
  dt=Math.max(0,Math.min(dt,.1));
  const dead=clamp(state.dead||0,0,1),speed=Math.max(0,Math.abs(state.speed||0));
  if(state.reset||(previousDead>0&&dead===0)){locomotion=0;gaitPhase=phaseOffset;lastKey='';}
  previousDead=dead;
  const action=state.action||(state.attack>0?(kind==='arthas'?'melee':'attack'):'idle');
  const progress=clamp(state.progress??state.attack??0,0,1);
  if(dead===0)gaitPhase+=speed*dt/(cycleDistance*(kind==='arthas'?1:Math.max(.001,root.scale.y)))*TAU;
  locomotion=THREE.MathUtils.lerp(locomotion,clamp(speed/normalSpeed,0,1),1-Math.exp(-dt*14));
  if(state.gaitPhase!==undefined)gaitPhase=state.gaitPhase;
  if(state.locomotion!==undefined)locomotion=state.locomotion;
  const input={...state,time:state.time??0,dt,gaitPhase,locomotion,speed,action,progress,dead,variant:state.variant??variant};
  const sampled=kind==='arthas'?sampleHeroMotion(input):sampleUndeadMotion(kind,input);
  const key=dead>0?'dead':`${action}:${action==='melee'?state.comboStep||0:0}`;
  if(key!==lastKey){
   if(lastKey&&kind==='arthas'&&hammer){
    root.updateWorldMatrix(true,true);
    fromRightTarget=root.worldToLocal(rig.rightHand.getWorldPosition(new THREE.Vector3())).divideScalar(h);
    fromRightPole=root.worldToLocal(rig.rightForearm.getWorldPosition(new THREE.Vector3())).divideScalar(h);
    fromWeaponRotation=root.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(hammer.getWorldQuaternion(new THREE.Quaternion()));
    fromRightPalmRotation=root.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rig.rightHand.getWorldQuaternion(new THREE.Quaternion()));
   }else {fromRightTarget=null;fromRightPole=null;fromWeaponRotation=null;fromRightPalmRotation=null;}
   fromRotations=bones.map(b=>b.quaternion.clone());blendAge=0;lastKey=key;
  }
  blendAge+=dt;const blend=state.immediate?1:smooth(blendAge/(dead>0?.08:.075));
  bones.forEach((bone,i)=>{
   euler.set(...(sampled.rotations[bone.name]||[0,0,0]));quaternion.setFromEuler(euler);
   bone.quaternion.copy(fromRotations[i]).slerp(quaternion,blend);
  });
  rig.hips.position.copy(baseHips).add(new THREE.Vector3(...(sampled.hipsOffset||[0,0,0])).multiplyScalar(h));
  pose.position.fromArray(sampled.bodyOffset||[0,0,0]).multiplyScalar(h);
  pose.rotation.set(...(sampled.bodyRotation||[0,0,0]));
  root.updateWorldMatrix(true,true);

  // A stance foot travels backwards at the exact world travel rate. During the
  // other half cycle it lifts and returns, with separate dragging/heavy profiles.
  if(dead===0&&(kind!=='arthas'||action==='idle'||(action==='melee'&&(locomotion>.15||sampled.mocapWeight>0)))){
   const stance=kind==='arthas'?.52:kind==='zombie'?.63:.63;
   const stride=cycleDistance*.25/h;
   const feet=[];
   for(const [side,shift,sign] of [['right',0,1],['left',.5,-1]]){
    const c=((gaitPhase/TAU+shift)%1+1)%1;
    let z,y;
    if(c<stance){z=stride*(1-2*c/stance);y=0;}
    else {const swing=(c-stance)/(1-stance);z=THREE.MathUtils.lerp(-stride,stride,smooth(swing));y=Math.sin(swing*Math.PI)*(kind==='arthas'?.105:kind==='zombie'&&side==='left'?.025:gait.lift);}
    const bind=joints[side+'Foot'].clone().divideScalar(h);
    const drag=kind==='zombie'&&side==='left'?.72:1;
    const extraWidth=kind==='abomination'?.022:0;
    const plant=(sampled.mocapWeight||0)*(1-locomotion)*sign*(state.comboStep===1?-.065:.065);
    const target=toWorld([bind.x+sign*extraWidth,bind.y+y*locomotion,bind.z+z*locomotion*drag+plant]);
    const pole=toWorld([bind.x+sign*.02,.28,.55]);
    const footPitch=c>stance?Math.sin((c-stance)/(1-stance)*Math.PI)*(kind==='zombie'&&side==='left'?.10:.32):0;
    feet.push({side,target,pole,footPitch});
   }
   // A wide step requires a lower pelvis. Without this reach correction an IK
   // solver merely clamps the leg, leaving the forward boot floating in the air.
   let drop=0;
   for(const {side,target} of feet){
    const hip=rig[side+'Thigh'].getWorldPosition(new THREE.Vector3());
    const knee=rig[side+'Shin'].getWorldPosition(new THREE.Vector3());
    const ankle=rig[side+'Foot'].getWorldPosition(new THREE.Vector3());
    const length=(hip.distanceTo(knee)+knee.distanceTo(ankle))*.985;
    const horizontal=(hip.x-target.x)**2+(hip.z-target.z)**2;
    drop=Math.max(drop,hip.y-target.y-Math.sqrt(Math.max(.01,length*length-horizontal)));
   }
   const rootScale=root.getWorldScale(new THREE.Vector3()).y;
   stanceDrop=clamp(drop/rootScale,0,h*.18);
   rig.hips.position.y-=stanceDrop;root.updateWorldMatrix(true,true);
   for(const {side,target,pole,footPitch} of feet){
    solveLimb(rig[side+'Thigh'],rig[side+'Shin'],rig[side+'Foot'],target,pole);
    const groundOrientation=root.getWorldQuaternion(new THREE.Quaternion());
    groundOrientation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),footPitch*locomotion));
    const parentRotation=rig[side+'Foot'].parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    rig[side+'Foot'].quaternion.copy(parentRotation.multiply(groundOrientation));
    rig[side+'Foot'].updateWorldMatrix(false,true);
    footError=Math.max(footError,rig[side+'Foot'].getWorldPosition(new THREE.Vector3()).distanceTo(target));
   }
  }
  if(kind==='arthas'&&hammer&&dead===0){
   // Weapon carry is independent of the support hand. A relaxed right hand
   // still owns the weapon when the left hand releases it or casts a spell.
   const grip=clamp(sampled.grip||0,0,1);
   const armRoll=new THREE.Vector3(1,0,0).applyQuaternion(pose.getWorldQuaternion(new THREE.Quaternion()));
   const elbowFrame=pose.getWorldQuaternion(new THREE.Quaternion());
   if(sampled.mocapWeight)elbowFrame.slerp(rig.chest.getWorldQuaternion(new THREE.Quaternion()),sampled.mocapWeight);
   let rightTarget,rightPole,weaponLocal;
   if(sampled.rightHandTarget){
    const localTarget=new THREE.Vector3(...sampled.rightHandTarget);
    // The loaded hand follows the lowered running stance. A fixed world-height
    // target would leave the fist up by the shoulder on a long stride.
    if(action==='idle')localTarget.y-=stanceDrop/h*.75;
    if(fromRightTarget&&blend<1)localTarget.lerpVectors(fromRightTarget,localTarget,blend);
    rightTarget=toWorld(localTarget.toArray());
    // Arm poles turn with the torso during Q. A fixed world pole makes elbows
    // reverse halfway through a full spin.
    const poleOffset=action==='idle'?new THREE.Vector3(.09,-.20,-.125):new THREE.Vector3(.13+.17*grip,-.13-.04*grip,-.125+.04*grip);
    rightPole=rig.rightArm.getWorldPosition(new THREE.Vector3()).add(poleOffset.multiplyScalar(h).applyQuaternion(elbowFrame));
    if(sampled.rightElbowTarget)rightPole.lerp(toWorld(sampled.rightElbowTarget),sampled.mocapWeight||0);
    if(fromRightPole&&blend<1)rightPole.lerpVectors(toWorld(fromRightPole.toArray()),rightPole,blend);
    solveLimb(rig.rightArm,rig.rightForearm,rig.rightHand,rightTarget,rightPole,1,armRoll);
   }
   function placeHammer(){
    root.updateWorldMatrix(true,true);
    if(action==='idle'&&weaponLocal){
     // Calibrate against this model's relaxed fist once. Keep the palm aligned
     // with its handle while the walking IK raises/lowers the shoulder; allowing
     // the forearm's bend plane to dictate grip roll made the wrist flip.
     const rootRotation=root.getWorldQuaternion(new THREE.Quaternion());
     if(!carryPalmFrame)carryPalmFrame=weaponLocal.clone().invert().multiply(rootRotation.clone().invert()).multiply(rig.rightHand.getWorldQuaternion(new THREE.Quaternion()));
     const palmLocal=weaponLocal.clone().multiply(carryPalmFrame);
     if(fromRightPalmRotation&&blend<1)palmLocal.copy(fromRightPalmRotation.clone().slerp(palmLocal,blend));
     const wristRotation=rig.rightHand.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(rootRotation).multiply(palmLocal);
     rig.rightHand.quaternion.copy(wristRotation);rig.rightHand.updateWorldMatrix(false,true);
    }
    const desired=root.getWorldQuaternion(new THREE.Quaternion()).multiply(weaponLocal);
    desired.premultiply(rig.rightHand.getWorldQuaternion(new THREE.Quaternion()).invert());
    hammer.quaternion.copy(desired);
    // Right palm holds slightly above the pommel. This leaves ground clearance
    // with a relaxed arm, without shortening the existing weapon.
    hammer.position.set(-.006*h,-.022*h,.006*h).sub(new THREE.Vector3(0,.035*h,0).applyQuaternion(desired));
    hammer.updateWorldMatrix(false,true);
   }
   if(sampled.weaponRotation){
    const weaponEuler=new THREE.Euler(...sampled.weaponRotation);
    // Let the heavy head trail a little farther back as the knees compress,
    // preserving ground clearance with the original full-size hammer.
    if(action==='idle')weaponEuler.x+=stanceDrop/h*2.7;
    weaponLocal=new THREE.Quaternion().setFromEuler(weaponEuler);
    if(fromWeaponRotation&&blend<1)weaponLocal.copy(fromWeaponRotation.clone().slerp(weaponLocal,blend));
    placeHammer();
   }
   function keepHammerAboveGround(){
    if(!rightTarget||!weaponLocal)return;
    for(let pass=0;pass<5;pass++){
    let floor=Infinity;
    // The quarter-turned head is narrow on X and long on Z.
    for(const x of [-.1,.1])for(const y of [.318,.5025])for(const z of [-.19,.19])floor=Math.min(floor,hammer.localToWorld(new THREE.Vector3(x*h,y*h,z*h)).y);
    const ground=root.getWorldPosition(new THREE.Vector3()).y+.018;
    if(floor<ground){
     rightTarget.y+=ground-floor;
     solveLimb(rig.rightArm,rig.rightForearm,rig.rightHand,rightTarget,rightPole,1,armRoll);
     placeHammer();
    }else break;
    }
   }
   if(grip>.01){
    // Fit the shared handle into BOTH arm reaches before solving the support
    // palm. Keeping a bent elbow avoids the straight-arm IK branch flipping.
    const shoulderR=rig.rightArm.getWorldPosition(new THREE.Vector3());
    const shoulderL=rig.leftArm.getWorldPosition(new THREE.Vector3());
    const limbLength=(side)=>rig[side+'Forearm'].position.length()+rig[side+'Hand'].position.length();
    const actorScale=root.getWorldScale(new THREE.Vector3()).x;
    const reachR=limbLength('right')*actorScale*.965,reachL=limbLength('left')*actorScale*.945;
    const authoredTarget=rightTarget?.clone();
    for(let i=0;i<10&&rightTarget&&weaponLocal;i++){
     const support=hammer.localToWorld(new THREE.Vector3(0,.15*h,0));
     const offset=new THREE.Vector3(.005*h,-.023*h,.020*h).applyQuaternion(rig.leftHand.getWorldQuaternion(new THREE.Quaternion()));
     const delta=support.sub(offset).sub(shoulderL);
     const excess=Math.max(0,delta.length()-reachL);
     const shift=excess?delta.setLength(excess):new THREE.Vector3();
     rightTarget.sub(shift);
     const reach=rightTarget.clone().sub(shoulderR);
     if(reach.length()>reachR)rightTarget.copy(shoulderR).add(reach.setLength(reachR));
     solveLimb(rig.rightArm,rig.rightForearm,rig.rightHand,rightTarget,rightPole,1,armRoll);
     placeHammer();
     if(excess<.0001)break;
    }
    if(authoredTarget&&grip<1){
     rightTarget.lerpVectors(authoredTarget,rightTarget,grip);
     solveLimb(rig.rightArm,rig.rightForearm,rig.rightHand,rightTarget,rightPole,1,armRoll);
     placeHammer();
    }
    keepHammerAboveGround();
    root.updateWorldMatrix(true,true);
    const target=hammer.localToWorld(new THREE.Vector3(0,.15*h,0));
    const pole=rig.leftArm.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(-.26,-.23,.075).multiplyScalar(h).applyQuaternion(elbowFrame));
    if(sampled.leftElbowTarget)pole.lerp(toWorld(sampled.leftElbowTarget),sampled.mocapWeight||0);
    // Match palm centres, not cuff/wrist joints. Preserve the sampled wrist
    // curl while solving the arm; two refinements account for the palm offset.
    for(let i=0;i<3;i++){
     const palmOffset=new THREE.Vector3(.005*h,-.023*h,.020*h).applyQuaternion(rig.leftHand.getWorldQuaternion(new THREE.Quaternion()));
     solveLimb(rig.leftArm,rig.leftForearm,rig.leftHand,target.clone().sub(palmOffset),pole,grip,armRoll);
    }
    const palm=rig.leftHand.localToWorld(new THREE.Vector3(.005*h,-.023*h,.020*h));
    gripError=palm.distanceTo(target);
   }else keepHammerAboveGround();
  }
  root.updateWorldMatrix(true,true);
  root.userData.motion={action,progress,comboStep:state.comboStep||0,gaitPhase,locomotion,dead,grip:sampled.grip||0,footError,gripError,...(sampled.mocapFrame?{mocapFrame:sampled.mocapFrame}: {})};
  return {dead,hit:clamp(state.hit||0,0,1),fade:clamp(state.fade||0,0,1)};
 }
 return {update};
}
