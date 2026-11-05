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
