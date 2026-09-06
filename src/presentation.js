import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CaptureSceneDepth, createIllustratedPixelPass, pixelViewport } from './retro.js';
import { createActorShadows } from './actor-shadows.js';

// Reuse captured depth: contact shading does not render the crowd a second time.
function contactShadows(camera, depth) {
 const pass = new ShaderPass({
  name:'StoneAndCharacterContact',
  uniforms:{tDiffuse:{value:null},tSceneDepth:{value:null},projectionInverse:{value:new THREE.Matrix4()},projection:{value:new THREE.Matrix4()},far:{value:camera.far},strength:{value:.75}},
  vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`
   uniform sampler2D tDiffuse,tSceneDepth;
   uniform mat4 projectionInverse,projection;
   uniform float far,strength;
   varying vec2 vUv;
   vec3 viewPosition(vec2 uv){
    float z=texture2D(tSceneDepth,uv).r*far;
    vec4 ray=projectionInverse*vec4(uv*2.-1.,1.,1.);
    return ray.xyz*(z/max(-ray.z,.0001));
   }
   void main(){
    vec3 color=texture2D(tDiffuse,vUv).rgb;
    vec3 p=viewPosition(vUv);
    vec3 n=normalize(cross(dFdx(p),dFdy(p)));
    if(dot(n,-p)<0.)n=-n;
    float radius=1.1,occlusion=0.,weight=0.;
    vec2 screenRadius=vec2(projection[0][0],projection[1][1])*.5*radius/max(-p.z,.1);
    for(int i=0;i<12;i++){
     float angle=float(i)*2.39996323;
     float ring=sqrt((float(i)+.5)/12.);
     vec2 uv=vUv+vec2(cos(angle),sin(angle))*screenRadius*ring;
     if(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.)continue;
     vec3 delta=viewPosition(uv)-p;float dist=length(delta);
     float facing=max(0.,dot(n,delta)-.035)/max(dist,.04);
     float falloff=1.-smoothstep(radius*.25,radius*1.6,dist);
     occlusion+=facing*falloff;weight+=1.;
    }
    float ao=clamp(occlusion/max(weight,1.)*3.2,0.,.65);
    // Leave luminous hammer trails and the blue seal bright.
    float emission=1.-smoothstep(1.2,3.,max(color.r,max(color.g,color.b)));
    gl_FragColor=vec4(color*(1.-ao*strength*emission),1.);
   }`
 });
 pass.uniforms.tSceneDepth.value=depth.target.texture;
 pass.uniforms.projectionInverse.value=camera.projectionMatrixInverse;
 pass.uniforms.projection.value=camera.projectionMatrix;
 pass.material.toneMapped=false;pass.material.depthTest=false;pass.material.depthWrite=false;
 return pass;
}

export function createPresentation(renderer,scene,camera) {
 const actorShadows=createActorShadows(scene);
 renderer.shadowMap.type=THREE.PCFShadowMap;
 const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthTexture:new THREE.DepthTexture(1,1,THREE.UnsignedIntType)});
 const composer=new EffectComposer(renderer,target);composer.setPixelRatio(1);
 composer.addPass(new RenderPass(scene,camera));
 const depth=new CaptureSceneDepth(camera);composer.addPass(depth);
 const contact=contactShadows(camera,depth);composer.addPass(contact);
 const bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.19,.45,1.25);composer.addPass(bloom);
 composer.addPass(new OutputPass());
 const retro=createIllustratedPixelPass(depth);composer.addPass(retro);
 let layout,lastWidth=1280,lastHeight=720,lastQuality='high',crowded=false;
 function resize(w,h,quality='high'){
  const low=quality==='low'||quality==='performance';
  lastWidth=w;lastHeight=h;lastQuality=quality;
  const pixels=pixelViewport(w,h,quality),sampleScale=low||crowded?1:1.25;
  const sceneSize={w:Math.round(pixels.w*sampleScale),h:Math.round(pixels.h*sampleScale)};
  camera.aspect=w/h;camera.updateProjectionMatrix();
  renderer.setSize(pixels.w,pixels.h,false);
  composer.setSize(sceneSize.w,sceneSize.h);
  retro.uniforms.resolution.value.set(pixels.w,pixels.h);
  retro.uniforms.resolveDetail.value=low?0:1;
  contact.enabled=!low;bloom.enabled=!low;renderer.shadowMap.enabled=!low;
  renderer.shadowMap.needsUpdate=true;
  layout={...pixels,sceneResolution:[sceneSize.w,sceneSize.h],contactShadows:!low,sampleScale};
  return layout;
 }
 function prepareActors(player,enemies,quality){
  actorShadows.update(player,enemies,quality);
  const count=enemies.reduce((sum,e)=>sum+(!e.dead&&e.actor.root.visible?1:0),0);
  const next=crowded?count>48:count>64;
  // Keep the pixel grid and combat intact; only extra subpixel samples yield
  // their budget to a dense horde. Hysteresis prevents resize oscillation.
  if(next!==crowded){crowded=next;if(lastQuality==='high')resize(lastWidth,lastHeight,lastQuality);}
 }
 return {resize,prepareActors,render:()=>composer.render(),get layout(){return layout;}};
}
