import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { HEIGHT, rigDescription, skinGeometry } from './rigging.js';
import { createMotionController } from './motion-controller.js';

function prepare(gltf,kind) {
  gltf.scene.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(gltf.scene);
  const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const h=HEIGHT[kind],s=h/size.y,desc=rigDescription(kind),parts=[];
  gltf.scene.traverse(source=>{
    if(!source.isMesh)return;
    const geometry=source.geometry.clone().applyMatrix4(source.matrixWorld);
    // Rodin's body centerline is x=z=0. An asymmetric cape or removed sword must
    // not move that centerline away from the procedural skeleton.
    geometry.translate(0,-bounds.min.y,0);
    geometry.scale(s,s,s);
    skinGeometry(geometry,kind,desc,source.material.map);
    const material=source.material.clone();
    if(kind==='arthas'){
      material.userData.pixelSurface='hero';
      material.side=THREE.FrontSide;
      material.roughness=.63;
      material.metalness=.65;
      material.envMapIntensity=1.2;
    }else {
      // The new references carry their own skin colour, armour masks and facial
      // detail. Preserve those PBR values rather than applying the old green tint.
      // Thin bat membranes must remain visible from either side of the camera.
      if(kind==='dreadlord')material.side=THREE.DoubleSide;
    }
    for(const key of ['map','normalMap','metalnessMap','roughnessMap'])if(material[key])material[key].anisotropy=4;
    parts.push({geometry,material});
  });
  return {kind,desc,parts};
}

function cylinderBetween(a,b,radius,material,parent) {
  const direction=new THREE.Vector3().subVectors(b,a),mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,direction.length(),6),material);
  mesh.position.copy(a).add(b).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
  parent.add(mesh);return mesh;
}

function makeHammer(h) {
  const group=new THREE.Group();group.name='LightsVengeance';
  const gold=new THREE.MeshStandardMaterial({color:0xd5a743,metalness:.9,roughness:.28});
  const steel=new THREE.MeshStandardMaterial({color:0xb7cbd2,metalness:.85,roughness:.23});
  const leather=new THREE.MeshStandardMaterial({color:0x1b2936,roughness:.9});
  const glow=new THREE.MeshStandardMaterial({color:0xd7f7ff,emissive:0x78cfff,emissiveIntensity:2.5,metalness:.2,roughness:.35});
  for(const material of [gold,steel,leather,glow])material.userData.pixelSurface='weapon';
  const add=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x*h,y*h,z*h);m.castShadow=true;group.add(m);return m;};
  add(new THREE.CylinderGeometry(.016*h,.022*h,.44*h,10),leather,0,.15,0);
  for(let i=0;i<8;i++)add(new THREE.TorusGeometry(.020*h,.004*h,4,12),gold,0,-.02+i*.035,0).rotation.x=Math.PI/2;
  add(new THREE.SphereGeometry(.036*h,8,6),gold,0,-.088,0);
  const shape=new THREE.Shape();shape.moveTo(-.155*h,-.066*h);shape.lineTo(.155*h,-.066*h);shape.lineTo(.175*h,-.035*h);shape.lineTo(.175*h,.07*h);shape.lineTo(-.175*h,.07*h);shape.lineTo(-.175*h,-.035*h);shape.closePath();
  const head=new THREE.ExtrudeGeometry(shape,{depth:.135*h,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.014*h,bevelThickness:.014*h});head.translate(0,0,-.0675*h);
  add(head,steel,0,.41,0);
  add(new THREE.BoxGeometry(.072*h,.177*h,.16*h),gold,0,.414,0);
  for(const x of [-.145,.145])add(new THREE.BoxGeometry(.028*h,.148*h,.158*h),gold,x,.414,0);
  for(const z of [-.089,.089]){
    const ring=add(new THREE.TorusGeometry(.042*h,.006*h,6,16),gold,0,.415,z);
    add(new THREE.OctahedronGeometry(.031*h),glow,0,.415,z);
  }
  const aura=new THREE.PointLight(0x86d8ff,1.2,2.1);aura.position.set(0,.42*h,0);group.add(aura);
  // Turn the hammer head a quarter turn around its handle. Keep the grip
  // frame unchanged so the hands and captured swing trajectory stay aligned.
  const headAlignment=new THREE.Matrix4().makeRotationY(Math.PI/2);
  for(const part of group.children)part.applyMatrix4(headAlignment);
  group.userData.materials=[gold,steel,leather,glow];
  return group;
}

function addDetails(kind,rig,h) {
  const group=new THREE.Group();group.name='UndeadDetails';
  const glow=new THREE.MeshStandardMaterial({color:0xb1eb9c,emissive:0x8cfa67,emissiveIntensity:2.4,roughness:.8});
  if(kind!=='arthas') {
    // Small eye embers reinforce the undead silhouette without large emissive masks.
    for(const side of [-1,1]){
      const eye=new THREE.Mesh(new THREE.SphereGeometry(.009*h,6,4),glow);
      eye.scale.set(1.6,.6,.7);eye.position.set(side*.036*h,.052*h,.085*h);group.add(eye);
    }
    rig.head.add(group);
  }
  const extra=[];
  if(kind==='abomination') {
    const stitch=new THREE.MeshStandardMaterial({color:0x242621,roughness:1});
    const seam=new THREE.Group();seam.name='AbominationStitches';
    // Place stitches just above the rounded stomach, attached to the spine.
    for(let i=0;i<12;i++){
      const y=.54+i*.013,x=.04+Math.sin(i*.65)*.025,z=.16-Math.pow(y-.62,2)*1.7;
      cylinderBetween(new THREE.Vector3((x-.014)*h,(y-.60-.008)*h,z*h),new THREE.Vector3((x+.014)*h,(y-.60+.008)*h,(z+.001)*h),.003*h,stitch,seam);
    }
    rig.spine.add(seam);extra.push(stitch);
  }
  return [glow,...extra];
}

function instantiate(template) {
  const {kind,desc,parts}=template,h=HEIGHT[kind];
  const root=new THREE.Group();root.name=kind;
  const pose=new THREE.Group();root.add(pose);
  const bones=desc.map(d=>{const b=new THREE.Bone();b.name=d.name;return b;});
  const rig=Object.fromEntries(bones.map(b=>[b.name,b]));
  desc.forEach((d,i)=>{
    const parent=d.parent>=0?desc[d.parent].p:[0,0,0];
    bones[i].position.set((d.p[0]-parent[0])*h,(d.p[1]-parent[1])*h,(d.p[2]-parent[2])*h);
    if(d.parent>=0)bones[d.parent].add(bones[i]);else pose.add(bones[i]);
  });
  root.updateMatrixWorld(true);
  const skeleton=new THREE.Skeleton(bones),materials=[];
  for(const part of parts){
    const material=part.material.clone(),mesh=new THREE.SkinnedMesh(part.geometry,material);
    materials.push(material);mesh.name=kind+'Body';mesh.castShadow=true;mesh.receiveShadow=true;
    mesh.frustumCulled=false;pose.add(mesh);mesh.bind(skeleton,new THREE.Matrix4());
  }
  // New undead assets already contain eyes/stitches; legacy overlays would sit
  // at the previous models' coordinates. Keep the hero accessory path unchanged.
  const additional=kind==='arthas'?addDetails(kind,rig,h):[];
  let hammer;
  if(kind==='arthas'){
    hammer=makeHammer(h);hammer.position.set(-.006*h,-.022*h,.006*h);rig.rightHand.add(hammer);
    additional.push(...hammer.userData.materials);
  }
  const controller=createMotionController({kind,root,pose,rig,bones,desc,h,hammer});
  const floorSamples=[];
  for(const {geometry} of parts){
    const positions=geometry.attributes.position,ids=geometry.attributes.skinIndex,weights=geometry.attributes.skinWeight;
    const surface=kind!=='arthas'&&geometry.index?[...new Set(geometry.index.array)]:null;
    const count=surface?surface.length:positions.count,step=Math.max(1,Math.floor(count/480));
    for(let j=0;j<count;j+=step){const i=surface?surface[j]:j;floorSamples.push({p:new THREE.Vector3().fromBufferAttribute(positions,i),ids:[ids.getX(i),ids.getY(i),ids.getZ(i),ids.getW(i)],w:[weights.getX(i),weights.getY(i),weights.getZ(i),weights.getW(i)]});}
  }
  const floorMatrices=bones.map(()=>new THREE.Matrix4()),floorPoint=new THREE.Vector3(),weightedPoint=new THREE.Vector3();
  function update(dt,state={}){
    const {dead,hit,fade}=controller.update(dt,state);
    // The generated bodies have very different shoulder/belly thicknesses.
    // Sample their actual skinned surface to let the collapse settle onto the
    // street instead of rotating half the body below y=0.
    if(dead>.10){
      root.updateMatrixWorld(true);let lowest=Infinity;
      bones.forEach((bone,i)=>floorMatrices[i].multiplyMatrices(bone.matrixWorld,skeleton.boneInverses[i]));
      for(const sample of floorSamples){
        weightedPoint.set(0,0,0);
        for(let j=0;j<4;j++)if(sample.w[j]>0)weightedPoint.addScaledVector(floorPoint.copy(sample.p).applyMatrix4(floorMatrices[sample.ids[j]]),sample.w[j]);
        lowest=Math.min(lowest,weightedPoint.y);
      }
      const groundY=root.getWorldPosition(floorPoint).y,scale=root.getWorldScale(weightedPoint).y;
      const lift=Math.max(0,groundY+.012-lowest)/scale;
      pose.position.y+=lift;root.updateMatrixWorld(true);
    }
    for(const material of materials){
      material.emissive.setRGB(hit*.34,hit*.07,hit*.015);material.emissiveIntensity=1;
    }
    // Keep the collapse visible, then dissolve body AND weapon as one actor.
    for(const material of [...materials,...additional]){
      const opacity=1-fade;material.transparent=opacity<.999;material.opacity=opacity;material.depthWrite=opacity>.35;
    }
    root.visible=fade<.999;
  }
  update(0,{time:0});
  return {root,update,getWeaponTrace(inner,outer,tip){
    if(!hammer)return false;
    root.updateWorldMatrix(true,true);
    inner.set(0,.30*h,0).applyMatrix4(hammer.matrixWorld);
    outer.set(0,.51*h,0).applyMatrix4(hammer.matrixWorld);
    tip.set(0,.415*h,0).applyMatrix4(hammer.matrixWorld);
    return true;
  },resetMotion(){update(0,{reset:true,time:0,immediate:true});},dispose(){
    root.removeFromParent();skeleton.dispose();
    for(const m of [...materials,...additional])m.dispose();
    // Accessories own their small meshes; body geometry belongs to the template.
    root.traverse(o=>{if(o.isMesh&&!o.isSkinnedMesh)o.geometry?.dispose();});
  }};
}

export async function loadActors(onProgress=()=>{}) {
  const loader=new GLTFLoader(),templates={},kinds=['arthas','zombie','forsaken','abomination','dreadlord'];
  const labels={arthas:'圣骑士',zombie:'腐尸',forsaken:'被遗忘者',abomination:'憎恶',dreadlord:'恐惧魔王'};
  let loaded=0;
  await Promise.all(kinds.map(async kind=>{
    const filename=kind==='arthas'?'arthas':`undead-${kind}`;
    const gltf=await loader.loadAsync(`${import.meta.env.BASE_URL}models/${filename}.glb`);
    templates[kind]=prepare(gltf,kind);
    loaded++;
    onProgress({loaded,total:kinds.length,progress:loaded/kinds.length,label:labels[kind]});
  }));
  return {create(kind){
    if(!templates[kind])throw new Error(`Unknown actor kind: ${kind}`);
    return instantiate(templates[kind]);
  }};
}


