import * as THREE from 'three';

// One transparent draw grounds the whole crowd. Nearby bodies also retain their
// full animated sun shadows; distant bodies do not double the skinning workload.
export function createActorShadows(scene){
 const capacity=512,geometry=new THREE.PlaneGeometry(2,2);geometry.rotateX(-Math.PI/2);
 const opacity=new THREE.InstancedBufferAttribute(new Float32Array(capacity),1);
 geometry.setAttribute('shadowOpacity',opacity);
 const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,toneMapped:false,
  vertexShader:'attribute float shadowOpacity;varying vec2 vUv;varying float vOpacity;void main(){vUv=uv;vOpacity=shadowOpacity;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',
  fragmentShader:'varying vec2 vUv;varying float vOpacity;void main(){float r=length(vUv*2.-1.);float a=pow(1.-smoothstep(.08,1.,r),2.)*vOpacity;gl_FragColor=vec4(.013,.020,.028,a);}'
 });
 const mesh=new THREE.InstancedMesh(geometry,material,capacity);mesh.name='Crowd contact shadows';mesh.count=0;mesh.frustumCulled=false;mesh.renderOrder=-1;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(mesh);
 const transform=new THREE.Object3D(),bodyMeshes=new WeakMap();
 function bodies(root){
  if(!bodyMeshes.has(root)){const meshes=[];root.traverse(o=>{if(o.isSkinnedMesh)meshes.push(o);});bodyMeshes.set(root,meshes);}
  return bodyMeshes.get(root);
 }
 function update(player,enemies,quality){
  let count=0;
  function contact(root,radius,alpha){
   if(!root.visible||count>=capacity)return;
   transform.position.set(root.position.x,.036,root.position.z);transform.rotation.set(0,root.rotation.y,0);
   transform.scale.set(radius,1,radius*.72);transform.updateMatrix();mesh.setMatrixAt(count,transform.matrix);opacity.setX(count++,alpha);
  }
  contact(player.root,.56,.25);
  const ranked=[];
  for(const enemy of enemies){
   const root=enemy.actor.root;
   const distance=root.position.distanceToSquared(player.root.position);
   // A larger silhouette merits a detailed shadow at a greater distance.
   if(root.visible&&distance<400)ranked.push({root,score:distance/Math.max(1,enemy.height*.55)+(enemy.dead?20:0)});
   const alpha=enemy.dead?Math.max(0,.24*(1-enemy.deathAge/3)):enemy.kind==='dreadlord'?.19:.30;
   contact(root,Math.max(.30,enemy.radius*1.22),alpha);
   for(const body of bodies(root))body.castShadow=false;
  }
  if(quality==='high'){
   ranked.sort((a,b)=>a.score-b.score);
   for(const {root} of ranked.slice(0,16))for(const body of bodies(root))body.castShadow=true;
  }
  mesh.count=count;mesh.instanceMatrix.needsUpdate=true;opacity.needsUpdate=true;
 }
 return {update,dispose(){mesh.removeFromParent();mesh.dispose();geometry.dispose();material.dispose();}};
}
