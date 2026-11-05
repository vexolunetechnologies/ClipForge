/* Runs in the existing Image Animator iframe. Never interrupts rendering/export. */
(function(){
 'use strict';
 let paused=false,wasAnimating=false;
 function setVisible(visible){
  if(typeof S==='undefined'||S.busy)return;
  if(!visible){
   paused=true;
   if(S.raf){wasAnimating=true;cancelAnimationFrame(S.raf);S.raf=0}
  }else if(paused){
   paused=false;
   if(wasAnimating&&S.T&&S.items.length)start();
   wasAnimating=false;
  }
 }
 window.addEventListener('message',event=>{
  if(event.source!==parent||!event.data||event.data.ia!=='visibility')return;
  setVisible(!!event.data.v);
 });
 window.ClipForgeAnimatorIdle={get paused(){return paused}};
})();
