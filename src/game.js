import { TouchControls, prefersTouchControls } from './touch-controls.js';
import {PaladinAura} from './paladin-aura.js';
import {ANGEL,AngelPower} from './angel-power.js';
import {AngelWings} from './angel-vfx.js';
import {AngelCinematic} from './angel-cinematic.js';
import { EndlessHorde, hordePressure, SurvivalRecord, formatSurvivalTime } from './endless.js';
import { SURVIVAL, RELICS, StreetSupplies } from './survival.js';
import { HolyVfx } from './holy-vfx.js';
import * as THREE from 'three';
import { AudioScene } from './audio.js';
import { EnvironmentalAudio } from './environmental-audio.js';
import { AUDIO_ASSETS } from './audio-manifest.js';
import { ENEMY_TYPES, ENEMY_LIMITS, createEnemyStats, enemyDeathState } from './enemy-config.js';

const UP = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;
const TAU = Math.PI * 2;
const MELEE_DURATIONS = [.50, .52, .70];
const MELEE_CONTACTS = [.48, .48, .55];
const CAMERA = Object.freeze({ yaw: .5, pitch: .84, distance: 28, targetHeight: 1.05, minPitch: .72, maxPitch: 1.22, minDistance: 16, maxDistance: 32 });
// Hand-drawn pixel matrices; all filled cells align to the original integer grid.
const pixelPalette = {"a": "#695d42", "b": "#655f43", "c": "#b5a069", "d": "#e0cd94", "e": "#b19766", "f": "#d2b389", "g": "#334b58", "h": "#70959a", "k": "#2c3c3b"};
const icons = {
  "hammer": [
    "................",
    "......bbbb......",
    ".....bccccb.....",
    "....bccddccb....",
    "...bccdddcceb...",
    "...bcdddcceeb...",
    "....bccdceeb....",
    ".....bcceeb.....",
    "......babb......",
    ".....baab.......",
    "....baab........",
    "...baab.........",
    "..baab..........",
    ".baab...........",
    "..bb............",
    "................"
  ],
  "whirl": [
    ".......c........",
    "....bbbbcc......",
    "...bcdddcccb....",
    "..bcdbbbbdccb...",
    ".bcdbaaaabdcb...",
    ".bdbaabbbabdcb..",
    "bcdbaabcdbabdb..",
    "bcdbabddcdbabcb.",
    "bcdbabddcdbabcb.",
    ".bdbabcdbbaabcb.",
    ".bcdbabbbaaabdb.",
    "..bcdbaaaaabdcb.",
    "...bccbbbbbdcb..",
    "....bccccddcb...",
    "......cbbbb.....",
    "........c......."
  ],
  "consecrate": [
    ".......c........",
    "......bcb.......",
    "......bdb.......",
    "......bdb.......",
    "......bdb.......",
    "..c...bdb...c...",
    ".bcbbbdddbbbcb..",
    "cdddddddddddddc.",
    ".bcbbbdddbbbcb..",
    "..c...bdb...c...",
    "......bdb.......",
    "......bdb.......",
    "...bbbdddbbb....",
    "..bcccccccccb...",
    "...bbcccccbb....",
    ".....bbbbb......"
  ],
  "dodge": [
    ".............hc.",
    "............hc..",
    "..........hhc...",
    ".........hchc...",
    ".......hhcchc...",
    "......hcccchc...",
    ".....hcddcchc...",
    "....hcddcchc....",
    "...hcdddchchc...",
    "..hcdddchcchc...",
    "..hcddchcchc....",
    "..hcddccchc.....",
    "...hccchchc.....",
    "....hhhchc......",
    ".....hhhh.......",
    "................"
  ]
};
const pixelSvg = rows => `<svg viewBox="0 0 16 ${rows.length}" shape-rendering="crispEdges" aria-hidden="true">${rows.map((row,y) => [...row].map((cell,x) => cell === '.' ? '' : `<rect x="${x}" y="${y}" width="1" height="1" fill="${pixelPalette[cell]}"/>`).join('')).join('')}</svg>`;
const svg = name => pixelSvg(icons[name]);
const portraitSvg = pixelSvg([".....bbbbbb.....", "....bccddccb....", "...bccddddccb...", "...bcddcccccb...", "..bccdccffecc...", "..bccdcfffecb...", "..bccdckffkcb...", "..bccdcffffcb...", "..bccdcfeffcb...", "..bccdcefeecb...", "..bcdcceeeccb...", "..bcccgbbbgccb..", ".bccbgghhggbccb.", "bccbbgghhggbbcbb", "bcbdcbhhhhbcdccb", "bcdccbghhgbcdccb", "bcddcbgddgbcddcb", "bcccbbgddgbbcccb", "bbghhhgddghhhgbb", "bghhhgghhgghhhgb"]);

export class Game {
  constructor({ scene, camera, renderer, world, actors, holyAssets, quality = 'high', onQuality }) {
    Object.assign(this, { scene, camera, renderer, world, actors, holyAssets, quality, onQuality });
    this._state = 'menu'; this.keys = new Set(); this.enemies = []; this.effects = []; this.floaters = [];
    this.audio = new AudioScene(); this.stepDistance = 0; this.stepVariant = 0; this.groanTimer = 2.5; this.shake = 0; this.inputAttack = false;
    this.environmentalAudio=new EnvironmentalAudio(this.audio);this._environmentRun=0;this._environmentSequence=0;this._environmentDamageIds=new Set();
    this._environmentEvents={impacts:0,broken:0,explosions:0,explosionEnemyHits:0};this._environmentDamageAreas=0;this._environmentLastEvent=null;
    this.drag = false; this.elapsed = 0; this.gameTime = 0; this.kills = 0; this.threatStage = 1; this.maxCombo = 0; this.combo = 0; this.comboTimer = 0;
    this.hp = SURVIVAL.maxHp; this.maxHp = SURVIVAL.maxHp; this.unlocked={q:false,e:false}; this.invincible = 0; this.hitFlash = 0; this.cooldowns = { q: 0, e: 0, space: 0 };
    this.resetActions(true); this._combatTime = 0; this.heroSpeed = 0;
    this.player = actors.create('arthas'); scene.add(this.player.root); this.player.root.position.copy(world.start || new THREE.Vector3(0, 0, 20)); this.player.root.rotation.y = Math.PI;
    this.holyVfx=holyAssets?new HolyVfx(scene,holyAssets):null;this.supplies=new StreetSupplies(scene,world);
    this.playerVelocity = new THREE.Vector3(); this.dodgeDirection = new THREE.Vector3(0, 0, -1); this.target = new THREE.Vector3(); this.temp = new THREE.Vector3(); this.projection = new THREE.Vector3();
    this.cameraTarget = new THREE.Vector3();
    this.resetCamera(true);
    this.angel=new AngelPower();this.angelWings=new AngelWings(this.player.root,holyAssets);this.horde = new EndlessHorde(); this.record = new SurvivalRecord(); this.recordTimer = 0; this.enemyBars = null;
    this.activeCap = hordePressure().cap; this.fps = 60; this.lastFrameTime = performance.now(); this.hudTick = 0; this.nextId = 1;
    this.navNodes = [[0,21],[0,8],[0,-4],[0,-19],[-10,-5],[-11,-20],[9,-18],[10,1],[24,1],[28,-11]].map(([x,z]) => new THREE.Vector3(x,0,z));
    this.navGraph = this.navNodes.map((n, i) => this.navNodes.map((m, j) => i !== j && this.clearPath(n, m, .62) ? j : -1).filter(i => i >= 0));
    this._destructionRevision=this.world.destruction?.revision??0;
    this.quality = quality; this.setupUI();this.angelFilm=new AngelCinematic(actors,holyAssets,this.ui); this.setupInput(); this.addPlayerLight();
    this.spawnMenuEnemies();
    const self = this;
    window.__game = Object.freeze({
      get state() { return self._state; },
      get player() { const p = self.player.root.position; return { x: p.x, y: p.y, z: p.z, hp: Math.round(self.hp), maxHp: self.maxHp, invincible: self.invincible > 0 }; },
      get enemies() { return self.enemies.filter(e => !e.dead && !e.decorative).map(e => ({ id: e.id, kind: e.kind, name: e.name, x: e.actor.root.position.x, z: e.actor.root.position.z, hp: e.hp, maxHp: e.maxHp, boss: e.boss, size: e.size, height: e.height, radius: e.radius, healthBarHeight: e.healthBarHeight, attackDuration: e.attack.duration, attackContact: e.attack.contact, attackReach: e.attack.hitRange, action: e.attackTimer > 0 ? 'attack' : 'idle', progress: e.attackTimer > 0 ? 1-e.attackTimer/e.attack.duration : 0, variant: e.attackVariant })); },
      get enemyCount() { return self.enemies.filter(e => !e.dead && !e.decorative).length; },
      get threatStage() { return self.threatStage; }, get kills() { return self.kills; }, get fps() { return Math.round(self.fps); },
      get cooldowns() { return { ...self.cooldowns }; },
      get audio() { return self.audio.status; },
      get summary() { return { survival:{revision:'blue-aura-v1',angel:self.angel.summary,mode:'endless',best:{...self.record.best},pressure:hordePressure(self.gameTime,self.kills,self.quality),spawned:self.horde.spawned,bossesSpawned:self.horde.bossesSpawned,unlocked:{...self.unlocked},relics:self.world.destruction?.relics||[],supplies:self.supplies?.summary},aura:self.aura?.summary,holyVfx:self.holyVfx?.summary, ...self.enemyCensus(), environment:self.environmentSummary(), state: self._state, threatStage: self.threatStage, kills: self.kills, activeCap: self.activeCap, time: Math.round(self.gameTime), maxCombo: self.maxCombo, action: self._action, actionProgress: self.actionProgress(), actionDuration: self._actionDuration, contactFired: self._actionFired, comboStep: self.comboStep, speed: self.heroSpeed, hitstop: self._hitstop, camera: { yaw: self.viewYaw, pitch: self.viewPitch, distance: self.viewDistance, height: self.camera.position.y, occlusion: self.world.getOcclusionState?.().filter(v=>v.fade>.02).map(v=>({name:v.name,fade:Math.round(v.fade*100)/100})) || [] }, corpses: self.enemies.filter(e=>e.dead).map(e=>({id:e.id,age:e.deathAge,progress:enemyDeathState(e).dead,fade:enemyDeathState(e).fade})) }; },
    });
    this.updateHUD(); this.showMenu('start');
    document.getElementById('loading-screen')?.remove();
  }
  get state() { return this._state; }
  get simulationFrozen() {return this._state==='paused'||this._state==='ascension'||this.angel?.phase==='pending';}
  environmentSummary() {
    const destruction=this.world.destruction,state=destruction?.state||{},byKind={};let damaged=0;
    for(const prop of state.props||[]){
      const counts=byKind[prop.kind]||(byKind[prop.kind]={alive:0,destroyed:0});counts[prop.alive?'alive':'destroyed']++;
      if(prop.alive&&prop.hp<prop.maxHp)damaged++;
    }
    return {enabled:Boolean(destruction),revision:destruction?.revision??0,total:state.total??0,alive:state.alive??0,destroyed:state.destroyed??0,fragmentsActive:state.fragmentsActive??0,damaged,byKind,damageAreas:this._environmentDamageAreas||0,events:{...this._environmentEvents},lastEvent:this._environmentLastEvent||null};
  }
  syncDestructionNavigation(force=false) {
    const revision=this.world.destruction?.revision??0;
    if(!force&&revision===this._destructionRevision)return;
    this._destructionRevision=revision;
    this._obstacleNavigationCache?.clear();
    this.navGraph=this.navNodes.map((a,i)=>this.navNodes.map((b,j)=>i!==j&&this.clearPath(a,b,.62)?j:-1).filter(j=>j>=0));
    for(const enemy of this.enemies){enemy.navTarget=null;enemy.navTime=0;}
  }
  resetEnvironment() {
    this.environmentalAudio?.stop();this.world.destruction?.reset();this.world.destruction?.drainEvents();
    this._environmentRun=(this._environmentRun||0)+1;this._environmentSequence=0;this._environmentAttackId=null;this._environmentDamageIds=new Set();
    this._environmentEvents={impacts:0,broken:0,explosions:0,explosionEnemyHits:0};this._environmentDamageAreas=0;this._environmentLastEvent=null;
    this.syncDestructionNavigation(true);
  }
  nextEnvironmentAttackId() {
    this._environmentSequence=(this._environmentSequence||0)+1;
    return `hero:${this._environmentRun||0}:${this._environmentSequence}`;
  }
  damageEnvironment({position,direction=null,radius,arc=TAU,damage,source,attackId}) {
    if(this._state!=='playing'||!this.world.destruction)return;
    this._environmentDamageIds??=new Set();
    attackId??=this._environmentAttackId||this.nextEnvironmentAttackId();
    if(this._environmentDamageIds.has(attackId))return;
    this._environmentDamageIds.add(attackId);
    if(this._environmentDamageIds.size>192)this._environmentDamageIds.delete(this._environmentDamageIds.values().next().value);
    this._environmentDamageAreas=(this._environmentDamageAreas||0)+1;
    this.world.destruction.damageArea({position:position.clone(),direction:direction?.clone()||null,radius,arc,damage,source,attackId});
  }
  updateEnvironment(dt) {
    if(this._state!=='playing'||!this.world.destruction)return;
    // This is the sole destruction clock. world.update only advances ambience.
    this.world.destruction.update(dt,this.gameTime);
    this.flushEnvironmentEvents();
  }
  flushEnvironmentEvents() {
    if(this._state!=='playing'||!this.world.destruction)return;
    const events=this.world.destruction.drainEvents();let visuals=0,labels=0,explosionLabels=0;
    const explosiveBatch=events.some(event=>event.type==='explode');
    this._environmentEvents??={impacts:0,broken:0,explosions:0,explosionEnemyHits:0};
    for(const event of events){
      const position=event.position;if(!position)continue;
      this._environmentLastEvent={type:event.type,kind:event.kind,source:event.source||''};
      this.environmentalAudio?.play(event,this.player.root.position,this.viewYaw);
      const stone=/stone|grave|tomb|pillar|pedestal|relic/i.test(event.kind||'');
      if(event.type==='explode'){
        this._environmentEvents.explosions++;
        const radius=Number.isFinite(event.radius)?event.radius:3.6,damage=Number.isFinite(event.damage)?event.damage:85;
        // Props already chain inside destruction.damageArea. This event damages
        // each living enemy once, never the hero and never the props again.
        for(const enemy of this.enemies){
          if(enemy.dead||enemy.decorative)continue;
          const delta=enemy.actor.root.position.clone().sub(position).setY(0);
          if(delta.length()<=radius+enemy.radius*.2){this.damageEnemy(enemy,damage,5,true,position,'environment');this._environmentEvents.explosionEnemyHits++;}
        }
        this.makeRing(position,radius,.50,0xf8ad50,true);this.burst(position.clone().add(new THREE.Vector3(0,.5,0)),0xffa14a,24,4.5);
        this.shake=Math.max(this.shake,.16);
        if(explosionLabels++<2)this.floating(position,'爆燃','critical',1.05);
      }else if(event.type==='break'){
        this._environmentEvents.broken++;
        if(event.ability)this.unlockSkill(event.ability,event.position);
        if(visuals++<8){this.burst(position.clone().add(new THREE.Vector3(0,.4,0)),stone?0xa5ac99:0xb08a5e,10,2.2);this.makeRing(position,.85,.28,stone?0xadb49c:0xc69a62,true);}
        if(!explosiveBatch&&labels++<2)this.floating(position,'碎裂','',.8);
      }else if(event.type==='impact'){
        this._environmentEvents.impacts++;
        if(visuals++<8)this.burst(position.clone().add(new THREE.Vector3(0,.5,0)),stone?0xa5ac99:0xc39a68,4,1.1);
        if(event.source==='melee')this._hitstop=Math.max(this._hitstop||0,.025);
      }
    }
    this.syncDestructionNavigation();
  }
  enemyCensus() {
    const enemyKinds=Object.fromEntries(Object.keys(ENEMY_TYPES).map(kind=>[kind,0]));
    const enemySizes=Object.fromEntries(Object.keys(ENEMY_TYPES).map(kind=>[kind,null]));
    for(const enemy of this.enemies){
      if(enemy.dead||enemy.decorative)continue;
      enemyKinds[enemy.kind]++;
      const range=enemySizes[enemy.kind];
      enemySizes[enemy.kind]=range?[Math.min(range[0],enemy.size),Math.max(range[1],enemy.size)]:[enemy.size,enemy.size];
    }
    for(const kind of Object.keys(enemySizes))if(enemySizes[kind])enemySizes[kind]=enemySizes[kind].map(value=>Number(value.toFixed(3)));
    return {enemyKinds,enemySizes};
  }
  addPlayerLight() {
    this.playerLight = new THREE.PointLight(0xffcd79, 1.2, 5, 2); this.playerLight.position.set(0, 1.5, 0); this.player.root.add(this.playerLight);
    this.aura=new PaladinAura(this.player.root);
  }
  setupUI() {
    const ui = document.createElement('div'); ui.id = 'game-ui'; document.body.appendChild(ui); this.ui = ui; ui.classList.toggle('touch-ui', prefersTouchControls());
    const ability = (id, icon, key, name, tooltip) => `<button class="ability ready" id="ability-${id}" title="${tooltip}" aria-label="${tooltip}"><span class="ability-icon">${svg(icon)}<span class="ability-cooldown" hidden></span></span><span class="ability-key">${key}</span><span class="ability-name">${name}</span></button>`;
    ui.innerHTML = `<div class="vignette"></div><div class="damage-vignette"></div>
      <div class="zone-title"><h1>斯坦索姆</h1><p>余烬中的誓言</p><div class="chapter">THE CULLING · OLD TOWN</div></div>
      <div class="objective"><div class="objective-title">无尽生存</div><div class="survival-score"><div class="survival-clock" role="timer" aria-label="本局存活时间">00:00</div><div class="objective-detail">尸潮等级 1</div><div class="survival-best"></div></div><div class="relic-objective"></div></div>
      <div class="map-frame"><canvas width="128" height="128" id="minimap"></canvas><span class="compass-n">N</span><div class="map-label"><span class="map-location">旧城南街</span> · 瘟疫区</div></div>
      <div class="utility"><button id="pause-button" aria-label="暂停游戏"><kbd>ESC</kbd>暂停</button><button id="fullscreen-button" aria-label="进入全屏"><kbd>F</kbd><span>全屏</span></button><button id="sound-button" aria-label="静音切换">声音 · 开</button></div>
      <div class="health-panel"><div class="portrait">${portraitSvg}</div><div class="hero-info"><div class="hero-name">阿尔萨斯</div><div class="hero-class">圣骑士 · 白银之手</div><div class="life-pips" role="img" aria-label="生命 3 格，共 3 格"><i></i><i></i><i></i></div><div class="health-track"><div class="health-fill"></div><span class="health-text">3 / 3</span></div><div class="health-help">三格生命 · 靠近血包回复一格</div></div></div>
      <div class="ability-bar">${ability('j','hammer','J','圣锤连击','J / 鼠标左键 · 圣锤连击（按住连续攻击）')}${ability('q','whirl','Q','神圣风暴','Q · 神圣风暴 · 8 秒冷却')}${ability('e','consecrate','E','奉 献','E · 奉献 · 12 秒冷却')}${ability('space','dodge','空格','圣翼闪避','空格 · 圣翼闪避 · 2 秒冷却')}</div>
      <div class="angel-meter"><div class="angel-meter-title"><span>+ 天使降临</span><b class="angel-meter-value">0 / 12</b></div><div class="angel-meter-track"><i></i></div><div class="angel-meter-help">击杀 12 名亡灵唤醒圣翼</div></div><div class="kill-panel"><div class="kill-label">净 化 之 魂</div><div class="kill-count">00</div><div class="kill-total">SOULS CLEANSED</div></div>
      <div class="combo"><strong>0</strong><span>连 斩</span></div><div class="toast"><div class="toast-title"></div><div class="toast-sub"></div></div>
      <div class="boss-panel" hidden><div class="boss-name">恐惧魔王 · 长夜领主</div><div class="boss-track"><div class="boss-fill"></div></div></div>
      <div class="onboarding"><span><kbd>W A S D</kbd>移动</span><span><kbd>右键拖动</kbd>视角</span><span><kbd>滚轮</kbd>远近</span><span><kbd>R</kbd>镜头归中</span><span><kbd>J / 左键</kbd>连击</span></div>
      <div class="relic-hint" hidden></div><div class="touch-controls"><div class="touch-stick" role="group" aria-label="移动摇杆"><span>移 动</span><i></i></div></div><button class="touch-recenter" aria-label="镜头归中">归中</button>
      <div class="modal-layer start"><div class="modal-content"></div><div class="menu-version">A SMALL WORLD. AN UNBROKEN OATH.</div></div><div class="system-notice" role="status" aria-live="polite"></div>`;
    this.dom = { angel:ui.querySelector('.angel-meter'), angelValue:ui.querySelector('.angel-meter-value'), angelFill:ui.querySelector('.angel-meter-track i'), angelHelp:ui.querySelector('.angel-meter-help'), clock:ui.querySelector('.survival-clock'), best:ui.querySelector('.survival-best'), life:ui.querySelector('.life-pips'), relicObjective:ui.querySelector('.relic-objective'), relicHint:ui.querySelector('.relic-hint'),health: ui.querySelector('.health-fill'), hp: ui.querySelector('.health-text'), kills: ui.querySelector('.kill-count'), detail: ui.querySelector('.objective-detail'), combo: ui.querySelector('.combo'), comboValue: ui.querySelector('.combo strong'), modal: ui.querySelector('.modal-layer'), modalContent: ui.querySelector('.modal-content'), toast: ui.querySelector('.toast'), toastTitle: ui.querySelector('.toast-title'), toastSub: ui.querySelector('.toast-sub'), boss: ui.querySelector('.boss-panel'), bossName: ui.querySelector('.boss-name'), bossFill: ui.querySelector('.boss-fill'), damage: ui.querySelector('.damage-vignette'), help: ui.querySelector('.onboarding'), location: ui.querySelector('.map-location') };
    this.mapCtx = ui.querySelector('#minimap').getContext('2d'); this.mapCtx.scale(.5,.5); this.mapCtx.imageSmoothingEnabled = false;
    ui.querySelector('#pause-button').addEventListener('click', () => this.togglePause());
    ui.querySelector('#fullscreen-button').addEventListener('click', () => this.toggleFullscreen());
    const syncFullscreen = () => {
      const full = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
      const button = ui.querySelector('#fullscreen-button');
      button.querySelector('span').textContent = full ? '退出全屏' : '全屏'; button.setAttribute?.('aria-label', full ? '退出全屏' : '进入全屏');
    };
    document.addEventListener?.('fullscreenchange', syncFullscreen); document.addEventListener?.('webkitfullscreenchange', syncFullscreen);
    ui.querySelector('#sound-button').addEventListener('click', () => { this.audio.toggleMute(); this.syncSoundButton(); });
    this.syncSoundButton();
    for (const id of ['j', 'q', 'e', 'space']) ui.querySelector(`#ability-${id}`).addEventListener('click', () => { if (this._state !== 'playing') return; if (id === 'j') this.attack(); else this.skill(id); });

  }
  showMenu(type) {
    this.dom.modal.hidden = false; this.dom.modal.className = `modal-layer ${type === 'start' ? 'start' : ''}`;
    const btn = (id, text, primary = false) => `<button id="menu-${id}" class="menu-button ${primary ? 'primary' : 'secondary'}">${text}<span class="arrow">&gt;</span></button>`;
    let content = '';
    if (type === 'start') content = `<div class="menu-eyebrow">LORDAERON · THE FALLEN CITY</div><div class="menu-crest">${svg('consecrate')}</div><h2 class="menu-title">斯坦索姆</h2><div class="menu-subtitle">余烬中的誓言</div><div class="menu-divider"></div><p class="menu-description">钟声已停。火焰还在燃烧。<br>尸潮永不停歇，挑战你能坚持的极限。<br>满血只能承受三次攻击，拾取血包才能回血。<br>打碎南街与东巷的圣物，唤醒 Q／E 技能。<br>击杀 12 名亡灵，唤醒五秒无敌天使。</p>${btn('start','踏 入 旧 城',true)}${btn('settings','画 面 与 声 音')}<p class="menu-controls desktop-guide"><strong>WASD</strong> 移动　<strong>J</strong> 连击　<strong>Q / E</strong> 圣物解锁<br>右键拖动视角 · 滚轮远近 · <strong>R</strong> 归中<br><strong>SPACE</strong> 闪避</p><p class="menu-controls touch-guide">左侧摇杆移动 · 右侧按住圣锤连击<br>拖动街道转动视角 · 双指缩放<br>横屏游玩视野更宽 · 点击圣翼闪避</p><div class="menu-fineprint">无尽尸潮 · 越战越险 · 领主反复来袭<br>${this.record.persistent ? '本地最佳' : '本次最佳'} ${formatSurvivalTime(this.record.best.seconds)} · ${this.record.best.kills} 净化之魂<br>同人致敬作品 · 非官方出品</div>`;
    if (type === 'pause') content = `<div class="menu-crest">${svg('consecrate')}</div><div class="menu-eyebrow">THE LIGHT WILL WAIT</div><h2 class="menu-title">誓言未歇</h2><p class="menu-description">旧城的时间，暂时停在此刻。</p>${btn('resume','继 续 征 战',true)}${btn('settings','画 面 与 声 音')}${btn('restart','重 新 开 始')}${btn('home','返 回 主 菜 单')}`;
    if (type === 'settings') content = `<div class="menu-eyebrow">SETTINGS</div><h2 class="menu-title">画面与声音</h2>
      <label class="setting-row">总音量<input aria-label="总音量" id="volume-setting" type="range" min="0" max="100" value="${Math.round(this.audio.volume * 100)}"></label>
      <label class="setting-row">打击与环境音效<input aria-label="音效音量" id="effects-setting" type="range" min="0" max="100" value="${Math.round(this.audio.effectsVolume * 100)}"></label>
      <label class="setting-row">背景音乐<input aria-label="配乐音量" id="music-volume-setting" type="range" min="0" max="100" value="${Math.round(this.audio.musicVolume * 100)}"></label>
      <label class="setting-row">配乐选择<select aria-label="配乐选择" id="music-setting">${AUDIO_ASSETS.music.map(track=>`<option value="${track.id}" ${this.audio.status.track===track.id?'selected':''}>${track.title}</option>`).join('')}</select></label>
      <label class="setting-row">画面品质<select aria-label="画面品质" id="quality-setting"><option value="high" ${this.quality !== 'low' ? 'selected' : ''}>精致 · 像素细节</option><option value="low" ${this.quality === 'low' ? 'selected' : ''}>流畅 · 轻量像素</option></select></label>
      <p class="settings-note">重击时配乐会轻轻退后，让圣锤的声音更清楚。<br>音量与配乐选择会自动保存。<br>流畅画质使用更粗的像素与简化环境特效。</p>${btn('back','返 回',true)}`;
    if (type === 'dead') {
      const newBest = Math.floor(this.gameTime) > this.record.baseline;
      content = `<div class="menu-crest">${svg('hammer')}</div><div class="menu-eyebrow">${newBest ? 'A NEW SURVIVAL RECORD' : 'A FALLEN OATH'}</div><h2 class="menu-title">${newBest ? '新的生存纪录' : '誓言未尽'}</h2><p class="menu-description">你的圣锤沉入灰烬。<br>尸潮没有尽头，下一次能否坚持更久？</p><div class="result-grid"><div class="result-stat"><strong>${formatSurvivalTime(this.gameTime)}</strong><span>本局存活</span></div><div class="result-stat"><strong>${this.kills}</strong><span>净化之魂</span></div><div class="result-stat"><strong>${this.threatStage}</strong><span>尸潮等级</span></div></div><p class="result-best">${this.record.persistent ? '本地最佳' : '本次最佳'} ${formatSurvivalTime(this.record.best.seconds)} · ${this.record.best.kills} 净化之魂<br>本局最高连斩 ${this.maxCombo}</p>${btn('restart','再 战 一 次',true)}${btn('home','返 回 主 菜 单')}`;
    }
    this.dom.modalContent.innerHTML = content;
    const on = (id, fn) => this.dom.modalContent.querySelector(`#menu-${id}`)?.addEventListener('click', fn);
    on('start', () => this.start()); on('restart', () => this.start()); on('resume', () => this.resume());
    on('settings', () => { this.menuReturn = type; this.showMenu('settings'); });
    on('back', () => this.showMenu(this.menuReturn || 'start'));
    on('home', () => { this.reset(); this._state = 'menu'; this.audio.setMode('menu'); this.audio.start(); this.spawnMenuEnemies(); this.showMenu('start'); });
    this.dom.modalContent.querySelector('#volume-setting')?.addEventListener('input', e => { this.audio.setVolume(Number(e.target.value) / 100); this.syncSoundButton(); });
    this.dom.modalContent.querySelector('#effects-setting')?.addEventListener('input', e => this.audio.setEffectsVolume(Number(e.target.value) / 100));
    this.dom.modalContent.querySelector('#music-volume-setting')?.addEventListener('input', e => this.audio.setMusicVolume(Number(e.target.value) / 100));
    this.dom.modalContent.querySelector('#music-setting')?.addEventListener('change', e => { this.audio.start(); this.audio.switchMusic(e.target.value); });
    this.dom.modalContent.querySelector('#quality-setting')?.addEventListener('change', e => { this.quality = e.target.value; this.activeCap = hordePressure(this.gameTime,this.kills,this.quality).cap; this.trimCorpses(); this.onQuality?.(this.quality); });
  }
  syncSoundButton() {
    const muted=this.audio.status.muted || this.audio.volume===0;
    this.ui.querySelector('#sound-button').textContent=`声音 · ${muted?'关':'开'}`;
  }
  beginAngelDescent() {
    if(this._state!=='playing'||this.hp<=0||!this.angel.begin())return false;
    this._state='ascension';this.resetActions(true);this.heroSpeed=0;this.keys.clear();this.touchControls?.reset();this.inputAttack=false;this.drag=false;
    this.environmentalAudio?.stop();this.audio.setMode('ascension');this.audio.play('holyCharge',1.05);this._angelBeat=false;
    this.dom.toast.classList.remove('visible');this.toastTimer=0;this.angelFilm?.show();this.updateHUD();return true;
  }
  updateAngelCinematic(dt) {
    const end=this.angel.advanceCinematic(dt);this.angelFilm?.render(end?ANGEL.cinematicSeconds:this.angel.elapsed);
    if(!this._angelBeat&&(end||this.angel.elapsed>=.83)){this._angelBeat=true;this.audio.play('chime',1.2);this.audio.play('heavy',.75);}
    if(end){
      this.angelFilm?.hide();this._state='playing';this.keys.clear();this.touchControls?.reset();this.inputAttack=false;this.resetActions(true);this.player.resetMotion?.();
      this.angelWings?.update(0,1,1);this.audio.setMode('playing');this.audio.play('consecrate',1);this.shake=.2;this.playerLight.intensity=5;
    }
    this.updateHUD();
  }
  updateAngelPower(dt) {
    if(!this.angel?.active)return;
    const ended=this.angel.advanceActive(dt);
    if(ended){this.angelWings?.reset();this.updateHUD();}
    else this.angelWings?.update(this.angel.elapsed,1,Math.min(1,this.angel.remaining/.35));
  }
  soundAt(kind,position,power=1,options={}) {
    const delta=position.clone().sub(this.player.root.position),distance=delta.length();
    if(distance>17)return;
    const pan=clamp((delta.x*Math.cos(this.viewYaw)-delta.z*Math.sin(this.viewYaw))/9,-.8,.8);
    this.audio.play(kind,power/(1+distance*.12),{...options,pan});
  }
  setupInput() {
    this.touchControls = new TouchControls(this, CAMERA);
    this.onKeyDown = e => {
      if (e.target?.matches?.('input, select, textarea') && e.key !== 'Escape') return;
      const key = e.code === 'Space' ? 'space' : e.key.toLowerCase();
      if (key === 'f' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); this.toggleFullscreen(); return; }
      if (['w','a','s','d','q','e','j','r','space','arrowup','arrowdown','arrowleft','arrowright'].includes(key)) e.preventDefault();
      if (e.key === 'Escape' && !e.repeat) { e.preventDefault(); this.togglePause(); return; }
      if (key === 'r' && this._state === 'playing' && !e.repeat) { this.resetCamera(false); return; }
      this.keys.add(key);
      if (this._state === 'playing' && !e.repeat && ['q','e','space'].includes(key)) this.skill(key);
    };
    this.onKeyUp = e => this.keys.delete(e.code === 'Space' ? 'space' : e.key.toLowerCase());
    window.addEventListener('keydown', this.onKeyDown); window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('pagehide', () => this.saveRecord());
    document.addEventListener('visibilitychange', () => { if (document.hidden && ['playing','ascension'].includes(this._state)) this.pause(); });
    window.addEventListener('blur', () => { this.keys.clear();this.touchControls?.reset(); this.inputAttack = false; this.drag = false; if (['playing','ascension'].includes(this._state)) this.pause(); });
    const canvas = this.renderer.domElement; canvas.tabIndex = 0;
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch' || this._state !== 'playing') return; canvas.focus();
      if (e.button === 2) { e.preventDefault(); this.drag = true; this.dragPointer = e.pointerId; this.lastPointer = [e.clientX,e.clientY]; canvas.setPointerCapture(e.pointerId); }
      if (e.button === 0) this.inputAttack = true;
    });
    const endOrbit = () => { this.drag = false; this.dragPointer = null; };
    window.addEventListener('pointerup', e => { if(e.pointerType==='touch')return; if (e.button === 2) endOrbit(); if (e.button === 0) this.inputAttack = false; });
    window.addEventListener('pointercancel', e => { if(e.pointerType==='touch')return; endOrbit(); this.inputAttack = false; });
    canvas.addEventListener('lostpointercapture', endOrbit);
    window.addEventListener('pointermove', e => {
      if (!this.drag || this._state !== 'playing' || e.pointerId !== this.dragPointer) return;
      this.yaw -= (e.clientX - this.lastPointer[0]) * .005;
      this.pitch = clamp(this.pitch + (e.clientY - this.lastPointer[1]) * .003, CAMERA.minPitch, CAMERA.maxPitch); this.lastPointer = [e.clientX,e.clientY];
    });
    canvas.addEventListener('wheel', e => {
      e.preventDefault(); if (this._state !== 'playing') return;
      const pixels = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientHeight || 720 : 1);
      this.distance = clamp(this.distance * Math.exp(clamp(pixels, -300, 300) * .0012), CAMERA.minDistance, CAMERA.maxDistance);
    }, { passive: false });
  }
  saveRecord() { this.record.save(this.gameTime,this.kills); }
  reset() {
    this.saveRecord();this.record.begin();this.angel?.reset();this.angelWings?.reset();this.angelFilm?.hide();this.pauseReturn=null;
    for (const enemy of this.enemies) { this.scene.remove(enemy.actor.root); enemy.actor.dispose?.(); }
    this.enemies.length = 0;
    this.horde.reset();this.recordTimer=0;this.activeCap=hordePressure(0,0,this.quality).cap;
    if (this.enemyBars) { this.enemyBars.back.count = 0; this.enemyBars.fill.count = 0; }
    for (const effect of this.effects) this.disposeEffect(effect); this.effects.length = 0;this.holyVfx?.reset();
    for (const floater of this.floaters) floater.el.remove(); this.floaters.length = 0;
    this.resetEnvironment();this.supplies?.reset();this.unlocked={q:false,e:false};
    this.keys.clear();this.touchControls?.reset(); this.inputAttack = false; this.drag = false; this.hp = this.maxHp; this.gameTime = 0; this.kills = 0; this.threatStage = 1;
    this.combo = 0; this.comboTimer = 0; this.maxCombo = 0;
    this.resetActions(true); this._combatTime = 0; this.heroSpeed = 0; this.stepDistance = 0; this.stepVariant = 0; this.groanTimer = 2.5; this.audio.silence(); this.invincible = 0; this.hitFlash = 0; this.shake = 0; this.cooldowns = { q: 0, e: 0, space: 0 };
    this.player.root.position.copy(this.world.start || new THREE.Vector3(0,0,20)); this.player.root.rotation.y = Math.PI;
    this.player.resetMotion?.();this.aura?.reset(); this.playerVelocity.set(0,0,0); this.dodgeDirection.set(0,0,-1); this.deathTimer=0; this.toastTimer=0;
    this.resetCamera(true);
    this.dom.boss.hidden = true; this.dom.help.style.opacity = '1'; this.dom.toast.classList.remove('visible'); this.updateHUD();
  }
  start() { this.reset(); this._state = 'playing'; this.dom.modal.hidden = true; this.audio.setMode('playing'); this.audio.start(); this.announce('无尽生存 · 尸潮永不停歇','打碎金色圣物解锁技能 · 靠近红色血包回血',4.2); this.renderer.domElement.focus(); this.updateHUD(); }
  pause() { if(this._state==='paused')return;this.pauseReturn=this._state;this.saveRecord(); this._state = 'paused'; this.environmentalAudio?.stop(); this.audio.setMode('paused'); this.keys.clear();this.touchControls?.reset(); this.inputAttack = false; this.drag = false; this.updateHUD(); this.showMenu('pause'); }
  resume() { this._state=this.pauseReturn==='ascension'?'ascension':'playing';this.audio.setMode(this._state==='ascension'?'ascension':'playing'); this.dom.modal.hidden = true; this.renderer.domElement.focus(); this.audio.start(); }
  togglePause() { if (['playing','ascension'].includes(this._state)) this.pause(); else if (this._state === 'paused') this.resume(); }
  async toggleFullscreen() {
    try {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (!exit) throw new Error('Fullscreen exit unavailable');
        await exit.call(document);
      } else {
        const target = document.documentElement;
        const request = target.requestFullscreen || target.webkitRequestFullscreen;
        if (!request) throw new Error('Fullscreen unavailable');
        await request.call(target);
      }
    } catch (_) {
      const notice = this.ui.querySelector('.system-notice');
      notice.textContent = this.ui.classList.contains('touch-ui') ? '当前浏览器不支持网页全屏，横屏也可以游玩。' : '当前浏览器限制了网页全屏，请按 F11 使用浏览器全屏。';
      notice.classList.add('visible');
      clearTimeout(this.noticeTimeout);
      this.noticeTimeout = setTimeout(() => notice.classList.remove('visible'), 5500);
    }
  }
  announce(title, sub, duration = 3) { this.dom.toastTitle.textContent = title; this.dom.toastSub.textContent = sub; this.dom.toast.classList.add('visible'); this.toastTimer = duration; }
  clearPath(a, b, radius = .5) {
    const count = Math.max(1, Math.ceil(a.distanceTo(b) / 1.1));
    for (let i = 1; i <= count; i++) {
      const p = a.clone().lerp(b, i / count), q = this.world.resolveMovement(p.clone(), radius);
      if (p.distanceToSquared(q) > .13 * .13) return false;
    }
    return true;
  }
  move(root, direction, distance, radius) {
    const p = root.position, origin = p.clone();
    const targetX = p.clone(); targetX.x += direction.x * distance;
    const resultX = this.world.resolveMovement(targetX, radius); if (resultX) p.copy(resultX);
    const targetZ = p.clone(); targetZ.z += direction.z * distance;
    const resultZ = this.world.resolveMovement(targetZ, radius); if (resultZ) p.copy(resultZ);
    p.y = 0;
    return p.distanceTo(origin);
  }
  facingDirection() { return new THREE.Vector3(Math.sin(this.player.root.rotation.y),0,Math.cos(this.player.root.rotation.y)); }
  moveDirection() {
    let x = (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) - (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0);
    let z = (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0) - (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0);
    x += this.touchControls?.movement.x || 0; z += this.touchControls?.movement.z || 0;
    return new THREE.Vector3(x, 0, z).applyAxisAngle(UP, this.viewYaw).normalize();
  }
  actionProgress() { return this._actionDuration > 0 ? clamp(this._actionElapsed / this._actionDuration,0,1) : 0; }
  resetActions(resetCombo=false) {
    this._action='idle'; this._actionElapsed=0; this._actionDuration=0; this._actionContact=1;
    this._actionFired=false; this._actionAim=null; this._hitstop=0; this._actionWhoosh=false;
    this._environmentAttackId=null;
    this.attackTimer=0; this.attackDuration=.5; this.attackFired=false; this.dodgeTimer=0;
    if(resetCombo){this.comboStep=0;this.lastAttack=-10;}
  }
  beginAction(action,duration,contact=1) {
    this.resetActions(); this._action=action; this._actionDuration=duration; this._actionContact=contact;
    this._environmentAttackId=this.nextEnvironmentAttackId();
    this.attackDuration=duration; this.attackTimer=action==='dodge'?0:duration; this.dodgeTimer=action==='dodge'?duration:0;
  }
  updateAction(dt) {
    if(this._action==='idle'||dt<=0)return;
    this._actionElapsed=Math.min(this._actionDuration,this._actionElapsed+dt);
    const progress=this.actionProgress(),remaining=Math.max(0,this._actionDuration-this._actionElapsed);
    if(this._action==='melee'&&!this._actionWhoosh&&progress>=.30){this._actionWhoosh=true;this.audio.play('swing',this.comboStep===2?1.05:.86,{variant:this.comboStep});}
    this.attackTimer=this._action==='dodge'?0:remaining;this.dodgeTimer=this._action==='dodge'?remaining:0;
    if(this._action!=='dodge'&&!this._actionFired&&progress>=this._actionContact){
      this._actionFired=true;this.attackFired=true;
      if(this._action==='melee')this.applyMelee();
      else if(this._action==='whirl')this.applySkillContact('q');
      else if(this._action==='cast')this.applySkillContact('e');
    }
    if(progress>=1)this.resetActions();
  }
  attack() {
    if(this._state!=='playing'||this._hitstop>0)return;
    if(this._action==='melee') { if(this.actionProgress()<.8||!this._actionFired)return; }
    else if(this._action!=='idle')return;
    this.comboStep = this.gameTime - this.lastAttack < .95 ? (this.comboStep + 1) % 3 : 0;
    this.lastAttack=this.gameTime;this.beginAction('melee',MELEE_DURATIONS[this.comboStep],MELEE_CONTACTS[this.comboStep]);
    const nearest = this.enemies.filter(e => !e.dead && !e.decorative).reduce((best, e) => {
      const dist = e.actor.root.position.distanceToSquared(this.player.root.position);
      return dist < 4.5 * 4.5 && (!best || dist < best.dist) ? { enemy: e, dist } : best;
    }, null);
    if(nearest){const d=nearest.enemy.actor.root.position.clone().sub(this.player.root.position);this._actionAim=Math.atan2(d.x,d.z);}
  }
  applyMelee() {
    const facing = this.facingDirection(), heavy = this.comboStep === 2;

    let hits = 0;
    for (const enemy of this.enemies) {
      if (enemy.dead || enemy.decorative) continue;
      const d = enemy.actor.root.position.clone().sub(this.player.root.position), distance = d.length();
      if (distance < (heavy ? 3.8 : 3.3) + enemy.radius * .3 && (distance < 1.3 || d.normalize().dot(facing) > (heavy ? -.4 : -.13))) {
        this.damageEnemy(enemy, heavy ? 65 : 38, heavy ? 4.7 : 2.3, heavy); hits++;
      }
    }
    if (hits) { this.shake = Math.max(this.shake, heavy ? .18 : .085); this.audio.play(heavy?'heavy':'hit',heavy?1:.85,{variant:this.comboStep}); this._hitstop=heavy?.065:.045; }
    this.damageEnvironment({position:this.player.root.position,direction:facing,radius:heavy?3.8:3.3,arc:Math.acos(heavy?-.4:-.13)*2,damage:heavy?65:38,source:'melee',attackId:this._environmentAttackId});
  }
  skill(id) {
    if(this._state!=='playing'||!['q','e','space'].includes(id)||this.cooldowns[id]>0)return;
    if(id!=='space'&&!this.unlocked?.[id]){const relic=RELICS.find(r=>r.ability===id);this.announce(`${relic.skill}尚未获得`,`打碎${relic.area}的${relic.name}以解锁`,2.2);return;}
    if(id!=='space'&&!['idle','melee'].includes(this._action))return;
    const p = this.player.root.position;
    this.lastAttack=-10;this.comboStep=0;
    if(id==='space'){
      this.beginAction('dodge',.34);this.cooldowns.space=2;this.invincible=.48;
      this.dodgeDirection=this.moveDirection();if(this.dodgeDirection.lengthSq()<.01)this.dodgeDirection=this.facingDirection();
      this.audio.play('dodge');this.burst(p.clone().add(new THREE.Vector3(0,.7,0)),0xc9def0,16,2);
    }else if(id==='q'){
      this.beginAction('whirl',.9,.44);this.cooldowns.q=8;this.invincible=Math.max(this.invincible,.75);this.audio.play('holyCharge',.7,{variant:0});
    }else{
      this.beginAction('cast',1.05,.58);this.cooldowns.e=12;this.audio.play('holyCharge',.8,{variant:1});
    }
    this.updateHUD();
  }
  applySkillContact(id) {
    const p=this.player.root.position;
    if (id === 'q') {
      this.audio.play('whirl',1); this.audio.play('heavy',.64);
      const visual=this.holyVfx?.storm(p);if(visual)this.effects.push({root:visual.root,visual,age:0,duration:visual.duration,type:'holy-storm'});
      for (const e of this.enemies) if (!e.dead && !e.decorative && e.actor.root.position.distanceTo(p) < 6) this.damageEnemy(e,115,9,true);
      this.damageEnvironment({position:p,radius:6,damage:115,source:'whirl',attackId:this._environmentAttackId});
      this.shake = .22; this.playerLight.intensity = 8;
    }
    if (id === 'e') {
      this.audio.play('consecrate',1); this.audio.play('heavy',.48);
      const visual=this.holyVfx?.consecration(p),root=visual?.root||new THREE.Group();
      if(!visual){root.position.copy(p);this.scene.add(root);}
      this.effects.push({root,visual,age:0,duration:5.2,type:'consecration',tick:0,position:p.clone(),radius:4.3,environmentAttackId:this._environmentAttackId||this.nextEnvironmentAttackId(),environmentTick:0});

    }
    this.updateHUD();
  }
  unlockSkill(id,position){
    if(!['q','e'].includes(id)||this.unlocked?.[id]||this._state!=='playing')return false;
    this.unlocked??={q:false,e:false};this.unlocked[id]=true;this.cooldowns[id]=0;
    const relic=RELICS.find(r=>r.ability===id);this.audio.play('chime',.95);this.burst(position.clone().setY(1.6),0xffdf86,50,4);
    this.announce(`${relic.skill}已获得`,`${id.toUpperCase()} 释放 · 圣物的力量已苏醒`,3.5);this.updateHUD();return true;
  }
  updateSupplies(dt){
    if(this._state!=='playing'||!this.supplies)return;
    const restored=this.supplies.update(dt,this.player.root.position,this.hp,this.maxHp,p=>this.enemyAttackLine(this.player.root.position,p));
    if(restored>0){this.heal(restored);this.audio.play('chime',.42);this.floating(this.player.root.position,`+${restored} 生命`,'healing',2.0);this.burst(this.player.root.position.clone().setY(.8),0xbed98c,12,1);this.updateHUD();}
  }
  updateRelicHUD(){
    if(!this.dom.relicObjective)return;const p=this.player.root.position,remaining=RELICS.filter(r=>!this.unlocked?.[r.ability]);
    this.dom.relicObjective.innerHTML=remaining.map(r=>`<span><b>${r.ability.toUpperCase()}</b> ${r.area}圣物 · ${Math.round(Math.hypot(p.x-r.x,p.z-r.z))}m</span>`).join('');
    this.dom.relicObjective.hidden=remaining.length===0;
    const nearby=remaining.find(r=>Math.hypot(p.x-r.x,p.z-r.z)<5),state=nearby&&(this.world.destruction?.relics||[]).find(r=>r.id===nearby.id);
    this.dom.relicHint.hidden=!nearby||this._state!=='playing';
    if(nearby)this.dom.relicHint.textContent=`J 打碎${nearby.name} · 解锁 ${nearby.ability.toUpperCase()} ${nearby.skill}${state?` · ${state.hp}/${state.maxHp}`:''}`;
  }
  damageEnemy(enemy, amount, knock = 0, critical = false, origin=this.player.root.position,source='hero') {
    if (enemy.dead || enemy.decorative || this._state!=='playing') return;
    const judgement=this.angel?.active&&source!=='environment';if(judgement){amount=Math.max(amount,enemy.hp);critical=true;}
    enemy.hp -= amount; enemy.hit = .23; enemy.stun = Math.max(enemy.stun,enemy.stunDuration); enemy.attackTimer=0;
    enemy.knock.copy(enemy.actor.root.position).sub(origin).setY(0).normalize().multiplyScalar(knock*enemy.knockScale);
    this.floating(enemy.actor.root.position,judgement?'裁决':amount,critical?'critical':'',enemy.healthBarHeight);
    this.burst(enemy.actor.root.position.clone().add(new THREE.Vector3(0,enemy.impactHeight,0)),0xe4ba72,critical?12:6,1.8);
    if(enemy.hp<=0){
      enemy.dead=true;enemy.deathAge=0;this.kills++;this.angel?.earnKill();this.combo++;this.comboTimer=4.5;this.maxCombo=Math.max(this.maxCombo,this.combo);
      this.supplies?.enemyKilled(enemy,this.hp);this.soundAt('kill',enemy.actor.root.position,enemy.sound.killGain,{pitch:enemy.sound.killPitch});
      if(enemy.boss)this.dom.boss.hidden=true;
      this.trimCorpses();
    }
  }
  heal(amount) { this.hp=Math.min(this.maxHp,this.hp+amount); }
  hurt(amount) {
    if(this.invincible>0||this.angel?.protected||this._state!=='playing')return;
    if(!Number.isFinite(amount)||amount<=0)return;
    this.hp=Math.max(0,this.hp-SURVIVAL.hitDamage);this.invincible=SURVIVAL.hitGrace;this.hitFlash=.5;this.updateHUD();this.shake=.16;this.audio.play('hurt');
    if(this.hp<=0){this.saveRecord();this._state='dead';this.audio.setMode('dead');this.resetActions(true);this.heroSpeed=0;this.inputAttack=false;this.keys.clear();this.touchControls?.reset();this.deathTimer=1.3;this.dom.help.style.opacity='0';}
  }
  spawnEnemy(kind='zombie',decorative=false,position=null,boss=false) {
    const stats=createEnemyStats(kind,boss),radius=stats.radius;
    let p=position?.clone();
    if(!p){
      const candidates=(this.world.spawnPoints||this.navNodes).filter(v=>v.distanceTo(this.player.root.position)>10);
      const source=candidates.length?candidates:(this.world.spawnPoints||this.navNodes);
      // Try separated entry positions so larger monsters do not stack at a gate.
      let best=null,bestClearance=-Infinity;
      for(let attempt=0;attempt<10;attempt++){
        const candidate=source[Math.floor(Math.random()*source.length)].clone();
        candidate.x+=(Math.random()-.5)*3;candidate.z+=(Math.random()-.5)*3;
        const resolved=this.world.resolveMovement(candidate,radius);
        let clearance=resolved.distanceTo(this.player.root.position)-8;
        for(const other of this.enemies){if(other.dead||other.decorative)continue;clearance=Math.min(clearance,resolved.distanceTo(other.actor.root.position)-radius-other.radius-.25);}
        if(clearance>bestClearance){best=resolved.clone();bestClearance=clearance;}
        if(clearance>=0)break;
      }
      p=best;
    }
    const actor=this.actors.create(kind);
    p=this.world.resolveMovement(p,radius);actor.root.position.copy(p);actor.root.rotation.y=Math.random()*TAU;
    actor.root.scale.multiplyScalar(stats.size);
    this.scene.add(actor.root);
    const enemy={...stats,id:this.nextId++,kind,actor,boss,decorative,dead:false,deathAge:0,fastDecay:false,hit:0,stun:0,knock:new THREE.Vector3(),attackTimer:0,attackCooldown:Math.random()*1.5+.4,attackFired:false,attackVariant:1,navTime:0,navTarget:null,phase:Math.random()*10};
    this.enemies.push(enemy);return enemy;
  }
  spawnMenuEnemies() {
    const kinds=['zombie','forsaken','zombie','zombie','abomination','forsaken'];
    kinds.forEach((kind,i)=>this.spawnEnemy(kind,true,new THREE.Vector3((i%3-1)*2.6,0,-3-Math.floor(i/3)*5)));
  }
  trimCorpses() {
    const limit=this.quality==='low'?ENEMY_LIMITS.corpsesLow:ENEMY_LIMITS.corpsesHigh;
    const corpses=this.enemies.filter(e=>e.dead&&!e.fastDecay).sort((a,b)=>b.deathAge-a.deathAge||a.id-b.id);
    for(let i=0;i<corpses.length-limit;i++)corpses[i].fastDecay=true;
  }
  updateEnemyHealthBars() {
    // Two instanced draws cover the entire crowd; no textures or DOM per enemy.
    if(!this.enemyBars){
      const geometry=new THREE.PlaneGeometry(1,1);
      const back=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial({color:0x202a29,depthWrite:false,toneMapped:false}),ENEMY_LIMITS.high);
      const fill=new THREE.InstancedMesh(geometry,new THREE.MeshBasicMaterial({color:0xffffff,depthWrite:false,toneMapped:false}),ENEMY_LIMITS.high);
      for(const mesh of [back,fill]){mesh.count=0;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.scene.add(mesh);}
      back.renderOrder=20;fill.renderOrder=21;
      this.enemyBars={back,fill,dummy:new THREE.Object3D(),color:new THREE.Color(),right:new THREE.Vector3()};
    }
    const {back,fill,dummy,color,right}=this.enemyBars;
    right.set(1,0,0).applyQuaternion(this.camera.quaternion);
    let count=0;
    for(const e of this.enemies){
      if(e.dead||e.decorative||(!e.large&&e.hp>=e.maxHp)||e.actor.root.position.distanceToSquared(this.player.root.position)>22*22)continue;
      if(count>=ENEMY_LIMITS.high)break;
      const fraction=clamp(e.hp/e.maxHp,0,1),width=e.healthBarWidth;
      dummy.quaternion.copy(this.camera.quaternion);dummy.position.copy(e.actor.root.position);dummy.position.y+=e.healthBarHeight;
      dummy.scale.set(width,.12,1);dummy.updateMatrix();back.setMatrixAt(count,dummy.matrix);
      dummy.position.addScaledVector(right,-width*.46*(1-fraction));dummy.scale.set(width*.92*fraction,.07,1);dummy.updateMatrix();fill.setMatrixAt(count,dummy.matrix);
      fill.setColorAt(count,color.setHex(e.barColor));count++;
    }
    back.count=fill.count=count;back.instanceMatrix.needsUpdate=true;fill.instanceMatrix.needsUpdate=true;
    if(fill.instanceColor)fill.instanceColor.needsUpdate=true;
  }
  getNavTarget(enemy) {
    // A hero can stand closer to a fountain or wall than a large monster can.
    // Route to an enemy-sized legal approach point; attacks still measure the
    // actual player position in updateEnemies.
    const start=enemy.actor.root.position, player=this.player.root.position;
    let end=this.world.resolveMovement(player.clone(),enemy.radius);
    if(end.distanceTo(player)>enemy.attack.startRange*.9||!this.enemyAttackLine(end,player)){
      // At overlapping cart/house corners the collision projection can choose
      // a distant wall face. Search the weapon's reachable perimeter for a
      // legal stance with a clear attack line into the hero's narrower space.
      let best=null,bestScore=Infinity,nearest=end,nearestDistance=end.distanceTo(player);
      const range=Math.max(.2,enemy.attack.hitRange-.08);
      for(let i=0;i<32;i++){
        const angle=i*TAU/32,candidate=this.world.resolveMovement(player.clone().add(new THREE.Vector3(Math.sin(angle)*range,0,Math.cos(angle)*range)),enemy.radius);
        const distance=candidate.distanceTo(player);
        if(!this.enemyAttackLine(candidate,player))continue;
        if(distance<nearestDistance){nearest=candidate;nearestDistance=distance;}
        if(distance>enemy.attack.hitRange-.04)continue;
        const score=candidate.distanceTo(start)+distance*.25;
        if(score<bestScore){best=candidate;bestScore=score;}
      }
      // Some gaps admit the hero but are narrower than this monster. Wait at
      // the closest legal edge without extending its reach or phasing a wall.
      end=best||nearest;
    }
    if(this.enemyPath(start,end,enemy.radius))return end.clone();
    const nearest=(p)=>this.navNodes.map((n,i)=>({i,d:n.distanceToSquared(p)})).sort((a,b)=>a.d-b.d).find(a=>this.enemyPath(p,this.navNodes[a.i],enemy.radius))?.i;
    const a=nearest(start),b=nearest(end);if(a===undefined||b===undefined)return this.getObstacleNavTarget(enemy,end)||end.clone();
    const queue=[a],prev=new Map([[a,null]]);
    for(let k=0;k<queue.length;k++){const n=queue[k];if(n===b)break;for(const v of this.navGraph[n])if(!prev.has(v)&&this.enemyPath(this.navNodes[n],this.navNodes[v],enemy.radius)){prev.set(v,n);queue.push(v);}}
    if(!prev.has(b))return this.getObstacleNavTarget(enemy,end)||this.navNodes[a].clone();
    const path=[];let i=b;while(i!==null){path.unshift(i);i=prev.get(i);}
    for(let j=path.length-1;j>=0;j--)if(this.enemyPath(start,this.navNodes[path[j]],enemy.radius))return this.navNodes[path[j]].clone();
    return this.navNodes[a].clone();
  }
  getObstacleNavTarget(enemy,end,approachSearch=false) {
    if(!this.world.destruction)return null;
    // Ten district waypoints are enough for buildings, but small new carts and
    // barrels can cut their sight lines. Only failed coarse routes use this
    // lazy grid. Occupancy/edges are shared by 2.5cm clearance buckets and by
    // destruction revision; moving enemies never rebuild it every frame.
    const radius=Math.ceil(enemy.radius*40)/40,revision=this.world.destruction.revision;
    this._obstacleNavigationCache??=new Map();
    const key=`${revision}:${radius}`;let grid=this._obstacleNavigationCache.get(key);
    if(!grid){
      const bounds=this.world.bounds||{minX:-14,maxX:32,minZ:-26,maxZ:28},step=1.05;
      const columns=Math.ceil((bounds.maxX-bounds.minX)/step)+1,rows=Math.ceil((bounds.maxZ-bounds.minZ)/step)+1;
      grid={minX:bounds.minX,minZ:bounds.minZ,step,columns,rows,count:columns*rows,valid:new Uint8Array(columns*rows),tested:new Uint8Array(columns*rows),edges:new Uint8Array(columns*rows)};
      this._obstacleNavigationCache.set(key,grid);if(this._obstacleNavigationCache.size>32)this._obstacleNavigationCache.delete(this._obstacleNavigationCache.keys().next().value);
    }
    const {columns,rows,step}=grid;
    const point=i=>new THREE.Vector3(grid.minX+(i%columns)*step,0,grid.minZ+Math.floor(i/columns)*step);
    const valid=i=>{
      if(i<0||i>=grid.count)return false;
      if(!grid.valid[i]){const p=point(i);grid.valid[i]=p.distanceToSquared(this.world.resolveMovement(p.clone(),radius))<.008*.008?2:1;}
      return grid.valid[i]===2;
    };
    const anchors=p=>{
      const x=Math.round((p.x-grid.minX)/step),z=Math.round((p.z-grid.minZ)/step),near=[];
      for(let ring=0;ring<=5;ring++){
        for(let dz=-ring;dz<=ring;dz++)for(let dx=-ring;dx<=ring;dx++){
          if(ring&&Math.max(Math.abs(dx),Math.abs(dz))!==ring)continue;
          const xx=x+dx,zz=z+dz;if(xx<0||xx>=columns||zz<0||zz>=rows)continue;
          const i=zz*columns+xx;if(!valid(i))continue;const q=point(i),distance=p.distanceTo(q);
          if(this.enemyPath(p,q,enemy.radius))near.push({i,distance});
        }
        if(near.length>=6||ring>=2&&near.length)break;
      }
      return near.sort((a,b)=>a.distance-b.distance).slice(0,8);
    };
    const starts=anchors(enemy.actor.root.position),ends=[];if(!starts.length)return null;
    if(!approachSearch)for(const anchor of anchors(end))ends.push({...anchor,approach:end});
    else{
      // A hero-sized nook may contain no grid center. Find legal attack stances
      // around its edge rather than route a wider body into the exact nook.
      const player=this.player.root.position,reach=Math.max(.2,enemy.attack.hitRange-.08);
      for(let i=0;i<32;i++){
        const angle=i*TAU/32,candidate=this.world.resolveMovement(player.clone().add(new THREE.Vector3(Math.sin(angle)*reach,0,Math.cos(angle)*reach)),enemy.radius);
        if(candidate.distanceTo(player)>enemy.attack.hitRange-.04||!this.enemyAttackLine(candidate,player))continue;
        for(const anchor of anchors(candidate))ends.push({...anchor,approach:candidate});
      }
    }
    if(!ends.length)return approachSearch?null:this.getObstacleNavTarget(enemy,end,true);
    const goals=new Map();for(const anchor of ends)if(!goals.has(anchor.i)||goals.get(anchor.i).distance>anchor.distance)goals.set(anchor.i,anchor);
    const cost=new Float64Array(grid.count).fill(Infinity),previous=new Int32Array(grid.count).fill(-1),closed=new Uint8Array(grid.count),heap=[];
    const push=(i,score)=>{let at=heap.length;heap.push({i,score});while(at){const parent=(at-1)>>1;if(heap[parent].score<=score)break;heap[at]=heap[parent];at=parent;}heap[at]={i,score};};
    const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){let at=0;while(at*2+1<heap.length){let child=at*2+1;if(child+1<heap.length&&heap[child+1].score<heap[child].score)child++;if(heap[child].score>=last.score)break;heap[at]=heap[child];at=child;}heap[at]=last;}return top.i;};
    const heuristic=i=>point(i).distanceTo(end);
    for(const start of starts){cost[start.i]=start.distance;push(start.i,start.distance+heuristic(start.i));}
    const offsets=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];let found=-1;
    while(heap.length){
      const i=pop();if(closed[i])continue;closed[i]=1;if(goals.has(i)){found=i;break;}
      const x=i%columns,z=Math.floor(i/columns),p=point(i);
      for(let direction=0;direction<offsets.length;direction++){
        const [dx,dz]=offsets[direction],xx=x+dx,zz=z+dz;if(xx<0||xx>=columns||zz<0||zz>=rows)continue;
        const next=zz*columns+xx;if(closed[next]||!valid(next))continue;const bit=1<<direction;
        if(!(grid.tested[i]&bit)){
          grid.tested[i]|=bit;
          if((!dx||!dz||valid(z*columns+xx)&&valid(zz*columns+x))&&this.enemyPath(p,point(next),radius,.3))grid.edges[i]|=bit;
        }
        if(!(grid.edges[i]&bit))continue;
        const nextCost=cost[i]+step*(dx&&dz?Math.SQRT2:1);if(nextCost>=cost[next])continue;
        cost[next]=nextCost;previous[next]=i;push(next,nextCost+heuristic(next));
      }
    }
    if(found<0)return approachSearch?null:this.getObstacleNavTarget(enemy,end,true);
    const approach=goals.get(found).approach;if(this.enemyPath(enemy.actor.root.position,approach,enemy.radius))return approach.clone();
    const route=[];for(let i=found;i>=0;i=previous[i])route.push(point(i));
    for(const waypoint of route)if(this.enemyPath(enemy.actor.root.position,waypoint,enemy.radius))return waypoint;
    return null;
  }
  enemyPath(from,to,radius,step=.35) {
    // Route tolerance must be smaller than collision clearance. The broad
    // visibility test's 13cm allowance can falsely accept a line just outside
    // the walkable union, trapping a wide body at the eastern street corner.
    const count=Math.max(1,Math.ceil(from.distanceTo(to)/step));
    for(let i=1;i<=count;i++){
      const point=from.clone().lerp(to,i/count),resolved=this.world.resolveMovement(point.clone(),radius);
      if(point.distanceToSquared(resolved)>.008*.008)return false;
    }
    return true;
  }
  enemyAttackLine(from,to) { return this.enemyPath(from,to,.05,.2); }
  updateEnemies(dt,time) {
    const p=this.player.root.position;
    for(let index=this.enemies.length-1;index>=0;index--){
      const e=this.enemies[index];let speed=0;
      if(e.dead){e.deathAge+=dt;const death=enemyDeathState(e);e.actor.update(dt,{speed:0,action:'idle',progress:0,attack:0,hit:0,dead:death.dead,fade:death.fade,variant:e.attackVariant,time:time+e.phase});if(death.expired){this.scene.remove(e.actor.root);e.actor.dispose?.();this.enemies.splice(index,1);}continue;}
      e.hit=Math.max(0,e.hit-dt);e.stun=Math.max(0,e.stun-dt);
      if(e.decorative||this._state!=='playing'){e.actor.update(dt,{speed:0,action:'idle',progress:0,attack:0,hit:0,dead:0,fade:0,variant:e.attackVariant,time:time+e.phase});continue;}
      if(e.knock.lengthSq()>.02){this.move(e.actor.root,e.knock,dt,e.radius);e.knock.multiplyScalar(Math.exp(-dt*7));}
      const delta=p.clone().sub(e.actor.root.position),distance=delta.length();
      e.attackCooldown=Math.max(0,e.attackCooldown-dt);
      if(e.attackTimer>0){
        e.attackTimer=Math.max(0,e.attackTimer-dt);const progress=1-e.attackTimer/e.attack.duration;
        if(progress>=e.attack.contact&&!e.attackFired){
          e.attackFired=true;if(distance<e.attack.hitRange&&this.enemyAttackLine(e.actor.root.position,p))this.hurt(e.attack.damage);
          if(e.impact){this.makeRing(e.actor.root.position,e.impact.radius,.42,e.impact.color,false);this.soundAt(e.impact.sound,e.actor.root.position,e.impact.gain);}
        }
      } else if(e.stun<=0){
        const atApproach=e.navTarget&&e.actor.root.position.distanceToSquared(e.navTarget)<.25*.25;
        const reach=atApproach?e.attack.hitRange-.04:e.attack.startRange;
        if(distance>reach||!this.enemyAttackLine(e.actor.root.position,p)){
          e.navTime-=dt;if(e.navTime<=0||!e.navTarget){e.navTarget=this.getNavTarget(e);e.navTime=.65+Math.random()*.4;}
          let dir=e.navTarget.clone().sub(e.actor.root.position).setY(0).normalize();
          const separate=new THREE.Vector3();
          for(const other of this.enemies){if(other===e||other.dead||other.decorative)continue;const v=e.actor.root.position.clone().sub(other.actor.root.position),d=v.length(),minimum=(e.radius+other.radius)*.85;if(d<minimum&&d>.02)separate.addScaledVector(v,(minimum-d)/(d*minimum));}
          dir.addScaledVector(separate,1.35).normalize();const moved=this.move(e.actor.root,dir,e.speed*dt,e.radius);speed=dt>0?moved/dt:0;
          if(dir.lengthSq()>.01){const angle=Math.atan2(dir.x,dir.z);e.actor.root.rotation.y+=Math.atan2(Math.sin(angle-e.actor.root.rotation.y),Math.cos(angle-e.actor.root.rotation.y))*Math.min(1,dt*6);}
        } else if(e.attackCooldown<=0){e.attackTimer=e.attack.duration;e.attackFired=false;e.attackVariant=(e.attackVariant+1)%e.attack.variants;e.attackCooldown=THREE.MathUtils.lerp(...e.attack.cooldown,Math.random());e.actor.root.rotation.y=Math.atan2(delta.x,delta.z);}
      }
      const progress=e.attackTimer>0?1-e.attackTimer/e.attack.duration:0;
      e.actor.update(dt,{speed,action:e.attackTimer>0?'attack':'idle',progress,attack:progress,attackContact:e.attack.contact,attackDuration:e.attack.duration,variant:e.attackVariant,hit:e.hit>0?e.hit/.23:0,dead:0,fade:0,time:time+e.phase});
    }
  }
  updateHorde(dt) {
    if(this._state!=='playing')return;
    const living=this.enemies.filter(e=>!e.dead&&!e.decorative);
    const {pressure,entries}=this.horde.update(dt,this.gameTime,this.kills,this.quality,{living:living.length,large:living.filter(e=>e.large).length,boss:living.some(e=>e.boss)});
    this.activeCap=pressure.cap;
    if(pressure.stage>this.threatStage){
      this.threatStage=pressure.stage;
      this.announce(`尸潮等级 ${this.threatStage}`,`亡灵持续增援 · 街巷正被尸潮吞没`,2.8);
      this.audio.play('chime',.35);
    }
    for(const entry of entries){
      const enemy=this.spawnEnemy(entry.kind,false,null,entry.boss);
      enemy.hp=enemy.maxHp=Math.round(enemy.maxHp*pressure.healthScale);enemy.speed*=pressure.speedScale;
      if(entry.boss){this.announce(enemy.announcement,'长夜领主再临 · 击败它后尸潮仍将继续',4);this.audio.play('brute',.8);}
    }
  }
  makeRing(position,radius,duration,color,expand=true) {
    const root=new THREE.Mesh(new THREE.RingGeometry(.93,1,64),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:.8,depthWrite:false,blending:THREE.AdditiveBlending}));
    root.rotation.x=-Math.PI/2;root.position.copy(position);root.position.y=.075;this.scene.add(root);this.effects.push({root,age:0,duration,type:'ring',radius,expand});
  }
  burst(position,color,count=20,speed=3) {
    if(this.quality==='low')count=Math.ceil(count*.55);
    const positions=new Float32Array(count*3),velocities=[];
    for(let i=0;i<count;i++){velocities.push(new THREE.Vector3((Math.random()-.5)*speed,Math.random()*speed*.65+.2,(Math.random()-.5)*speed));}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
    const mat=new THREE.PointsMaterial({color,size:.075,transparent:true,opacity:.9,depthWrite:false,blending:THREE.AdditiveBlending,sizeAttenuation:true});
    const root=new THREE.Points(geo,mat);root.position.copy(position);this.scene.add(root);this.effects.push({root,age:0,duration:.65,type:'particles',velocities});
  }
  floating(position,value,kind='',height=2.1) {
    if(this.floaters.length>45)return;
    const el=document.createElement('span');el.className=`floating-damage ${kind}`;el.textContent=value;this.ui.appendChild(el);
    this.floaters.push({el,position:position.clone().add(new THREE.Vector3((Math.random()-.5)*.6,height,0)),age:0,duration:.8});
  }
  disposeEffect(effect) {
    if(effect.visual){effect.visual.dispose();return;}
    this.scene.remove(effect.root);effect.root.traverse(node=>{node.geometry?.dispose();if(node.material){if(Array.isArray(node.material))node.material.forEach(m=>m.dispose());else node.material.dispose();}});
  }
  updateEffects(dt) {
    for(let i=this.effects.length-1;i>=0;i--){
      const e=this.effects[i];e.age+=dt;const t=e.age/e.duration;
      if(t>=1){this.disposeEffect(e);this.effects.splice(i,1);continue;}
      e.visual?.update(e.age);
      if(e.type==='ring'){const scale=e.radius*(e.expand?.3+t*.7:1);e.root.scale.setScalar(scale);e.root.material.opacity=(1-t)*.75;}
      if(e.type==='arc'){e.root.rotation.y+=dt*5;e.root.scale.setScalar(1+t*.12);e.root.traverse(n=>{if(n.material)n.material.opacity=(1-t)*.8;});}
      if(e.type==='particles'){const a=e.root.geometry.attributes.position;for(let j=0;j<e.velocities.length;j++){const v=e.velocities[j];v.y-=dt*2;a.setXYZ(j,a.getX(j)+v.x*dt,a.getY(j)+v.y*dt,a.getZ(j)+v.z*dt);}a.needsUpdate=true;e.root.material.opacity=1-t;}
      if(e.type==='consecration'){

        e.tick-=dt;if(e.tick<=0&&this._state==='playing'){
          e.tick=.65;
          for(const enemy of this.enemies)if(!enemy.dead&&!enemy.decorative&&enemy.actor.root.position.distanceTo(e.position)<e.radius)this.damageEnemy(enemy,32,.6,false);
          this.damageEnvironment({position:e.position,radius:e.radius,damage:32,source:'consecration',attackId:`${e.environmentAttackId}:pulse:${e.environmentTick++}`});
          for(let j=0;j<3;j++){const a=Math.random()*TAU,r=Math.random()*4;this.burst(e.position.clone().add(new THREE.Vector3(Math.sin(a)*r,.15,Math.cos(a)*r)),0xefcf88,3,.6);}
        }
      }
    }
    for(let i=this.floaters.length-1;i>=0;i--){const f=this.floaters[i];f.age+=dt;if(f.age>f.duration){f.el.remove();this.floaters.splice(i,1);continue;}this.projection.copy(f.position);this.projection.y+=f.age*1.5;this.projection.project(this.camera);f.el.style.left=`${(this.projection.x*.5+.5)*window.innerWidth}px`;f.el.style.top=`${(-this.projection.y*.5+.5)*window.innerHeight}px`;f.el.style.opacity=`${this.projection.z>1?0:Math.min(1,(1-f.age/f.duration)*2)}`;}
  }
  resetCamera(snap = false) {
    this.yaw = CAMERA.yaw; this.pitch = CAMERA.pitch; this.distance = CAMERA.distance;
    if (!snap) {
      this.yaw = this.viewYaw + Math.atan2(Math.sin(CAMERA.yaw - this.viewYaw), Math.cos(CAMERA.yaw - this.viewYaw));
      return;
    }
    this.viewYaw = this.yaw; this.viewPitch = this.pitch; this.viewDistance = this.distance;
    this.cameraTarget.copy(this.player.root.position).add(new THREE.Vector3(0, CAMERA.targetHeight, 0));
    this.updateCamera(0);
  }
  updateCamera(dt) {
    const target=this.player.root.position.clone().add(new THREE.Vector3(0,CAMERA.targetHeight,0));
    this.cameraTarget.lerp(target,1-Math.exp(-dt*10));
    // Ease spherical coordinates so a fast orbit never cuts through the courtyard.
    const blend=1-Math.exp(-dt*14);
    this.viewYaw=THREE.MathUtils.lerp(this.viewYaw,this.yaw,blend);
    this.viewPitch=THREE.MathUtils.lerp(this.viewPitch,this.pitch,blend);
    this.viewDistance=THREE.MathUtils.lerp(this.viewDistance,this.distance,blend);
    const d=this.viewDistance,offset=new THREE.Vector3(Math.sin(this.viewYaw)*d*Math.cos(this.viewPitch),d*Math.sin(this.viewPitch),Math.cos(this.viewYaw)*d*Math.cos(this.viewPitch));
    this.camera.position.copy(this.cameraTarget).add(offset);
    if(this.shake>.001){this.camera.position.x+=(Math.random()-.5)*this.shake;this.camera.position.y+=(Math.random()-.5)*this.shake*.7;}
    this.camera.lookAt(this.cameraTarget);this.shake*=Math.exp(-dt*12);
    this.camera.updateMatrixWorld();
    this.world.updateOcclusion?.(this.camera,this.player.root.position,dt);
  }
  drawMap() {
    const ctx=this.mapCtx,s=3.3,ox=104,oz=130;ctx.clearRect(0,0,256,256);ctx.fillStyle='#2f4342';ctx.fillRect(0,0,256,256);
    const map=(x,z)=>[ox+x*s,oz+z*s];
    const rect=(x1,z1,x2,z2)=>{const [x,y]=map(x1,z1);ctx.fillRect(x,y,(x2-x1)*s,(z2-z1)*s);ctx.strokeRect(x,y,(x2-x1)*s,(z2-z1)*s);};
    ctx.fillStyle='#65745e';ctx.strokeStyle='#a6a17b';ctx.lineWidth=.65;
    rect(-6,-12,6,28);rect(-14,-26,14,0);rect(3,-6,30,6);rect(22,-16,32,8);
    ctx.fillStyle='#314a4b';ctx.strokeStyle='#a7a580';const fountain=map(-6,-13);ctx.beginPath();ctx.arc(...fountain,3.1*s,0,TAU);ctx.fill();ctx.stroke();
    ctx.strokeStyle='#9d8a5522';ctx.lineWidth=.4;for(let i=-20;i<40;i+=5){const a=map(i,-30),b=map(i,35);ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();}
    for(const e of this.enemies){
      if(e.dead)continue;const [x,y]=map(e.actor.root.position.x,e.actor.root.position.z),r=e.map.radius;
      ctx.fillStyle=e.map.color;ctx.beginPath();
      if(e.map.shape==='square')ctx.rect(x-r,y-r,r*2,r*2);
      else if(e.map.shape==='diamond'){ctx.moveTo(x,y-r);ctx.lineTo(x+r,y);ctx.lineTo(x,y+r);ctx.lineTo(x-r,y);ctx.closePath();}
      else ctx.arc(x,y,r,0,TAU);
      ctx.fill();if(e.boss){ctx.strokeStyle='#eed6a0';ctx.lineWidth=1;ctx.stroke();}
    }
    for(const relic of RELICS)if(!this.unlocked?.[relic.ability]){
      const [rx,ry]=map(relic.x,relic.z);ctx.fillStyle='#e8cd70';ctx.fillRect(rx-4,ry-4,8,8);ctx.strokeStyle='#574724';ctx.strokeRect(rx-4,ry-4,8,8);ctx.fillStyle='#fff0b2';ctx.font='10px monospace';ctx.textAlign='center';ctx.fillText(relic.ability.toUpperCase(),rx,ry-7);
    }
    for(const pack of this.supplies?.packs||[]){const [px,py]=map(pack.position.x,pack.position.z);ctx.fillStyle='#e27157';ctx.fillRect(px-1.5,py-1.5,3,3);}
    const p=this.player.root.position,[x,y]=map(p.x,p.z);ctx.save();ctx.translate(x,y);ctx.rotate(-this.player.root.rotation.y);ctx.fillStyle='#eed6a0';ctx.shadowBlur=0;ctx.shadowColor='#e5c786';ctx.beginPath();ctx.moveTo(0,6);ctx.lineTo(-4,-4);ctx.lineTo(0,-2);ctx.lineTo(4,-4);ctx.closePath();ctx.fill();ctx.restore();
    this.dom.location.textContent=p.x>17?'东侧巷道':p.z<-3?'殉难者广场':'旧城南街';
  }
  updateHUD() {
    this.dom.health.style.width=`${this.hp/this.maxHp*100}%`;this.dom.hp.textContent=`${Math.ceil(this.hp)} / ${this.maxHp}`;
    if(this.dom.life){this.dom.life.setAttribute('aria-label',`生命 ${this.hp} 格，共 ${this.maxHp} 格`);[...this.dom.life.children].forEach((pip,i)=>pip.classList.toggle('empty',i>=this.hp));this.dom.life.classList.toggle('critical',this.hp===1);}
    if(this.dom.angel&&this.angel){
      const active=this.angel.active,cinematic=this.angel.phase==='cinematic'||this.angel.phase==='pending';
      this.dom.angel.classList.toggle('active',active||cinematic);
      this.dom.angelValue.textContent=active?`${this.angel.remaining.toFixed(1)}s`:cinematic?'觉醒':`${this.angel.charge} / ${ANGEL.killsRequired}`;
      this.dom.angelFill.style.width=`${(active?this.angel.remaining/ANGEL.activeSeconds:cinematic?1:this.angel.charge/ANGEL.killsRequired)*100}%`;
      this.dom.angelHelp.textContent=active?'无敌 · 攻击命中即裁决':cinematic?'天使降临 · 战场时间冻结':`击杀 ${ANGEL.killsRequired} 名亡灵唤醒圣翼`;
    }
    this.updateRelicHUD();this.dom.kills.textContent=String(this.kills).padStart(2,'0');
    this.dom.clock.textContent=formatSurvivalTime(this.gameTime);
    const living=this.enemies.filter(e=>!e.dead&&!e.decorative).length;
    this.dom.detail.textContent=`尸潮等级 ${this.threatStage} · 场上 ${living} 名`;
    this.dom.best.textContent=`${this.record.persistent?'本地最佳':'本次最佳'} ${formatSurvivalTime(Math.max(this.record.best.seconds,this.gameTime))}${Math.floor(this.gameTime)>this.record.baseline?' · 新纪录':''}`;
    for(const key of ['q','e','space']){
      const button=this.ui.querySelector(`#ability-${key}`),cd=button.querySelector('.ability-cooldown'),locked=key!=='space'&&!this.unlocked?.[key];
      button.classList.toggle('locked',locked);button.setAttribute('aria-disabled',String(locked));
      cd.hidden=!locked&&this.cooldowns[key]<=0;cd.textContent=locked?'未获得':Math.ceil(this.cooldowns[key]);
      button.classList.toggle('ready',!locked&&this.cooldowns[key]<=0);
      const relic=RELICS.find(r=>r.ability===key);if(relic){const title=locked?`${key.toUpperCase()} · 未获得 · 打碎${relic.area}的${relic.name}`:`${key.toUpperCase()} · ${relic.skill} · ${key==='q'?8:12} 秒冷却`;button.title=title;button.setAttribute('aria-label',title);}
    }
    this.dom.combo.classList.toggle('visible',this.combo>=3&&this.comboTimer>0);this.dom.comboValue.textContent=this.combo;
    const boss=this.enemies.find(e=>e.boss&&!e.dead);this.dom.boss.hidden=!boss;if(boss){this.dom.bossName.textContent=boss.name;this.dom.bossFill.style.width=`${Math.max(0,boss.hp/boss.maxHp)*100}%`;}
    this.drawMap();
  }
  update(dt,elapsed) {
    const now=performance.now(),wallDt=(now-this.lastFrameTime)/1000;this.lastFrameTime=now;
    dt=Math.min(dt,.05);this.elapsed=elapsed;this.fps=THREE.MathUtils.lerp(this.fps,1/Math.max(.001,wallDt),.035);
    if(this._state==='paused')return;
    if(this.angel?.phase==='pending')this.beginAngelDescent();
    if(this._state==='ascension'){this.updateAngelCinematic(dt);return;}
    const playing=this._state==='playing';
    if(playing){
      this.gameTime+=dt;this.recordTimer+=dt;if(this.recordTimer>=10){this.recordTimer=0;this.saveRecord();}this.invincible=Math.max(0,this.invincible-dt);this.hitFlash=Math.max(0,this.hitFlash-dt);
      for(const key in this.cooldowns)this.cooldowns[key]=Math.max(0,this.cooldowns[key]-dt);
      this.comboTimer-=dt;if(this.comboTimer<=0)this.combo=0;
      // Hitstop freezes only the hero's combat clock, movement and sampled pose.
      // UI, invulnerability, cooldowns, world effects and enemy clocks keep advancing.
      const frozenTime=Math.min(dt,this._hitstop);this._hitstop=Math.max(0,this._hitstop-dt);
      const combatDt=Math.max(0,dt-frozenTime);this._combatTime+=combatDt;
      if(combatDt>0&&(this.keys.has('j')||this.inputAttack||this.touchControls?.attacking))this.attack();
      const direction=this.moveDirection();let moved=0;
      if(combatDt>0){
        if(this._action==='dodge'){
          const moveDt=Math.min(combatDt,Math.max(0,this._actionDuration-this._actionElapsed));
          moved=this.move(this.player.root,this.dodgeDirection,13*moveDt,.5);
          const angle=Math.atan2(this.dodgeDirection.x,this.dodgeDirection.z);this.player.root.rotation.y+=Math.atan2(Math.sin(angle-this.player.root.rotation.y),Math.cos(angle-this.player.root.rotation.y))*Math.min(1,combatDt*22);
          if(moved>.001&&Math.random()<.65)this.burst(this.player.root.position.clone().add(new THREE.Vector3(0,.7,0)),0xded8ad,2,.5);
        }else if(direction.lengthSq()>.01){
          moved=this.move(this.player.root,direction,(this._action==='idle'?5.3:2.7)*combatDt,.52);
          if(this._action==='idle'){const angle=Math.atan2(direction.x,direction.z);this.player.root.rotation.y+=Math.atan2(Math.sin(angle-this.player.root.rotation.y),Math.cos(angle-this.player.root.rotation.y))*Math.min(1,combatDt*15);}
        }
        if(this._action==='melee'&&this._actionAim!==null&&!this._actionFired){
          const difference=Math.atan2(Math.sin(this._actionAim-this.player.root.rotation.y),Math.cos(this._actionAim-this.player.root.rotation.y));
          this.player.root.rotation.y+=difference*(1-Math.exp(-combatDt*12));
        }
        this.updateAction(combatDt);
      }
      this.heroSpeed=combatDt>0?moved/combatDt:0;
      if(moved>.001&&this._action!=='dodge'){
        this.stepDistance+=moved;
        if(this.stepDistance>=1.22){this.stepDistance%=1.22;this.audio.play('footstep',.32,{variant:this.stepVariant++%2});}
      }else if(moved<=.001)this.stepDistance=Math.min(this.stepDistance,.75);
      this.groanTimer-=dt;
      if(this.groanTimer<=0){
        this.groanTimer=2.4+Math.random()*2.2;
        const nearby=this.enemies.filter(e=>!e.dead&&!e.decorative&&e.actor.root.position.distanceTo(this.player.root.position)<13);
        if(nearby.length){const e=nearby[Math.floor(Math.random()*nearby.length)];this.soundAt(e.sound.groan,e.actor.root.position,e.sound.gain,{pitch:e.sound.pitch});}
      }
      if(combatDt>0){const progress=this.actionProgress();this.player.update(combatDt,{speed:this.heroSpeed,action:this._action,progress,comboStep:this.comboStep,variant:this.comboStep,attack:this._action==='melee'||this._action==='whirl'?progress:0,hit:this.hitFlash>0?this.hitFlash*2:0,dead:0,fade:0,time:this._combatTime});}
      this.holyVfx?.sampleWeapon(this.player,combatDt,this._action,this.actionProgress(),this.comboStep);
      this.updateEnvironment(dt);this.updateEnemies(dt,elapsed);if(this._state==='playing'){this.updateSupplies(dt);this.updateHorde(dt);}
      if(this.gameTime>15)this.dom.help.style.opacity='0';
    } else if(this._state==='menu'){
      this._combatTime+=dt;this.heroSpeed=0;this.player.update(dt,{speed:0,action:'idle',progress:0,attack:0,hit:0,dead:0,fade:0,time:this._combatTime});this.updateEnemies(dt,elapsed);
    } else if(this._state==='dead'){
      this._combatTime+=dt;this.deathTimer-=dt;this.player.update(dt,{speed:0,action:'idle',progress:0,attack:0,hit:0,dead:Math.min(1,(1.3-this.deathTimer)/.9),fade:0,time:this._combatTime});this.updateEnemies(dt,elapsed);if(this.deathTimer<=0&&this.dom.modal.hidden)this.showMenu('dead');

    }
    if(!playing)this.holyVfx?.sampleWeapon(this.player,dt,'idle',0,0);
    this.updateCamera(dt);this.updateEnemyHealthBars();this.updateEffects(dt);this.flushEnvironmentEvents();this.playerLight.intensity=THREE.MathUtils.lerp(this.playerLight.intensity,1.2,dt*3);this.dom.damage.style.opacity=String(Math.max(0,this.hitFlash)*.65);
    if(this.toastTimer>0){this.toastTimer-=dt;if(this.toastTimer<=0)this.dom.toast.classList.remove('visible');}
    this.aura?.update(dt,{dead:this._state==='dead'});
    if(this._state==='playing'){this.updateAngelPower(dt);if(this.angel?.phase==='pending')this.beginAngelDescent();}
    this.hudTick+=dt;if(this.hudTick>.1){this.hudTick=0;this.updateHUD();}
  }
}

