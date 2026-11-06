/* Optional mobile-only, presentation-only thumbnail strips.
 * Reads the existing ClipForge timeline; never changes clip state or export. */
(() => {
  "use strict";
  if (!window.matchMedia("(max-width:760px)").matches) return;
  const root=document.getElementById("editorTool");
  const inner=root?.querySelector("#stInner");
  const state=window.ClipForgeEditor?.state;
  if(!inner||!state)return;

  const cache=new Map();
  function encodeFrame(source,kind){
    if(!source)return Promise.resolve(null);
    return new Promise(resolve=>{
      const canvas=document.createElement("canvas");
      canvas.width=120;canvas.height=68;
      const ctx=canvas.getContext("2d");
      if(!ctx){resolve(null);return;}
      let media,finished=false,timeout;
      const done=value=>{
        if(finished)return;
        finished=true;clearTimeout(timeout);
        if(media instanceof HTMLVideoElement){
          try{media.pause();media.removeAttribute("src");media.load();}catch(_){}
        }
        resolve(value);
      };
      const draw=()=>{
        try{
          const w=media.videoWidth||media.naturalWidth;
          const h=media.videoHeight||media.naturalHeight;
          if(!w||!h){done(null);return;}
          const scale=Math.max(canvas.width/w,canvas.height/h);
          const dw=w*scale,dh=h*scale;
          ctx.drawImage(media,(canvas.width-dw)/2,(canvas.height-dh)/2,dw,dh);
          done(canvas.toDataURL("image/jpeg",0.72));
        }catch(_){done(null);}
      };
      timeout=setTimeout(()=>done(null),7000);
      if(kind==="image"){
        media=new Image();
        media.onload=draw;media.onerror=()=>done(null);media.src=source;
      }else{
        media=document.createElement("video");
        media.muted=true;media.playsInline=true;media.preload="auto";
        media.onerror=()=>done(null);
        media.onseeked=draw;
        media.onloadedmetadata=()=>{
          const duration=Number(media.duration);
          const sample=Number.isFinite(duration)&&duration>.25?Math.min(.7,duration*.2):0;
          if(sample>.02){try{media.currentTime=sample;}catch(_){media.onloadeddata=draw;}}
          else media.onloadeddata=draw;
        };
        media.src=source;
      }
    });
  }
  function poster(clip){
    const key=clip?.url;
    if(!key)return Promise.resolve(null);
    if(!cache.has(key))cache.set(key,encodeFrame(key,clip.kind==="image"?"image":"video"));
    return cache.get(key);
  }
  function populate(){
    const blocks=inner.querySelectorAll('.st-pro-lane[data-lane-kind="video"] .st-clip-block');
    for(const block of blocks){
      if(block.querySelector(".cf-mobile-filmstrip"))continue;
      const clip=state.clips.find(item=>item.id===block.dataset.id);
      if(!clip?.url)continue;
      const strip=document.createElement("span");
      strip.className="cf-mobile-filmstrip";
      strip.setAttribute("aria-hidden","true");
      block.prepend(strip);
      poster(clip).then(url=>{
        if(url&&strip.isConnected)strip.style.backgroundImage='url("'+url+'")';
      }).catch(()=>{});
    }
  }
  let queued=false;
  function schedule(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;populate();});
  }
  new MutationObserver(schedule).observe(inner,{childList:true,subtree:true});
  schedule();
})();