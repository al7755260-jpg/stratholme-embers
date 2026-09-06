import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createWorld } from './world.js';
import { loadActors } from './actors.js';
import { Game } from './game.js';
import { loadHolyVfxAssets } from './holy-vfx.js';
import { paintPixelMaterials } from './retro.js';
import { createPresentation } from './presentation.js';
import './style.css';
import './touch-controls.css';
import './combat-polish.css';
import { prefersTouchControls } from './touch-controls.js';
import { MobileLandscape } from './mobile-landscape.js';

const app = document.querySelector('#app');
const boot = document.createElement('div');
boot.className='boot-screen';
boot.innerHTML='<div class="boot-symbol">+</div><h1>斯坦索姆</h1><p>余烬中的誓言</p><div class="boot-line"><i></i></div><small>正在唤醒沉睡的街区…</small>';
document.body.append(boot);
async function init(){
 const renderer = new THREE.WebGLRenderer({antialias:false, powerPreference:'high-performance'});
 const viewport=()=>({w:Math.max(320,app.clientWidth||innerWidth||1280),h:Math.max(240,app.clientHeight||innerHeight||720)});
 let size=viewport(),quality=prefersTouchControls()?'low':'high',pixels;
 renderer.setPixelRatio(1);
 renderer.domElement.style.imageRendering='pixelated';
 renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.3;
 renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.info.autoReset=false;
 app.append(renderer.domElement);
 const scene = new THREE.Scene(); scene.fog=new THREE.FogExp2(0x26333f,0.011);
 const camera = new THREE.PerspectiveCamera(43,size.w/size.h,0.1,180);
 const pmrem = new THREE.PMREMGenerator(renderer);
 const env = new RoomEnvironment();scene.environment = pmrem.fromScene(env,0.025).texture;
 scene.environmentIntensity=.30; env.dispose();pmrem.dispose();
 const [townhouse,actors,holyAssets] = await Promise.all([
   new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/townhouse.glb`),
   loadActors((v)=>{boot.querySelector('small').textContent=typeof v==='string'?v:`正在整备${v.label||'角色'} · ${v.loaded||0} / ${v.total||3}`;}),
   loadHolyVfxAssets()
 ]);
 townhouse.scene.traverse(m=>{if(m.isMesh){m.material.metalness=0;m.material.roughnessMap=null;m.material.normalMap=null;m.material.roughness=.93;m.material.envMapIntensity=.18;m.material.color.set(0xf0f1ed);}});
 const world = createWorld(scene,townhouse.scene);
 const baseCreate=actors.create.bind(actors);actors.create=(kind)=>{const actor=baseCreate(kind);paintPixelMaterials(actor.root);return actor;};
 paintPixelMaterials(scene);
 const presentation=createPresentation(renderer,scene,camera);
 const resize=()=>{size=viewport();pixels=presentation.resize(size.w,size.h,quality);};
 const game = new Game({scene,camera,renderer,world,actors,holyAssets,quality,onQuality(value){
   quality=value;resize();
 }});
 game.mobileLayout=new MobileLandscape(game,app);game.mobileLayout.sync();
 window.__renderer=renderer; window.__world=world;

 boot.remove();
 let elapsed=0,last=performance.now(),fpsTime=0,frames=0,styleTime=0;
 function frame(now){
   const wallDt=(now-last)/1000,dt=Math.min(wallDt,0.05);last=now;const frozen=game.simulationFrozen;if(!frozen)elapsed+=dt;
   game.update(dt,elapsed);if(!frozen&&!game.simulationFrozen)world.update(dt,elapsed);world.updateLightingFocus(game.player.root.position);presentation.prepareActors(game.player,game.enemies,quality);renderer.info.reset();presentation.render();
   styleTime-=dt;if(styleTime<=0){paintPixelMaterials(scene);styleTime=1;}
   frames++;fpsTime+=wallDt;if(fpsTime>1){window.__renderStats={fps:Math.round(frames/fpsTime),calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,quality,nativeResolution:[pixels.w,pixels.h],sceneResolution:presentation.layout.sceneResolution,contactShadows:presentation.layout.contactShadows,paletteColors:32768,styleRevision:"cg-pixel-v3",textureLimit:512};app.dataset.renderStats=JSON.stringify(window.__renderStats);app.dataset.gameState=JSON.stringify({...window.__game.summary,player:window.__game.player,enemyCount:window.__game.enemyCount,cooldowns:window.__game.cooldowns,audio:window.__game.audio});frames=0;fpsTime=0;}
   requestAnimationFrame(frame);
 }requestAnimationFrame(frame);
 addEventListener('resize',resize);new ResizeObserver(resize).observe(app);resize();
 document.addEventListener('visibilitychange',()=>{last=performance.now();});
}
init().catch(error=>{console.error(error);boot.querySelector('small').textContent='加载失败，请刷新重试。'+error.message;boot.querySelector('.boot-line').remove();});


