import * as THREE from 'three';
import { flameBatch, sparks } from './holy-vfx.js';

const clamp=THREE.MathUtils.clamp;
function featherGeometry() {
  // Stepped, split feather tip; every vane remains legible through pixel scaling.
  const shape=new THREE.Shape();shape.moveTo(0,0);shape.lineTo(.19,.095);shape.lineTo(.45,.105);shape.lineTo(.75,.045);shape.lineTo(.96,-.025);shape.lineTo(1.05,-.105);shape.lineTo(.86,-.085);shape.lineTo(.83,-.15);shape.lineTo(.57,-.13);shape.lineTo(.54,-.17);shape.lineTo(.25,-.115);shape.lineTo(.07,-.06);shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

export class AngelWings {
  constructor(parent,assets,{cinematic=false}={}) {
    this.root=new THREE.Group();this.root.name='Angel / articulated feather wings';parent.add(this.root);
    this.cinematic=cinematic;this.geometry=featherGeometry();this.mirroredGeometry=this.geometry.clone().scale(-1,1,1);this.materials=[0xba772b,0xffd887,0xfff2c5].map(color=>new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,depthWrite:false,toneMapped:false,forceSinglePass:true}));
    this.sides=[];const dummy=new THREE.Object3D();
    for(const side of [-1,1]) {
      const pivot=new THREE.Group();pivot.position.set(side*.22,1.53,-.22);this.root.add(pivot);this.sides.push({pivot,side});
      for(let layer=0;layer<3;layer++){
        const mesh=new THREE.InstancedMesh(side<0?this.mirroredGeometry:this.geometry,this.materials[layer],24);mesh.frustumCulled=false;mesh.renderOrder=10+layer;mesh.name='layered luminous pinions';pivot.add(mesh);
        for(let i=0;i<24;i++){
          const primary=i<14,j=primary?i:i-14;
          dummy.position.set(side*(primary?.22+j*.065:.05+j*.075),primary?.70-j*.052:.61-j*.061,layer*.011+(primary?0:.04));
          dummy.rotation.set(0,0,side*(primary?.61-j*.075:.62-j*.07));
          const length=primary?2.0-j*.064:.87-j*.027;
          dummy.scale.set(length*(layer===0?1.02:layer===1?.95:.85),(primary?.91:.86)*(layer===0?1.12:layer===1?.85:.37),1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
        }
      }
    }
    this.haloMaterial=new THREE.MeshBasicMaterial({color:0xffd373,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false,toneMapped:false});
    this.halo=new THREE.Mesh(new THREE.RingGeometry(.30,.33,32),this.haloMaterial);this.halo.rotation.x=-Math.PI/2;this.halo.position.set(0,2.48,-.03);this.root.add(this.halo);
    this.light=new THREE.PointLight(0xffd789,0,cinematic?9:5,2);this.light.position.set(0,1.45,.4);this.root.add(this.light);
    if(assets?.atlas){
      const placements=Array.from({length:14},(_,i)=>{const a=i/14*Math.PI*2;return {position:[Math.cos(a)*.38,i%3===0?.68:.08,Math.sin(a)*.33],size:[.35,i%3===0?.75:1.1],phase:i/14,angle:a};});
      if(!cinematic)for(const side of [-1,1])for(let i=0;i<4;i++)placements.push({position:[side*(.65+i*.38),1.40+i*.035,-.15],size:[.27,.42+i*.06],phase:i*.17,angle:Math.PI/2});
      this.flames=flameBatch(assets.atlas,placements,cinematic?.38:.62);this.root.add(this.flames.mesh);
      this.embers=sparks(cinematic?100:64,cinematic?.75:1.45,2.6,1.05);this.root.add(this.embers.mesh);
    }
    this.root.visible=false;
  }
  update(time,opening=1,fade=1) {
    this.root.visible=fade>0;
    const unfurl=clamp(opening,0,1),pulse=.93+Math.sin(time*14)*.07;
    for(const {pivot,side} of this.sides){pivot.rotation.y=side*(1.46*(1-unfurl)+.055*Math.sin(time*4));pivot.rotation.z=side*(.28*(1-unfurl)+.04*Math.sin(time*3));}
    this.root.scale.setScalar(.64+.36*unfurl);
    this.materials.forEach((m,i)=>m.opacity=fade*(i===0?.9:pulse));this.haloMaterial.opacity=fade*.9;
    this.halo.position.y=2.48+Math.sin(time*3)*.035;this.light.intensity=fade*(this.cinematic?.32:1.7+pulse*.3);
    this.flames?.update(time,fade);this.embers?.update(time,fade);
  }
  reset() {this.root.visible=false;this.light.intensity=0;}
  dispose() {
    this.root.removeFromParent();const geometries=new Set(),materials=new Set();
    this.root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
  }
}
