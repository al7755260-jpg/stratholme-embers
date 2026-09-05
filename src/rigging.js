import * as THREE from 'three';

/** Model-space conventions: +Z faces forward, y=0 is the sole, units are metres. */
export const HEIGHT = Object.freeze({ arthas: 2.2, zombie: 1.75, forsaken: 2.35, abomination: 3.5, dreadlord: 3.35 });
const clamp = THREE.MathUtils.clamp;
const smooth = (a,b,x) => THREE.MathUtils.smoothstep(x,a,b);
const mix = THREE.MathUtils.lerp;

// Joint centres were checked against horizontal slices of the optimized GLBs.
// In particular, wrists are at the cuff, not the bottom of the fingers, and
// ankles sit behind the toes. Coordinates below are fractions of standing height.
const anatomy = {
  arthas: {
    shoulder:[.153,.752,.005], elbow:[.188,.628,.025], wrist:[.193,.504,.057],
    leftShoulder:[-.173,.752,.005], leftElbow:[-.235,.628,.017], leftWrist:[-.251,.502,.045],
    hip:[.095,.445,-.014], knee:[.106,.263,-.008], foot:[.107,.078,-.026],
    waist:.49, chest:.746, neck:.844, headWidth:.115, armRadius:.040,
  },
  zombie: {
    shoulder:[.150,.785,-.040], elbow:[.220,.650,-.004], wrist:[.259,.520,.069],
    hip:[.115,.440,-.025], knee:[.140,.270,-.016], foot:[.171,.080,-.039],
    waist:.470, spine:.615, chest:.780, neck:.863, headWidth:.108, armRadius:.043,
    pelvisZ:-.045, spineZ:-.065, chestZ:-.045, headZ:.048, headX:.025,
  },
  forsaken: {
    shoulder:[.162,.765,-.035], elbow:[.225,.610,-.045], wrist:[.253,.477,.012],
    hip:[.095,.448,-.012], knee:[.128,.284,.012], foot:[.167,.065,-.027],
    waist:.475, spine:.590, chest:.744, neck:.834, headWidth:.118, armRadius:.048,
    pelvisZ:-.013, spineZ:-.018, chestZ:-.014, headZ:.025,
  },
  abomination: {
    shoulder:[.274,.795,-.073], elbow:[.357,.650,-.042], wrist:[.352,.460,.052],
    hip:[.175,.380,-.045], knee:[.210,.213,-.025], foot:[.230,.080,-.022],
    waist:.400, spine:.580, chest:.765, neck:.866, headWidth:.136, armRadius:.080,
    pelvisZ:-.055, spineZ:-.015, chestZ:-.040, headZ:.045,
  },
  dreadlord: {
    shoulder:[.158,.634,.005], elbow:[.215,.505,.015], wrist:[.250,.387,.048],
    hip:[.093,.382,.004], knee:[.144,.228,.063], foot:[.151,.051,-.005],
    waist:.418, spine:.515, chest:.632, neck:.708, headWidth:.137, armRadius:.042,
    pelvisZ:-.008, spineZ:-.012, chestZ:-.003, headZ:.061,
    wing:[.135,.650,-.112], wingTip:[.280,.909,-.105],
  },
};

/** Preserve the original 18/16 names, parentage, and index order exactly. */
export function rigDescription(kind) {
  const d=anatomy[kind];
  if(!d) throw new Error(`Unknown rig archetype: ${kind}`);
  const result=[
    {name:'hips',parent:-1,p:[0,d.waist,d.pelvisZ||0]},
    {name:'spine',parent:0,p:[0,d.spine||.60,d.spineZ||0]},
    {name:'chest',parent:1,p:[0,d.chest,d.chestZ||0]},
    {name:'head',parent:2,p:[d.headX||0,d.neck,d.headZ||0]},
  ];
  for(const [side,sign] of [['right',1],['left',-1]]) {
    const mirrored=p=>[p[0]*sign,p[1],p[2]];
    const arm=result.length;
    result.push({name:`${side}Arm`,parent:2,p:side==='left'&&d.leftShoulder?d.leftShoulder.slice():mirrored(d.shoulder)});
    result.push({name:`${side}Forearm`,parent:arm,p:side==='left'&&d.leftElbow?d.leftElbow.slice():mirrored(d.elbow)});
    result.push({name:`${side}Hand`,parent:arm+1,p:side==='left'&&d.leftWrist?d.leftWrist.slice():mirrored(d.wrist)});
    const leg=result.length;
    result.push({name:`${side}Thigh`,parent:0,p:mirrored(d.hip)});
    result.push({name:`${side}Shin`,parent:leg,p:mirrored(d.knee)});
    result.push({name:`${side}Foot`,parent:leg+1,p:mirrored(d.foot)});
  }
  if(kind==='arthas') {
    // The top now hinges at the shoulder attachment, rather than mid-back.
    result.push({name:'cape',parent:2,p:[0,.716,-.105]});
    result.push({name:'capeHem',parent:16,p:[0,.424,-.145]});
  }
  if(kind==='dreadlord')for(const [side,sign] of [['right',1],['left',-1]]){
    const root=result.length;
    result.push({name:`${side}Wing`,parent:2,p:[d.wing[0]*sign,d.wing[1],d.wing[2]]});
    result.push({name:`${side}WingTip`,parent:root,p:[d.wingTip[0]*sign,d.wingTip[1],d.wingTip[2]]});
  }
  return result;
}

function textureSampler(texture) {
  const source=texture?.image;
  if(!source || typeof document==='undefined')return null;
  try {
    const canvas=document.createElement('canvas');
    canvas.width=source.width;canvas.height=source.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(source,0,0);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    return (u,v)=>{
      // GLTFLoader uses flipY=false. Keep the same image/UV convention.
      const row=clamp(texture.flipY?1-v:v,0,.999999);
      const i=(Math.floor(row*canvas.height)*canvas.width+Math.floor(clamp(u,0,.999999)*canvas.width))*4;
      const r=pixels[i]/255,g=pixels[i+1]/255,b=pixels[i+2]/255;
      const max=Math.max(r,g,b,.03);
      return {
        blue:smooth(.07,.28,(b-r)/max)*smooth(.005,.12,(b-g)/max),
        gold:smooth(.10,.30,(r-b)/max)*smooth(.03,.20,(g-b)/max),
      };
    };
  } catch {
    // Geometry-based cape detection still works when texture pixels are absent.
    return null;
  }
}

function interpolateArmX(y,d) {
  if(y>=d.elbow[1])return mix(d.elbow[0],d.shoulder[0],clamp((y-d.elbow[1])/(d.shoulder[1]-d.elbow[1]),0,1));
  return mix(d.wrist[0],d.elbow[0],clamp((y-d.wrist[1])/(d.elbow[1]-d.wrist[1]),0,1));
}

function addPair(weights,a,b,t,amount=1) {
  weights[a]+=amount*(1-t);weights[b]+=amount*t;
}
function blendDistribution(target,other,amount) {
  for(let i=0;i<target.length;i++)target[i]=mix(target[i],other[i],amount);
}

// Binary surface segmentation uses the narrow mesh connection, not a plane
// through the enormous inward-curling fingers. Dinic runs once per template.
function segmentHeavyArms(points){
  const n=points.length,source=n,sink=n+1,graph=Array.from({length:n+2},()=>[]);
  const edge=(a,b,c)=>{const f={to:b,capacity:c,reverse:graph[b].length},r={to:a,capacity:0,reverse:graph[a].length};graph[a].push(f);graph[b].push(r);};
  for(const p of points){
    const ax=Math.abs(p.x),near=Math.hypot(ax-.352,p.y-.46,p.z-.052);
    const upperArm=ax>.264&&ax<.402&&p.y>.655&&p.y<.785&&p.z<.02;
    const arm=(ax>.334&&p.y>.31&&p.y<.735)||(near<.092&&ax>.253)||upperArm;
    const body=ax<.220||p.y<.285||p.y>.858||(ax<.29&&p.z>.155&&p.y>.47&&p.y<.68);
    if(arm&&!body)edge(source,p.id,10000);
    if(body)edge(p.id,sink,10000);
    for(const id of p.neighbours)if(id>p.id){
      const q=points[id],length=Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z);
      const capacity=1/(1+length/.016);edge(p.id,id,capacity);edge(id,p.id,capacity);
    }
  }
  const level=new Int32Array(n+2),cursor=new Int32Array(n+2),queue=new Int32Array(n+2);
  function layers(){level.fill(-1);let head=0,tail=0;queue[tail++]=source;level[source]=0;
    while(head<tail){const v=queue[head++];for(const e of graph[v])if(e.capacity>1e-9&&level[e.to]<0){level[e.to]=level[v]+1;queue[tail++]=e.to;}}
    return level[sink]>=0;
  }
  function send(v,flow){if(v===sink)return flow;
    for(;cursor[v]<graph[v].length;cursor[v]++){
      const e=graph[v][cursor[v]];if(e.capacity<=1e-9||level[e.to]!==level[v]+1)continue;
      const sent=send(e.to,Math.min(flow,e.capacity));if(sent>1e-9){e.capacity-=sent;graph[e.to][e.reverse].capacity+=sent;return sent;}
    }return 0;
  }
  while(layers()){cursor.fill(0);while(send(source,1e9)>1e-9){/* augment */}}
  const armRegion=new Uint8Array(n),seen=new Uint8Array(n+2);let head=0,tail=0;queue[tail++]=source;seen[source]=1;
  while(head<tail){const v=queue[head++];if(v<n)armRegion[v]=1;for(const e of graph[v])if(e.capacity>1e-9&&!seen[e.to]){seen[e.to]=1;queue[tail++]=e.to;}}
  return armRegion;
}

// The four replacement bodies have independent measured proportions. Preserve
// the accepted hero's weighting code below; these regions only see new undead.
function skinEnemyGeometry(geometry,kind,bones){
  const d=anatomy[kind],h=HEIGHT[kind],width=bones.length;
  if(!d||width!==(kind==='dreadlord'?20:16))throw new Error(`Invalid ${kind} skeleton`);
  const position=geometry.attributes.position,vertices=new Array(position.count),welded=new Map();
  for(let i=0;i<position.count;i++){
    const x=position.getX(i)/h,y=position.getY(i)/h,z=position.getZ(i)/h;
    const key=`${Math.round(x*100000)},${Math.round(y*100000)},${Math.round(z*100000)}`;
    let p=welded.get(key);
    if(!p){p={id:welded.size,x,y,z,neighbours:new Set(),island:-1,wing:0};welded.set(key,p);}
    vertices[i]=p;
  }
  const points=[...welded.values()];
  let removedBridgeTriangles=0;
  let indices=geometry.index?.array;
  const count=indices?indices.length:vertices.length;
  for(let i=0;i<count;i+=3)for(let j=0;j<3;j++){
    const a=vertices[indices?indices[i+j]:i+j],b=vertices[indices?indices[i+(j+1)%3]:i+(j+1)%3];
    if(a!==b){a.neighbours.add(b.id);b.neighbours.add(a.id);}
  }
  if(kind==='abomination'){
    const armRegion=segmentHeavyArms(points);
    for(const p of points)p.heavyArm=armRegion[p.id];
    const retained=[];
    for(let i=0;i<indices.length;i+=3){
      const tri=[vertices[indices[i]],vertices[indices[i+1]],vertices[indices[i+2]]];
      const cy=tri.reduce((n,p)=>n+p.y,0)/3;
      const bridge=cy>.29&&cy<.68&&tri.some(p=>p.heavyArm)&&tri.some(p=>!p.heavyArm);
      if(bridge)removedBridgeTriangles++;else retained.push(indices[i],indices[i+1],indices[i+2]);
    }
    geometry.setIndex(retained);indices=geometry.index.array;
    for(const p of points)p.neighbours.clear();
    for(let i=0;i<indices.length;i+=3)for(let j=0;j<3;j++){
      const a=vertices[indices[i+j]],b=vertices[indices[i+(j+1)%3]];
      if(a!==b){a.neighbours.add(b.id);b.neighbours.add(a.id);}
    }
  }
  // Wings lie behind the shoulder/arm volume. Their outer membrane can descend
  // to ankle height, so height-only and nearest-arm classification are invalid.
  // The small shoulder attachment band blends only chest/root-wing, never hands.
  if(kind==='dreadlord')for(const p of points){
    const ax=Math.abs(p.x),outer=smooth(.300,.346,ax);
    const rear=smooth(.056,.098,-p.z)*smooth(.119,.204,ax);
    const upper=smooth(.696,.748,p.y)*smooth(.139,.195,ax);
    p.wing=Math.max(outer,rear,upper);
  }
  // Cut the actual surface below the armpit. Cuffs and palms form separate
  // connected islands even where a front projection overlaps a belt or skirt.
  const cutoff=kind==='abomination'?.690:Math.min(d.shoulder[1]-.072,d.elbow[1]+.018),lower=Math.max(.16,d.wrist[1]-.19);
  const available=new Set(points.filter(p=>p.y<cutoff&&p.y>lower&&p.wing<.20).map(p=>p.id));
  let armIslands=0;
  while(available.size){
    const seed=available.values().next().value;available.delete(seed);
    const queue=[seed],component=[];
    while(queue.length){const p=points[queue.pop()];component.push(p);for(const id of p.neighbours)if(available.delete(id))queue.push(id);}
    let minX=Infinity,maxX=-Infinity,nearWrist=Infinity,meanX=0;
    for(const p of component){
      minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);meanX+=p.x;
      nearWrist=Math.min(nearWrist,Math.hypot(Math.abs(p.x)-d.wrist[0],p.y-d.wrist[1],p.z-d.wrist[2]));
    }
    meanX/=component.length;
    const side=minX>.045?0:maxX<-.045?1:-1;
    const isArm=side>=0&&Math.abs(meanX)>(kind==='abomination'?.289:d.elbow[0]-.075)&&nearWrist<d.armRadius*1.65&&component.length<points.length*.24;
    if(isArm)armIslands++;
    for(const p of component)p.island=isArm?side:2;
  }
  if(kind==='abomination')for(const p of points)if(p.y<cutoff&&p.y>lower)p.island=p.heavyArm?(p.x>=0?0:1):2;
  const stats={vertices:position.count,weldedVertices:points.length,invalidWeights:0,armIslands,wingVertices:0,headVertices:0,smoothingPasses:20,removedBridgeTriangles};
  for(const p of points){
    const {x,y,z}=p,ax=Math.abs(x),side=x>=0?0:1,arm=side===0?4:10;
    const w=new Float32Array(width),spine=d.spine||.60;
    if(y<spine)addPair(w,0,1,smooth(d.waist-.006,spine+.018,y));
    else addPair(w,1,2,smooth(spine-.018,d.chest-.018,y));
    const legs=new Float32Array(width),split=smooth(-.017,.017,x);
    const thigh=smooth(d.knee[1]-.028,d.knee[1]+.043,y);
    const foot=1-smooth(d.foot[1]+.010,d.foot[1]+.064,y);
    for(const [base,factor]of[[7,split],[13,1-split]]){
      legs[base]=factor*thigh;legs[base+1]=factor*(1-thigh)*(1-foot);legs[base+2]=factor*(1-thigh)*foot;
    }
    let legAmount=1-smooth(d.hip[1]-.020,d.hip[1]+.065,y);
    // Hanging centre panels stay connected to the pelvis instead of separating
    // into a left and right thigh when a stride opens the legs.
    if((kind==='zombie'||kind==='abomination'||kind==='dreadlord')&&ax<.088){
      const panel=(1-smooth(.050,.088,ax))*smooth(.025,.069,z)*smooth(.065,.140,y);
      legAmount*=1-panel*.88;
    }
    blendDistribution(w,legs,legAmount);
    const armWeights=new Float32Array(width);
    const upper=smooth(d.elbow[1]-.026,d.elbow[1]+.039,y);
    const hand=1-smooth(d.wrist[1]-.012,d.wrist[1]+.032,y);
    armWeights[arm]=upper;armWeights[arm+1]=(1-upper)*(1-hand);armWeights[arm+2]=(1-upper)*hand;
    const inner=interpolateArmX(y,d)-d.armRadius;
    const centreZ=y>=d.elbow[1]
      ?mix(d.elbow[2],d.shoulder[2],clamp((y-d.elbow[1])/(d.shoulder[1]-d.elbow[1]),0,1))
      :mix(d.wrist[2],d.elbow[2],clamp((y-d.wrist[1])/(d.elbow[1]-d.wrist[1]),0,1));
    const axisDistance=Math.hypot(ax-inner-d.armRadius,z-centreZ);
    let armAmount=smooth(inner-.017,inner+.026,ax)*(1-smooth(d.shoulder[1]+.045,d.shoulder[1]+.105,y));
    armAmount*=1-smooth(d.armRadius*1.35,d.armRadius*2.15,axisDistance);
    const heightGate=smooth(lower-.018,lower+.025,y)*(1-smooth(d.shoulder[1]+.045,d.shoulder[1]+.105,y));
    const outside=smooth(d.elbow[0]-d.armRadius*.55,d.elbow[0]-d.armRadius*.15,ax)*heightGate;
    armAmount=Math.max(armAmount*heightGate,outside);
    const islandStrength=1-smooth(cutoff-.065,cutoff,y);
    if(p.island===side)armAmount=mix(armAmount,1,islandStrength);
    // A chain or fused cuff can bridge the arm to the torso in the generated
    // mesh. A body-island label may suppress only points outside the limb volume.
    if(p.island===2)armAmount*=kind==='abomination'?1-islandStrength:1-islandStrength*(1-outside)*smooth(d.armRadius*1.05,d.armRadius*1.6,axisDistance);
    blendDistribution(w,armWeights,armAmount);
    const headAmount=smooth(d.neck-.034,d.neck+.018,y)*(1-smooth(d.headWidth-.016,d.headWidth+.035,ax));
    if(headAmount>0){const head=new Float32Array(width);head[3]=1;blendDistribution(w,head,headAmount);if(headAmount>.95)stats.headVertices++;}
    if(p.wing>0){
      const wing=new Float32Array(width),base=side===0?16:18;
      const attachment=1-smooth(.126,.215,ax);
      const tip=smooth(.225,.395,ax);
      wing[2]=attachment;wing[base]=(1-attachment)*(1-tip);wing[base+1]=(1-attachment)*tip;
      blendDistribution(w,wing,p.wing);if(p.wing>.95)stats.wingVertices++;
    }
    p.weights=w;
    p.locked=(y<d.foot[1]-.007&&p.wing<.01)||(headAmount>.999&&y>d.neck+.064&&p.wing<.01);
    p.neighbourWeights=[];let total=0;
    for(const id of p.neighbours){const q=points[id],weight=1/Math.sqrt(Math.max(.001,Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z)));p.neighbourWeights.push([id,weight]);total+=weight;}
    for(const pair of p.neighbourWeights)pair[1]/=total||1;
  }
  let current=new Float32Array(points.length*width),next=new Float32Array(current.length);
  for(const p of points)current.set(p.weights,p.id*width);
  for(let pass=0;pass<20;pass++){
    for(const p of points){
      const b=p.id*width;
      if(p.locked||!p.neighbours.size){next.set(current.subarray(b,b+width),b);continue;}
      for(let j=0;j<width;j++){
        let value=current[b+j]*.45;
        for(const [id,weight]of p.neighbourWeights)value+=current[id*width+j]*weight*.55;
        next[b+j]=value;
      }
      // Continuous interior masks keep a hand wholly on its arm chain and a
      // membrane wholly on chest/wing. The transition rings remain smooth.
      let allowed=null,strength=0;
      if(p.wing>.8){allowed=p.x>=0?[2,16,17]:[2,18,19];strength=smooth(.80,.995,p.wing);}
      else if(p.island===0||p.island===1){const a=p.island===0?4:10;allowed=[a,a+1,a+2];strength=1-smooth(cutoff-.065,cutoff,p.y);}
      if(allowed&&strength>0){
        const sum=allowed.reduce((n,j)=>n+next[b+j],0)||1;
        for(let j=0;j<width;j++)next[b+j]=mix(next[b+j],allowed.includes(j)?next[b+j]/sum:0,strength);
      }
    }
    [current,next]=[next,current];
  }
  const indexData=new Uint16Array(position.count*4),weightData=new Float32Array(position.count*4);
  for(const p of points){
    const weights=current.subarray(p.id*width,(p.id+1)*width);
    const strongest=Array.from(weights,(w,i)=>[i,w]).filter(([,w])=>w>1e-6).sort((a,b)=>b[1]-a[1]).slice(0,4);
    let sum=strongest.reduce((n,[,w])=>n+w,0);
    if(!Number.isFinite(sum)||sum<=0){strongest.splice(0,strongest.length,[0,1]);sum=1;stats.invalidWeights++;}
    p.skin=strongest.map(([i,w])=>[i,w/sum]);
  }
  for(let i=0;i<vertices.length;i++)vertices[i].skin.forEach(([bone,weight],j)=>{indexData[i*4+j]=bone;weightData[i*4+j]=weight;});
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indexData,4));
  geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weightData,4));
  geometry.userData.rigging=stats;geometry.computeBoundingSphere();return geometry;
}

/**
 * Anatomical skinning with continuous joint bands. Unlike nearest-bone scoring,
 * distant hands cannot capture a skirt, and thighs cannot capture low fingers.
 * Inputs match the previous skinGeometry(geometry,kind,bones,texture) API.
 */
export function skinGeometry(geometry,kind,bones,texture) {
  if(kind!=='arthas')return skinEnemyGeometry(geometry,kind,bones);
  const d=anatomy[kind],height=HEIGHT[kind];
  if(!d || bones.length!==(kind==='arthas'?18:16))throw new Error(`Invalid ${kind} skeleton`);
  const position=geometry.attributes.position,uv=geometry.attributes.uv,normal=geometry.attributes.normal;
  const indexData=new Uint16Array(position.count*4),weightData=new Float32Array(position.count*4);
  const sample=kind==='arthas'?textureSampler(texture):null;
  const welded=new Map(),vertexGroups=new Array(position.count);

  // UV seams duplicate a position. Give all copies the same colour mask and the
  // same weights, so a sleeve/cape seam cannot open under a large arm rotation.
  for(let i=0;i<position.count;i++) {
    const x=position.getX(i)/height,y=position.getY(i)/height,z=position.getZ(i)/height;
    const key=`${Math.round(x*50000)},${Math.round(y*50000)},${Math.round(z*50000)}`;
    let point=welded.get(key);
    if(!point){point={x,y,z,blue:0,gold:0,count:0,nx:0,ny:0,nz:0,id:welded.size,neighbours:new Set(),armIsland:-1};welded.set(key,point);}
    const colour=sample&&uv?sample(uv.getX(i),uv.getY(i)):null;
    point.blue+=colour?.blue||0;point.gold+=colour?.gold||0;point.count++;
    if(normal){point.nx+=normal.getX(i);point.ny+=normal.getY(i);point.nz+=normal.getZ(i);}
    vertexGroups[i]=point;
  }

  const points=Array.from(welded.values());
  const edgeUse=new Map();
  const triangleIndex=geometry.index?.array;
  const triangleCount=triangleIndex?triangleIndex.length:position.count;
  for(let i=0;i<triangleCount;i+=3)for(let k=0;k<3;k++){
    const a=vertexGroups[triangleIndex?triangleIndex[i+k]:i+k];
    const b=vertexGroups[triangleIndex?triangleIndex[i+(k+1)%3]:i+(k+1)%3];
    if(a&&b&&a!==b){
      a.neighbours.add(b.id);b.neighbours.add(a.id);
      const key=a.id<b.id?`${a.id}:${b.id}`:`${b.id}:${a.id}`;
      edgeUse.set(key,(edgeUse.get(key)||0)+1);
    }
  }
  for(const [key,count] of edgeUse)if(count===1){const [a,b]=key.split(':').map(Number);points[a].boundary=true;points[b].boundary=true;}
  for(const p of points){const length=Math.hypot(p.nx,p.ny,p.nz)||1;p.nx/=length;p.ny/=length;p.nz/=length;}

  // Below the armpit, cuffs/palms are separate surface islands even when they
  // overlap the waist in a front projection. Classify the connected surface,
  // rather than alternating body/arm weights across the inner cuff's triangles.
  const cutoff=.677;
  const available=new Set(points.filter(p=>p.y>.29&&p.y<cutoff&&(kind!=='arthas'||p.z>-.105)).map(p=>p.id));
  let islands=0,islandVertices=0;
  while(available.size){
    const seed=available.values().next().value;available.delete(seed);
    const queue=[seed],component=[];
    while(queue.length){const id=queue.pop();component.push(points[id]);for(const neighbour of points[id].neighbours)if(available.delete(neighbour))queue.push(neighbour);}
    if(component.length<3||component.length>points.length*.22)continue;
    let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,meanX=0,meanY=0;
    for(const p of component){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);meanX+=p.x;meanY+=p.y;}
    meanX/=component.length;meanY/=component.length;
    const side=minX>.064?0:maxX<-.064?1:-1;
    const threshold=kind==='arthas'?(side===0?.118:.167):kind==='zombie'?.187:.238;
    if(side<0||Math.abs(meanX)<threshold||minY<.328||meanY>cutoff-.009)continue;
    islands++;islandVertices+=component.length;
    for(const p of component)p.armIsland=side;
  }

  for(const p of points){
    p.neighbourWeights=[];let total=0;
    for(const id of p.neighbours){const q=points[id],weight=1/Math.pow(Math.max(.001,Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z)),.5);p.neighbourWeights.push([id,weight]);total+=weight;}
    for(const entry of p.neighbourWeights)entry[1]/=total||1;
  }
  const statistics={vertices:position.count,weldedVertices:welded.size,capeVertices:0,headVertices:0,invalidWeights:0,armIslands:islands,armIslandVertices:islandVertices,smoothingPasses:20};
  for(const point of welded.values()) {
    const {x,y,z}=point,ax=Math.abs(x),side=x>=0?0:1;
    const arm=side===0?4:10,leg=side===0?7:13;
    const blue=point.blue/point.count,gold=point.gold/point.count;
    const weights=new Float64Array(bones.length);

    // Pelvis/spine/chest rotation progresses up the torso. No head weights are
    // admitted here; wide pauldrons used to be pulled toward the head capsule.
    if(y<.60)addPair(weights,0,1,smooth(d.waist-.005,.63,y));
    else addPair(weights,1,2,smooth(.60,.73,y));

    // Continuous thigh/knee/ankle weights. Only the narrow crotch strip mixes the
    // two legs. Low boots and toes follow the foot rigidly, not the shin.
    const legWeights=new Float64Array(bones.length);
    const thigh=smooth(d.knee[1]-.035,d.knee[1]+.040,y);
    const foot=1-smooth(d.foot[1]+.007,d.foot[1]+.070,y);
    const split=smooth(-.018,.018,x);
    for(const [base,factor] of [[7,split],[13,1-split]]) {
      legWeights[base]=factor*thigh;
      legWeights[base+1]=factor*(1-thigh)*(1-foot);
      legWeights[base+2]=factor*(1-thigh)*foot;
    }
    let legAmount=1-smooth(d.hip[1]-.015,d.hip[1]+.075,y);
    if(kind==='arthas' && blue>.25 && z>.018 && y>.25 && y<.49) {
      // The blue/gold front tabard hangs from the belt; keep most of it on hips.
      legAmount*=.18;
    } else if(kind!=='arthas' && ax<.072 && y>.27 && y<d.hip[1]) {
      legAmount*=mix(.35,1,smooth(.30,d.hip[1],y));
    }
    blendDistribution(weights,legWeights,legAmount);

    // Arms are admitted by the outside contour of each actual limb, never by
    // height alone. This keeps palms connected even below the pelvis line.
    const armAnatomy=kind==='arthas'&&side===1?{...d,shoulder:d.leftShoulder.map(Math.abs),elbow:[Math.abs(d.leftElbow[0]),...d.leftElbow.slice(1)],wrist:[Math.abs(d.leftWrist[0]),...d.leftWrist.slice(1)]}:d;
    const centreX=interpolateArmX(y,armAnatomy);
    const inner=centreX-d.armRadius;
    let armAmount=smooth(inner-.014,inner+.024,ax);
    armAmount*=smooth(.265,.345,y)*(1-smooth(d.shoulder[1]+.055,d.shoulder[1]+.115,y));
    const armWeights=new Float64Array(bones.length);
    const upper=smooth(d.elbow[1]-.033,d.elbow[1]+.041,y);
    const hand=1-smooth(d.wrist[1]-.019,d.wrist[1]+.035,y);
    armWeights[arm]=upper;
    armWeights[arm+1]=(1-upper)*(1-hand);
    armWeights[arm+2]=(1-upper)*hand;
    blendDistribution(weights,armWeights,armAmount);
    if(point.armIsland===side){blendDistribution(weights,armWeights,1-smooth(.610,cutoff,y));}

    // Large gold pauldrons get one stable chest/upper-arm mixture throughout the
    // plate. Elbow and head motion no longer crushes or wrinkles their surfaces.
    if(kind==='arthas') {
      const pauldron=smooth(.099,.132,ax)*(1-smooth(.221,.253,ax))
        *smooth(.686,.720,y)*(1-smooth(.823,.853,y))*Math.max(.4,gold);
      if(pauldron>0){
        const plate=new Float64Array(bones.length);plate[2]=.28;plate[arm]=.72;
        blendDistribution(weights,plate,pauldron);
      }
    }

    // Head and long hair move together. The narrow central-neck collar is the
    // only transition to chest; no forearm, shoulder, or pelvis weights survive.
    const headWidth=d.headWidth;
    let headAmount=smooth(d.neck-.039,d.neck+.009,y)*(1-smooth(headWidth-.015,headWidth+.027,ax));
    if(kind==='arthas' && gold>.25 && y>.778 && ax<.100) {
      const hair=gold*smooth(.778,.830,y)*(1-smooth(.082,.113,ax));
      headAmount=Math.max(headAmount,hair);
    }
    if(headAmount>0){
      const head=new Float64Array(bones.length);head[3]=1;
      blendDistribution(weights,head,headAmount);
      if(headAmount>.95)statistics.headVertices+=point.count;
    }

    if(kind==='arthas') {
      // Both back-depth and blue cloth identify cape, including its forward-
      // flaring edges. Blend the shoulder attachment over a band, not a cutoff.
      // Blue sleeves and the rear edge of gold pauldrons are not cape. On the
      // upper body require actual rear depth; only the lower flared hem may come
      // forward. Gold armour never uses a cloth bone based on depth alone.
      const back=smooth(.092,.135,-z)*(1-gold);
      const requiredDepth=mix(-.026,.076,smooth(.49,.67,y));
      const blueBack=blue*smooth(requiredDepth,requiredDepth+.035,-z);
      const capeAmount=Math.max(back,blueBack)*smooth(.085,.137,y)*(1-smooth(.726,.797,y));
      if(capeAmount>0&&point.armIsland<0) {
        const cape=new Float64Array(bones.length);
        const hem=1-smooth(.285,.540,y);
        const attachment=smooth(.670,.768,y);
        cape[2]=attachment;
        cape[16]=(1-attachment)*(1-hem);
        cape[17]=(1-attachment)*hem;
        blendDistribution(weights,cape,capeAmount);
        if(capeAmount>.7)statistics.capeVertices+=point.count;
      }
    }

    point.weights=weights;
    point.locked=y<.066 || (headAmount>.99&&y>.89);
  }

  // Smooth on welded topology, including UV seam neighbours. Rigid core hands,
  // feet, and heads retain their semantic region; joint transition rings lose
  // the high-frequency weight jumps that produced metre-long metal ribbons.
  const width=bones.length;
  let current=new Float32Array(points.length*width),next=new Float32Array(current.length);
  for(const p of points)current.set(p.weights,p.id*width);
  for(let pass=0;pass<20;pass++){
    for(const p of points){
      const base=p.id*width;
      if(p.locked||!p.neighbours.size){next.set(current.subarray(base,base+width),base);continue;}
      for(let j=0;j<width;j++){
        let value=current[base+j]*.45;
        for(const [neighbour,weight] of p.neighbourWeights)value+=current[neighbour*width+j]*weight*.55;
        next[base+j]=value;
      }
      if(p.armIsland>=0){
        const a=p.armIsland===0?4:10;
        let total=next[base+a]+next[base+a+1]+next[base+a+2];
        if(total<1e-8)total=1;
        const strength=1-smooth(.610,cutoff,p.y);
        for(let j=0;j<width;j++)next[base+j]=mix(next[base+j],j>=a&&j<=a+2?next[base+j]/total:0,strength);
      }
    }
    [current,next]=[next,current];
  }

  // Seal only millimetre-scale cracks along genuinely open seams.
  // Do this AFTER anatomical island classification: an early broad weld can
  // accidentally connect a cuff to a nearby waist and bring back arm ribbons.
  // Mutual-nearest pairs cannot cascade into a large cluster or fill torn cloth.
  const seamRadius=.0015,buckets=new Map(),nearest=new Int32Array(points.length).fill(-1);
  // Limit this small repair to the observed undead abdomen/skirt/leg seams.
  // Hero armour, weapons, shoulders, open cuffs, and torn outer hems stay intact.
  const boundary=points.filter(p=>kind!=='arthas'&&p.boundary&&p.armIsland<0
    &&p.y>.13&&p.y<.71&&Math.abs(p.x)<(kind==='abomination'?.242:.180));
  for(const p of boundary){const key=`${Math.floor(p.x/seamRadius)},${Math.floor(p.y/seamRadius)},${Math.floor(p.z/seamRadius)}`;let bucket=buckets.get(key);if(!bucket){bucket=[];buckets.set(key,bucket);}bucket.push(p);}
  for(const p of boundary){
    const cx=Math.floor(p.x/seamRadius),cy=Math.floor(p.y/seamRadius),cz=Math.floor(p.z/seamRadius);
    let best=seamRadius*seamRadius;
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(let dz=-1;dz<=1;dz++){
      const bucket=buckets.get(`${cx+dx},${cy+dy},${cz+dz}`);if(!bucket)continue;
      for(const q of bucket){
        if(q===p||q.armIsland!==p.armIsland||p.neighbours.has(q.id))continue;
        if(normal&&p.nx*q.nx+p.ny*q.ny+p.nz*q.nz<.55)continue;
        const squared=(p.x-q.x)**2+(p.y-q.y)**2+(p.z-q.z)**2;
        if(squared<best){best=squared;nearest[p.id]=q.id;}
      }
    }
  }
  statistics.sealedSeamPairs=0;statistics.maxSeamMovement=0;
  for(const p of boundary){
    const id=nearest[p.id];if(id<=p.id||nearest[id]!==p.id)continue;
    const q=points[id],centre=[(p.x+q.x)*.5,(p.y+q.y)*.5,(p.z+q.z)*.5];
    statistics.maxSeamMovement=Math.max(statistics.maxSeamMovement,Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z)*height*.5);
    p.sealedPosition=centre;q.sealedPosition=centre;
    for(let j=0;j<width;j++){const average=(current[p.id*width+j]+current[q.id*width+j])*.5;current[p.id*width+j]=average;current[q.id*width+j]=average;}
    statistics.sealedSeamPairs++;
  }
  for(const point of points){
    const weights=current.subarray(point.id*width,(point.id+1)*width);
    // Keep at most four influences and renormalize after filtering tiny values.
    const strongest=Array.from(weights,(weight,index)=>[index,weight])
      .filter(([,weight])=>weight>1e-6).sort((a,b)=>b[1]-a[1]).slice(0,4);
    let sum=strongest.reduce((total,[,weight])=>total+weight,0);
    if(!Number.isFinite(sum)||sum<=0){strongest.splice(0,strongest.length,[0,1]);sum=1;statistics.invalidWeights++;}
    point.skin=strongest.map(([index,weight])=>[index,weight/sum]);
  }
  for(let i=0;i<position.count;i++){
    const point=vertexGroups[i];
    if(point.sealedPosition)position.setXYZ(i,...point.sealedPosition.map(v=>v*height));
    point.skin.forEach(([index,weight],j)=>{indexData[i*4+j]=index;weightData[i*4+j]=weight;});
  }
  if(statistics.sealedSeamPairs)position.needsUpdate=true;
  geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indexData,4));
  geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weightData,4));
  geometry.userData.rigging=statistics;
  geometry.computeBoundingSphere();
  return geometry;
}
