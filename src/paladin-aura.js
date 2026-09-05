import * as THREE from 'three';

// Four flared corners, crossed rune bands and quarter seals from the supplied
// blue-violet aura reference. The open centre keeps the street and boots visible.
function makeSigilTexture() {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  const c=canvas.getContext('2d');c.translate(256,256);c.scale(170,170);c.lineJoin='miter';c.lineCap='round';
  const path=(points,closed=false)=>{c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));if(closed)c.closePath();};
  const luminous=(draw,width=.021,core='#d9edff')=>{
    c.save();draw();c.strokeStyle='#6650ef';c.lineWidth=width*3.8;c.globalAlpha=.18;c.shadowBlur=20;c.shadowColor='#7150ff';c.stroke();
    c.globalAlpha=.65;c.strokeStyle='#8491ff';c.lineWidth=width*2.0;c.shadowBlur=7;c.stroke();
    c.globalAlpha=1;c.strokeStyle=core;c.lineWidth=width;c.shadowBlur=2;c.stroke();c.restore();
  };
  // A pair of violet rune ribbons, each capped with a diamond and a small seal.
  for(let axis=0;axis<2;axis++){
    c.save();c.rotate(axis*Math.PI/2);
    c.fillStyle='#211663';c.globalAlpha=.54;c.fillRect(-1.13,-.09,2.26,.18);c.globalAlpha=1;
    luminous(()=>path([[-1.14,-.09],[1.14,-.09],[1.14,.09],[-1.14,.09]],true),.013,'#aba4ff');
    for(const side of [-1,1]){
      luminous(()=>path([[side*1.09,0],[side*1.23,-.14],[side*1.37,0],[side*1.23,.14]],true),.016,'#c1b8ff');
      luminous(()=>{c.beginPath();c.arc(side*1.23,0,.033,0,Math.PI*2);},.012,'#c0beff');
    }
    // Small angular strokes are deliberately symbolic, rather than text labels.
    for(let i=-8;i<=8;i++){
      if(Math.abs(i)<2)continue;const x=i*.123;c.save();c.translate(x,0);if(i%2)c.scale(-1,1);
      luminous(()=>path([[-.029,-.040],[.025,-.040],[.025,-.006],[-.018,-.006],[-.018,.039],[.031,.039]]),.009,'#a9b4ff');
      c.restore();
    }
    c.restore();
  }
  // Four white-blue pointed lobes with inset chevrons and slashed circular seals.
  for(let quadrant=0;quadrant<4;quadrant++){
    c.save();c.rotate(quadrant*Math.PI/2);
    luminous(()=>path([[.18,.94],[.45,.79],[1.08,1.08],[.79,.45],[.94,.18]]),.027);
    luminous(()=>path([[.23,.70],[.40,.64],[.80,.80],[.64,.40],[.70,.23]]),.014,'#b5d3ff');
    luminous(()=>{c.beginPath();c.ellipse(.43,.43,.19,.15,-Math.PI/4,0,Math.PI*2);},.019,'#d2e4ff');
    luminous(()=>path([[.26,.26],[.61,.61],[.81,.81]]),.018,'#d6eeff');
    c.restore();
  }
  luminous(()=>path([[0,-.23],[.23,0],[0,.23],[-.23,0]],true),.015,'#8fa8ff');
  const texture=new THREE.CanvasTexture(canvas);texture.name='Blue-violet fourfold paladin seal';texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;return texture;
}

export class PaladinAura {
  constructor(parent) {
    this.parent=parent;this.age=0;this.texture=makeSigilTexture();
    this.root=new THREE.Group();this.root.name='Paladin / permanent blue rune aura';this.root.position.y=.075;parent.add(this.root);
    this.material=new THREE.ShaderMaterial({
      uniforms:{sigil:{value:this.texture},time:{value:0},visibility:{value:1}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`uniform sampler2D sigil;uniform float time,visibility;varying vec2 vUv;
        void main(){vec4 seal=texture2D(sigil,vUv);float breath=.88+.10*sin(time*1.7);float gleam=.95+.05*sin(atan(vUv.y-.5,vUv.x-.5)*4.-time*1.4);
        gl_FragColor=vec4(seal.rgb*1.23,seal.a*breath*gleam*visibility);}`,
      transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false,
      polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
    });
    this.mesh=new THREE.Mesh(new THREE.PlaneGeometry(4.6,4.6),this.material);this.mesh.rotation.x=-Math.PI/2;this.mesh.renderOrder=2;this.root.add(this.mesh);
    this.reset();
  }
  get summary(){return {enabled:this.root.visible,age:Number(this.age.toFixed(3)),rotation:Number((this.root.rotation.y+this.parent.rotation.y).toFixed(3)),pattern:'fourfold-rune-seal',size:4.6};}
  update(dt,{dead=false}={}) {
    this.age+=dt;this.material.uniforms.time.value=this.age;
    // Follow translation immediately, while turning at a steady 5 degrees/sec
    // instead of snapping around every time the paladin changes attack targets.
    this.root.rotation.y=-this.parent.rotation.y+this.age*.085;
    this.material.uniforms.visibility.value=THREE.MathUtils.damp(this.material.uniforms.visibility.value,dead?0:1,5,dt);
    this.root.visible=this.material.uniforms.visibility.value>.005;
  }
  reset(){this.age=0;this.root.visible=true;this.root.rotation.y=-this.parent.rotation.y;this.material.uniforms.time.value=0;this.material.uniforms.visibility.value=1;}
  dispose(){this.root.removeFromParent();this.mesh.geometry.dispose();this.material.dispose();this.texture.dispose();}
}
