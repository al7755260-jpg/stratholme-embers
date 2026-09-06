import * as THREE from 'three';
import { flameBatch } from './holy-vfx.js';

const clamp=THREE.MathUtils.clamp;
function featherGeometry(){
  const p=[],uv=[],indices=[];
  for(let i=0;i<=16;i++){
    const u=i/16,width=Math.pow(Math.sin(Math.PI*u),.72)*.092*(1-.30*u);
    const bend=-.30*u*u,depth=.12*Math.sin(u*Math.PI);
    for(const side of [-1,1]){p.push(u,bend+side*width,depth);uv.push(u,side*.5+.5);}
    if(i<16){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
function lightMaterial(color,opacity){
  return new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false,
    uniforms:{uTime:{value:0},uFade:{value:0},uColor:{value:new THREE.Color(color)},uOpacity:{value:opacity}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',
    fragmentShader:`uniform float uTime,uFade,uOpacity;uniform vec3 uColor;varying vec2 vUv;
    void main(){float edge=pow(max(0.,1.-abs(vUv.y-.5)*2.),.65);
      float tip=1.-smoothstep(.62,1.,vUv.x);
      float flow=.66+.34*sin(vUv.x*14.-uTime*4.5);
      float a=edge*tip*flow*uOpacity*uFade;
      gl_FragColor=vec4(uColor,a);}`});
}
function driftingGold(count){
  const positions=[],seeds=[];
  for(let i=0;i<count;i++){
    const side=i%2?-1:1,t=((i*37)%count)/count,jitter=((i*19)%101)/101;
    positions.push(side*(.45+2.05*t),1.48+.85*Math.sin(t*Math.PI*.78)-jitter*.48,.18+.75*t);
    seeds.push((i*.61803398875)%1,side,.4+jitter*.6);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('aSeed',new THREE.Float32BufferAttribute(seeds,3));
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
    uniforms:{uTime:{value:0},uFade:{value:0}},
    vertexShader:`attribute vec3 aSeed;uniform float uTime,uFade;varying float vLife;varying float vSeed;
    void main(){float age=fract(aSeed.x+uTime*(.30+aSeed.z*.16));vLife=sin(age*3.14159265)*uFade;vSeed=aSeed.x;
      vec3 p=position;p.x+=aSeed.y*age*(.55+aSeed.z*.6);p.y+=age*(.38+aSeed.z*.65);p.z-=age*(.20+aSeed.x*.5);
      p.x+=sin(age*5.+aSeed.x*12.)*.10;p.z+=sin(age*6.+aSeed.x*15.)*.15;
      vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
      gl_PointSize=clamp((1.0+aSeed.z)*30./max(2.,-mv.z),1.,5.);}`,
    fragmentShader:`varying float vLife;varying float vSeed;void main(){vec2 p=abs(gl_PointCoord-.5);if(p.x>.18&&p.y>.18)discard;
      vec3 color=mix(vec3(1.,.50,.13),vec3(1.,.92,.62),vSeed);gl_FragColor=vec4(color,vLife*.82);}`});
  const mesh=new THREE.Points(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=16;
  return {mesh,update(time,fade){material.uniforms.uTime.value=time;material.uniforms.uFade.value=fade;}};
}

export class AngelWings {
  constructor(parent,assets,{cinematic=false}={}){
    this.root=new THREE.Group();this.root.name='Angel / curved flowing light wings';parent.add(this.root);
    this.cinematic=cinematic;this.time=0;this.geometry=featherGeometry();this.mirroredGeometry=this.geometry.clone().scale(-1,1,1);
    this.materials=[lightMaterial(0xf39b37,.30),lightMaterial(0xffd674,.55),lightMaterial(0xffedb0,.85)];
    this.sides=[];this.feathers=[];this.filaments=[];this.transform=new THREE.Object3D();
    for(const side of [-1,1]){
      const pivot=new THREE.Group();pivot.position.set(side*.19,1.40,-.22);this.root.add(pivot);this.sides.push({pivot,side});
      for(let layer=0;layer<3;layer++){
        const mesh=new THREE.InstancedMesh(side<0?this.mirroredGeometry:this.geometry,this.materials[layer],24);mesh.frustumCulled=false;mesh.renderOrder=10+layer;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);pivot.add(mesh);
        this.feathers.push({mesh,side,layer});
      }
      for(let i=0;i<5;i++){
        const curve=new THREE.CubicBezierCurve3(new THREE.Vector3(side*.05,.30,.015),new THREE.Vector3(side*(.65+i*.025),1.60-i*.075,.18),new THREE.Vector3(side*(1.7+i*.04),1.75-i*.12,.48),new THREE.Vector3(side*(2.65+i*.10),1.28-i*.10,.86+i*.045));
        const material=new THREE.MeshBasicMaterial({color:i%2?0xffe2a0:0xf1ae49,transparent:true,opacity:.2,blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false});
        const ribbon=new THREE.Mesh(new THREE.TubeGeometry(curve,28,.008+i*.0015,3,false),material);ribbon.renderOrder=13;pivot.add(ribbon);this.filaments.push({ribbon,phase:i*.75+side});
      }
    }
    this.haloMaterial=new THREE.MeshBasicMaterial({color:0xffd373,transparent:true,opacity:.65,side:THREE.DoubleSide,depthWrite:false,toneMapped:false});
    this.halo=new THREE.Mesh(new THREE.RingGeometry(.30,.32,32),this.haloMaterial);this.halo.rotation.x=-Math.PI/2;this.halo.position.set(0,2.48,-.03);this.root.add(this.halo);
    this.light=new THREE.PointLight(0xffd789,0,cinematic?9:5,2);this.light.position.set(0,1.45,.4);this.root.add(this.light);
    if(assets?.atlas){
      const placements=Array.from({length:14},(_,i)=>{const a=i/14*Math.PI*2;return {position:[Math.cos(a)*.38,i%3===0?.68:.08,Math.sin(a)*.33],size:[.30,i%3===0?.65:.92],phase:i/14,angle:a};});
      this.flames=flameBatch(assets.atlas,placements,cinematic?.30:.48);this.root.add(this.flames.mesh);
    }
    this.embers=driftingGold(cinematic?224:160);this.root.add(this.embers.mesh);this.update(0,0,0);this.root.visible=false;
  }
  get summary(){return {revision:'flowing-light-wings-v2',feathers:144,curvedFilaments:10,driftingSparks:this.embers.mesh.geometry.attributes.position.count,time:this.time,visible:this.root.visible};}
  update(time,opening=1,fade=1){
    this.time=time;this.root.visible=fade>0;const unfurl=clamp(opening,0,1),dummy=this.transform;
    for(const {pivot,side} of this.sides){pivot.rotation.y=side*(1.38*(1-unfurl)-.16+.10*Math.sin(time*2.1));pivot.rotation.z=side*(.30*(1-unfurl)+.065*Math.sin(time*2.4));}
    this.root.scale.setScalar(.64+.36*unfurl);
    for(const {mesh,side,layer} of this.feathers){
      for(let i=0;i<24;i++){
        const primary=i<16,t=(primary?i:i-16)/(primary?15:7),lag=time*2.5-t*4.8;
        dummy.position.set(side*(.12+(primary?1.72:1.36)*t),.34+1.22*Math.sin(t*Math.PI*.78)+(primary?0:.075),.62*t*t+layer*.018+(primary?0:.035));
        dummy.position.y+=Math.sin(lag)*.065*t;dummy.position.z+=Math.sin(lag-.7)*.15*t;
        dummy.rotation.set(Math.sin(lag)*.08,side*(-.08+Math.sin(lag)*.12),side*(-1.15+t*.84+Math.sin(lag)*.08));
        const length=primary?.60+1.15*Math.sin(t*Math.PI*.76):.40+.48*Math.sin(t*Math.PI);
        dummy.scale.set(length*(.92+.10*Math.sin(i*2.1))*[1.05,.95,.86][layer],(primary?1:.7)*[1.18,.68,.22][layer],1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate=true;
    }
    this.materials.forEach(m=>{m.uniforms.uTime.value=time;m.uniforms.uFade.value=fade;});
    for(const {ribbon,phase} of this.filaments){ribbon.material.opacity=fade*(.12+.09*(.5+.5*Math.sin(time*2.8-phase)));ribbon.position.z=Math.sin(time*2-phase)*.04;}
    this.haloMaterial.opacity=fade*.65;this.halo.position.y=2.48+Math.sin(time*3)*.035;
    this.light.intensity=fade*(this.cinematic?.30:1.65);this.flames?.update(time,fade);this.embers.update(time,fade*unfurl);
  }
  reset(){this.root.visible=false;this.light.intensity=0;}
  dispose(){
    this.root.removeFromParent();const geometries=new Set(),materials=new Set();
    this.root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);if(o.isInstancedMesh)o.dispose();});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
  }
}
