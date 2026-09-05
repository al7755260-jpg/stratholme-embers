import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RELICS } from './survival.js';

const TAU=Math.PI*2,clamp=T.MathUtils.clamp;
const LIMIT=120,MAX_CHAIN=8;
const CONFIG=Object.freeze({
  crate:{hp:42,w:1.05,d:1.05,h:1.08,material:'wood',chips:12},
  barrel:{hp:55,w:1.10,d:1.10,h:1.35,material:'wood',chips:15},
  oil:{hp:52,w:1.14,d:1.14,h:1.38,material:'metal',chips:16},
  barricade:{hp:100,w:2.35,d:.95,h:1.38,material:'wood',chips:19},
  wagon:{hp:160,w:2.50,d:5.10,h:1.88,cz:.90,material:'wood',chips:30},
  grave:{hp:85,w:.86,d:.62,h:1.45,material:'stone',chips:12},
  pedestal:{hp:140,w:1.12,d:1.05,h:1.83,material:'stone',chips:17},
  relic:{hp:76,w:1.15,d:1.15,h:2.40,material:'stone',chips:22},
});

// Roads: x +/-6; square +/-14; east passage z +/-6. Keep the central
// north/south combat lane more than five metres wide, including the demo props.
const placements=[
 ['crate',-3.65,19.5,.12],['oil',3.65,18.4,-.13],['barrel',4.95,18.5,.2],['crate',4.70,16.9,-.1],
 ['crate',-5.10,24,.07],['barrel',-5.15,22.4,.1],['crate',5.10,25,-.1],['barrel',5.15,23.4,-.1],
 ['barricade',-4.5,14,.10],['barrel',-5.15,10.2,.2],['grave',-5.05,7.6,Math.PI/2],['pedestal',5.0,10,-Math.PI/2],
 ['crate',-5.1,4.7,.15],['oil',5.12,5.1,.3],['barricade',4.45,1.2,.08],['grave',-5.1,.8,Math.PI/2],
 ['wagon',-12,-7,.2],['wagon',13,-10,-.1],['oil',-10.5,-3,.2],['crate',-12.5,-1.8,.3],
 ['barrel',-12.3,-10.6,.1],['grave',-12.4,-17.8,Math.PI/2],['pedestal',-12,-23.3,.2],['barricade',-8.8,-24.7,.0],
 ['crate',-4,-24.8,.1],['oil',1.2,-24.8,.2],['barrel',2.6,-24.8,-.2],['crate',4,-24.8,-.07],
 ['grave',8,-24.7,.05],['crate',12.4,-23.2,.2],['oil',12.4,-20.3,.3],['barrel',12.4,-18.8,.1],
 ['grave',12.4,-15.7,-Math.PI/2],['crate',10.4,-7,.17],['barricade',17.7,-4.6,.05],['crate',20,4.8,.1],
 ['barrel',22.3,4.8,.1],['oil',27.8,-4.8,.1],['crate',29,-4.8,-.1],['barricade',29.5,-10,Math.PI/2],
 ['grave',30.5,-13.9,-.2],['crate',23.5,-13.5,.2],['oil',5.5,-24.8,-.1],
];
export const DESTRUCTIBLE_LAYOUT=Object.freeze([...placements.map(([kind,x,z,rotation],i)=>Object.freeze({id:`d${String(i+1).padStart(2,'0')}-${kind}`,kind,x,z,rotation})),...RELICS]);

function makeGrain(){
 const side=64,data=new Uint8Array(side*side*4);let seed=91517;
 for(let y=0;y<side;y++)for(let x=0;x<side;x++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const grain=Math.sin(x*.78+Math.sin(y*.09)*.8)*19+Math.sin(x*2.8+y*.021)*10;
  const n=clamp(204+grain+(seed/4294967296-.5)*28,145,250),i=(y*side+x)*4;
  data[i]=n;data[i+1]=n;data[i+2]=n;data[i+3]=255;
 }
 const texture=new T.DataTexture(data,side,side);texture.colorSpace=T.SRGBColorSpace;
 texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.magFilter=T.NearestFilter;texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;return texture;
}

function makeTemplate(kind,materials){
 const buckets=new Map(),transform=new T.Object3D();
 function part(geometry,material,x=0,y=0,z=0,rx=0,ry=0,rz=0){
  transform.position.set(x,y,z);transform.rotation.set(rx,ry,rz);transform.scale.set(1,1,1);transform.updateMatrix();
  if(!geometry.index)geometry.setIndex(Array.from({length:geometry.attributes.position.count},(_,i)=>i));
  geometry.applyMatrix4(transform.matrix);if(!buckets.has(material))buckets.set(material,[]);buckets.get(material).push(geometry);
 }
 const box=(w,h,d,x,y,z,material,rx=0,ry=0,rz=0)=>part(new T.BoxGeometry(w,h,d),material,x,y,z,rx,ry,rz);
 const cyl=(r1,r2,h,x,y,z,material,n=12,rx=0,ry=0,rz=0)=>part(new T.CylinderGeometry(r1,r2,h,n),material,x,y,z,rx,ry,rz);
 function beam(a,b,w,d,material){const v=new T.Vector3(...b).sub(new T.Vector3(...a)),g=new T.BoxGeometry(w,v.length(),d);g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),v.normalize()));part(g,material,...a.map((v,i)=>(v+b[i])/2));}
 if(kind==='crate'){
  box(1.01,1.03,1.01,0,.525,0,'wood');
  for(const y of [.13,.93])box(1.08,.14,1.08,0,y,0,'darkWood');
  for(const x of [-.43,.43])for(const z of [-.526,.526])box(.13,1.06,.07,x,.54,z,'darkWood');
  for(const z of [-.563,.563])beam([-.42,.20,z],[.42,.87,z],.10,.06,'lightWood');
  for(const x of [-.40,.40])for(const y of [.15,.92])cyl(.025,.025,.045,x,y,.605,'metal',6,Math.PI/2);
 }else if(kind==='barrel'||kind==='oil'){
  const oil=kind==='oil',body=oil?'red':'wood';
  cyl(.47,.52,.66,0,.37,0,body);cyl(.52,.47,.65,0,1.02,0,body);
  for(const y of [.15,.69,1.20])part(new T.TorusGeometry(y===.69?.53:.49,.037,4,12),'metal',0,y,0,Math.PI/2);
  cyl(.46,.46,.055,0,1.37,0,'darkWood');cyl(.475,.475,.06,0,.025,0,'darkWood');
  for(let i=0;i<12;i++){const a=i*TAU/12;box(.018,1.12,.018,Math.sin(a)*.489,.72,Math.cos(a)*.489,'darkWood');}
  if(oil){
   box(.32,.32,.025,0,.93,.507,'ochre',0,0,Math.PI/4);
   box(.055,.18,.025,0,.94,.543,'charcoal');box(.055,.045,.027,0,.80,.543,'charcoal');
   cyl(.095,.095,.035,.17,1.407,0,'metal',8);cyl(.03,.03,.06,.17,1.44,0,'ember',6);
  }
 }else if(kind==='barricade'){
  for(const x of [-.86,.86]){
   beam([x,.05,-.43],[x,1.15,.23],.15,.17,'darkWood');beam([x,.05,.43],[x,1.15,-.23],.15,.17,'darkWood');
  }
  for(const y of [.63,1.05])box(2.32,.26,.14,0,y,.05,'wood',0,0,y>.8?-.035:.025);
  beam([-1.05,.49,.17],[1.05,1.18,.17],.12,.10,'lightWood');
  for(const x of [-.88,0,.88])part(new T.ConeGeometry(.077,.37,4),'charcoal',x,1.31,.01,0,Math.PI/4);
  for(const x of [-.9,.9])for(const y of [.63,1.05])cyl(.04,.04,.055,x,y,.15,'metal',6,Math.PI/2);
 }else if(kind==='wagon'){
  for(let x=-.80;x<.9;x+=.27)box(.245,.13,3.08,x,.85,0,'darkWood');
  for(const x of [-.95,.95]){
   for(const y of [1.03,1.31,1.59])box(.15,.23,3.05,x,y,0,'wood');
   for(const z of [-1.29,1.29])box(.20,1.12,.20,x,1.14,z,'darkWood');
  }
  for(const y of [1.03,1.31,1.59])box(1.88,.23,.14,0,y,-1.48,'wood');
  for(const z of [-.94,.94]){
   box(2.48,.13,.14,0,.60,z,'metal');
   for(const x of [-1.12,1.12]){
    part(new T.TorusGeometry(.51,.071,5,12),'darkWood',x,.55,z,0,Math.PI/2);
    part(new T.TorusGeometry(.54,.025,4,12),'metal',x,.55,z,0,Math.PI/2);
    cyl(.12,.12,.26,x,.55,z,'metal',8,0,0,Math.PI/2);
    for(let i=0;i<4;i++){const a=i*Math.PI/4;beam([x,.55-Math.sin(a)*.46,z-Math.cos(a)*.46],[x,.55+Math.sin(a)*.46,z+Math.cos(a)*.46],.07,.07,'lightWood');}
   }
  }
  for(const x of [-.52,.52])beam([x,.84,1.35],[x,.35,3.42],.115,.13,'darkWood');
  box(1.38,.32,.68,0,1.10,-.60,'charcoal');box(.76,.58,.70,.25,1.31,.39,'wood',0,.13);
 }else if(kind==='grave'){
  box(.84,.17,.60,0,.10,0,'darkStone');box(.67,.15,.44,0,.24,0,'stone');
  box(.58,.98,.23,0,.78,0,'stone',0,0,-.035);cyl(.29,.29,.235,0,1.24,0,'stone',10,Math.PI/2);
  box(.075,.43,.022,0,1.05,.132,'charcoal');box(.28,.067,.024,0,1.13,.135,'charcoal');
  for(const y of [.48,.56,.64])box(.32,.022,.015,0,y,.13,'darkStone');
 }else if(kind==='relic'){
  box(1.13,.20,1.13,0,.11,0,'darkStone');box(.94,.13,.94,0,.28,0,'relicGold');
  box(.68,.72,.68,0,.68,0,'stone');box(.88,.14,.88,0,1.09,0,'relicGold');
  for(const x of [-.41,.41])for(const z of [-.41,.41]){
   box(.09,1.15,.09,x,.74,z,'relicGold');
   part(new T.ConeGeometry(.14,.30,4),'relicGold',x,1.41,z,0,Math.PI/4);
  }
  part(new T.OctahedronGeometry(.43,0),'sacred',0,1.78,0,0,Math.PI/4);
  box(.065,.50,.024,0,.72,.353,'sacred');box(.31,.065,.025,0,.81,.355,'sacred');
  for(let i=0;i<4;i++){const a=i*TAU/4;beam([Math.sin(a)*.16,2.12,Math.cos(a)*.16],[Math.sin(a)*.31,2.33,Math.cos(a)*.31],.035,.035,'sacred');}
 }else if(kind==='pedestal'){
  box(1.10,.19,1.02,0,.10,0,'darkStone');box(.91,.15,.86,0,.26,0,'stone');
  box(.69,.91,.63,0,.80,0,'stone');box(.92,.16,.86,0,1.34,0,'darkStone');
  cyl(.19,.28,.29,0,1.55,0,'stone',6);part(new T.IcosahedronGeometry(.20,0),'stone',.015,1.76,.016,0,.45,.12);
  for(const x of [-.38,.38])box(.075,.84,.075,x,.79,.35,'darkStone');
  box(.26,.29,.019,0,.84,.334,'charcoal',0,0,Math.PI/4);box(.06,.37,.021,0,.84,.349,'ochre');
 }
 const d=CONFIG[kind],front=kind==='wagon'?.747:kind==='barricade'?.135:kind==='grave'?.133:kind==='pedestal'?.335:d.d*.51;
 // Dark slits appear after damage. They are a separate instanced layer, so
 // damaging one barrel cannot change every barrel's shared material.
 const crackX=kind==='wagon'?.25:0,base=kind==='wagon'?1.30:d.h*.52;
 beam([crackX-.15,base+.24,front+.008],[crackX+.02,base,front+.008],.028,.014,'crack');
 beam([crackX+.02,base,front+.008],[crackX-.09,base-.25,front+.008],.028,.014,'crack');
 beam([crackX+.01,base+.01,front+.009],[crackX+.20,base-.13,front+.009],.018,.014,'crack');
 const result=[];
 for(const [key,parts]of buckets){
  const geometry=mergeGeometries(parts,false);for(const g of parts)g.dispose();
  if(geometry)result.push({geometry,material:materials[key],crack:key==='crack'});
 }
 return result;
}

function fadeMaterial(material){
 material.transparent=true;material.depthWrite=false;
 material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float instanceFade;\nvarying float vInstanceFade;');
  shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvInstanceFade=instanceFade;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vInstanceFade;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a*=vInstanceFade;');
 };
 material.customProgramCacheKey=()=>`destructible-instance-fade-${material.type}`;return material;
}

export function createDestructibles(parent){
 const root=new T.Group();root.name='DestructibleStreetProps';parent.add(root);
 const grain=makeGrain();
 const standard=(color,roughness=.88,metalness=0,map=null)=>new T.MeshStandardMaterial({color,roughness,metalness,map});
 const materials={wood:standard(0xa08052,.94,0,grain),lightWood:standard(0xb29463,.9,0,grain),darkWood:standard(0x514130,.95,0,grain),
  metal:standard(0x41484a,.52,.70),stone:standard(0x95998b,.96),darkStone:standard(0x5d6561,.96),red:standard(0x8a3d24,.80,.14,grain),
  charcoal:standard(0x292621),ochre:standard(0xc19140,.73,.18),crack:standard(0x201c17),ember:new T.MeshStandardMaterial({color:0xfa8937,emissive:0xff661b,emissiveIntensity:1.15,roughness:.8}),
  relicGold:standard(0xc99b44,.55,.4),sacred:new T.MeshStandardMaterial({color:0xf9e7a9,emissive:0xffc752,emissiveIntensity:1.5,roughness:.5})};
 const prototypes=new Map(),props=[],events=[],pool=[],batches=[];
 let revision=0,obstacleCache=[],disposed=false,randomState=16061,clock=0,oilExplosions=0,fragmentSerial=0;
 const random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;};
 const range=(a,b)=>a+(b-a)*random();
 const transform=new T.Object3D(),tint=new T.Color(),zero=new T.Matrix4().makeScale(0,0,0),directionScratch=new T.Vector3();
 const rotationMatrix=new T.Matrix4(),physicsEuler=new T.Euler();
 const counts=Object.fromEntries(Object.keys(CONFIG).map(k=>[k,DESTRUCTIBLE_LAYOUT.filter(p=>p.kind===k).length]));
 for(const kind of Object.keys(CONFIG)){
  const entries=makeTemplate(kind,materials).map(({geometry,material,crack})=>{
   const mesh=new T.InstancedMesh(geometry,material,counts[kind]);mesh.name=`${kind}-${crack?'damage':'body'}`;mesh.frustumCulled=false;
   mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.castShadow=!crack;mesh.receiveShadow=true;root.add(mesh);
   const entry={mesh,crack,dirty:false};batches.push(entry);return entry;
  });prototypes.set(kind,entries);
 }
 const used={};
 for(const placement of DESTRUCTIBLE_LAYOUT){
  const d=CONFIG[placement.kind],p={...placement,...d,maxHp:d.hp,alive:true,slot:used[placement.kind]||0,hurt:0,impulseX:0,impulseZ:0,dirty:true,attackIds:new Set(),brightness:.88+random()*.20};
  used[p.kind]=p.slot+1;
  const co=Math.cos(p.rotation),si=Math.sin(p.rotation),cx=p.x+si*(p.cz||0),cz=p.z+co*(p.cz||0);
  const ex=Math.abs(co)*p.w*.5+Math.abs(si)*p.d*.5,ez=Math.abs(si)*p.w*.5+Math.abs(co)*p.d*.5;
  p.box=Object.freeze([cx-ex,cx+ex,cz-ez,cz+ez]);props.push(p);
 }
 const fragmentMaterials=[fadeMaterial(standard(0xffffff,.90,.10)),fadeMaterial(new T.MeshBasicMaterial({color:0xffffff,blending:T.AdditiveBlending})),fadeMaterial(new T.MeshBasicMaterial({color:0xffffff}))];
 const fragmentGeometries=[new T.BoxGeometry(1,1,1),new T.IcosahedronGeometry(.5,0),new T.IcosahedronGeometry(.5,0)];
 const fragmentMeshes=fragmentGeometries.map((geometry,i)=>{
  geometry.setAttribute('instanceFade',new T.InstancedBufferAttribute(new Float32Array(LIMIT),1).setUsage(T.DynamicDrawUsage));
  const mesh=new T.InstancedMesh(geometry,fragmentMaterials[i],LIMIT);mesh.name=['WoodAndStoneDebris','ExplosionSparks','ImpactDust'][i];mesh.frustumCulled=false;
  mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.castShadow=i===0;mesh.visible=false;mesh.renderOrder=i===0?0:3;root.add(mesh);
  for(let j=0;j<LIMIT;j++){mesh.setMatrixAt(j,zero);mesh.setColorAt(j,new T.Color(0));}return mesh;
 });
 for(let i=0;i<LIMIT;i++)pool.push({active:false,type:0,pos:new T.Vector3(),velocity:new T.Vector3(),scale:new T.Vector3(),rotation:new T.Vector3(),omega:new T.Vector3(),age:0,life:1,rest:false,flare:false});
 function obstacleRefresh(){obstacleCache=props.filter(p=>p.alive).map(p=>p.box);}
 function drawProp(p){
  const damage=1-p.hp/p.maxHp,shake=p.hurt>0?Math.sin(p.hurt*38)*Math.exp(-p.hurt*8)*.075:0;
  transform.position.set(p.x,0,p.z);transform.rotation.set(p.impulseZ*shake,p.rotation,-p.impulseX*shake);transform.scale.set(1,1,1);transform.updateMatrix();
  const flash=p.hurt>0?Math.max(0,1-p.hurt/.16):0,base=p.brightness*(1-damage*.16);
  for(const entry of prototypes.get(p.kind)){
   entry.mesh.setMatrixAt(p.slot,p.alive&&(!entry.crack||damage>.22)?transform.matrix:zero);
   tint.setRGB(base+flash*.9,base+flash*.55,base+flash*.25);entry.mesh.setColorAt(p.slot,tint);entry.dirty=true;
  }p.dirty=false;
 }
 function flushBodies(){for(const entry of batches)if(entry.dirty){entry.mesh.instanceMatrix.needsUpdate=true;if(entry.mesh.instanceColor)entry.mesh.instanceColor.needsUpdate=true;entry.dirty=false;}}
 function deactivate(index){const f=pool[index];if(f.active){fragmentMeshes[f.type].setMatrixAt(index,zero);fragmentMeshes[f.type].geometry.attributes.instanceFade.setX(index,0);}f.active=false;}
 function fragment(type,position,velocity,scale,color,life,flare=false){
  let index=pool.findIndex(f=>!f.active);
  if(index<0){let oldest=Infinity;for(let i=0;i<LIMIT;i++)if(pool[i].serial<oldest){oldest=pool[i].serial;index=i;}deactivate(index);}
  const f=pool[index];f.active=true;f.serial=++fragmentSerial;f.type=type;f.pos.copy(position);f.velocity.copy(velocity);f.scale.copy(scale);f.age=0;f.life=life;f.rest=false;f.flare=flare;
  f.rotation.set(range(0,TAU),range(0,TAU),range(0,TAU));f.omega.set(range(-7,7),range(-7,7),range(-7,7));
  fragmentMeshes[type].setColorAt(index,tint.set(color));return f;
 }
 function puff(p,count,strength=1,explosion=false){
  for(let i=0;i<count;i++){
   const angle=range(0,TAU),r=range(.08,p.w*.32),pos=new T.Vector3(p.x+Math.sin(angle)*r,range(.24,p.h*.80),p.z+Math.cos(angle)*r);
   fragment(2,pos,new T.Vector3(Math.sin(angle)*range(.15,.7)*strength,range(.25,.9),Math.cos(angle)*range(.15,.7)*strength),new T.Vector3().setScalar(range(.20,.48)*strength),explosion?0x4f4640:0x958a74,range(.55,1.15));
  }
 }
 function debris(p,explosion=false){
  const solid= p.material==='stone',co=Math.cos(p.rotation),si=Math.sin(p.rotation);
  for(let i=0;i<p.chips;i++){
   const lx=range(-p.w*.42,p.w*.42),lz=range(-p.d*.37,p.d*.37)+(p.cz||0),angle=range(0,TAU),force=explosion?range(2.5,6):range(1.2,3.4);
   const pos=new T.Vector3(p.x+co*lx+si*lz,range(.28,p.h*.82),p.z-si*lx+co*lz);
   const v=new T.Vector3(Math.sin(angle)*force+p.impulseX*.8,range(1.7,4.6)*(explosion?1.25:1),Math.cos(angle)*force+p.impulseZ*.8);
   const metal=p.material==='metal'||(!solid&&i%6===0);
   const scale=solid?new T.Vector3(range(.12,.35),range(.12,.35),range(.12,.35)):metal?new T.Vector3(range(.07,.16),range(.03,.075),range(.17,.43)):new T.Vector3(range(.10,.20),range(.04,.12),range(.35,p.kind==='wagon'?1.22:.85));
   fragment(0,pos,v,scale,solid?0x83877e:metal?0x596064:i%3===0?0xb28a53:0x765339,range(2.3,4.1));
  }
  puff(p,p.kind==='wagon'?7:4,explosion?1.6:1,explosion);
  if(explosion){
   fragment(1,new T.Vector3(p.x,.72,p.z),new T.Vector3(0,.65,0),new T.Vector3(2.3,1.65,2.3),0xff6824,.40,true);
   for(let i=0;i<15;i++){const angle=range(0,TAU),force=range(2.5,7.5);fragment(1,new T.Vector3(p.x,.8,p.z),new T.Vector3(Math.sin(angle)*force,range(1,5),Math.cos(angle)*force),new T.Vector3(range(.035,.10),range(.08,.25),range(.035,.10)),i%3?0xffac3c:0xff5122,range(.30,.80));}
  }
 }
 function hitFeedback(p,damage,direction,source){
  p.hurt=.001;p.impulseX=direction.x;p.impulseZ=direction.z;p.dirty=true;
  events.push({type:'impact',kind:p.kind,position:new T.Vector3(p.x,Math.min(.9,p.h*.58),p.z),source,damage});
  puff(p,1,.60);
  const position=new T.Vector3(p.x,.72,p.z),velocity=new T.Vector3(direction.x*1.1,1.7,direction.z*1.1);
  fragment(p.kind==='oil'?1:0,position,velocity,new T.Vector3(.08,.05,.21),p.kind==='oil'?0xff9e3d:p.material==='stone'?0x929589:0xb9915c,.65);
 }
 function applyDamage(p,damage,direction,source,queue,attackId){
  if(!p.alive||damage<=0)return false;
  if(attackId!==undefined&&attackId!==null){if(p.attackIds.has(attackId))return false;p.attackIds.add(attackId);}
  p.hp=Math.max(0,p.hp-damage);hitFeedback(p,damage,direction,source);
  if(p.hp>0){drawProp(p);return true;}
  p.alive=false;p.dirty=true;revision++;drawProp(p);debris(p,p.kind==='oil');
  events.push({type:'break',kind:p.kind,id:p.id,ability:p.ability,position:new T.Vector3(p.x,.35,p.z),source});
  if(p.kind==='oil')queue.push(p);
  return true;
 }
 function closestPoint(p,position,out){
  const co=Math.cos(p.rotation),si=Math.sin(p.rotation),dx=position.x-p.x,dz=position.z-p.z;
  const x=clamp(co*dx-si*dz,-p.w*.5,p.w*.5),z=clamp(si*dx+co*dz-(p.cz||0),-p.d*.5,p.d*.5)+(p.cz||0);
  return out.set(p.x+co*x+si*z,position.y||0,p.z-si*x+co*z);
 }
 function damageArea({position,direction,radius=0,arc=TAU,damage=0,source='melee',attackId}={}){
  if(disposed||!position||!Number.isFinite(position.x)||!Number.isFinite(position.z)||!Number.isFinite(damage)||damage<=0||!Number.isFinite(radius)||radius<0)return {hit:0,broken:0,explosions:0};
  directionScratch.set(Number.isFinite(direction?.x)?direction.x:0,0,Number.isFinite(direction?.z)?direction.z:0);if(directionScratch.lengthSq()<1e-8)directionScratch.set(0,0,1);directionScratch.normalize();
  const axis=directionScratch.clone(),queue=[],startAlive=props.filter(p=>p.alive).length;let hit=0,explosions=0;
  const full=!Number.isFinite(arc)||arc>=TAU-.001,half=clamp(arc,0,TAU)*.5,nearest=new T.Vector3();
  for(const p of props){
   if(!p.alive)continue;closestPoint(p,position,nearest);const dx=nearest.x-position.x,dz=nearest.z-position.z,dist=Math.hypot(dx,dz);
   if(dist>radius+.00001)continue;
   const centerX=p.x-position.x,centerZ=p.z-position.z,centerDist=Math.hypot(centerX,centerZ);
   if(!full&&centerDist>.001){const angle=Math.acos(clamp((axis.x*centerX+axis.z*centerZ)/centerDist,-1,1));const angularExtent=Math.asin(Math.min(.99,Math.min(p.w,p.d)*.5/Math.max(centerDist,.001)));if(angle>half+angularExtent)continue;}
   if(applyDamage(p,damage,axis,source,queue,attackId))hit++;
  }
  // Destruction is marked before the queue is expanded. Every oil barrel may
  // explode once; iterative breadth-first chaining has an explicit hard cap.
  for(let at=0;at<queue.length&&explosions<MAX_CHAIN;at++){
   const bomb=queue[at],pos=new T.Vector3(bomb.x,.6,bomb.z);explosions++;oilExplosions++;
   events.push({type:'explode',kind:'oil',position:pos,radius:4.7,damage:105,source});
   for(const p of props){
    if(!p.alive)continue;closestPoint(p,pos,nearest);const distance=Math.hypot(nearest.x-pos.x,nearest.z-pos.z);if(distance>4.7)continue;
    directionScratch.set(p.x-bomb.x,0,p.z-bomb.z);if(directionScratch.lengthSq()<1e-8)directionScratch.copy(axis);directionScratch.normalize();
    applyDamage(p,95,directionScratch,'explosion',queue,`oil:${bomb.id}`);
   }
  }
  const broken=startAlive-props.filter(p=>p.alive).length;if(broken)obstacleRefresh();flushBodies();
  return {hit,broken,explosions};
 }
 function update(dt,time){
  if(disposed)return;dt=Number.isFinite(dt)?clamp(dt,0,.10):0;clock=Number.isFinite(time)?time:clock+dt;
  for(const p of props)if(p.alive&&(p.hurt>0||p.dirty)){
   if(p.hurt>0){p.hurt+=dt;if(p.hurt>.65){p.hurt=0;p.impulseX=0;p.impulseZ=0;}}drawProp(p);
  }flushBodies();
  const active=[0,0,0];
  for(let i=0;i<LIMIT;i++){
   const f=pool[i];if(!f.active)continue;f.age+=dt;if(f.age>=f.life){deactivate(i);continue;}
   if(!f.rest){
    const gravity=f.type===2?-.13:f.type===1?5:9.8;f.velocity.y-=gravity*dt;f.pos.addScaledVector(f.velocity,dt);f.rotation.addScaledVector(f.omega,dt);
    rotationMatrix.makeRotationFromEuler(physicsEuler.set(f.rotation.x,f.rotation.y,f.rotation.z));
    const elements=rotationMatrix.elements;
    const ground=.025+.5*(Math.abs(elements[1])*f.scale.x+Math.abs(elements[5])*f.scale.y+Math.abs(elements[9])*f.scale.z);
    if(f.type!==2&&!f.flare&&f.pos.y<ground){
     f.pos.y=ground;f.velocity.y=Math.abs(f.velocity.y)*.29;f.velocity.x*=.67;f.velocity.z*=.67;f.omega.multiplyScalar(.61);
     if(f.velocity.lengthSq()<.34){f.rest=true;f.velocity.set(0,0,0);f.rotation.x=0;f.rotation.z=0;f.pos.y=.025+f.scale.y*.5;}
    }
   }
   const progress=f.age/f.life,fade=f.type===2?Math.sin(Math.min(1,progress/.13)*Math.PI/2)*Math.pow(1-progress,1.2):1-T.MathUtils.smoothstep(progress,.54,1);
   const expansion=f.type===2?1+f.age*.85:f.flare?.70+progress*2:1;
   transform.position.copy(f.pos);transform.rotation.set(f.rotation.x,f.rotation.y,f.rotation.z);transform.scale.copy(f.scale).multiplyScalar(expansion*(f.type===0?Math.max(.03,fade):1));transform.updateMatrix();
   const mesh=fragmentMeshes[f.type];mesh.setMatrixAt(i,transform.matrix);mesh.geometry.attributes.instanceFade.setX(i,fade*(f.type===2?.35:1));active[f.type]++;
  }
  fragmentMeshes.forEach((mesh,i)=>{mesh.visible=active[i]>0;mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;mesh.geometry.attributes.instanceFade.needsUpdate=true;});
 }
 function reset(){
  if(disposed)return;events.length=0;oilExplosions=0;randomState=16061;fragmentSerial=0;
  for(let i=0;i<LIMIT;i++)deactivate(i);for(const mesh of fragmentMeshes){mesh.visible=false;mesh.instanceMatrix.needsUpdate=true;mesh.geometry.attributes.instanceFade.needsUpdate=true;}
  for(const p of props){p.hp=p.maxHp;p.alive=true;p.attackIds.clear();p.hurt=0;p.impulseX=p.impulseZ=0;p.dirty=true;drawProp(p);}
  revision++;obstacleRefresh();flushBodies();
 }
 function dispose(){
  if(disposed)return;disposed=true;root.removeFromParent();events.length=0;
  for(const batch of batches){batch.mesh.geometry.dispose();batch.mesh.dispose();}
  for(const mesh of fragmentMeshes){mesh.geometry.dispose();mesh.dispose();}
  for(const m of Object.values(materials))m.dispose();for(const m of fragmentMaterials)m.dispose();grain.dispose();obstacleCache=[];
 }
 reset();
 return {damageArea,update,reset,dispose,drainEvents(){return events.splice(0);},
  get obstacles(){return obstacleCache;},get revision(){return revision;},
  get relics(){return props.filter(p=>p.kind==='relic').map(({id,ability,x,z,hp,maxHp,alive})=>({id,ability,x,z,hp,maxHp,alive}));},
  get state(){return {total:props.length,alive:props.filter(p=>p.alive).length,destroyed:props.filter(p=>!p.alive).length,fragmentsActive:pool.filter(f=>f.active).length,fragmentLimit:LIMIT,oilExplosions,revision,
   props:props.map(({id,kind,x,z,hp,maxHp,alive})=>({id,kind,x,z,hp,maxHp,alive}))};},
 };
}
