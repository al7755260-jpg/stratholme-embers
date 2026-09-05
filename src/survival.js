import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const SURVIVAL=Object.freeze({maxHp:3,hitDamage:1,hitGrace:.9,packHeal:1,packLimit:16,packLife:45,pickupRadius:.85,pickupDelay:.4,dropChance:.30,pityKills:4});
export const RELICS=Object.freeze([
  Object.freeze({id:'relic-q',kind:'relic',ability:'q',name:'风暴圣物',skill:'神圣风暴',area:'旧城南街',x:-3.45,z:15.6,rotation:0}),
  Object.freeze({id:'relic-e',kind:'relic',ability:'e',name:'奉献圣物',skill:'奉献',area:'东侧巷道',x:20,z:2.7,rotation:0}),
]);

// Long unlucky streaks cannot starve an otherwise successful run. Big enemies
// always drop a pack; at critical health the chance rises but pickup is required.
export function healthDropRoll(misses,hp,large=false,random=Math.random){
  const guaranteed=large||misses+1>=SURVIVAL.pityKills;
  const dropped=guaranteed||random()<(hp===1?.52:SURVIVAL.dropChance);
  return {dropped,misses:dropped?0:misses+1};
}

function mergedBoxes(parts){
  const geometries=parts.map(([w,h,d,x,y,z])=>new THREE.BoxGeometry(w,h,d).translate(x,y,z));
  const g=mergeGeometries(geometries);for(const part of geometries)part.dispose();return g;
}

export class StreetSupplies {
  constructor(scene,world){
    this.world=world;this.root=new THREE.Group();this.root.name='Dropped health packs';scene.add(this.root);
    this.packs=[];this.misses=0;this.dropped=0;this.picked=0;this.serial=0;this.expired=0;
    this.transform=new THREE.Object3D();this.color=new THREE.Color();
    const red=new THREE.MeshStandardMaterial({color:0xc44739,roughness:.7,emissive:0x751d12,emissiveIntensity:.65});
    const ivory=new THREE.MeshBasicMaterial({color:0xffe9b3,toneMapped:false});
    const gold=new THREE.MeshStandardMaterial({color:0x836241,roughness:.8});
    const body=mergedBoxes([[.63,.38,.39,0,0,0],[.54,.09,.43,0,.14,0]]);
    const cross=mergedBoxes([[.075,.25,.025,0,.01,.215],[.245,.07,.026,0,.01,.217],[.075,.018,.27,0,.198,0],[.245,.019,.07,0,.20,0]]);
    const straps=mergedBoxes([[.055,.405,.43,-.22,0,0],[.055,.405,.43,.22,0,0],[.22,.055,.055,0,.26,0],[.04,.10,.055,-.105,.225,0],[.04,.10,.055,.105,.225,0]]);
    this.meshes=[[body,red],[cross,ivory],[straps,gold]].map(([g,m])=>{const mesh=new THREE.InstancedMesh(g,m,SURVIVAL.packLimit);mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.root.add(mesh);return mesh;});
    // A small ground marker makes satchels readable against the pixel stonework.
    const haloG=new THREE.PlaneGeometry(1.05,1.05);haloG.rotateX(-Math.PI/2);
    const haloM=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,toneMapped:false,
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',
      fragmentShader:'varying vec2 vUv;void main(){vec2 p=abs(vUv-.5);float d=p.x+p.y;float a=(1.-smoothstep(.19,.49,d))*.38;gl_FragColor=vec4(.78,.22,.08,a);}'});
    this.halos=new THREE.InstancedMesh(haloG,haloM,SURVIVAL.packLimit);this.halos.frustumCulled=false;this.halos.count=0;this.root.add(this.halos);
  }
  get summary(){return {available:this.packs.length,dropped:this.dropped,picked:this.picked,expired:this.expired,misses:this.misses,packs:this.packs.map(p=>({id:p.id,x:+p.position.x.toFixed(2),z:+p.position.z.toFixed(2),life:+(SURVIVAL.packLife-p.age).toFixed(1)}))};}
  enemyKilled(enemy,hp,random=Math.random){
    const roll=healthDropRoll(this.misses,hp,enemy.large||enemy.boss,random);this.misses=roll.misses;
    if(roll.dropped)this.spawn(enemy.actor.root.position,random);
    return roll.dropped;
  }
  spawn(position,random=Math.random){
    const angle=random()*Math.PI*2,p=position.clone().setY(0);p.x+=Math.sin(angle)*.55;p.z+=Math.cos(angle)*.55;
    const resolved=this.world.resolveMovement(p,.24).clone().setY(0);
    if(this.packs.length>=SURVIVAL.packLimit){this.packs.shift();this.expired++;}
    this.packs.push({id:++this.serial,position:resolved,age:0,phase:random()*Math.PI*2});this.dropped++;
    this.draw();return this.packs.at(-1);
  }
  update(dt,player,hp,maxHp,canReach=()=>true){
    if(dt<=0)return 0;let restored=0;
    this.packs=this.packs.filter(p=>{
      p.age+=dt;
      if(p.age>=SURVIVAL.packLife){this.expired++;return false;}
      if(hp+restored<maxHp&&p.age>=SURVIVAL.pickupDelay&&Math.hypot(player.x-p.position.x,player.z-p.position.z)<SURVIVAL.pickupRadius&&canReach(p.position)){
        restored+=SURVIVAL.packHeal;this.picked++;return false;
      }
      return true;
    });
    this.draw();return Math.min(restored,maxHp-hp);
  }
  draw(){
    const dummy=this.transform;
    this.packs.forEach((p,i)=>{
      const blink=p.age>SURVIVAL.packLife-5&&Math.sin(p.age*13)<-.1,scale=blink?.76:1;
      const toss=p.age<.5?Math.sin(p.age/.5*Math.PI)*.75:0;
      dummy.position.copy(p.position);dummy.position.y=.40+Math.sin(p.age*3+p.phase)*.07+toss;dummy.rotation.set(0,p.phase+p.age*.45,0);dummy.scale.setScalar(scale);dummy.updateMatrix();
      for(const mesh of this.meshes)mesh.setMatrixAt(i,dummy.matrix);
      dummy.position.y=.045;dummy.rotation.set(0,0,0);dummy.scale.setScalar(scale);dummy.updateMatrix();this.halos.setMatrixAt(i,dummy.matrix);
    });
    for(const mesh of [...this.meshes,this.halos]){mesh.count=this.packs.length;mesh.instanceMatrix.needsUpdate=true;}
  }
  reset(){this.packs.length=0;this.misses=this.dropped=this.picked=this.serial=this.expired=0;this.draw();}
  dispose(){this.root.removeFromParent();for(const mesh of [...this.meshes,this.halos]){mesh.geometry.dispose();mesh.material.dispose();mesh.dispose();}}
}
