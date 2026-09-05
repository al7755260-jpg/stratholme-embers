import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// Art-direction anchors. Texture detail is retained between these paint ramps.
// Values intentionally remain display-space colors; the palette pass follows OutputPass.
const PALETTE = [
 '#151d25','#25303a','#35434d','#4b5b64','#657982','#829497','#aab3ad','#d0d0bb',
 '#25262d','#413b3b','#5a4b42','#78634d','#998057','#baa071','#dfc894','#f8e6b9',
 '#352930','#583b3c','#804b3c','#a8633e','#d48649','#edb66c','#f8d898',
 '#213a35','#36574b','#52705b','#739072','#98ad8b','#bed0ab',
 '#1d2e42','#2c455e','#42637f','#658aa0','#94b7c2',
 '#51435c','#7d667b','#ac9299','#d3b7a5','#dadbce','#f0eee0'
].map(hex=>new THREE.Vector3(...new THREE.Color(hex).getRGB(new THREE.Color(),THREE.SRGBColorSpace).toArray()));

const quadVertex = 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }';

// Preserve scene depth before ping-pong fullscreen passes clear it.
export class CaptureSceneDepth extends Pass {
 constructor(camera){
  super();this.needsSwap=false;
  this.target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:false});
  this.material=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms:{tDepth:{value:null},near:{value:camera.near},far:{value:camera.far}},vertexShader:quadVertex,fragmentShader:`
   #include <packing>
   uniform sampler2D tDepth; uniform float near; uniform float far; varying vec2 vUv;
   void main(){float d=texture2D(tDepth,vUv).x;float linearDepth=-perspectiveDepthToViewZ(d,near,far)/far;gl_FragColor=vec4(vec3(linearDepth),1.);}`});
  this.quad=new FullScreenQuad(this.material);
 }
 setSize(w,h){this.target.setSize(w,h);}
 render(renderer,writeBuffer,readBuffer){this.material.uniforms.tDepth.value=readBuffer.depthTexture;renderer.setRenderTarget(this.target);this.quad.render(renderer);}
 dispose(){this.target.dispose();this.material.dispose();this.quad.dispose();}
}

export function createIllustratedPixelPass(depth){
 const pass=new ShaderPass({name:'IllustratedPixelPalette',uniforms:{tDiffuse:{value:null},tSceneDepth:{value:null},resolution:{value:new THREE.Vector2(480,300)},palette:{value:PALETTE},ditherStrength:{value:.26}},vertexShader:quadVertex,fragmentShader:`
  uniform sampler2D tDiffuse; uniform sampler2D tSceneDepth; uniform vec2 resolution;
  uniform vec3 palette[40]; uniform float ditherStrength; varying vec2 vUv;
  float b2(vec2 p){vec2 q=mod(p,2.);return 2.*q.x+3.*q.y-4.*q.x*q.y;}
  float b4(vec2 p){p=mod(p,4.);return (4.*b2(p)+b2(floor(p/2.))+.5)/16.;}
  void main(){
   vec2 cell=floor(vUv*resolution),uv=(cell+.5)/resolution,one=1./resolution;
   vec3 color=texture2D(tDiffuse,uv).rgb;
   float luma=dot(color,vec3(.299,.587,.114));
   color=mix(color,vec3(luma),.045);
   // A gentle toe keeps texture contrast inside shadowed walls and cobbles.
   // Do not collapse every dark texel to the first swatch in the palette.
   color=pow(max(color,vec3(0.)),vec3(.88));
   float z=texture2D(tSceneDepth,uv).r;
   float d1=texture2D(tSceneDepth,uv+vec2(one.x,0)).r;
   float d2=texture2D(tSceneDepth,uv+vec2(0,one.y)).r;
   float edge=step(max(.0022,z*.055),max(d1-z,d2-z));
   // Single-pixel contour ink is confined to depth breaks, rather than noisy texture edges.
   color=mix(color,color*.78,edge*.60);
   float nearest=100.,second=100.;vec3 a=palette[0],b=palette[1];
   for(int i=0;i<40;i++){
    vec3 difference=color-palette[i];float dist=dot(difference*difference,vec3(.27,.54,.19));
    if(dist<nearest){second=nearest;b=a;nearest=dist;a=palette[i];}
    else if(dist<second){second=dist;b=palette[i];}
   }
   vec3 axis=b-a;float mixAmount=clamp(dot(color-a,axis)/max(dot(axis,axis),.0001),0.,.5);
   float threshold=b4(cell);float selection=step(threshold,mixAmount*ditherStrength);
   vec3 painted=mix(color,mix(a,b,selection),.30);
   // 15-bit console colour preserves fine cracks, grain, cloth and stone tones.
   // The integer pixel grid and nearest sampling supply the pixel-art edges.
   painted=floor(clamp(painted,0.,1.)*31.+.5+(threshold-.5)*.16)/31.;
   gl_FragColor=vec4(painted,1.);
  }`});
 pass.uniforms.tSceneDepth.value=depth.target.texture;pass.material.toneMapped=false;pass.material.depthTest=false;pass.material.depthWrite=false;return pass;
}

const textureCache=new WeakMap();
export function pixelTexture(texture,maxSize=512){
 if(!texture?.image)return texture;
 // Procedural grain/crack maps use typed pixel data, not CanvasImageSource.
 if(texture.isDataTexture){texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;return texture;}
 if(textureCache.has(texture))return textureCache.get(texture);
 const source=texture.image,w=source.width||source.videoWidth,h=source.height||source.videoHeight;
 if(!w||!h)return texture;
 const factor=Math.min(1,maxSize/Math.max(w,h)),canvas=document.createElement('canvas');
 canvas.width=Math.max(1,Math.round(w*factor));canvas.height=Math.max(1,Math.round(h*factor));
 const ctx=canvas.getContext('2d');ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(source,0,0,canvas.width,canvas.height);
 const result=texture.clone();result.source=new THREE.Source(canvas);result.mipmaps=[];result.generateMipmaps=true;
 result.magFilter=THREE.NearestFilter;result.minFilter=THREE.NearestMipmapLinearFilter;result.anisotropy=1;result.needsUpdate=true;
 textureCache.set(texture,result);textureCache.set(result,result);return result;
}

const styled=new WeakSet();
export function paintPixelMaterials(root){
 root.traverse(mesh=>{
  if(!mesh.isMesh||!mesh.material)return;
  for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
   if(styled.has(material)||material.isShaderMaterial)continue;
   // TextureLoader callbacks may still be running, so defer this material until its map exists.
   if(material.map&&!material.map.image)continue;
   if(material.map)material.map=pixelTexture(material.map,512);if(material.emissiveMap)material.emissiveMap=pixelTexture(material.emissiveMap,512);
   if(material.isMeshStandardMaterial){
    if(material.normalMap)material.normalMap=pixelTexture(material.normalMap,512);
    if(material.bumpMap){material.bumpMap=pixelTexture(material.bumpMap,512);material.bumpScale=Math.min(material.bumpScale,.075);}
    material.roughnessMap=null;material.metalnessMap=null;
    const wet=material.userData.pixelSurface==='wet';
    material.roughness=wet?.30:.86;material.metalness=wet?.28:Math.min(material.metalness,.18);material.envMapIntensity=wet?.5:.35;
   }
   material.needsUpdate=true;styled.add(material);
  }
 });
}

export function pixelViewport(w,h,quality='high'){
 const low=quality==='low'||quality==='performance';
 const scale=low?Math.max(2,Math.round(h/240)):Math.max(2,Math.ceil(h/540));
 return {w:Math.max(1,Math.round(w/scale)),h:Math.max(1,Math.round(h/scale)),scale};
}


