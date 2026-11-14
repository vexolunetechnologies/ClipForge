/* Load optional Studio Editor modules only on first entry; keep core editor intact. */
(function(){
 'use strict';
 let pending=null;
 function activate(){
  if(window.ClipForgeNavigation?.current?.()!=='editor'||pending)return;
  if(!window.ClipForgeEditor?.state)return;
  pending=(async()=>{
   await import('/dist/editor/timeline.js');
   await import('/dist/editor/studio-ui.js');
   // Desktop layout + category toolbar reuse original editor controls.
   // The CSS is scoped to Studio, and the mobile interface stays unchanged.
   if(!document.querySelector('link[data-studio-phase1]')){
     const style=document.createElement('link');
     style.rel='stylesheet';
     style.href='/studio-editor-phase1.css?v=20261114-tool-panels';
     style.dataset.studioPhase1='1';
     document.head.append(style);
   }
   await import('/studio-editor-phase1.js');
   // Decorative thumbnails are optional and cannot block editing tools.
   if(window.matchMedia('(max-width:760px)').matches){
     import('/editor-mobile-thumbnails.js').catch(error=>console.warn('Optional filmstrip unavailable',error));
   }
  })().catch(error=>{
   pending=null;
   const status=document.getElementById('stStatus');
   if(status)status.textContent='Studio enhancements could not load. Reload and try again.';
   console.error('ClipForge Studio enhancement loading failed',error);
  });
 }
 window.addEventListener('hashchange',activate);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',activate,{once:true});
 else activate();
})();
