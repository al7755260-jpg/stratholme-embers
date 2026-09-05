import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {AngelWings} from './angel-vfx.js';

const smooth=(a,b,x)=>THREE.MathUtils.smoothstep(x,a,b);
export class AngelCinematic {
  constructor(actors,assets,parent) {
    this.element=document.createElement('div');this.element.className='angel-cinematic';this.element.hidden=true;this.element.setAttribute('role','status');this.element.setAttribute('aria-label','天使降临变身动画，战场暂停两秒');
    this.element.innerHTML='<div class="angel-film"><div class="angel-film-grain"></div><div class="angel-film-flash"></div><div class="angel-film-top">白银之手 · 圣光觉醒</div><div class="angel-film-title">天使降临</div><div class="angel-film-sub">五秒无敌 · 圣锤裁决</div><div class="angel-film-counter">THE LIGHT ANSWERS</div></div>';
    parent.append(this.element);this.film=this.element.querySelector('.angel-film');this.flash=this.element.querySelector('.angel-film-flash');this.title=this.element.querySelector('.angel-film-title');this.subtitle=this.element.querySelector('.angel-film-sub');
    this.renderer=new THREE.WebGLRenderer({antialias:false,alpha:false,powerPreference:'high-performance'});this.renderer.setPixelRatio(1);this.renderer.setSize(480,270,false);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;
    this.renderer.domElement.className='angel-film-canvas';this.film.prepend(this.renderer.domElement);
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x101e2b);this.scene.fog=new THREE.FogExp2(0x101e2b,.028);
    this.camera=new THREE.PerspectiveCamera(34,16/9,.1,40);this.camera.position.set(.5,1.7,8);this.camera.lookAt(0,1.5,0);
    this.scene.add(new THREE.HemisphereLight(0xffefd3,0x466477,1.4));const key=new THREE.DirectionalLight(0xffdda4,2);key.position.set(-2,4,4);this.scene.add(key);const rim=new THREE.DirectionalLight(0xa4ceff,1.5);rim.position.set(3,3,-2);this.scene.add(rim);
    this.hero=actors.create('arthas');this.scene.add(this.hero.root);
    this.hero.root.traverse(o=>{if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material]){if(m.isMeshStandardMaterial){m.metalness=Math.min(.38,m.metalness);m.roughness=Math.max(.55,m.roughness);}}});
    this.wings=new AngelWings(this.hero.root,assets,{cinematic:true});
    this.sun=new THREE.Group();this.sun.position.set(0,1.6,-1.2);this.scene.add(this.sun);
    const rayPositions=[];
    for(let i=0;i<40;i++){const a=i/40*Math.PI*2,r=5.5+(i%3)*.7,w=.015+(i%4)*.004;rayPositions.push(Math.cos(a)*.6,Math.sin(a)*.6,0,Math.cos(a-w)*r,Math.sin(a-w)*r,0,Math.cos(a+w)*r,Math.sin(a+w)*r,0);}
    const rays=new THREE.BufferGeometry();rays.setAttribute('position',new THREE.Float32BufferAttribute(rayPositions,3));this.rayMaterial=new THREE.MeshBasicMaterial({color:0xc79544,transparent:true,opacity:.18,side:THREE.DoubleSide,depthWrite:false});this.sun.add(new THREE.Mesh(rays,this.rayMaterial));
    const ringMaterial=new THREE.MeshBasicMaterial({color:0x97865b,transparent:true,opacity:.65,side:THREE.DoubleSide,depthWrite:false});
    for(const radius of [1.48,1.56,1.85])this.sun.add(new THREE.Mesh(new THREE.RingGeometry(radius,radius+.018,48),ringMaterial));
    const glyphGeo=new THREE.PlaneGeometry(.048,.12),glyphMat=new THREE.MeshBasicMaterial({color:0xd8b878});
    for(let i=0;i<24;i++){const a=i/24*Math.PI*2;const glyph=new THREE.Mesh(glyphGeo,glyphMat);glyph.position.set(Math.cos(a)*1.70,Math.sin(a)*1.70,.01);glyph.rotation.z=a;this.sun.add(glyph);}
    this.composer=new EffectComposer(this.renderer);this.composer.addPass(new RenderPass(this.scene,this.camera));this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(480,270),.24,.15,1.1));this.composer.addPass(new OutputPass());
    this.composer.addPass(new ShaderPass({uniforms:{tDiffuse:{value:null}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform sampler2D tDiffuse;varying vec2 vUv;void main(){vec3 c=texture2D(tDiffuse,vUv).rgb;float v=1.-.27*pow(length((vUv-.5)*1.3),2.);c=floor(c*v*31.+.5)/31.;gl_FragColor=vec4(c,1.);}'}));
    this.render(0);this.hide();
  }
  show() {this.element.hidden=false;this.hero.resetMotion?.();this.lastFrame=-1;this.render(0);}
  hide() {this.element.hidden=true;}
  render(seconds) {
    // Thirty authored pose samples over two seconds, enlarged without smoothing.
    const frame=Math.floor(Math.min(2,seconds)*15);if(frame===this.lastFrame)return;this.lastFrame=frame;
    const t=frame/15,p=t/2,open=smooth(.45,1.12,t),pull=smooth(.23,1.18,t);
    this.hero.update(1/15,{speed:0,action:'ascend',progress:p,immediate:true,time:t,hit:0,dead:0});
    this.hero.root.rotation.y=THREE.MathUtils.lerp(-.45,.13,pull);this.hero.root.position.y=smooth(.5,1.25,t)*.10;
    this.wings.update(t,open,smooth(0,.28,t));
    this.sun.rotation.z=-.05+t*.06;this.sun.scale.setScalar(.83+open*.23);this.rayMaterial.opacity=.025+open*.05;
    this.camera.position.set(THREE.MathUtils.lerp(.8,.24,pull),THREE.MathUtils.lerp(1.92,1.48,pull),THREE.MathUtils.lerp(4.8,8.6,pull));this.camera.lookAt(0,1.48,0);
    const flash=Math.max(0,1-Math.abs(t-.87)/.16)*.62;this.flash.style.opacity=String(flash);
    const reveal=smooth(.88,1.15,t);this.title.style.opacity=String(reveal);this.title.style.transform=`translateY(${Math.round((1-reveal)*20)}px) scale(${.94+reveal*.06})`;this.subtitle.style.opacity=String(smooth(1.13,1.36,t));
    this.element.dataset.frame=String(frame);this.composer.render();
  }
  dispose() {this.wings.dispose();this.hero.dispose?.();this.scene.traverse(o=>{o.geometry?.dispose();if(o.material)o.material.dispose();});this.composer.dispose();this.renderer.dispose();this.element.remove();}
}
