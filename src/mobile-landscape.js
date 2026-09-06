import {prefersTouchControls} from './touch-controls.js';

export class MobileLandscape {
 constructor(game,app){
  this.game=game;this.app=app;this.blocked=false;
  this.overlay=document.createElement('section');this.overlay.className='orientation-screen';this.overlay.hidden=true;
  this.overlay.setAttribute('role','dialog');this.overlay.setAttribute('aria-modal','true');this.overlay.setAttribute('aria-labelledby','orientation-title');
  this.overlay.innerHTML='<div class="orientation-card"><div class="orientation-emblem" aria-hidden="true"><span class="orientation-phone"></span><span class="orientation-arrow">↻</span></div><p class="orientation-eyebrow">斯坦索姆 · 余烬中的誓言</p><h2 id="orientation-title">请横屏游玩</h2><p class="orientation-message">横向握持手机，展开战场。</p><p class="orientation-controls">左手移动 · 右手挥锤与施法</p></div>';
  document.body.append(this.overlay);
  this.sync=this.sync.bind(this);
  this.touchQuery=matchMedia('(pointer: coarse)');
  this.touchQuery.addEventListener?.('change',this.sync);
  this.onTouch=e=>{if(e.pointerType==='touch'){game.ui.classList.add('touch-ui');this.sync();}};
  window.addEventListener('resize',this.sync);
  window.addEventListener('pointerdown',this.onTouch,true);
  document.addEventListener('visibilitychange',this.sync);
  this.observer=new ResizeObserver(this.sync);this.observer.observe(app);
 }
 sync(){
  const touch=prefersTouchControls()||this.game.ui.classList.contains('touch-ui');
  const width=this.app.clientWidth||innerWidth,height=this.app.clientHeight||innerHeight;
  const blocked=touch&&height>width;
  this.blocked=blocked;
  if(blocked&&['playing','ascension'].includes(this.game.state))this.game.pause();
  if(blocked){
   this.game.keys.clear();this.game.touchControls?.reset();this.game.inputAttack=false;this.game.drag=false;
  }
  this.overlay.hidden=!blocked;this.game.ui.inert=blocked;this.app.inert=blocked;
  this.overlay.querySelector('.orientation-message').textContent=this.game.state==='paused'?'战斗已暂停，横屏后点击继续。':'横向握持手机，展开战场。';
  this.app.dataset.orientation=JSON.stringify({mode:touch?'landscape':'window',blocked,width,height});
 }
 dispose(){
  window.removeEventListener('resize',this.sync);window.removeEventListener('pointerdown',this.onTouch,true);
  document.removeEventListener('visibilitychange',this.sync);this.touchQuery.removeEventListener?.('change',this.sync);this.observer.disconnect();
  this.overlay.remove();this.game.ui.inert=false;this.app.inert=false;
 }
}
