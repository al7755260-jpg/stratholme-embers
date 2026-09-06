import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { decorateTownhouse, addDistrictDetails } from './environment-details.js';
import { createDestructibles } from './destructibles.js';

// A deliberately compact district: gate street, market square and the eastern dogleg.
export function createWorld(scene,townhouse=null){
 const root=new T.Group();scene.add(root);
 const houseBounds=townhouse?new T.Box3().setFromObject(townhouse):null;
 const houseSize=houseBounds?.getSize(new T.Vector3()),houseCenter=houseBounds?.getCenter(new T.Vector3());
 let seed=7405;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 const range=(a,b)=>a+(b-a)*rand();
 const loader=new T.TextureLoader();
 function texture(url,repeat=1,neutral=false){const t=loader.load(url,loaded=>{if(neutral){const c=document.createElement('canvas');c.width=loaded.image.width;c.height=loaded.image.height;const ctx=c.getContext('2d');ctx.filter='grayscale(1) brightness(1.28)';ctx.drawImage(loaded.image,0,0);loaded.image=c;loaded.needsUpdate=true;}});t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(repeat,repeat);t.colorSpace=T.SRGBColorSpace;t.anisotropy=8;return t;}
 const cobble=texture(`${import.meta.env.BASE_URL}textures/cobblestone.png`,18,true),stone=texture(`${import.meta.env.BASE_URL}textures/limestone.png`,1);
 function canvasMap(painter,size=256){const c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d');painter(ctx,size);const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.colorSpace=T.SRGBColorSpace;return t;}
 const woodTex=canvasMap((c,s)=>{c.fillStyle='#73634e';c.fillRect(0,0,s,s);for(let i=0;i<500;i++){c.strokeStyle=`rgba(${rand()>.5?'12,10,9':'140,121,87'},${range(.05,.25)})`;c.beginPath();const x=range(0,s);c.moveTo(x,0);c.bezierCurveTo(x+range(-8,8),s*.3,x+range(-8,8),s*.6,x+range(-8,8),s);c.stroke();}});
 const roofTex=canvasMap((c,s)=>{c.fillStyle='#354650';c.fillRect(0,0,s,s);for(let y=0;y<s;y+=32){for(let x=-32;x<s;x+=64){let a=x+(y%64?32:0);const tone=Math.floor(range(70,105));c.fillStyle=`rgb(${tone*.72},${tone*.9},${tone})`;c.fillRect(a+1,y+1,62,30);c.strokeStyle='#67727a';c.globalAlpha=.28;c.strokeRect(a+2,y+2,60,27);c.globalAlpha=1;}}},256);roofTex.repeat.set(2,2);
 const mat={
  stone:new T.MeshStandardMaterial({color:0x9daab3,map:stone,roughness:.94,bumpMap:stone,bumpScale:.14}),
  darkStone:new T.MeshStandardMaterial({color:0x697984,map:stone,roughness:.89,bumpMap:stone,bumpScale:.12}),
  trim:new T.MeshStandardMaterial({color:0xaeb8be,map:stone,roughness:.86}),
  plaster:new T.MeshStandardMaterial({color:0xadb3b0,map:stone,roughness:1}),
  wood:new T.MeshStandardMaterial({color:0xa49377,map:woodTex,roughness:.91}),
  darkWood:new T.MeshStandardMaterial({color:0x697677,map:woodTex,roughness:.94}),
  roof:new T.MeshStandardMaterial({color:0x7b98af,map:roofTex,bumpMap:roofTex,bumpScale:.06,roughness:.78,metalness:.09}),
  metal:new T.MeshStandardMaterial({color:0x343b3d,roughness:.52,metalness:.7}),
  gold:new T.MeshStandardMaterial({color:0x958052,roughness:.55,metalness:.62}),
  black:new T.MeshStandardMaterial({color:0x161b1e,roughness:.9}),
  glass:new T.MeshStandardMaterial({color:0x684020,emissive:0xdd7928,emissiveIntensity:.66,roughness:.7}),
  blue:new T.MeshStandardMaterial({color:0x164f91,roughness:.98,side:T.DoubleSide}),
  statue:new T.MeshStandardMaterial({color:0xbac4c8,map:stone,emissive:0x77838a,emissiveIntensity:.22,roughness:.91,side:T.DoubleSide}),
  moss:new T.MeshStandardMaterial({color:0x364846,roughness:1}),
  paper:new T.MeshStandardMaterial({color:0x8a8475,roughness:1}),
  ground:new T.MeshStandardMaterial({color:0xc3ccd2,map:cobble,emissive:0xa5b4be,emissiveIntensity:.22,emissiveMap:cobble,bumpMap:cobble,bumpScale:.2,roughness:.54,metalness:.15}),
 };
 // Keep each building's material batches independent. A foreground gate must
 // never fade every stone wall merely because they share the same source paint.
 const occluders=[];let activeOccluder=null;
 function newOccluder(name,boxes=null){const entry={name,meshes:[],boxes,materials:[],fade:0,hold:0,lastGoal:0};occluders.push(entry);return entry;}
 function registerTree(entry,object){object.traverse(mesh=>{if(mesh.isMesh)entry.meshes.push(mesh);});}
 const batches=new Map();const temp=new T.Object3D();
 function put(geo,m,x,y,z,rx=0,ry=0,rz=0){temp.position.set(x,y,z);temp.rotation.set(rx,ry,rz);temp.scale.set(1,1,1);temp.updateMatrix();const g=geo.clone().applyMatrix4(temp.matrix);if(!g.index)g.setIndex(Array.from({length:g.attributes.position.count},(_,i)=>i));if(!g.attributes.uv)g.setAttribute('uv',new T.BufferAttribute(new Float32Array(g.attributes.position.count*2),2));if(!g.attributes.normal)g.computeVertexNormals();if(!batches.has(activeOccluder))batches.set(activeOccluder,new Map());const bucket=batches.get(activeOccluder);if(!bucket.has(m))bucket.set(m,[]);bucket.get(m).push(g);geo.dispose();}
 const box=(x,y,z,w,h,d,m,ry=0,rz=0)=>put(new T.BoxGeometry(w,h,d),m,x,y,z,0,ry,rz);
 const cyl=(x,y,z,r1,r2,h,m,n=12)=>put(new T.CylinderGeometry(r1,r2,h,n),m,x,y,z);
 function beam(a,b,width,m){const dir=new T.Vector3().subVectors(b,a),mid=a.clone().add(b).multiplyScalar(.5);const q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),dir.clone().normalize());const g=new T.BoxGeometry(width,dir.length(),width);g.applyQuaternion(q);put(g,m,mid.x,mid.y,mid.z);}
 const ground=new T.Mesh(new T.PlaneGeometry(110,110),mat.ground);ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;root.add(ground);
 // Raised pavements and alternating kerbstones establish human scale.
 const curbs=[];
 function curb(x,z,w,d){box(x,.11,z,w,.22,d,mat.darkStone);if(w>d){for(let a=-w/2;a<w/2;a+=1.1)box(x+a+.52,.24,z+(z>0?-d/2:d/2),1,.3,.35,mat.trim);}else{for(let a=-d/2;a<d/2;a+=1.1)box(x+(x>0?-w/2:w/2),.24,z+a+.52,.35,.3,1,mat.trim);}curbs.push({x,z,w,d});}
 curb(-7.2,13,2.4,30);curb(7.2,17,2.4,21);curb(-15.1,-12,2.2,29);curb(15.1,-17,2.2,18);curb(0,-27.3,30,2.5);curb(22,7.4,22,2.6);curb(31.8,-4,2.6,24);
 function archShape(width,height){const s=new T.Shape(),r=width/2;s.moveTo(-r,0);s.lineTo(-r,height-r);s.absarc(0,height-r,r,Math.PI,0,true);s.lineTo(r,0);s.closePath();return s;}
 function arch(x,y,z,w,h,depth,m,rotation=0){put(new T.ExtrudeGeometry(archShape(w,h),{depth,bevelEnabled:false,curveSegments:7}),m,x,y,z,0,rotation);}
 function building(x,z,w,d,h,rotation=0,variant=0){
   const owner=newOccluder(`house-${occluders.length}`);
   if(townhouse&&variant!==3){
    const previousOccluder=activeOccluder;activeOccluder=owner;
    const instance=new T.Group(),model=townhouse.clone(true);model.position.sub(new T.Vector3(houseCenter.x,houseBounds.min.y,houseCenter.z));instance.add(model);
    instance.scale.set(w/houseSize.x,(h+w*.57)/houseSize.y,d/houseSize.z);instance.position.set(x,0,z);instance.rotation.y=rotation;
    instance.traverse(m=>{if(m.isMesh){m.castShadow=true;m.receiveShadow=true;m.material=m.material.clone();m.material.color.multiply(new T.Color(.94,.97,1));m.material.roughness=.95;m.material.metalness=.025;}});root.add(instance);registerTree(owner,instance);
    decorateTownhouse({mat,put,box,beam,addBanner},{x,z,w,d,h,rotation,variant});
    activeOccluder=previousOccluder;
    return;
   }
   const previousOccluder=activeOccluder;activeOccluder=owner;
   const co=Math.cos(rotation),si=Math.sin(rotation);
   function p(lx,ly,lz){return new T.Vector3(x+lx*co+lz*si,ly,z-lx*si+lz*co);}
   const b=(lx,ly,lz,ww,hh,dd,m,rz=0)=>{const v=p(lx,ly,lz);box(v.x,v.y,v.z,ww,hh,dd,m,rotation,rz);};
   b(0,.55,0,w+.4,1.1,d+.35,mat.darkStone);b(0,h*.26,0,w,h*.52,d,mat.stone);
   b(0,h*.75,0,w+.3,h*.5,d+.2,variant%3?mat.plaster:mat.stone);
   b(0,h*.52,0,w+.6,.32,d+.45,mat.wood);b(0,h,0,w+.5,.35,d+.4,mat.darkWood);
   for(let xx=-w/2;xx<=w/2+.1;xx+=w/3){b(xx,h*.74,d/2+.14,.19,h*.52,.19,mat.darkWood);b(xx,h*.74,-d/2-.14,.19,h*.52,.19,mat.darkWood);}
   for(const xx of [-w/2,w/2]){b(xx,h*.26,d/2+.07,.32,h*.5,.32,mat.trim);b(xx,h*.26,-d/2-.07,.32,h*.5,.32,mat.trim);}
   // A solid gable with textured roof planes, ridge cap, exposed rafters and eaves.
   const rise=w*.57;
   const sh=new T.Shape();sh.moveTo(-w/2,0);sh.lineTo(w/2,0);sh.lineTo(0,rise);sh.closePath();
   const gp=p(0,h,-d/2);put(new T.ExtrudeGeometry(sh,{depth:d,bevelEnabled:false}),mat.plaster,gp.x,gp.y,gp.z,0,rotation);
   const slope=Math.atan2(rise,w/2),len=Math.hypot(rise,w/2)+.7;
   b(-w/4,h+rise/2,0,len,.22,d+1,mat.roof,slope);
   b(w/4,h+rise/2,0,len,.22,d+1,mat.roof,-slope);
   b(0,h+rise+.06,0,.32,.32,d+1.05,mat.darkWood);
   for(const zz of [-d/2-.1,d/2+.1]){beam(p(-w/2-.2,h,zz),p(0,h+rise+.1,zz),.22,mat.darkWood);beam(p(w/2+.2,h,zz),p(0,h+rise+.1,zz),.22,mat.darkWood);beam(p(0,h,zz),p(0,h+rise,zz),.18,mat.darkWood);b(0,h+rise*.32,zz,w*.62,.16,.17,mat.darkWood);}
   // Front and rear facades allow the same houses to line both the street and plaza.
   for(const face of [-1,1]){
    const fz=face*(d/2+.16),rot=rotation+(face<0?Math.PI:0);
    for(let ix=0;ix<3;ix++)for(let floor=0;floor<2;floor++){
     const xx=(ix-1)*w*.29,yy=.8+floor*h*.49;
     const pt=p(xx,yy,fz);const ww=w*.18,hh=floor?1.55:1.85;
     arch(pt.x,pt.y,pt.z,ww+.22,hh+.2,.08,mat.trim,rot);
     const p2=p(xx,yy+.1,fz+face*.1);arch(p2.x,p2.y,p2.z,ww,hh,.06,(ix+floor+variant)%3?mat.glass:mat.black,rot);
     b(xx,yy+hh*.48,fz+face*.2,.065,hh*.88,.08,mat.metal);b(xx,yy+hh*.48,fz+face*.22,ww,.08,.08,mat.metal);
     b(xx,yy-.03,fz+face*.18,ww+.35,.16,.4,mat.trim);
     if((ix+floor+variant)%4===0){b(xx,yy+hh*.4,fz+face*.27,ww+ .26,.18,.12,mat.wood,.3);b(xx,yy+hh*.65,fz+face*.29,ww+.2,.18,.12,mat.wood,-.28);}
    }
    const door=p(0,0.18,fz+face*.15);arch(door.x,door.y,door.z,1.6,2.5,.1,mat.darkWood,rot);
    for(let k=-2;k<=2;k++)b(k*.26,1.14,fz+face*.28,.035,1.8,.055,mat.wood);
    b(0,.12,fz+face*.55,2.2,.24,1.1,mat.trim);
    // Diagonal structural beams and hanging blue banners.
    for(const side of [-1,1])beam(p(side*w*.47,h*.55,fz),p(side*w*.22,h*.95,fz),.16,mat.darkWood);
   }
   b(w*.25,h+rise*.8,0,.9,2.7,1,mat.darkStone);b(w*.25,h+rise*.8+1.36,0,1.15,.18,1.2,mat.trim);
   if(variant%2===0){const pos=p(-w*.3,h*.7,d/2+.5);addBanner(pos.x,pos.y,pos.z,rotation);}
   activeOccluder=previousOccluder;
 }
 const flags=[];
 function addBanner(x,y,z,ry){
  const g=new T.PlaneGeometry(1.25,2.9,6,14);g.translate(0,-1.45,0);
  const points=g.attributes.position;for(let i=0;i<points.count;i++)if(points.getY(i)<-2.7)points.setY(i,points.getY(i)+.35*(1-Math.abs(points.getX(i))/.625));
  const mesh=new T.Mesh(g,mat.blue);mesh.position.set(x,y,z);mesh.rotation.y=ry;root.add(mesh);flags.push(mesh);
  box(x,y+.08,z,1.5,.09,.11,mat.gold,ry);
  // Small gold sun crest is geometry attached to the flag at its center.
  const crestParts=[new T.RingGeometry(.2,.26,12).translate(0,-1.1,.03)];
  for(let i=0;i<8;i++){const angle=i*Math.PI/4;crestParts.push(new T.PlaneGeometry(.06,.16).rotateZ(-angle).translate(Math.sin(angle)*.36,-1.1+Math.cos(angle)*.36,.031));}
  mesh.add(new T.Mesh(mergeGeometries(crestParts,false),mat.gold));
  for(const part of crestParts)part.dispose();
  if(activeOccluder)registerTree(activeOccluder,mesh);
 }
 const houses=[
 [-10.5,21,7,9,7.2,Math.PI/2,0],[-10.8,10.8,7.3,9.5,8.7,Math.PI/2,1],[-11,1.3,7,9,7.6,Math.PI/2,2],
 [10.8,22,7,9,8.2,-Math.PI/2,2],[10.7,12.8,7,9,7.4,-Math.PI/2,1],
 [-19,-9,7.5,8,8.8,Math.PI/2,3],[-19,-20,8.5,8,7.5,Math.PI/2,0],
 [-11,-32,8,8,8.5,0,1],[11,-32,8,8,8.6,0,2],
 [19,-18,8,8,9,-Math.PI/2,0],[20,11.5,8,8,8.5,Math.PI,3],[29,12,8,8,7.2,Math.PI,0],
 [37,-2,8,8,8.9,-Math.PI/2,2],[28,-21,8,8,7.5,0,1],[-29,-12,9,10,11,0,2],[-24,14,9,10,11,0,3],[23,-39,9,9,11,0,0]
 ];houses.forEach(a=>building(...a));
 // The chapel gate is the primary long-distance landmark.
 activeOccluder=newOccluder('chapel');
 box(0,6.6,-35,8.4,13.2,6.6,mat.stone);
 box(0,3,-31.6,4.8,6,.2,mat.black);
 arch(0,.1,-31.4,4.3,6.2,.3,mat.darkWood);
 for(const x of [-4.4,4.4]){box(x,7,-34.6,1,14,7.8,mat.darkStone);for(let y=1;y<14;y+=3)box(x,y,-30.5,1.3,.27,.7,mat.trim);}
 box(0,13.4,-35,9.4,.55,7.6,mat.trim);box(0,17.2,-35,5.2,7.2,4.8,mat.stone);
 put(new T.CircleGeometry(1.45,16),mat.glass,0,9.4,-31.3);
 put(new T.TorusGeometry(1.55,.21,7,16),mat.trim,0,9.4,-31.15);
 put(new T.TorusGeometry(.65,.08,5,12),mat.darkStone,0,9.4,-31.02);
 for(let i=0;i<8;i++){const a=i*Math.PI/4;beam(new T.Vector3(0,9.4,-30.95),new T.Vector3(Math.sin(a)*1.45,9.4+Math.cos(a)*1.45,-30.95),.1,mat.darkStone);}
 for(const x of [-3.3,3.3]){box(x,6.4,-31.2,.5,12.8,.8,mat.trim);box(x,6.6,-30.85,.85,.25,1.15,mat.darkStone);}
 box(0,6.6,-31.05,8.4,.3,.7,mat.trim);
 for(let x of [-1.15,1.15]){arch(x,15,-32.5,1.2,3.2,.13,mat.glass);for(let y=15.2;y<17.9;y+=.4)box(x,y,-32.3,1.2,.08,.12,mat.darkWood);}
 box(0,20.9,-35,6,.45,5.5,mat.trim);
 put(new T.ConeGeometry(4.6,10.2,4),mat.roof,0,26,-35,0,Math.PI/4);
 cyl(0,32,-35,.06,.15,2.5,mat.gold,8);box(0,32,-35,1.3,.1,.1,mat.gold);
 for(const x of [-3,3]){cyl(x,21.2,-32.2,.45,.55,2,mat.stone,8);put(new T.ConeGeometry(.85,2.7,4),mat.roof,x,23.3,-32.2,0,Math.PI/4);}
 // Cemetery wall and barred city entrance behind the player.
 activeOccluder=newOccluder('entrance-gate',[
  new T.Box3(new T.Vector3(-8.9,0,28.7),new T.Vector3(-4.7,13.0,31.3)),
  new T.Box3(new T.Vector3(4.7,0,28.7),new T.Vector3(8.9,13.0,31.3)),
  new T.Box3(new T.Vector3(-6.0,0,29.15),new T.Vector3(6.0,8.6,30.85)),
 ]);
 for(const x of [-6.8,6.8]){box(x,4.7,30,2,9.4,2,mat.stone);box(x,9.7,30,2.5,.5,2.5,mat.trim);put(new T.ConeGeometry(2,3,4),mat.roof,x,11.4,30,0,Math.PI/4);}
 for(const x of [-6.8,6.8])addBanner(x,8.3,31.12,0);
 box(0,7.4,30,12,2.2,1.6,mat.stone);
 for(let x=-5.5;x<6;x+=.55)box(x,3.1,30,.12,6.2,.13,mat.metal);box(0,3.1,30,12,.14,.15,mat.metal);
 activeOccluder=null;
 // Ruined fountain: dark wet basin and carved tiers under the civic knight.
 const fx=-6,fz=-13;
 cyl(fx,.18,fz,3.15,3.3,.35,mat.trim,14);cyl(fx,.38,fz,2.9,3,.25,mat.darkStone,14);
 put(new T.TorusGeometry(2.73,.23,6,16),mat.trim,fx,.58,fz,Math.PI/2);
 const fountainWater=new T.MeshStandardMaterial({color:0x20353f,roughness:.14,metalness:.45});fountainWater.userData.pixelSurface='wet';
 cyl(fx,.44,fz,2.55,2.55,.1,fountainWater,24);
 cyl(fx,1.45,fz,.58,.95,2,mat.stone);cyl(fx,2.3,fz,1.55,.5,.6,mat.trim);cyl(fx,2.64,fz,1.52,1.52,.14,mat.darkStone);
 for(let i=0;i<8;i++){const a=i*Math.PI/4;cyl(fx+Math.sin(a)*2.86,.73,fz+Math.cos(a)*2.86,.13,.18,.5,mat.trim,7);}
 const lamps=[];
 function lamp(x,z){
  cyl(x,.2,z,.45,.6,.4,mat.darkStone);cyl(x,2,z,.075,.14,3.8,mat.metal,8);
  box(x,4,z,.18,.18,.7,mat.metal);box(x,3.75,z+.35,.44,.7,.44,mat.glass);
  for(const xx of [-.25,.25])for(const zz of [.1,.6])box(x+xx,3.75,z+zz,.06,.9,.06,mat.metal);
  put(new T.ConeGeometry(.45,.4,4),mat.metal,x,4.25,z+.35,0,Math.PI/4);
  cyl(x,3.26,z+.35,.4,.3,.15,mat.metal,4);
  lamps.push({x,z});
 }
 [[-5.9,19],[5.9,11],[-13,-4],[13,-22],[6,-26],[23,6],[-13,-24]].forEach(p=>lamp(...p));
 // Prop clusters provide silhouettes at street edges without blocking combat lanes.
 function barrel(x,z,r=.5){cyl(x,.67,z,r*.85,r*.9,1.28,mat.wood,12);for(const y of [.16,.64,1.16])cyl(x,y,z,r*.95,r*.95,.08,mat.metal,12);cyl(x,1.33,z,r*.82,r*.82,.055,mat.darkWood,12);}
 function crate(x,z,s=1,ry=0){box(x,s/2,z,s,s,s,mat.wood,ry);for(const y of [.1,s-.1])box(x,y,z,s+.03,.12,s+.03,mat.darkWood,ry);for(const xx of [-s*.4,s*.4])box(x+xx,s/2,z+s*.51,.11,s,.07,mat.darkWood,ry);}
 function wagon(x,z,ry){box(x,.85,z,1.8,.18,3,mat.darkWood,ry);box(x-1,1.26,z,.16,.9,3.1,mat.wood,ry);box(x+1,1.26,z,.16,.9,3.1,mat.wood,ry);for(const xx of [-1.12,1.12])for(const zz of [-.95,.95]){put(new T.TorusGeometry(.56,.08,5,12),mat.darkWood,x+xx,.58,z+zz,0,Math.PI/2);for(let j=0;j<4;j++)beam(new T.Vector3(x+xx,.58-Math.sin(j*Math.PI/4)*.5,z+zz-Math.cos(j*Math.PI/4)*.5),new T.Vector3(x+xx,.58+Math.sin(j*Math.PI/4)*.5,z+zz+Math.cos(j*Math.PI/4)*.5),.06,mat.wood);}beam(new T.Vector3(x-.5,.8,z+1.4),new T.Vector3(x-.5,.3,z+3.4),.12,mat.wood);beam(new T.Vector3(x+.5,.8,z+1.4),new T.Vector3(x+.5,.3,z+3.4),.12,mat.wood);}
 // Breakable barrels, crates and carts are created below by destructibles.js.
 // Stone rubble and snapped timbers, biased to pavement edges.
 for(let i=0;i<100;i++){const x=(rand()>.5?1:-1)*range(5.2,6.4),z=range(1,28);box(x,range(.06,.18),z,range(.1,.38),range(.08,.28),range(.1,.5),rand()>.3?mat.trim:mat.darkWood,range(0,6));}
 for(let i=0;i<24;i++){const x=range(-14,14),z=range(-25,-2);if(Math.abs(x)<9&&z>-20)continue;box(x,.15,z,range(.2,.8),.2,range(.2,.6),mat.darkStone,range(0,6));}
 const districtDetails=addDistrictDetails({mat,put,box,cyl,beam,range,rand});
 // Small geometry details are consolidated here.
 for(const [owner,bucket] of batches)for(const [material,geometries] of bucket){const merged=mergeGeometries(geometries,false);if(merged){const m=new T.Mesh(merged,material);m.castShadow=material!==mat.glass;m.receiveShadow=true;root.add(m);if(owner)owner.meshes.push(m);}for(const g of geometries)g.dispose();}batches.clear();

 root.updateWorldMatrix(true,true);
 for(const owner of occluders){
  const materialCopies=new Map(),bounds=new T.Box3();owner.meshes=Array.from(new Set(owner.meshes));
  for(const mesh of owner.meshes){
   bounds.union(new T.Box3().setFromObject(mesh));
   const copy=source=>{let material=materialCopies.get(source);if(!material){material=source.clone();materialCopies.set(source,material);owner.materials.push({material,opacity:source.opacity,transparent:source.transparent,depthWrite:source.depthWrite});}return material;};
   mesh.material=Array.isArray(mesh.material)?mesh.material.map(copy):copy(mesh.material);
  }
  if(!owner.boxes)owner.boxes=bounds.isEmpty()?[]:[bounds];
 }
 const hemi=new T.HemisphereLight(0xc1d3df,0x849296,1.55);scene.add(hemi);
 const moon=new T.DirectionalLight(0xc6d7e8,3.1);moon.position.set(-14,35,15);moon.castShadow=true;moon.shadow.intensity=.92;moon.shadow.radius=2.6;moon.shadow.mapSize.set(2048,2048);Object.assign(moon.shadow.camera,{left:-25,right:25,top:25,bottom:-25,near:1,far:100});moon.shadow.normalBias=.025;moon.shadow.bias=-.00008;scene.add(moon,moon.target);
 // Snap in the light's plane to keep soft shadows steady while the camera follows.
 const lightDirection=new T.Vector3(-14,35,15),lightForward=lightDirection.clone().normalize();
 const lightRight=new T.Vector3().crossVectors(new T.Vector3(0,1,0),lightForward).normalize();
 const lightUp=new T.Vector3().crossVectors(lightForward,lightRight),lightFocus=new T.Vector3();
 function updateLightingFocus(position){
  const texel=50/2048;
  lightFocus.copy(position);
  lightFocus.addScaledVector(lightRight,Math.round(position.dot(lightRight)/texel)*texel-position.dot(lightRight));
  lightFocus.addScaledVector(lightUp,Math.round(position.dot(lightUp)/texel)*texel-position.dot(lightUp));
  moon.target.position.copy(lightFocus);moon.position.copy(lightFocus).add(lightDirection);
 }
 const fireLight=new T.PointLight(0xff6b26,48,25,2);fireLight.position.set(-6,5,8);scene.add(fireLight);
 const plazaLight=new T.PointLight(0xff8b3e,52,28,2);plazaLight.position.set(13,6,-16);scene.add(plazaLight);
 const rim=new T.PointLight(0x779fcc,30,18,2);rim.position.set(0,6,23);scene.add(rim);
 const skyMat=new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:{time:{value:0}},vertexShader:'varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:`varying vec3 vDir;uniform float time;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
 float fbm(vec2 p){float f=0.;float a=.5;for(int i=0;i<5;i++){f+=a*noise(p);p=p*2.04+1.3;a*=.5;}return f;}
 void main(){vec3 d=normalize(vDir);vec2 p=d.xz/max(.14,d.y+.3);float n=fbm(p*1.8+vec2(time*.004,0));vec3 col=mix(vec3(.29,.34,.37),vec3(.075,.12,.16),smoothstep(.0,.8,d.y));col=mix(col,col*.40,smoothstep(.38,.8,n));float glow=exp(-length((d.xz-vec2(.1,-.8))*vec2(2.,1.))*2.)*(1.-smoothstep(.0,.5,d.y));col+=vec3(.29,.095,.018)*glow;gl_FragColor=vec4(col,1.);}`});
 const sky=new T.Mesh(new T.SphereGeometry(130,24,12),skyMat);scene.add(sky);
 // Animated fire uses crossed soft-edged ribbons. Smoke is a separate rising layer.
 const fireMat=new T.ShaderMaterial({transparent:true,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide,uniforms:{time:{value:0}},vertexShader:`varying vec2 vUv;uniform float time;void main(){vUv=uv;vec3 p=position;p.x+=sin(uv.y*9.+time*4.+position.y)*uv.y*.20;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,fragmentShader:`varying vec2 vUv;uniform float time;float hash(vec2 p){return fract(sin(dot(p,vec2(12.98,78.23)))*43758.5);}void main(){vec2 uv=vUv;float shift=sin(uv.y*13.-time*5.)*.06+sin(uv.y*21.-time*3.)*.04;float width=(1.-uv.y)*.42;float edge=1.-smoothstep(width*.4,width,abs(uv.x-.5+shift));float a=edge*smoothstep(0.,.12,uv.y)*pow(1.-uv.y,.8);vec3 color=mix(vec3(.95,.115,.008),vec3(1.45,.65,.09),pow(1.-uv.y,3.));gl_FragColor=vec4(color,a*.72);}`});
 const fires=[];
 function fire(x,y,z,scale=1){const f=new T.Group();f.position.set(x,y,z);for(let i=0;i<2;i++){const m=new T.Mesh(new T.PlaneGeometry(scale*1.4,scale*3.1,2,8),fireMat);m.position.y=scale*1.4;m.rotation.y=i*Math.PI/2;f.add(m);}root.add(f);fires.push(f);}
 [[-8,10.5,21,1.7],[9.2,10.6,12.8,1.9],[-7.5,9,9,1.6],[-12,10,11,1.8],[9,8,18,1.4],[12,10,22,1.8],[15,8,-17,1.9],[19,11,-19,1.4],[-16,8,-19,1.5],[-5.8,.15,6,.55],[12,.2,-11,.55],[29,9,11,1.4]].forEach(a=>fire(...a));
 const smokeTex=canvasMap((c,s)=>{const g=c.createRadialGradient(s*.5,s*.5,0,s*.5,s*.5,s*.5);g.addColorStop(0,'rgba(185,186,182,.36)');g.addColorStop(.32,'rgba(145,151,152,.24)');g.addColorStop(.65,'rgba(95,104,110,.13)');g.addColorStop(1,'rgba(80,89,95,0)');c.fillStyle=g;c.fillRect(0,0,s,s);});
 const smoke=[];for(let i=0;i<46;i++){const fi=fires[i%fires.length];const m=new T.SpriteMaterial({map:smokeTex,color:0x3c4246,transparent:true,opacity:.6,depthWrite:false});const s=new T.Sprite(m);s.position.copy(fi.position);const age=range(0,1);const data={s,base:fi.position.clone(),phase:age,size:range(4,8)};smoke.push(data);root.add(s);}
 const ashGeo=new T.BufferGeometry(),ashPos=new Float32Array(420*3),ashSpeed=[];for(let i=0;i<420;i++){ashPos[i*3]=range(-24,32);ashPos[i*3+1]=range(.5,22);ashPos[i*3+2]=range(-33,30);ashSpeed.push(range(.25,.7));}ashGeo.setAttribute('position',new T.BufferAttribute(ashPos,3));
 const ash=new T.Points(ashGeo,new T.PointsMaterial({color:0xffb777,size:.035,transparent:true,opacity:.7,depthWrite:false,blending:T.AdditiveBlending}));root.add(ash);
 // A few subtle wet patches have directional highlights, rather than a costly mirror pass.
 const puddleMat=new T.MeshStandardMaterial({color:0x2b3d4b,roughness:.14,metalness:.55,transparent:true,opacity:.46,depthWrite:false});puddleMat.userData.pixelSurface='wet';
 const puddleGeometries=[];
 for(let i=0;i<32;i++){const g=new T.CircleGeometry(range(.55,1.8),12);g.scale(1,range(.3,.7),1);g.rotateX(-Math.PI/2);g.rotateY(range(0,6.28));g.translate(range(-4.8,4.8),.019,range(-24,27));puddleGeometries.push(g);}
 const wetPatches=new T.Mesh(mergeGeometries(puddleGeometries,false),puddleMat);wetPatches.receiveShadow=true;root.add(wetPatches);for(const g of puddleGeometries)g.dispose();
 const reflectedLight=new T.MeshBasicMaterial({color:0xc69758,transparent:true,opacity:.18,depthWrite:false,blending:T.AdditiveBlending});
 const reflectedFragments=[];
 for(const [x,z,dir] of [[-4.5,18,1],[4.2,11,-1],[-3.9,7,1],[3.8,-20,-1],[-10.6,-4,1],[10.8,-18,-1]])for(let i=0;i<8;i++){
  const g=new T.PlaneGeometry(range(.18,.68),range(.06,.12));g.rotateX(-Math.PI/2);g.rotateY(range(-.1,.1));g.translate(x+dir*i*.10,.028,z+i*.20+range(-.04,.04));reflectedFragments.push(g);
 }
 root.add(new T.Mesh(mergeGeometries(reflectedFragments,false),reflectedLight));for(const g of reflectedFragments)g.dispose();
 const destruction=createDestructibles(root);
 const walkRects=[[-6,6,-12,28],[-14,14,-26,0],[3,30,-6,6],[22,32,-16,8]];
 // Foundations are static. Breakable cart/crate/barrel footprints are read live.
 const obstacles=houses.map(([x,z,w,d,,rotation])=>{const co=Math.abs(Math.cos(rotation)),si=Math.abs(Math.sin(rotation)),hx=(co*(w+.4)+si*(d+.35))*.5,hz=(si*(w+.4)+co*(d+.35))*.5;return [x-hx,x+hx,z-hz,z+hz];});
 const currentObstacles=()=>[...obstacles,...destruction.obstacles];
 const start=new T.Vector3(0,0,21);
 function inWalk(x,z,r){return walkRects.some(([a,b,c,d])=>x>=a+r&&x<=b-r&&z>=c+r&&z<=d-r);}
 function clampWalk(x,z,r){if(inWalk(x,z,r))return [x,z];let best=Infinity,result=[x,z];for(const [a,b,c,d] of walkRects){const xx=T.MathUtils.clamp(x,a+r,b-r),zz=T.MathUtils.clamp(z,c+r,d-r),dist=(x-xx)**2+(z-zz)**2;if(dist<best){best=dist;result=[xx,zz];}}return result;}
 const insideBox=(x,z,r,[a,b,c,d])=>x>a-r&&x<b+r&&z>c-r&&z<d+r;
 function clearPosition(x,z,r){return inWalk(x,z,r)&&!currentObstacles().some(o=>insideBox(x,z,r,o))&&Math.hypot(x-fx,z-fz)>=3.1+r-1e-6;}
 function resolveMovement(pos,r=.4){let [x,z]=clampWalk(pos.x,pos.z,r);const skin=.001;
  // Recheck the walk union after each projection; a wall at a bend must not push the actor outside it.
  for(let pass=0;pass<4;pass++){
   for(const obstacle of currentObstacles()){if(!insideBox(x,z,r,obstacle))continue;
    const [a,b,c,d]=obstacle,faces=[[a-r-skin,z],[b+r+skin,z],[x,c-r-skin],[x,d+r+skin]];let best=Infinity,result=null;
    for(const [px,pz] of faces)for(const [wa,wb,wc,wd] of walkRects){const xx=T.MathUtils.clamp(px,wa+r,wb-r),zz=T.MathUtils.clamp(pz,wc+r,wd-r);if(!clearPosition(xx,zz,r))continue;const dist=(x-xx)**2+(z-zz)**2;if(dist<best){best=dist;result=[xx,zz];}}
    if(result)[x,z]=result;
   }
   const dx=x-fx,dz=z-fz,radius=3.1+r;
   if(Math.hypot(dx,dz)<radius){const angle=Math.atan2(dz,dx);let best=Infinity,result=null;
    // Usually the radial projection wins; nearby cart corners may require moving around the basin.
    for(let i=0;i<32;i++){const a=angle+i*Math.PI/16,xx=fx+Math.cos(a)*(radius+skin),zz=fz+Math.sin(a)*(radius+skin);if(!clearPosition(xx,zz,r))continue;const dist=(x-xx)**2+(z-zz)**2;if(dist<best){best=dist;result=[xx,zz];}}
    if(result)[x,z]=result;
   }
   [x,z]=clampWalk(x,z,r);if(clearPosition(x,z,r))break;
  }
  return new T.Vector3(x,0,z);
 }
 // The old chase-camera collision shortened the boom to 1.2m at a wall. An
 // elevated tactical camera keeps its chosen orbit; the foreground fades below.
 function resolveCamera(desired){return desired.clone();}
 const occlusionRay=new T.Ray(),cameraPosition=new T.Vector3(),samplePosition=new T.Vector3(),occlusionHit=new T.Vector3(),expandedBox=new T.Box3();
 const occlusionSamples=[[0,.30,0],[0,1.12,0],[0,2.05,0]];
 for(let i=0;i<8;i++){const a=i*Math.PI/4;occlusionSamples.push([Math.cos(a)*3.0,.22,Math.sin(a)*3.0]);}
 function applyFade(owner){
  const fading=owner.fade>.001;
  for(const saved of owner.materials){
   const material=saved.material,transparent=fading||saved.transparent;
   if(material.transparent!==transparent){material.transparent=transparent;material.needsUpdate=true;}
   material.opacity=saved.opacity*(1-owner.fade*.95);
   // A nearly invisible wall must not keep writing depth and hiding enemies.
   material.depthWrite=fading?false:saved.depthWrite;
  }
 }
 /** Call AFTER positioning the camera; target is the player's world-space feet. */
 function updateOcclusion(camera,target,dt=1/60){
  if(!camera||!target)return 0;
  const elapsed=T.MathUtils.clamp(Number.isFinite(dt)?dt:1/60,0,.1);
  camera.getWorldPosition(cameraPosition);
  let faded=0;
  for(const owner of occluders){
   let bodyHits=0,groundHits=0,inside=false;
   const margin=owner.lastGoal>0?.22:.08;
   for(const box of owner.boxes)if(box.containsPoint(cameraPosition)){inside=true;break;}
   if(!inside)for(let i=0;i<occlusionSamples.length;i++){
    const offset=occlusionSamples[i];samplePosition.set(target.x+offset[0],target.y+offset[1],target.z+offset[2]);
    occlusionRay.origin.copy(cameraPosition);occlusionRay.direction.subVectors(samplePosition,cameraPosition);
    const distance=occlusionRay.direction.length();if(distance<.001)continue;occlusionRay.direction.divideScalar(distance);
    let blocked=false;
    for(const box of owner.boxes){
     // Ground probes inside a house do not represent a playable combat surface.
     if(i>=3&&box.containsPoint(samplePosition))continue;
     expandedBox.copy(box).expandByScalar(margin);
     if(occlusionRay.intersectBox(expandedBox,occlusionHit)&&cameraPosition.distanceToSquared(occlusionHit)<(distance-.18)**2){blocked=true;break;}
    }
    if(blocked){if(i<3)bodyHits++;else groundHits++;}
   }
   let goal=inside||bodyHits?1:groundHits>=2?.93:groundHits===1?.66:0;
   if(goal>0){owner.hold=.20;owner.lastGoal=goal;}else{owner.hold=Math.max(0,owner.hold-elapsed);if(owner.hold>0)goal=owner.lastGoal;else owner.lastGoal=0;}
   const speed=goal>owner.fade?17:5.5;
   owner.fade=T.MathUtils.damp(owner.fade,goal,speed,elapsed);
   if(goal===0&&owner.fade<.001)owner.fade=0;
   applyFade(owner);if(owner.fade>.02)faded++;
  }
  return faded;
 }
 function getOcclusionState(){return occluders.map(owner=>({name:owner.name,fade:owner.fade,meshCount:owner.meshes.length,materialIds:owner.materials.map(saved=>saved.material.uuid),boxes:owner.boxes.map(box=>({min:box.min.toArray(),max:box.max.toArray()}))}));}
 return {root,start,destruction,districtDetails,updateLightingFocus,plaza:new T.Vector3(0,0,-12),bounds:{minX:-14,maxX:32,minZ:-26,maxZ:28},spawnPoints:[new T.Vector3(-9,0,-23),new T.Vector3(9,0,-23),new T.Vector3(0,0,-21),new T.Vector3(27,0,-12),new T.Vector3(27,0,2),new T.Vector3(-3,0,-7)],resolveMovement,resolveCamera,updateOcclusion,getOcclusionState,
  update(dt,t){skyMat.uniforms.time.value=t;fireMat.uniforms.time.value=t;fireLight.intensity=46+Math.sin(t*5.5)*5+Math.sin(t*13)*2;plazaLight.intensity=50+Math.sin(t*6)*6;
   for(const m of flags){const pos=m.geometry.attributes.position;for(let i=0;i<pos.count;i++){const y=pos.getY(i);pos.setZ(i,Math.sin(y*2+t*2.3+m.position.x)*.075*(-y)+Math.sin(t*1.7)*.04);}pos.needsUpdate=true;m.geometry.computeVertexNormals();}
   for(const {s,base,phase,size} of smoke){const age=(phase+t*.035)%1;s.position.set(base.x+Math.sin(age*4+phase)*2+age*5,base.y+2+age*18,base.z+age*2);s.scale.setScalar(size*(.6+age*1.3));s.material.opacity=Math.sin(age*Math.PI)*.5;s.material.rotation=phase*10+age*.5;}
   for(let i=0;i<ashSpeed.length;i++){ashPos[i*3]+=dt*.18;ashPos[i*3+1]+=dt*ashSpeed[i];if(ashPos[i*3+1]>24)ashPos[i*3+1]=.5;if(ashPos[i*3]>33)ashPos[i*3]=-24;}ashGeo.attributes.position.needsUpdate=true;
  }
 };
}


