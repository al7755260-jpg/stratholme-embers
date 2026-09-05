import * as THREE from 'three';

// The flipbook, flame placements, spiral centre lines and rune strokes are
// exported by Holy_VFX_Study.blend. Damage remains on Game's combat clock.
const TAU=Math.PI*2, clamp=THREE.MathUtils.clamp;
export async function loadHolyVfxAssets(){
  const base=`${import.meta.env.BASE_URL}vfx/`;
  const [response,atlas]=await Promise.all([fetch(base+'holy-vfx-spec.json'),new THREE.TextureLoader().loadAsync(base+'holy-flames.png')]);
  if(!response.ok)throw new Error('圣光特效素材读取失败');
  const spec=await response.json();
  atlas.colorSpace=THREE.SRGBColorSpace;atlas.magFilter=THREE.LinearFilter;atlas.minFilter=THREE.LinearFilter;atlas.generateMipmaps=false;
  return {spec,atlas};
}
const noiseGLSL=`
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){return noise(p)*.57+noise(p*2.04)*.28+noise(p*4.13)*.15;}`;
const uvVertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
function shader(fragment,uniforms={},vertex=uvVertex){
  return new THREE.ShaderMaterial({uniforms,vertexShader:vertex,fragmentShader:fragment,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false});
}
function disposeTree(root){
  root.removeFromParent();const geometries=new Set(),materials=new Set();
  root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});
  for(const g of geometries)g.dispose();for(const m of materials)m.dispose();
}
function effect(scene,position,duration,kind){
  const root=new THREE.Group();root.name='HolyVFX / '+kind;root.position.copy(position);scene.add(root);
  const ticks=[];let disposed=false;
  return {root,duration,kind,ticks,age:0,update(age){this.age=age;const fade=clamp(age/.10,0,1)*clamp((duration-age)/.38,0,1);for(const tick of ticks)tick(age,fade);},dispose(){if(disposed)return;disposed=true;disposeTree(root);}};
}
export function flameBatch(atlas,placements,opacity=.86){
  const base=new THREE.PlaneGeometry(1,1);base.translate(0,.5,0);
  const g=new THREE.InstancedBufferGeometry();g.index=base.index.clone();for(const k of ['position','uv'])g.setAttribute(k,base.attributes[k].clone());base.dispose();
  const centres=[],sizes=[],phases=[],angles=[];
  for(const f of placements)for(let cross=0;cross<2;cross++){centres.push(...f.position);sizes.push(...f.size);phases.push(f.phase);angles.push(f.angle+cross*Math.PI/2);}
  for(const [name,values,n] of [['aCenter',centres,3],['aSize',sizes,2],['aPhase',phases,1],['aAngle',angles,1]])g.setAttribute(name,new THREE.InstancedBufferAttribute(new Float32Array(values),n));g.instanceCount=phases.length;
  const mat=shader(`uniform sampler2D atlas;uniform float time,fade,strength;varying vec2 vUv;varying float vPhase;
    void main(){float f=mod(floor(time*24.+vPhase*32.),32.);vec2 tile=vec2(mod(f,8.),floor(f/8.));
    vec2 safeUv=mix(vec2(.004,.003),vec2(.996,.997),vUv);vec4 c=texture2D(atlas,(safeUv+tile)/vec2(8.,4.));
    float feather=smoothstep(0.,.07,vUv.y);float a=c.a*fade*strength*feather;
    gl_FragColor=vec4(c.rgb*vec3(1.,.89,.64),a);}`,
    {atlas:{value:atlas},time:{value:0},fade:{value:0},strength:{value:opacity}},
    `attribute vec3 aCenter;attribute vec2 aSize;attribute float aPhase,aAngle;uniform float time;varying vec2 vUv;varying float vPhase;
    void main(){vUv=uv;vPhase=aPhase;float pulse=1.+.14*sin(time*7.+aPhase*31.);vec3 p=position;p.x*=aSize.x;p.y*=aSize.y*pulse;
    p.x+=sin(time*4.+aPhase*21.+uv.y*3.)*uv.y*uv.y*.11;vec3 w=vec3(p.x*cos(aAngle),p.y,p.x*sin(aAngle))+aCenter;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(w,1.);}`);
  const mesh=new THREE.Mesh(g,mat);mesh.frustumCulled=false;mesh.name='Blender flame flipbook / crossed cards';
  return {mesh,update(t,f){mat.uniforms.time.value=t;mat.uniforms.fade.value=f;}};
}
function ribbonGeometry(points,widths){
  const positions=[],uvs=[],indices=[];
  points.forEach((p,i)=>{const width=Array.isArray(widths)?widths[i]:widths;positions.push(p[0],p[1]-width,p[2],p[0],p[1]+width,p[2]);uvs.push(i/(points.length-1),0,i/(points.length-1),1);if(i<points.length-1)indices.push(i*2,i*2+1,i*2+3,i*2,i*2+3,i*2+2);});
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);return g;
}
const ribbonFragment=`uniform float time,fade;varying vec2 vUv;${noiseGLSL}
void main(){float edge=pow(max(0.,sin(vUv.y*3.14159)),1.6);float ends=smoothstep(0.,.12,vUv.x)*(1.-smoothstep(.78,1.,vUv.x));
float flow=.4+.6*fbm(vec2(vUv.x*33.-time*8.,vUv.y*4.));float core=exp(-pow((vUv.y-.62)*23.,2.));
vec3 gold=mix(vec3(1.,.29,.016),vec3(1.9,1.43,.57),core);gl_FragColor=vec4(gold,fade*ends*edge*(.25*flow+core*.83));}`;
export function sparks(count,radius,height,duration){
  const positions=new Float32Array(count*3),seeds=new Float32Array(count*3);
  for(let i=0;i<seeds.length;i++)seeds[i]=Math.random();
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.setAttribute('seed',new THREE.BufferAttribute(seeds,3));
  const m=shader(`varying float vAlpha;void main(){vec2 p=gl_PointCoord-.5;float a=max(exp(-dot(p,p)*55.),max(0.,1.-abs(p.x)*30.)*max(0.,1.-abs(p.y)*2.));gl_FragColor=vec4(1.5,1.0,.3,a*vAlpha);}`,
    {time:{value:0},fade:{value:0},radius:{value:radius},height:{value:height},duration:{value:duration}},
    `attribute vec3 seed;uniform float time,fade,radius,height,duration;varying float vAlpha;void main(){float life=fract(time/duration+seed.x);float angle=seed.y*6.283+time*.7;float r=radius*(.2+.8*seed.z);vec3 p=vec3(sin(angle)*r,life*height+.12,cos(angle)*r);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp((1.5+seed.z*2.)*20./max(1.,-mv.z),1.,5.);vAlpha=fade*sin(life*3.14159)*(.4+seed.y*.6);}`);
  const mesh=new THREE.Points(g,m);mesh.frustumCulled=false;return {mesh,update(t,f){m.uniforms.time.value=t;m.uniforms.fade.value=f;}};
}
export class HolyVfx {
  constructor(scene,assets){this.scene=scene;this.assets=assets;this.trail=new HammerTrail(scene);this.created={consecration:0,storm:0};}
  get summary(){return {revision:'blender-holy-v1',atlasFrames:this.assets.spec.atlas.frames,created:{...this.created},trailSamples:this.trail.samples.length,trailVertices:this.trail.geometry.drawRange.count,sparks:this.trail.particles.length};}
  sampleWeapon(actor,dt,action,progress,combo){this.trail.update(actor,dt,action,progress,combo);}
  reset(){this.trail.reset();}
  consecration(position){
    this.created.consecration++;const {atlas,spec}=this.assets,e=effect(this.scene,position,spec.consecration.duration,'Consecration');
    const flame=flameBatch(atlas,spec.consecration.flames);e.root.add(flame.mesh);e.ticks.push((t,f)=>flame.update(t,f));
    const ground=shader(`uniform float time,fade;varying vec2 vUv;${noiseGLSL}
      void main(){vec2 p=(vUv-.5)*9.3;float r=length(p),a=atan(p.y,p.x);float n=fbm(p*1.6+vec2(time*.35,-time*.7));
      float rim=1.-smoothstep(3.45+n*.68,4.05+n*.48,r);float centre=smoothstep(.6,1.3,r);
      float channels=pow(1.-abs(sin(a*19.+r*2.7+n*5.-time*1.8)),10.);float cells=pow(smoothstep(.39,.8,n),2.);
      float boundary=exp(-pow((r-(3.7+(n-.5)*.65))*4.2,2.));float energy=(cells*.55+channels*.58+boundary*.5)*rim*centre;
      gl_FragColor=vec4(mix(vec3(.9,.16,.004),vec3(1.5,.88,.13),channels*.7+cells*.3),energy*fade*.76);}`,
      {time:{value:0},fade:{value:0}});
    const carpet=new THREE.Mesh(new THREE.PlaneGeometry(9.3,9.3),ground);carpet.rotation.x=-Math.PI/2;carpet.position.y=.062;e.root.add(carpet);
    const embers=sparks(110,4.1,1.8,1.4);e.root.add(embers.mesh);e.ticks.push((t,f)=>{ground.uniforms.time.value=t;ground.uniforms.fade.value=f;embers.update(t,f);});e.update(0);return e;
  }
  storm(position){
    this.created.storm++;const {atlas,spec}=this.assets,e=effect(this.scene,position,spec.storm.duration,'Divine Storm');
    const spiral=new THREE.Group();e.root.add(spiral);
    for(const strand of spec.storm.strands){
      const mat=shader(ribbonFragment,{time:{value:0},fade:{value:0}}),mesh=new THREE.Mesh(ribbonGeometry(strand.points,strand.widths),mat);spiral.add(mesh);
      e.ticks.push((t,f)=>{mat.uniforms.time.value=t;mat.uniforms.fade.value=f;});
    }
    const column=new THREE.Group();e.root.add(column);
    for(const points of spec.storm.columns||[]){
      const g=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p))),m=shader('uniform float fade;void main(){gl_FragColor=vec4(1.15,.72,.17,fade*.75);}',{fade:{value:0}},'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}');
      column.add(new THREE.Line(g,m));e.ticks.push((t,f)=>{m.uniforms.fade.value=f;});
    }
    const beam=shader(`uniform float time,fade;varying vec2 vUv;${noiseGLSL}
      void main(){float x=abs(vUv.x-.5),body=exp(-x*x*100.);float tendrils=pow(fbm(vec2(vUv.x*8.,vUv.y*9.-time*5.)),3.);float ends=smoothstep(0.,.08,vUv.y)*(1.-smoothstep(.65,1.,vUv.y));gl_FragColor=vec4(1.25,.7,.12,body*ends*(.09+tendrils*.75)*fade);}`,
      {time:{value:0},fade:{value:0}});
    for(let i=0;i<2;i++){const b=new THREE.Mesh(new THREE.PlaneGeometry(2.0,5.1),beam);b.position.y=2.56;b.rotation.y=i*Math.PI/2;e.root.add(b);}
    e.ticks.push((t,f)=>{column.rotation.y=-t*2.3;beam.uniforms.time.value=t;beam.uniforms.fade.value=f;});
    const gold=new THREE.MeshBasicMaterial({color:0xffdf7b,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false});
    const hammers=[];
    for(let i=0;i<3;i++){
      const h=new THREE.Group();const head=new THREE.Mesh(new THREE.BoxGeometry(.64,.28,.26),gold),shaft=new THREE.Mesh(new THREE.BoxGeometry(.075,.60,.075),gold);
      head.position.y=.23;shaft.position.y=-.2;h.add(head,shaft);e.root.add(h);hammers.push(h);
    }
    // These are exported strokes in upright planes, not rectangular glyph sprites.
    const runePositions=[],runeSeeds=[];
    for(let i=0;i<18;i++){const path=spec.storm.runePaths[i%spec.storm.runePaths.length];for(let j=0;j<path.length-1;j++)for(const p of [path[j],path[j+1]]){runePositions.push(p[0]*.85,p[1]*.85,0);runeSeeds.push(i*2.39996,i*.241,.45+(i%4)*.18);}}
    const rg=new THREE.BufferGeometry();rg.setAttribute('position',new THREE.Float32BufferAttribute(runePositions,3));rg.setAttribute('seed',new THREE.Float32BufferAttribute(runeSeeds,3));
    const rm=shader(`varying float vFade;void main(){gl_FragColor=vec4(1.35,.93,.28,vFade);}`,
      {time:{value:0},fade:{value:0}},
      `attribute vec3 seed;uniform float time,fade;varying float vFade;void main(){float a=seed.x+time*1.1,h=mod(time*2.8+seed.y,4.5);vec3 p=vec3(sin(a)*seed.z+position.x*cos(a),h+position.y,cos(a)*seed.z-position.x*sin(a));vFade=fade*smoothstep(0.,.5,h)*(1.-smoothstep(3.5,4.5,h));gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`);
    const runes=new THREE.LineSegments(rg,rm);runes.frustumCulled=false;e.root.add(runes);
    const plume=flameBatch(atlas,[{position:[0,.12,0],size:[.85,3.5],phase:.4,angle:0}],.32);e.root.add(plume.mesh);
    const embers=sparks(145,3.7,4.8,.65);e.root.add(embers.mesh);
    e.ticks.push((t,f)=>{
      spiral.rotation.y=t*spec.storm.rotationSpeed;spiral.scale.setScalar(.65+.35*Math.min(1,t/.3));
      gold.opacity=f*.82;hammers.forEach((h,i)=>{const a=t*6.4+i*TAU/3;h.position.set(Math.sin(a)*2.45,1.15+.3*Math.sin(a*2),Math.cos(a)*2.45);h.rotation.set(.2,-a,.7);});
      rm.uniforms.time.value=t;rm.uniforms.fade.value=f;plume.update(t,f);embers.update(t,f);
    });e.update(0);return e;
  }
}

// World-space history follows the real animated weapon, including the third
// overhead strike. No effect centre or guessed circular sweep is involved.
export class HammerTrail {
  constructor(scene){
    this.samples=[];this.particles=[];this.time=0;this.lastAction='idle';this.lastProgress=0;
    this.inner=new THREE.Vector3();this.outer=new THREE.Vector3();this.tip=new THREE.Vector3();this.previousTip=new THREE.Vector3();
    this.geometry=new THREE.BufferGeometry();this.positions=new Float32Array(64*2*3);this.uvs=new Float32Array(64*2*2);const idx=[];
    for(let i=0;i<63;i++)idx.push(i*2,i*2+1,i*2+3,i*2,i*2+3,i*2+2);
    this.geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));this.geometry.setAttribute('uv',new THREE.BufferAttribute(this.uvs,2).setUsage(THREE.DynamicDrawUsage));this.geometry.setIndex(idx);this.geometry.setDrawRange(0,0);
    this.material=shader(`varying vec2 vUv;uniform float strength;void main(){float age=pow(vUv.x,.9),edge=pow(max(0.,sin(vUv.y*3.14159)),.65);float core=exp(-pow((vUv.y-.82)*13.,2.));float threads=pow(max(0.,sin(vUv.y*68.+vUv.x*3.)),16.);vec3 gold=mix(vec3(1.35,.40,.025),vec3(2.8,2.05,.98),core);gl_FragColor=vec4(gold,age*edge*strength*(.32+core*1.1+threads*.32));}`,{strength:{value:1}});
    this.mesh=new THREE.Mesh(this.geometry,this.material);this.mesh.frustumCulled=false;this.mesh.name='Hammer / actual motion trail';scene.add(this.mesh);
    const pg=new THREE.BufferGeometry();this.sparkPositions=new Float32Array(384*2*3);pg.setAttribute('position',new THREE.BufferAttribute(this.sparkPositions,3).setUsage(THREE.DynamicDrawUsage));pg.setAttribute('alpha',new THREE.BufferAttribute(new Float32Array(384*2),1).setUsage(THREE.DynamicDrawUsage));pg.setDrawRange(0,0);
    const pm=shader('varying float vAlpha;void main(){gl_FragColor=vec4(1.65,1.14,.39,vAlpha);}',{},'attribute float alpha;varying float vAlpha;void main(){vAlpha=alpha;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}');
    this.sparkMesh=new THREE.LineSegments(pg,pm);this.sparkMesh.frustumCulled=false;scene.add(this.sparkMesh);
  }
  reset(){this.samples.length=0;this.particles.length=0;this.geometry.setDrawRange(0,0);this.sparkMesh.geometry.setDrawRange(0,0);this.lastAction='idle';this.lastProgress=0;}
  update(actor,dt,action,progress,combo=0){
    if(dt<=0)return;this.time+=dt;const life=action==='whirl'?.13:.24;
    const active=(action==='melee'&&progress>=.22&&progress<=.79)||(action==='whirl'&&progress>=.28&&progress<=.79);
    if(active&&actor.getWeaponTrace){
      actor.getWeaponTrace(this.inner,this.outer,this.tip);
      if(this.lastAction!==action||progress<this.lastProgress||this.samples.length&&this.tip.distanceTo(this.previousTip)>3.5)this.samples.length=0;
      const distance=this.samples.length?this.tip.distanceTo(this.previousTip):0;
      if(!this.samples.length||distance>.025){
        this.samples.push({inner:this.inner.clone(),outer:this.outer.clone(),time:this.time});if(this.samples.length>32)this.samples.shift();
        const n=Math.min(18,Math.ceil(distance*22));
        for(let i=0;i<n&&this.particles.length<384;i++){
          const p=this.previousTip.clone().lerp(this.tip,Math.random()),v=this.tip.clone().sub(this.previousTip).multiplyScalar(.07/Math.max(.008,dt));
          v.x+=(Math.random()-.5)*2;v.y+=Math.random()*1.8;v.z+=(Math.random()-.5)*2;
          this.particles.push({p,v,age:0,life:.17+Math.random()*.32});
        }
      }
      this.previousTip.copy(this.tip);
    }
    this.lastAction=action;this.lastProgress=progress;
    this.samples=this.samples.filter(s=>this.time-s.time<life);
    if(this.samples.length>1){
      const count=Math.min(64,Math.max(8,this.samples.length*4)),a=new THREE.CatmullRomCurve3(this.samples.map(s=>s.inner)),b=new THREE.CatmullRomCurve3(this.samples.map(s=>s.outer));
      for(let i=0;i<count;i++){
        const u=i/(count-1),inner=a.getPoint(u),outer=b.getPoint(u),age=this.time-THREE.MathUtils.lerp(this.samples[0].time,this.samples.at(-1).time,u),fade=clamp(1-age/life,0,1);
        // A broader amber wake is attached to the head; the bright outer edge
        // remains exactly on its outer socket.
        const axis=outer.clone().sub(inner);inner.addScaledVector(axis,-1.15);outer.addScaledVector(axis,.38);inner.toArray(this.positions,i*6);outer.toArray(this.positions,i*6+3);
        this.uvs.set([fade,0,fade,1],i*4);
      }
      this.geometry.attributes.position.needsUpdate=true;this.geometry.attributes.uv.needsUpdate=true;this.geometry.setDrawRange(0,(count-1)*6);this.material.uniforms.strength.value=combo===2?1.1:.95;
    }else this.geometry.setDrawRange(0,0);
    this.particles=this.particles.filter(p=>{p.age+=dt;p.v.y-=dt*3.2;p.p.addScaledVector(p.v,dt);return p.age<p.life&&p.p.y>0;});
    const pg=this.sparkMesh.geometry;this.particles.forEach((p,i)=>{p.p.toArray(this.sparkPositions,i*6);p.p.clone().addScaledVector(p.v,-.026).toArray(this.sparkPositions,i*6+3);const alpha=1-p.age/p.life;pg.attributes.alpha.setX(i*2,alpha);pg.attributes.alpha.setX(i*2+1,alpha*.1);});
    pg.attributes.position.needsUpdate=true;pg.attributes.alpha.needsUpdate=true;pg.setDrawRange(0,this.particles.length*2);
  }
}
