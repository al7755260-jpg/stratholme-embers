import * as T from 'three';

// All geometry passes through world's material buckets, including the owning
// building bucket. Decorative facades therefore fade with their actual house.
export function decorateTownhouse(api,house){
 const {mat,put,box,beam,addBanner}=api;
 const {x,z,w,d,h,rotation,variant}=house,co=Math.cos(rotation),si=Math.sin(rotation);
 const p=(lx,y,lz)=>new T.Vector3(x+lx*co+lz*si,y,z-lx*si+lz*co);
 const b=(lx,y,lz,ww,hh,dd,m,rz=0)=>{const v=p(lx,y,lz);box(v.x,v.y,v.z,ww,hh,dd,m,rotation,rz);};
 function pointed(lx,y,lz,ww,hh,depth,m,face){
  const r=ww/2,s=new T.Shape();s.moveTo(-r,0);s.lineTo(-r,hh*.64);s.quadraticCurveTo(-r,hh*.84,0,hh);s.quadraticCurveTo(r,hh*.84,r,hh*.64);s.lineTo(r,0);s.closePath();
  const v=p(lx,y,lz);put(new T.ExtrudeGeometry(s,{depth,bevelEnabled:false,curveSegments:3}),m,v.x,v.y,v.z,0,rotation+(face<0?Math.PI:0));
 }
 // Wide foundation courses, upper cornice, narrow stone ribs and buttress feet.
 b(0,.25,0,w+.20,.5,d+.18,mat.darkStone);
 for(const face of [-1,1]){
  const fz=face*(d*.5+.065);
  b(0,.67,fz,w+.30,.18,.22,mat.trim);b(0,h*.435,fz,w+.42,.24,.30,mat.trim);
  b(0,h*.86,fz,w+.34,.16,.22,mat.darkWood);
  for(const xx of [-w*.475,w*.475]){
   b(xx,h*.35,fz,.32,h*.7,.27,mat.darkStone);
   b(xx,.47,fz+face*.08,.63,.85,.42,mat.trim);
   for(let row=0;row<5;row++)b(xx,1+row*h*.13,fz+face*.04,.45,.09,.34,mat.trim);
   b(xx,h*.71,fz,.53,.17,.48,mat.trim);
  }
  // Tall, grouped lancets give each stretched GLB a legible gothic silhouette.
  const windowY=h*.47,windowH=Math.min(2.2,h*.25),windowW=Math.min(.91,w*.14);
  for(let k=-1;k<=1;k++){
   const lx=k*w*.28;
   pointed(lx,windowY,fz+face*.11,windowW+.24,windowH+.22,.07,mat.trim,face);
   pointed(lx,windowY+.1,fz+face*.21,windowW,windowH,.04,(k+variant)%3===0?mat.glass:mat.black,face);
   b(lx,windowY+windowH*.49,fz+face*.28,.075,windowH*.9,.07,mat.darkStone);
   b(lx,windowY+windowH*.41,fz+face*.28,windowW,.085,.08,mat.darkStone);
   b(lx,windowY-.06,fz+face*.20,windowW+.42,.16,.43,mat.trim);
  }
  const doorX=variant%2?w*.22:-w*.19;
  pointed(doorX,.20,fz+face*.17,1.62,2.84,.15,mat.trim,face);
  pointed(doorX,.23,fz+face*.34,1.22,2.50,.07,mat.darkWood,face);
  b(doorX,1.23,fz+face*.44,1.13,.09,.06,mat.metal);b(doorX,.62,fz+face*.44,1.13,.09,.06,mat.metal);
  b(doorX,.14,fz+face*.50,1.9,.27,1.1,mat.trim);
  // Every facade has a warm wall lantern; these emissive panes share one batch.
  const lampX=-doorX*.65+(doorX>0?-1.2:1.25),lampY=2.5;
  b(lampX,lampY+.44,fz+face*.32,.10,.25,.68,mat.metal);
  b(lampX,lampY,fz+face*.66,.32,.50,.24,mat.glass);
  for(const sx of [-1,1])b(lampX+sx*.20,lampY,fz+face*.66,.055,.62,.35,mat.metal);
  b(lampX,lampY+.34,fz+face*.66,.5,.12,.44,mat.metal);b(lampX,lampY-.34,fz+face*.66,.45,.10,.4,mat.metal);
  // Projecting shop board, its silhouette readable from the tactical camera.
  if(face>0){
   const sx=w*.34,sy=h*.40;
   b(sx,sy+.76,fz+face*.62,.11,.12,1.25,mat.metal);
   b(sx,sy+.28,fz+face*1.15,.10,.93,.78,mat.darkWood);
   b(sx,sy+.28,fz+face*1.15,.12,.11,.75,mat.gold);
   b(sx,sy+.28,fz+face*1.15,.13,.61,.10,mat.gold);
  }
 }
 // Bricked chimney caps, broken roof-edge tracery and a blue Alliance banner.
 const chimneyX=w*(variant%2?.30:-.28),chimneyY=h+w*.46;
 b(chimneyX,chimneyY,0,.78,2.25,.85,mat.darkStone);
 b(chimneyX,chimneyY+1.17,0,1.06,.16,1.13,mat.trim);
 b(chimneyX,chimneyY+1.265,0,.70,.03,.77,mat.black);
 for(let j=0;j<5;j++)b(chimneyX,chimneyY-.86+j*.4,.43,.82,.065,.055,mat.trim);
 const flag=p(-w*.34,h*.68,d*.5+.7);addBanner(flag.x,flag.y,flag.z,rotation);
}

export function addDistrictDetails(api){
 const {mat,put,box,cyl,beam,range,rand}=api;
 const stone=mat.statue,iron=mat.metal,slate=mat.darkStone;
 const v=(x,y,z)=>new T.Vector3(x,y,z);
 // Square plinth and a weathered armoured knight, facing the entrance street.
 const fx=-6,fz=-13,base=2.72;
 box(fx,base,fz,1.65,.36,1.60,mat.trim);box(fx,base+.22,fz,1.35,.12,1.3,slate);
 const kb=(x,y,z,w,h,d,m=stone,rz=0)=>box(fx+x,base+y,fz+z,w,h,d,m,0,rz);
 const kc=(x,y,z,ra,rb,h,m=stone,n=7)=>cyl(fx+x,base+y,fz+z,ra,rb,h,m,n);
 const limb=(a,b,r,m=stone)=>beam(v(fx+a[0],base+a[1],fz+a[2]),v(fx+b[0],base+b[1],fz+b[2]),r,m);
 for(const side of [-1,1]){
  kb(side*.30,.32,.17,.44,.24,.75);kc(side*.29,.88,.05,.19,.24,.98);
  put(new T.IcosahedronGeometry(.25,0),stone,fx+side*.29,base+1.38,fz+.09);
  kc(side*.28,1.68,.0,.25,.23,.62);kb(side*.31,1.00,.24,.27,.67,.17,mat.trim);
 }
 kb(0,1.94,0,.87,.40,.49);kc(0,2.26,0,.58,.41,.57,stone,6);
 kc(0,2.53,0,.49,.55,.13,mat.trim,6);kc(0,2.72,0,.17,.24,.24,slate,8);
 put(new T.IcosahedronGeometry(.36,1),stone,fx,base+3.03,fz+.02);
 kb(0,3.01,.33,.5,.075,.05,slate);kb(0,3.12,.345,.07,.29,.065,mat.trim);
 kb(0,3.39,-.015,.12,.38,.5,mat.trim);
 for(const side of [-1,1]){
  put(new T.IcosahedronGeometry(.40,0),stone,fx+side*.62,base+2.45,fz-.01);
  limb([side*.62,2.36,0],[side*.82,1.94,.04],.31);
 }
 // Left shield and right hand resting upon a long vertical stone sword.
 limb([-.82,1.94,.04],[-.89,1.70,.30],.27);limb([.82,1.94,.04],[1.03,1.80,.28],.27);
 put(new T.IcosahedronGeometry(.2,0),stone,fx+1.04,base+1.78,fz+.29);
 kb(1.04,1.52,.29,.09,.76,.09,slate);kb(1.04,1.31,.29,.54,.12,.16,mat.trim);
 kb(1.04,.77,.29,.17,1.05,.09,stone);
 const shield=new T.Shape();shield.moveTo(-.40,.5);shield.lineTo(.40,.5);shield.lineTo(.38,-.12);shield.lineTo(0,-.58);shield.lineTo(-.38,-.12);shield.closePath();
 put(new T.ExtrudeGeometry(shield,{depth:.14,bevelEnabled:false}),stone,fx-.91,base+1.62,fz+.35);
 kb(-.91,1.72,.51,.10,.56,.045,mat.trim);kb(-.91,1.78,.51,.45,.09,.045,mat.trim);
 // A stone cape descends from the shoulders, broad at the feet.
 const cape=new T.BufferGeometry();cape.setAttribute('position',new T.Float32BufferAttribute([
  -.55,2.51,-.23,.55,2.51,-.23,.63,.45,-.44,-.55,2.51,-.23,.63,.45,-.44,-.68,.45,-.44,
 ],3));cape.computeVertexNormals();put(cape,stone,fx,base,fz);
 // Raised inner drainage gutters; their black slots break up the wet cobbles.
 for(const x of [-5.62,5.62])for(let z=2;z<=27;z+=5){
  box(x,.018,z,.54,.035,1.23,slate);
  for(let i=0;i<6;i++)box(x,.045,z-.46+i*.18,.41,.035,.065,iron);
 }
 for(const [x,z] of [[-12,-24],[12.2,-20],[12.2,-5],[-12.5,-2],[26.5,5]]){
  box(x,.021,z,1.03,.04,1.03,slate);
  for(let i=-2;i<=2;i++)box(x+i*.17,.049,z,.06,.035,.87,iron);
 }
 // Thin pavement growth, scraps, broken slates and fallen masonry are batched.
 for(let i=0;i<175;i++){
  const side=rand()>.5?1:-1,z=range(-25,28),x=side*(z>0?range(5.6,6.9):range(12.8,14.2));
  const y=range(.04,.16),size=range(.09,.33),paint=i%6===0?mat.paper:i%3===0?mat.moss:slate;
  box(x,y,z,size,range(.025,.12),size*range(.6,1.8),paint,range(0,6));
 }
 for(const [cx,cz] of [[-14,-23],[13,-25],[30,5],[-6.8,2]])for(let i=0;i<11;i++){
  box(cx+range(-.75,.75),range(.12,.42),cz+range(-.7,.7),range(.25,.75),range(.15,.5),range(.2,.6),i%3?slate:mat.trim,range(0,3));
 }
 // Cemetery silhouettes stand behind the path; they do not intrude on combat.
 for(let i=0;i<10;i++){
  const x=-16.1-(i%2)*1.0,z=27.7-Math.floor(i/2)*2.8,tilt=range(-.11,.11);
  box(x,.56,z,.66,1.1,.21,slate,0,tilt);
  put(new T.CylinderGeometry(.33,.33,.21,8),slate,x,1.10,z,Math.PI/2);
  box(x,.74,z+.13,.33,.055,.045,mat.trim);box(x,.72,z+.13,.055,.36,.045,mat.trim);
  box(x,.06,z+.55,.85,.11,1.75,mat.darkStone,tilt);
 }
 for(const [a,b,z] of [[-16.8,-7.9,27.9],[-16.8,-7.9,2.5]]){
  for(let x=a;x<=b;x+=.48){box(x,.88,z,.055,1.76,.055,iron);put(new T.ConeGeometry(.11,.3,4),iron,x,1.89,z,0,Math.PI/4);}
  box((a+b)/2,.63,z,b-a,.055,.07,iron);box((a+b)/2,1.24,z,b-a,.055,.07,iron);
 }
 // Empty stalls hug the plaza edge: dark blue tattered cloth and open supports.
 function stall(x,z,ry){
  const c=Math.cos(ry),s=Math.sin(ry),pt=(lx,y,lz)=>v(x+lx*c+lz*s,y,z-lx*s+lz*c);
  const sb=(lx,y,lz,w,h,d,m)=>{const q=pt(lx,y,lz);box(q.x,q.y,q.z,w,h,d,m,ry);};
  for(const xx of [-1.3,1.3])for(const zz of [-.6,.6])sb(xx,1.2,zz,.12,2.4,.12,mat.darkWood);
  sb(0,.76,0,2.7,.17,1.32,mat.darkWood);sb(0,2.42,0,2.86,.14,1.55,mat.darkWood);
  for(let i=0;i<7;i++){const q=pt(-1.24+i*.41,2.37,.04);put(new T.PlaneGeometry(.4,1.64),i%3===0?mat.blue:mat.darkWood,q.x,q.y,q.z,-Math.PI/2,ry);}
  for(let i=0;i<3;i++)sb(-.85+i*.85,.99,0,.66,.24,.72,mat.darkWood);
 }
 stall(-15.1,-16.5,Math.PI/2);stall(15.1,-20.9,-Math.PI/2);
 // Two outer broken wall fragments and protruding charred beams frame the bend.
 for(const [x,z,ry] of [[29.5,-18,0],[34,6,Math.PI/2]]){
  box(x,.7,z,3.5,1.4,.6,slate,ry);box(x-1,.95,z,.8,.5,.7,mat.trim,ry);
  for(let k=0;k<4;k++)box(x-1.45+k*.96,1.56,z,.5,.45,.72,slate,ry);
 }
 return {statueHeight:6.5,facadeDetailVersion:1};
}
