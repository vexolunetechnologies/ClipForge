(()=>{
"use strict";
const $=id=>document.getElementById(id), clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const uid=()=>crypto.randomUUID?.()||"cf-"+Math.random().toString(36).slice(2);
const media=new Map(),videos=new Map(),images=new Map(),audioNodes=new Map();
const state={clips:[],mediaInfo:[],captionStyle:"creator-yellow",aspect:"16:9",name:"Untitled Project",time:0,zoom:85,playing:false,selected:null,tool:"select",snap:true,markers:[],markIn:null,markOut:null,history:[],redo:[],exporting:false,rate:1};
let lead=180,suppressScroll=false,lastTick=0,activeMedia=new Set(),audioCtx=null,audioBus=null,exportCanvas=null,recorder=null,recordChunks=[],exportTimer=0,exportCancel=false,inspectorSnapshot=false,drag=null,saveTimer=0;
let toastTimeout=0;
const log=s=>{
 $("status").textContent=s;
 const toast=$("mobileToast");
 if(!toast||!matchMedia("(max-width:760px)").matches)return;
 toast.textContent=s;toast.hidden=false;
 clearTimeout(toastTimeout);
 toastTimeout=setTimeout(()=>{toast.hidden=true;},2600);
};
const maxEnd=()=>Math.max(0,...state.clips.map(c=>Number.isFinite(c.start+c.duration)?c.start+c.duration:0));
const fmt=(t,frames=false)=>{t=Math.max(0,t||0);const h=Math.floor(t/3600),m=Math.floor(t/60)%60,s=Math.floor(t)%60,f=Math.floor((t%1)*30);const two=n=>String(n).padStart(2,"0");return frames?[h,m,s,f].map(two).join(":"):[m,s].map(two).join(":");};
const snapshot=()=>JSON.stringify({clips:state.clips,captionStyle:state.captionStyle,aspect:state.aspect,name:state.name,markers:state.markers});
function remember(){state.history.push(snapshot());if(state.history.length>70)state.history.shift();state.redo=[];updateButtons();}
function undo(){if(!state.history.length)return;state.redo.push(snapshot());Object.assign(state,JSON.parse(state.history.pop()));state.selected=null;rebuild();log("Undo");}
function redo(){if(!state.redo.length)return;state.history.push(snapshot());Object.assign(state,JSON.parse(state.redo.pop()));state.selected=null;rebuild();log("Redo");}
function updateButtons(){$("undoBtn").disabled=!state.history.length;$("redoBtn").disabled=!state.redo.length;}
function persist(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{localStorage.setItem("cf-studio-v2",JSON.stringify({clips:state.clips,mediaInfo:state.mediaInfo,captionStyle:state.captionStyle,aspect:state.aspect,name:state.name,markers:state.markers}));}catch(e){console.warn("Project save failed",e);}},450);}
const dbReady=new Promise(resolve=>{if(!("indexedDB" in window)){resolve(null);return;}try{const req=indexedDB.open("clipforge-studio-v2",1);req.onupgradeneeded=()=>{req.result.createObjectStore("assets");};req.onsuccess=()=>resolve(req.result);req.onerror=()=>resolve(null);}catch(_){resolve(null);}});
async function storeBlob(id,blob){const db=await dbReady;if(!db)return false;return new Promise(resolve=>{try{const tx=db.transaction("assets","readwrite");tx.objectStore("assets").put(blob,id);tx.oncomplete=()=>resolve(true);tx.onerror=()=>resolve(false);}catch(_){resolve(false);}});}
async function loadBlob(id){const db=await dbReady;if(!db)return null;return new Promise(resolve=>{try{const tx=db.transaction("assets","readonly"),req=tx.objectStore("assets").get(id);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>resolve(null);}catch(_){resolve(null);}});}
function durationOf(file,url,kind){if(kind==="image")return Promise.resolve(5);return new Promise(resolve=>{const el=document.createElement(kind==="video"?"video":"audio");el.preload="metadata";let finished=false;const done=v=>{if(finished)return;finished=true;el.removeAttribute("src");el.load();resolve(v);};el.onloadedmetadata=()=>done(Number.isFinite(el.duration)&&el.duration>0?el.duration:8);el.onerror=()=>done(8);el.src=url;setTimeout(()=>done(8),5000);});}
async function importFiles(files){const accepted=[...files].filter(file=>/^(video|audio|image)\//.test(file.type));if(!accepted.length){log("Choose a supported video, image or audio file");return;}for(const file of accepted){const kind=file.type.split("/")[0],id=uid(),url=URL.createObjectURL(file),dur=await durationOf(file,url,kind);const info={id,name:file.name,kind,duration:kind==="image"?5:dur,size:file.size};media.set(id,{...info,url,blob:file});state.mediaInfo.push(info);storeBlob(id,file).then(ok=>{if(!ok)log("Media imported. Browser storage may be unavailable, so keep your source files.");});const clip=insertClip(id,true);if(clip)state.selected=clip.id;}renderMedia();rebuild();log(accepted.length+" media file(s) imported");}
function insertClip(mediaId,automatic=false){const asset=media.get(mediaId);if(!asset)return null;remember();const kind=asset.kind==="audio"?"audio":"video";const start=kind==="video"?Math.max(0,...state.clips.filter(x=>x.kind==="video").map(x=>x.start+x.duration)):state.time;
const clip={id:uid(),mediaId,kind,start,duration:asset.duration,sourceIn:0,volume:1,speed:1,brightness:100,contrast:100,saturation:100,scale:100};state.clips.push(clip);if(!automatic)state.selected=clip.id;return clip;}
function addText(){const text=$("newText").value.trim()||"Your title";remember();const clip={id:uid(),kind:"text",start:state.time,duration:4,text,fontSize:62,color:"#ffffff",x:50,y:78};state.clips.push(clip);state.selected=clip.id;rebuild();closeSheets();log("Text added");}

// Overlay clips share the text/graphics row, keeping the approved mobile layout unchanged.
async function addOverlayFile(file){
 if(!file||!file.type.startsWith("image/")){log("Choose a PNG, JPG or other browser-supported picture");return;}
 const id=uid(),url=URL.createObjectURL(file);
 const info={id,name:file.name,kind:"image",duration:5,size:file.size};
 media.set(id,{...info,url,blob:file});
 state.mediaInfo.push(info);
 storeBlob(id,file).then(ok=>{if(!ok)log("Overlay imported. Keep your source file as browser storage may be limited.");});
 remember();
 const clip={id:uid(),kind:"overlay",mediaId:id,start:state.time,duration:5,scale:65,opacity:100,x:50,y:50};
 state.clips.push(clip);state.selected=clip.id;
 rebuild();closeSheets();log("Image overlay added");
}
// Captions Studio's existing 55-style library is shared with V2, not copied.
const captionStyles=()=>window.ClipForgeCaptionStyles;
let captionCategory="trending",captionSearch="",autoCaptionAbort=null;
function captionPresetOptions(current){
 const lib=captionStyles();
 if(!lib)return "";
 return lib.list.map(([id,label])=>'<option value="'+id+'"'+(id===current?' selected':'')+'>'+label+'</option>').join("");
}
function selectedCaptionStyle(){
 const clip=getClip(state.selected);
 return clip?.kind==="caption"?clip.style||"classic":state.captionStyle;
}
function chooseCaptionStyle(style){
 const lib=captionStyles();
 if(!lib?.list.some(([id])=>id===style)){log("Caption style unavailable");return;}
 const selected=getClip(state.selected);
 if(selected?.kind==="caption"&&selected.style===style&&state.captionStyle===style)return;
 remember();
 state.captionStyle=style;
 if(selected?.kind==="caption")selected.style=style;
 persist();renderCaptionGallery();renderInspector();drawPreview();
 log("Caption style selected: "+lib.list.find(([id])=>id===style)[1]);
}
function renderCaptionGallery(){
 const lib=captionStyles(),host=$("captionStyleGallery"),categories=$("captionCategories"),counter=$("captionStyleCount");
 if(!lib){counter.textContent="Caption style library unavailable; use manual captions.";return;}
 if(!categories.childElementCount){
  for(const group of lib.groups){
   const button=document.createElement("button");button.type="button";
   button.dataset.category=group.id;button.textContent=group.label;
   button.onclick=()=>{captionCategory=group.id;captionSearch="";$("captionStyleSearch").value="";renderCaptionGallery();};
   categories.append(button);
  }
 }
 for(const button of categories.children){
  const current=button.dataset.category===captionCategory;
  button.classList.toggle("active",current);
  button.setAttribute("aria-pressed",String(current));
 }
 const group=lib.groups.find(group=>group.id===(captionSearch?"all":captionCategory))||lib.groups.find(g=>g.id==="all");
 const names=new Map(lib.list),selected=selectedCaptionStyle();
 const ids=group.ids.filter(id=>!captionSearch||names.get(id)?.toLowerCase().includes(captionSearch)||id.includes(captionSearch));
 const previousScroll=host.scrollTop;
 host.replaceChildren();
 for(const id of ids){
  const card=document.createElement("button");card.type="button";card.dataset.style=id;
  card.className="caption-style-card"+(id===selected?" active":"");
  card.setAttribute("aria-pressed",String(id===selected));
  const canvas=document.createElement("canvas");canvas.width=320;canvas.height=180;
  const context=canvas.getContext("2d");
  if(context){
   context.fillStyle="#0d1520";context.fillRect(0,0,320,180);
   const sample=/urdu|drama-white|cinema-gold/.test(id)?"یہ کہانی بدل گئی":"GO VIRAL TODAY";
   try{lib.draw(context,sample,id,320,180,.8,2);}catch(e){console.warn("Style preview",id,e);}
  }
  const label=document.createElement("span");label.textContent=names.get(id)||id;
  card.append(canvas,label);card.onclick=()=>chooseCaptionStyle(id);host.append(card);
 }
 host.scrollTop=previousScroll;
 counter.textContent=ids.length+" of "+lib.list.length+" unique caption styles";
}
function applyCaptionStyleToAll(){
 const lib=captionStyles();
 if(!lib?.list.some(([id])=>id===state.captionStyle)){log("Select a caption style first");return;}
 const cues=state.clips.filter(c=>c.kind==="caption");
 if(!cues.length){log("Add or import captions first");return;}
 remember();for(const clip of cues)clip.style=state.captionStyle;
 rebuild();renderCaptionGallery();log("Applied style to "+cues.length+" captions");
}
function subtitleTimestamp(seconds,dot){
 const ms=Math.max(0,Math.round((Number(seconds)||0)*1000)),two=x=>String(x).padStart(2,"0"),three=x=>String(x).padStart(3,"0");
 return [two(Math.floor(ms/3600000)),two(Math.floor(ms/60000)%60),two(Math.floor(ms/1000)%60)].join(":")+(dot?".":",")+three(ms%1000);
}
function downloadSubtitles(format){
 const cues=state.clips.filter(c=>c.kind==="caption"&&c.text?.trim()).slice().sort((a,b)=>a.start-b.start);
 if(!cues.length){log("No captions to download");return;}
 const vtt=format==="vtt",lines=cues.map((c,index)=>{
  const range=subtitleTimestamp(c.start,vtt)+" --> "+subtitleTimestamp(c.start+c.duration,vtt);
  return (vtt?"":index+1+"\n")+range+"\n"+c.text;
 });
 const data=(vtt?"WEBVTT\n\n":"")+lines.join("\n\n")+"\n";
 download(data,(state.name||"clipforge").replace(/[^\w-]+/g,"_")+"."+(vtt?"vtt":"srt"),vtt?"text/vtt":"application/x-subrip");
 log("Downloaded "+(vtt?"VTT":"SRT")+" captions");
}
async function autoCaptionSelected(){
 if(autoCaptionAbort)return;
 const selected=getClip(state.selected);
 const clip=["video","audio"].includes(selected?.kind)?selected:activeClip("video",state.time)||activeClip("audio",state.time);
 const asset=getAsset(clip);
 if(!clip||!asset?.blob){log("Select an imported video/audio clip first");$("autoCaptionStatus").textContent="Select a video/audio clip whose original file is loaded.";return;}
 if(!window.ClipForgeStudioAutoCaptions){log("Auto transcription module unavailable");return;}
 const ctrl=new AbortController();autoCaptionAbort=ctrl;
 const progress=$("autoCaptionProgress"),cancel=$("cancelAutoCaptions"),startBtn=$("autoCaptions"),status=$("autoCaptionStatus");
 progress.hidden=false;progress.value=0;cancel.hidden=false;startBtn.disabled=true;
 status.textContent="Preparing audio for transcription…";
 try{
  const speed=clip.speed||1,sourceIn=clip.sourceIn??0;
  const cues=await window.ClipForgeStudioAutoCaptions.transcribe({
   blob:asset.blob,start:sourceIn,end:sourceIn+clip.duration*speed,
   language:$("autoCaptionLanguage").value,maxWords:Number($("autoCaptionWords").value),signal:ctrl.signal,
   onProgress:(pct,part,total)=>{progress.value=pct;status.textContent="Transcribing audio "+part+"/"+total+" · "+pct+"%";}
  });
  const prepared=cues.map(cue=>{
   const inTimeline=clip.start+(cue.start-sourceIn)/speed;
   const endTimeline=clip.start+(cue.start+cue.duration-sourceIn)/speed;
   const start=clamp(inTimeline,clip.start,clip.start+clip.duration);
   const end=clamp(endTimeline,start,clip.start+clip.duration);
   return {id:uid(),kind:"caption",start,duration:end-start,text:cue.text,fontSize:40,
    color:"#ffffff",x:50,y:87,style:state.captionStyle};
  }).filter(c=>c.duration>.02&&c.text.trim());
  if(!prepared.length)throw Error("No caption segments detected.");
  remember();state.clips.push(...prepared);state.selected=prepared[0].id;
  rebuild();renderCaptionGallery();
  status.textContent="Generated "+prepared.length+" editable caption clips. Review their timing and wording.";
  log("Auto captions complete · "+prepared.length+" clips");
 }catch(error){
  const message=ctrl.signal.aborted?"Transcription cancelled":error.message;
  status.textContent=message;log(message);
 }finally{
  autoCaptionAbort=null;startBtn.disabled=false;cancel.hidden=true;progress.hidden=true;
 }
}
function addCaption(){
 const content=$("newCaption").value.trim();
 if(!content){log("Enter caption text first");return;}
 remember();
 const clip={id:uid(),kind:"caption",start:state.time,duration:3,text:content,fontSize:40,
 color:"#ffffff",x:50,y:87,style:state.captionStyle};
 state.clips.push(clip);state.selected=clip.id;
 rebuild();closeSheets();log("Editable caption added");
}
function parseCaptionTimestamp(value){
 const parts=value.trim().replace(",",".").split(":").map(Number);
 if(parts.length<2||parts.length>3||parts.some(x=>!Number.isFinite(x)||x<0))return NaN;
 return parts.reduce((acc,part)=>acc*60+part,0);
}
function parseTimedCaptions(source){
 const text=source.replace(/^\uFEFF/,"").replace(/\r\n?/g,"\n").replace(/^WEBVTT[^\n]*\n/,"");
 const blocks=text.trim().split(/\n\s*\n/),result=[];
 for(const block of blocks){
  const lines=block.split("\n").map(s=>s.trim()).filter(Boolean);
  const cue=lines.findIndex(line=>line.includes("-->"));
  if(cue<0)continue;
  const [startRaw,endRaw]=lines[cue].split(/\s*-->\s*/);
  const start=parseCaptionTimestamp(startRaw);
  const end=parseCaptionTimestamp((endRaw||"").split(/\s+/)[0]);
  const words=lines.slice(cue+1).filter(line=>!/^<[^>]*>$/.test(line)).join("\n")
   .replace(/<[^>]*>/g,"").trim();
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start||!words)continue;
  result.push({id:uid(),kind:"caption",start,duration:Math.min(end-start,3600),
   text:words,fontSize:40,color:"#ffffff",x:50,y:87,style:state.captionStyle});
 }
 return result.slice(0,1000);
}
async function importTimedCaptions(file){
 if(!file)return;
 const parsed=parseTimedCaptions(await file.text());
 if(!parsed.length){log("No valid SRT/VTT captions found");return;}
 remember();state.clips.push(...parsed);state.selected=parsed[0].id;rebuild();closeSheets();
 log("Imported "+parsed.length+" timed captions");
}
function muteCurrentClip(){
 const clip=getClip(state.selected)?.kind==="video"?getClip(state.selected):activeClip("video",state.time);
 if(!clip){log("Select a video clip to mute it");return;}
 remember();clip.volume=(clip.volume??1)>0?0:1;syncPlayers();renderInspector();persist();
 log(clip.volume===0?"Video clip muted":"Video clip unmuted");
}
function saveCoverFrame(){
 const clip=activeClip("video",state.time);
 if(!clip){log("Move the playhead onto a video frame first");return;}
 drawPreview();
 const canvas=$("preview");
 canvas.toBlob(blob=>{
  if(!blob){log("Could not capture cover frame");return;}
  download(blob,(state.name||"clipforge").replace(/[^\w-]+/g,"_")+"-cover.png","image/png");
  log("Cover frame saved as PNG");
 },"image/png");
}
function safeName(s){return String(s||"Clip").replace(/[<>]/g,"");}
const getClip=id=>state.clips.find(c=>c.id===id),getAsset=c=>media.get(c?.mediaId);
function renderMedia(){const grid=$("mediaGrid");grid.textContent="";for(const item of state.mediaInfo){const m=media.get(item.id);const button=document.createElement("button");button.className="media-card";button.title="Add "+item.name+" to timeline";button.dataset.mid=item.id;const thumb=document.createElement("div");thumb.className="media-thumb";const pic=document.createElement("img");if(m?.thumb){pic.src=m.thumb;thumb.append(pic);}else if(item.kind==="audio")thumb.textContent="♫";else thumb.textContent=item.kind==="image"?"▧":"▶";const name=document.createElement("span");name.textContent=item.name;const duration=document.createElement("small");duration.textContent=fmt(item.duration)+" · "+item.kind;button.append(thumb,name,duration);button.addEventListener("click",()=>{if(!media.has(item.id)){log("Missing media. Please re-import this file.");return;}const clip=insertClip(item.id);if(clip){rebuild();closeSheets();log("Added to timeline");}});grid.append(button);}
$("mediaStatus").textContent=state.mediaInfo.length+" media file(s)";}
function makeThumb(asset){if(!asset||asset.thumb||asset.thumbBusy||asset.kind==="audio")return;asset.thumbBusy=true;if(asset.kind==="image"){const image=new Image();image.onload=()=>{const c=document.createElement("canvas");c.width=150;c.height=84;const x=c.getContext("2d");x.drawImage(image,0,0,c.width,c.height);asset.thumb=c.toDataURL("image/jpeg",.72);renderMedia();renderTimeline();};image.src=asset.url;return;}
const v=document.createElement("video");v.muted=true;v.preload="auto";v.playsInline=true;let done=false;const finish=()=>{if(done)return;done=true;try{v.removeAttribute("src");v.load();}catch(_){};};v.onloadedmetadata=()=>{try{v.currentTime=Math.min(.35,Math.max(.01,v.duration*.15));}catch(_){finish();}};v.onseeked=()=>{try{const c=document.createElement("canvas");c.width=150;c.height=84;const x=c.getContext("2d");x.drawImage(v,0,0,150,84);asset.thumb=c.toDataURL("image/jpeg",.72);renderMedia();renderTimeline();}catch(_){}finish();};v.onerror=finish;v.src=asset.url;setTimeout(finish,6000);
}
function rebuild(){state.time=clamp(state.time,0,maxEnd());$("aspect").value=state.aspect;$("mobileAspect").value=state.aspect;$("projectName").value=state.name;setAspect();renderMedia();for(const m of media.values())makeThumb(m);renderTimeline();renderInspector();updateButtons();persist();}
function setAspect(){const [a,b]=state.aspect.split(":").map(Number),w=a>=b?960:Math.round(960*a/b),h=a>=b?Math.round(960*b/a):960;const c=$("preview");c.width=w;c.height=h;c.style.aspectRatio=a+"/"+b;$("monitorLabel").textContent=state.aspect+" · Live Preview";}
function renderTimeline(){const view=$("timelineViewport"),content=$("timelineContent");lead=Math.max(40,view.clientWidth/2);const scale=state.zoom,total=Math.max(maxEnd()+12,30),width=Math.ceil(total*scale+lead*2);content.style.width=width+"px";const ruler=$("ruler");ruler.textContent="";const step=scale<50?10:scale<100?5:2;for(let t=0;t<=total;t+=step){const el=document.createElement("span");el.className="tick";el.style.left=(lead+t*scale)+"px";el.textContent=fmt(t);ruler.append(el);}for(const kind of ["video","text","audio"]){const lane=$(kind+"Lane");lane.textContent="";lane.style.width=width+"px";const laneClips=state.clips.filter(c=>kind==="text"?["text","caption","overlay"].includes(c.kind):c.kind===kind).sort((a,b)=>a.start-b.start);laneClips.forEach(clip=>{const asset=getAsset(clip),el=document.createElement("div");el.className="clip "+clip.kind+(state.selected===clip.id?" selected":"");el.dataset.clipId=clip.id;el.style.left=(lead+clip.start*scale)+"px";el.style.width=Math.max(8,clip.duration*scale)+"px";const film=document.createElement("span");film.className=kind==="video"?"filmstrip":kind==="audio"?"audio-wave":"";if(asset?.thumb&&kind==="video")film.style.backgroundImage='url("'+asset.thumb+'")';el.append(film);const label=document.createElement("span");label.className="clip-label";label.textContent=clip.kind==="caption"?"CC "+clip.text:clip.kind==="text"?"T "+clip.text:clip.kind==="overlay"?"▧ "+(asset?.name||"Overlay"):asset?.name||"Missing file";el.append(label);for(const side of ["left","right"]){const handle=document.createElement("span");handle.className="trim "+side;handle.dataset.trim=side;el.append(handle);}el.addEventListener("pointerdown",clipPointerDown);lane.append(el);});
if(matchMedia("(max-width:760px)").matches&&!laneClips.length){
 const action=document.createElement("button");action.className="empty-lane-action "+kind;
 const add=document.createElement("span");add.className="plus";add.textContent="+";
 const label=document.createElement("span");label.textContent=kind==="video"?"Add video":kind==="audio"?"Add audio":"Add text";
 action.append(add,label);action.style.left=(lead+7)+"px";
 action.addEventListener("pointerdown",e=>e.stopPropagation());
 action.onclick=()=>{
  if(kind==="video"){$("fileInput").accept="video/*,image/*";$("fileInput").click();}
  else openSheet(kind);
 };
 lane.append(action);
}
}
for(const t of state.markers){const mark=document.createElement("span");mark.className="tick minor";mark.style.left=(lead+t*scale)+"px";mark.title="Marker "+fmt(t);ruler.append(mark);}updateClock();}
function setTime(t,scroll=true){state.time=clamp(t,0,Math.max(maxEnd(),0));if(scroll){suppressScroll=true;$("timelineViewport").scrollLeft=state.time*state.zoom;requestAnimationFrame(()=>suppressScroll=false);}updateClock();syncPlayers();}
function updateClock(){
 $("clock").textContent=fmt(state.time,true)+" / "+fmt(maxEnd(),true);
 const mobile=$("mobileTimelineTime");
 if(mobile){
  mobile.firstChild.textContent=fmt(state.time)+" ";
  const total=mobile.querySelector("span");if(total)total.textContent="/ "+fmt(maxEnd());
 }
}
function snapTime(value,except){if(!state.snap)return Math.max(0,value);const points=[0,state.time,...state.markers];for(const c of state.clips){if(c.id!==except)points.push(c.start,c.start+c.duration);}let candidate=value,delta=9/state.zoom;for(const t of points){if(Math.abs(value-t)<delta){candidate=t;delta=Math.abs(value-t);}}return Math.max(0,candidate);}
function clipPointerDown(e){if(e.button!==0)return;const el=e.currentTarget,clip=getClip(el.dataset.clipId);if(!clip)return;
const mode=e.target.dataset.trim||"move";
if(state.tool==="razor"&&mode==="move"){const rect=el.getBoundingClientRect(),at=clip.start+(e.clientX-rect.left)/state.zoom;splitAt(at,clip);return;}
state.selected=clip.id;renderInspector();for(const n of document.querySelectorAll(".clip"))n.classList.toggle("selected",n.dataset.clipId===clip.id);
remember();drag={pointer:e.pointerId,client:e.clientX,original:{start:clip.start,duration:clip.duration,sourceIn:clip.sourceIn??0},mode,id:clip.id,changed:false};el.setPointerCapture(e.pointerId);el.addEventListener("pointermove",clipPointerMove);el.addEventListener("pointerup",clipPointerUp,{once:true});el.addEventListener("pointercancel",clipPointerUp,{once:true});e.stopPropagation();}
function clipPointerMove(e){if(!drag||e.pointerId!==drag.pointer)return;if(e.cancelable)e.preventDefault();const clip=getClip(drag.id);if(!clip)return;const delta=(e.clientX-drag.client)/state.zoom;if(Math.abs(delta)<.005)return;drag.changed=true;const o=drag.original;
if(drag.mode==="move")clip.start=snapTime(Math.max(0,o.start+delta),clip.id);
if(drag.mode==="left"){const limit=Math.max(-o.sourceIn/(clip.speed||1),-o.start);let dt=clamp(delta,limit,o.duration-.12);clip.start=snapTime(o.start+dt,clip.id);dt=clip.start-o.start;clip.duration=o.duration-dt;clip.sourceIn=o.sourceIn+dt*(clip.speed||1);}
if(drag.mode==="right"){const asset=getAsset(clip),maxDuration=asset?Math.max(.12,(asset.duration-o.sourceIn)/(clip.speed||1)):7200;clip.duration=clamp(o.duration+delta,.12,Math.max(.12,maxDuration));}
e.currentTarget.style.left=(lead+clip.start*state.zoom)+"px";e.currentTarget.style.width=Math.max(8,clip.duration*state.zoom)+"px";renderInspector();persist();}
function clipPointerUp(e){e.currentTarget.removeEventListener("pointermove",clipPointerMove);if(!drag)return;const changed=drag.changed;drag=null;if(changed){persist();log("Clip edited");}else{state.history.pop();updateButtons();}renderTimeline();}
function splitAt(t,clip){clip=clip||getClip(state.selected)||state.clips.find(c=>c.kind==="video"&&t>c.start+.04&&t<c.start+c.duration-.04);if(!clip||t<=clip.start+.04||t>=clip.start+clip.duration-.04){log("Place the playhead inside a clip to split");return;}remember();const offset=t-clip.start,copy={...clip,id:uid(),start:t,duration:clip.duration-offset,sourceIn:(clip.sourceIn||0)+offset*(clip.speed||1)};clip.duration=offset;state.clips.push(copy);state.selected=copy.id;rebuild();log("Clip split at "+fmt(t));}
function deleteSelected(){if(!state.selected)return;remember();state.clips=state.clips.filter(x=>x.id!==state.selected);state.selected=null;rebuild();log("Clip deleted");}
function rippleTrim(which){const clip=getClip(state.selected)||state.clips.find(c=>c.kind==="video"&&state.time>=c.start&&state.time<c.start+c.duration);if(!clip)return;if(state.time<=clip.start+.01||state.time>=clip.start+clip.duration-.01)return;remember();const cut=state.time-clip.start;if(which==="start"){clip.start=state.time;clip.sourceIn+=cut*(clip.speed||1);clip.duration-=cut;}else clip.duration=cut;rebuild();}
function getVideoElement(asset){if(!asset||asset.kind!=="video")return null;if(videos.has(asset.id))return videos.get(asset.id);const v=document.createElement("video");v.preload="auto";v.playsInline=true;v.src=asset.url;v.crossOrigin="anonymous";v.onseeked=()=>drawPreview();v.onloadeddata=()=>drawPreview();v.onerror=()=>log("Video codec unavailable in this browser");videos.set(asset.id,v);return v;}
function getImage(asset){if(!asset)return null;if(images.has(asset.id))return images.get(asset.id);const image=new Image();image.src=asset.url;image.onload=drawPreview;images.set(asset.id,image);return image;}
function getAudioElement(asset){if(!asset)return null;if(videos.has("a-"+asset.id))return videos.get("a-"+asset.id);const a=document.createElement("audio");a.preload="auto";a.src=asset.url;videos.set("a-"+asset.id,a);return a;}
function activeClip(kind,time){return state.clips.filter(c=>c.kind===kind&&time>=c.start&&time<c.start+c.duration).sort((a,b)=>b.start-a.start)[0];}
// Non-destructive clip opacity/volume envelope. Defaults to full intensity
// so existing projects retain their current look and sound.
function fadeGain(clip,time){
 if(!clip)return 1;
 const start=Number.isFinite(clip.start)?clip.start:0;
 const duration=Math.max(0,Number.isFinite(clip.duration)?clip.duration:0);
 const elapsed=clamp(time-start,0,duration);
 const inSec=clamp(Number(clip.fadeIn)||0,0,duration);
 const outSec=clamp(Number(clip.fadeOut)||0,0,duration);
 return clamp(Math.min(inSec>0?elapsed/inSec:1,outSec>0?(duration-elapsed)/outSec:1),0,1);
}
function drawComposite(ctx,width,height,time){
 ctx.save();ctx.fillStyle="#000000";ctx.fillRect(0,0,width,height);
 const clip=activeClip("video",time);
 if(clip){
  const asset=getAsset(clip),el=asset?.kind==="video"?getVideoElement(asset):getImage(asset);
  if(el&&(el.readyState>=2||el.complete&&el.naturalWidth)){
   const iw=el.videoWidth||el.naturalWidth,ih=el.videoHeight||el.naturalHeight;
   if(iw&&ih){
    const fit=Math.min(width/iw,height/ih)*(clip.scale||100)/100,ow=iw*fit,oh=ih*fit;
    ctx.globalAlpha=fadeGain(clip,time);
    ctx.filter="brightness("+(clip.brightness||100)+"%) contrast("+(clip.contrast||100)+"%) saturate("+(clip.saturation||100)+"%)";
    try{ctx.drawImage(el,(width-ow)/2,(height-oh)/2,ow,oh);}catch(_){}
    ctx.filter="none";ctx.globalAlpha=1;
   }
  }
 }
 // Image overlays are composited above the base video and below captions/text.
 for(const overlay of state.clips.filter(c=>c.kind==="overlay"&&time>=c.start&&time<c.start+c.duration)){
  const asset=getAsset(overlay),el=asset&&getImage(asset);
  if(!el?.complete||!el.naturalWidth)continue;
  const ow=width*.48*(overlay.scale??65)/100,oh=ow*el.naturalHeight/el.naturalWidth;
  ctx.save();ctx.globalAlpha=clamp((overlay.opacity??100)/100,0,1)*fadeGain(overlay,time);
  try{ctx.drawImage(el,width*(overlay.x??50)/100-ow/2,height*(overlay.y??50)/100-oh/2,ow,oh);}catch(_){}
  ctx.restore();
 }
 for(const item of state.clips.filter(c=>["text","caption"].includes(c.kind)&&time>=c.start&&time<c.start+c.duration)){
  ctx.save();ctx.globalAlpha=fadeGain(item,time);
  const isCaption=item.kind==="caption";
  const lib=window.ClipForgeCaptionStyles;
  if(isCaption&&item.style&&lib?.list.some(([key])=>key===item.style)){
   try{lib.draw(ctx,item.text,item.style,width,height,time-item.start,item.duration);ctx.restore();continue;}
   catch(error){console.warn("Caption preset rendering failed",error);}
  }
  const size=Math.max(12,(item.fontSize||(isCaption?40:62))*height/540);
  ctx.font="700 "+size+"px Arial, sans-serif";
  ctx.textAlign="center";ctx.textBaseline="middle";
  const x=width*(item.x??50)/100,y=height*(item.y??(isCaption?87:78))/100;
  const lines=(item.text||"").split("\n").slice(0,4);
  const lineHeight=size*1.2,top=y-((lines.length-1)*lineHeight)/2;
  if(isCaption){
   const textWidth=Math.min(width*.93,Math.max(40,...lines.map(line=>ctx.measureText(line).width))+size*.85);
   const backdropHeight=lines.length*lineHeight+size*.45;
   ctx.fillStyle="rgba(0,0,0,0.7)";
   ctx.fillRect(x-textWidth/2,top-lineHeight/2-size*.18,textWidth,backdropHeight);
  }
  ctx.fillStyle=item.color||"#ffffff";ctx.strokeStyle="#000a";ctx.lineWidth=Math.max(2,size*.06);
  for(let i=0;i<lines.length;i++){
   const line=lines[i],ly=top+i*lineHeight;
   ctx.strokeText(line,x,ly,width*.93);ctx.fillText(line,x,ly,width*.93);
  }
  ctx.restore();
 }
 ctx.restore();
}
function drawPreview(){const c=$("preview"),ctx=c.getContext("2d");if(!ctx)return;drawComposite(ctx,c.width,c.height,state.time);if(exportCanvas)drawComposite(exportCanvas.getContext("2d"),exportCanvas.width,exportCanvas.height,state.time);$("emptyState").hidden=state.clips.some(c=>c.kind==="video");}
function prepareAudio(){if(audioCtx)return;try{audioCtx=new (window.AudioContext||window.webkitAudioContext)();audioBus=audioCtx.createMediaStreamDestination();}catch(e){log("Audio engine unavailable");}}
function connectElement(el,volume=1){if(!audioCtx||!el)return;let item=audioNodes.get(el);if(!item){try{const src=audioCtx.createMediaElementSource(el),gain=audioCtx.createGain();src.connect(gain);gain.connect(audioCtx.destination);gain.connect(audioBus);item={gain};audioNodes.set(el,item);}catch(e){console.warn(e);return;}}item.gain.gain.value=clamp(volume,0,2);}
function syncPlayers(){const target=new Set();for(const kind of ["video","audio"]){const c=activeClip(kind,state.time);if(!c)continue;const asset=getAsset(c);if(!asset||asset.kind==="image")continue;const el=kind==="video"?getVideoElement(asset):getAudioElement(asset);if(!el)continue;target.add(el);const seconds=Math.max(0,(c.sourceIn??0)+(state.time-c.start)*(c.speed||1));if(Math.abs((el.currentTime||0)-seconds)>.16&&Number.isFinite(seconds)){try{el.currentTime=seconds;}catch(_){}}
if(state.playing){prepareAudio();connectElement(el,(c.volume??1)*fadeGain(c,state.time));el.playbackRate=clamp(c.speed||1,.25,4);if(el.paused)el.play().catch(()=>{});}else if(!el.paused)el.pause();}
for(const el of activeMedia){if(!target.has(el)&&!el.paused)el.pause();}
activeMedia=target;drawPreview();}
function pause(){state.playing=false;$("playBtn").textContent="▶";lastTick=0;for(const el of activeMedia)el.pause();}
function play(){if(!state.clips.length){log("Import media first");return;}if(state.time>=maxEnd()-.01)setTime(0);state.playing=true;$("playBtn").textContent="Ⅱ";prepareAudio();audioCtx?.resume().catch(()=>{});syncPlayers();}
function togglePlay(){state.playing?pause():play();}
function tick(now){if(state.playing){if(lastTick){const next=state.time+Math.min(1,Math.max(0,(now-lastTick)/1000))*state.rate;if(next>=maxEnd()){setTime(maxEnd());pause();if(state.exporting)stopExport();}else setTime(next);}lastTick=now;}drawPreview();requestAnimationFrame(tick);}
function inspectorLabel(name,value,id,type="number",min="",max=""){return '<label>'+name+'<input data-field="'+id+'" type="'+type+'" value="'+String(value??"").replace(/"/g,"&quot;")+'" '+(min!==""?'min="'+min+'"':'')+' '+(max!==""?'max="'+max+'"':'')+' step="'+(type==="number"?"0.1":"1")+'"></label>';}
function renderInspector(){const c=getClip(state.selected),body=$("inspectorContent");$("selectionHint").textContent=c?c.kind.toUpperCase():"No selection";if(!c){body.innerHTML='<div class="placeholder">Select a video, soundtrack or title on the timeline to inspect and edit it.<br><br>Keyboard: V select · C razor · Space play · Ctrl/Cmd+K split · I/O marks · J/K/L playback.</div>';return;}
const asset=getAsset(c);let html="<h3>"+safeName(asset?.name||(c.kind==="text"?"Text":c.kind==="caption"?"Caption":c.kind==="overlay"?"Image overlay":"Clip"))+"</h3><p class=\"hint\">"+c.kind.toUpperCase()+" CLIP</p>";
html+=inspectorLabel("Start (seconds)",c.start,"start","number",0);
html+=inspectorLabel("Duration (seconds)",c.duration,"duration","number",.1);
html+=inspectorLabel("Fade In (seconds)",c.fadeIn??0,"fadeIn","number",0);
html+=inspectorLabel("Fade Out (seconds)",c.fadeOut??0,"fadeOut","number",0);
if(c.kind==="text"||c.kind==="caption"){
 html+='<label>'+(c.kind==="caption"?"Caption":"Text")+'<textarea data-field="text" rows="3">'+safeName(c.text)+'</textarea></label>';
 html+=inspectorLabel("Font size",c.fontSize,"fontSize","number",10,180);
 html+=inspectorLabel("Horizontal position %",c.x,"x","number",0,100);
 html+=inspectorLabel("Vertical position %",c.y,"y","number",0,100);
 html+=inspectorLabel("Color",c.color,"color","color");
 if(c.kind==="caption"&&captionStyles()){
  html+='<label>Caption preset<select data-field="style">'+captionPresetOptions(c.style||"classic")+'</select></label>';
  html+='<p class="hint">Preset styles control their own typography, colors and animation.</p>';
 }
}else if(c.kind==="overlay"){
 html+=inspectorLabel("Overlay scale %",c.scale,"scale","range",10,250);
 html+=inspectorLabel("Opacity %",c.opacity,"opacity","range",0,100);
 html+=inspectorLabel("Horizontal position %",c.x,"x","range",0,100);
 html+=inspectorLabel("Vertical position %",c.y,"y","range",0,100);
}else {
 html+=inspectorLabel("Speed",c.speed,"speed","number",.25,4);
 html+=inspectorLabel("Volume",c.volume,"volume","number",0,2);
}
if(c.kind==="video"){html+="<hr><h3>Visual adjustments</h3>";html+=inspectorLabel("Brightness %",c.brightness,"brightness","range",0,200);html+=inspectorLabel("Contrast %",c.contrast,"contrast","range",0,200);html+=inspectorLabel("Saturation %",c.saturation,"saturation","range",0,200);html+=inspectorLabel("Scale %",c.scale,"scale","range",20,300);}
html+='<button class="full" id="duplicateClip">Duplicate Clip</button>';body.innerHTML=html;
for(const el of body.querySelectorAll("[data-field]")){el.oninput=()=>{const target=getClip(state.selected);if(!target)return;if(!inspectorSnapshot){remember();inspectorSnapshot=true;}const f=el.dataset.field;let v=el.type==="color"||f==="text"||f==="style"?el.value:Number(el.value);if(f==="start")v=Math.max(0,v||0);if(f==="duration")v=Math.max(.1,v||.1);if(f==="speed")v=clamp(v||1,.25,4);if(f==="volume")v=clamp(v,0,2);if(f==="fadeIn"||f==="fadeOut")v=clamp(Number.isFinite(v)?v:0,0,target.duration);if(f==="duration"&&target.mediaId){const a=getAsset(target);if(a)v=Math.min(v,Math.max(.1,(a.duration-(target.sourceIn??0))/(target.speed||1)));}
target[f]=v;if(f==="style")state.captionStyle=v;renderTimeline();syncPlayers();persist();if(f==="style")renderCaptionGallery();};el.onchange=()=>{inspectorSnapshot=false;renderInspector();};}
$("duplicateClip").onclick=()=>{remember();const copy={...c,id:uid(),start:c.start+c.duration};state.clips.push(copy);state.selected=copy.id;rebuild();log("Clip duplicated");};}
function chooseTab(tab){for(const b of document.querySelectorAll("[data-tab]"))b.classList.toggle("active",b.dataset.tab===tab);for(const section of document.querySelectorAll(".tab-content"))section.classList.toggle("active",section.id==="tab"+tab[0].toUpperCase()+tab.slice(1));if(tab==="captions")renderCaptionGallery();}
function openSheet(which){closeSheets();if(matchMedia("(max-width:760px)").matches){if(which==="inspector")$("app").querySelector(".inspector").classList.add("sheet-open");else{$("app").querySelector(".assets").classList.add("sheet-open");chooseTab(which);} $("sheetBackdrop").hidden=false;}else if(which!=="inspector")chooseTab(which);for(const b of document.querySelectorAll("[data-action]"))b.classList.toggle("active",b.dataset.action===which);}
function closeSheets(){document.querySelector(".assets").classList.remove("sheet-open");document.querySelector(".inspector").classList.remove("sheet-open");$("sheetBackdrop").hidden=true;}
function download(content,name,type){const b=content instanceof Blob?content:new Blob([content],{type}),url=URL.createObjectURL(b),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),4000);}
function saveProject(){download(JSON.stringify({version:2,name:state.name,aspect:state.aspect,captionStyle:state.captionStyle,clips:state.clips,mediaInfo:state.mediaInfo,markers:state.markers,note:"Media files are stored locally in this browser; this JSON does not contain video bytes."},null,2),(state.name||"project").replace(/[^\w-]+/g,"_")+".clipforge.json","application/json");log("Project JSON saved. Keep your original media files for transfer.");}
async function openProject(file){try{const data=JSON.parse(await file.text());if(data.version!==2||!Array.isArray(data.clips))throw Error("Unsupported project");remember();pause();state.clips=data.clips;state.mediaInfo=data.mediaInfo||[];state.aspect=data.aspect||"16:9";state.captionStyle=data.captionStyle||"creator-yellow";state.name=data.name||"Imported Project";state.markers=data.markers||[];state.selected=null;for(const info of state.mediaInfo){if(!media.has(info.id)){const blob=await loadBlob(info.id);if(blob)media.set(info.id,{...info,blob,url:URL.createObjectURL(blob)});}}rebuild();log("Project opened. Missing files must be re-imported.");}catch(e){log("Cannot open project: "+e.message);}}
async function restore(){try{const saved=JSON.parse(localStorage.getItem("cf-studio-v2")||"null");if(saved?.clips?.length){Object.assign(state,{clips:saved.clips,mediaInfo:saved.mediaInfo||[],aspect:saved.aspect||"16:9",captionStyle:saved.captionStyle||"creator-yellow",name:saved.name||"Untitled Project",markers:saved.markers||[]});for(const info of state.mediaInfo){const blob=await loadBlob(info.id);if(blob)media.set(info.id,{...info,blob,url:URL.createObjectURL(blob)});}log("Previous project recovered");}}catch(e){console.warn("Recovery unavailable",e);}rebuild();}
function exportDimensions(){const res=Number($("exportResolution").value),[a,b]=state.aspect.split(":").map(Number);if(a>b)return [Math.round(res*a/b),res];if(a<b)return [res,Math.round(res*b/a)];return [res,res];}
function stopExport(){if(!state.exporting)return;state.exporting=false;pause();if(recorder?.state==="recording"){try{recorder.stop();}catch(e){console.error(e);}}exportCanvas=null;$("startExport").disabled=false;$("exportText").textContent=exportCancel?"Export cancelled":"Finishing file…";}
function startExport(){if(!maxEnd()){log("Add a video before exporting");return;}if(typeof MediaRecorder==="undefined"||!HTMLCanvasElement.prototype.captureStream){$("exportText").textContent="This browser does not support recording exports";return;}pause();const [w,h]=exportDimensions();exportCanvas=document.createElement("canvas");exportCanvas.width=w;exportCanvas.height=h;const stream=exportCanvas.captureStream(30);prepareAudio();if(audioBus){for(const track of audioBus.stream.getAudioTracks())stream.addTrack(track);}
const types=["video/mp4;codecs=avc1.42E01E,mp4a.40.2","video/mp4","video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"];const type=types.find(t=>MediaRecorder.isTypeSupported(t))||"";try{recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:5_000_000});}catch(e){exportCanvas=null;$("exportText").textContent="Recorder failed: "+e.message;return;}
recordChunks=[];exportCancel=false;recorder.ondataavailable=e=>{if(e.data.size)recordChunks.push(e.data);};recorder.onerror=e=>{log("Export failed");console.warn(e);};
recorder.onstop=()=>{const result=new Blob(recordChunks,{type:recorder.mimeType||type||"video/webm"});for(const track of stream.getTracks())track.stop();if(!exportCancel&&result.size>500){const ext=(recorder.mimeType||type).includes("mp4")?"mp4":"webm";download(result,(state.name||"clipforge").replace(/[^\w-]+/g,"_")+"."+ext,result.type);$("exportText").textContent="Saved: "+(result.size/1048576).toFixed(1)+" MB";log("Video export completed");}else if(!exportCancel)log("Export returned an empty file");};
$("startExport").disabled=true;$("exportText").textContent="Recording…";state.exporting=true;setTime(0);drawPreview();recorder.start(500);play();}
function keyboard(e){if(e.defaultPrevented||e.altKey)return;const tag=e.target.tagName;if(["INPUT","TEXTAREA","SELECT"].includes(tag)||e.target.isContentEditable)return;const mod=e.ctrlKey||e.metaKey,key=e.key.toLowerCase();if(mod){if(key==="z"){e.preventDefault();e.shiftKey?redo():undo();}else if(key==="y"){e.preventDefault();redo();}else if(key==="k"){e.preventDefault();splitAt(state.time);}else if(key==="s"){e.preventDefault();saveProject();}return;}
if(e.key===" "){e.preventDefault();togglePlay();}else if(key==="v")chooseTool("select");else if(key==="c")chooseTool("razor");else if(key==="j"){state.rate=1;setTime(Math.max(0,state.time-.25));pause();}else if(key==="k")pause();else if(key==="l"){state.rate=1;play();}else if(key==="i"){state.markIn=state.time;log("In point "+fmt(state.time));}else if(key==="o"){state.markOut=state.time;log("Out point "+fmt(state.time));}else if(key==="m"){state.markers.push(state.time);renderTimeline();persist();log("Marker added");}else if(key==="s"){state.snap=!state.snap;$("snapBtn").classList.toggle("active",state.snap);$("snapStatus").textContent=state.snap?"Snapping on":"Snapping off";}else if(key==="arrowleft"){e.preventDefault();setTime(state.time-1/30);}else if(key==="arrowright"){e.preventDefault();setTime(state.time+1/30);}else if(key==="q")rippleTrim("start");else if(key==="w")rippleTrim("end");else if(key==="delete"||key==="backspace")deleteSelected();else if(key==="="||key==="+")changeZoom(15);else if(key==="-")changeZoom(-15);}
function chooseTool(tool){state.tool=tool;for(const b of document.querySelectorAll("[data-tool]"))b.classList.toggle("active",b.dataset.tool===tool);log(tool==="razor"?"Razor: tap a clip to split":"Selection tool");}
function changeZoom(amount){const old=state.time;state.zoom=clamp(state.zoom+amount,25,180);$("zoom").value=state.zoom;renderTimeline();setTime(old);}
function wire(){
$("fileInput").onchange=e=>{importFiles(e.target.files);e.target.value="";};
$("overlayInput").onchange=e=>{const file=e.target.files?.[0];e.target.value="";if(file)addOverlayFile(file);};
$("captionInput").onchange=e=>{const file=e.target.files?.[0];e.target.value="";if(file)importTimedCaptions(file).catch(error=>log("Subtitle import failed: "+error.message));};
for(const id of ["importBtn","emptyImport"])$(id).onclick=()=>{$("fileInput").accept="video/*,audio/*,image/*";$("fileInput").click();};
$("importAudio").onclick=()=>{$("fileInput").accept="audio/*";$("fileInput").click();};
$("dropzone").onclick=()=>$("importBtn").click();$("dropzone").onkeydown=e=>{if(e.key==="Enter")$("importBtn").click();};for(const name of ["dragover","dragenter"])$("dropzone").addEventListener(name,e=>{e.preventDefault();e.currentTarget.classList.add("dragging");});$("dropzone").ondragleave=e=>e.currentTarget.classList.remove("dragging");$("dropzone").ondrop=e=>{e.preventDefault();e.currentTarget.classList.remove("dragging");importFiles(e.dataTransfer.files);};
for(const b of document.querySelectorAll("[data-tab]"))b.onclick=()=>chooseTab(b.dataset.tab);for(const b of document.querySelectorAll("[data-action]"))b.onclick=()=>openSheet(b.dataset.action);$("sheetBackdrop").onclick=closeSheets;
$("mobileSearch").onclick=()=>openSheet("media");
$("closeMobileAssets").onclick=closeSheets;
$("closeMobileInspector").onclick=closeSheets;
$("mobileUndo").onclick=undo;$("mobileRedo").onclick=redo;
$("mobileFullscreen").onclick=()=>{const el=document.querySelector(".monitor");if(document.fullscreenElement)document.exitFullscreen?.();else el?.requestFullscreen?.().catch(()=>log("Fullscreen not available in this browser"));};
$("addText").onclick=addText;
$("addOverlay").onclick=()=>$("overlayInput").click();
$("addCaption").onclick=addCaption;
$("importCaptions").onclick=()=>$("captionInput").click();
$("captionStyleSearch").oninput=e=>{captionSearch=e.target.value.trim().toLowerCase();renderCaptionGallery();};
$("applyAllCaptionStyles").onclick=applyCaptionStyleToAll;
$("exportCaptionSrt").onclick=()=>downloadSubtitles("srt");
$("exportCaptionVtt").onclick=()=>downloadSubtitles("vtt");
$("autoCaptions").onclick=autoCaptionSelected;
$("cancelAutoCaptions").onclick=()=>autoCaptionAbort?.abort();
$("mobileMuteClip").onclick=muteCurrentClip;
$("mobileCover").onclick=saveCoverFrame;
$("playBtn").onclick=togglePlay;$("jumpStart").onclick=()=>setTime(0);$("jumpEnd").onclick=()=>setTime(maxEnd());$("stepBack").onclick=()=>{pause();setTime(state.time-1/30);};$("stepForward").onclick=()=>{pause();setTime(state.time+1/30);};
$("selectTool").onclick=()=>chooseTool("select");$("razorTool").onclick=()=>chooseTool("razor");$("splitBtn").onclick=()=>splitAt(state.time);$("deleteBtn").onclick=deleteSelected;$("undoBtn").onclick=undo;$("redoBtn").onclick=redo;
$("snapBtn").onclick=()=>{state.snap=!state.snap;$("snapBtn").classList.toggle("active",state.snap);$("snapStatus").textContent=state.snap?"Snapping on":"Snapping off";};
$("zoom").oninput=e=>changeZoom(Number(e.target.value)-state.zoom);$("zoomOut").onclick=()=>changeZoom(-15);$("zoomIn").onclick=()=>changeZoom(15);
$("aspect").onchange=e=>{remember();state.aspect=e.target.value;setAspect();persist();};$("projectName").onchange=e=>{state.name=e.target.value||"Untitled Project";persist();};
$("saveProject").onclick=saveProject;$("openProject").onclick=()=>$("projectInput").click();
$("mobileSaveProject").onclick=saveProject;
$("mobileOpenProject").onclick=()=>$("projectInput").click();
$("mobileDeleteClip").onclick=deleteSelected;
$("mobileAspect").onchange=e=>{
 $("aspect").value=e.target.value;
 $("aspect").dispatchEvent(new Event("change",{bubbles:true}));
};$("projectInput").onchange=e=>{if(e.target.files[0])openProject(e.target.files[0]);e.target.value="";};
$("resetEffects").onclick=()=>{const c=getClip(state.selected);if(!c||c.kind!=="video"){log("Select a video clip first");return;}remember();Object.assign(c,{brightness:100,contrast:100,saturation:100,scale:100});rebuild();};
$("exportBtn").onclick=()=>{$("exportModal").hidden=false;};$("closeExport").onclick=()=>{if(!state.exporting)$("exportModal").hidden=true;};$("cancelExport").onclick=()=>{if(state.exporting){exportCancel=true;stopExport();}else $("exportModal").hidden=true;};$("startExport").onclick=startExport;
$("timelineViewport").addEventListener("scroll",()=>{if(!suppressScroll){state.time=clamp($("timelineViewport").scrollLeft/state.zoom,0,maxEnd());updateClock();syncPlayers();}},{passive:true});
$("timelineViewport").addEventListener("wheel",e=>{if(e.ctrlKey){e.preventDefault();changeZoom(e.deltaY<0?10:-10);}},{passive:false});
// Premiere-style tap/drag scrub on the time ruler. Fixed gesture anchor prevents
// the scrollable timeline moving out from under the pointer while scrubbing.
const ruler=$("ruler");
let rulerDrag=null;
ruler.addEventListener("pointerdown",e=>{
 if(e.button!==0||rulerDrag)return;
 pause();
 const rect=ruler.getBoundingClientRect();
 const initial=clamp((e.clientX-rect.left-lead)/state.zoom,0,maxEnd());
 rulerDrag={pointer:e.pointerId,clientX:e.clientX,time:initial,scale:state.zoom};
 try{ruler.setPointerCapture(e.pointerId);}catch(_){}
 setTime(initial);
 e.preventDefault();
});
ruler.addEventListener("pointermove",e=>{
 if(!rulerDrag||e.pointerId!==rulerDrag.pointer)return;
 const desired=rulerDrag.time+(e.clientX-rulerDrag.clientX)/rulerDrag.scale;
 setTime(desired);
 if(e.cancelable)e.preventDefault();
});
function stopRulerDrag(e){
 if(!rulerDrag||e.pointerId!==rulerDrag.pointer)return;
 rulerDrag=null;
 try{ruler.releasePointerCapture(e.pointerId);}catch(_){}
}
ruler.addEventListener("pointerup",stopRulerDrag);
ruler.addEventListener("pointercancel",stopRulerDrag);
// Two-finger timeline zoom for phones. This does not change the video itself,
// clips, source media, or desktop keyboard shortcuts.
const pinchDistance=touches=>Math.hypot(
 touches[0].clientX-touches[1].clientX,
 touches[0].clientY-touches[1].clientY
);
let pinch=null;
$("timelineViewport").addEventListener("touchstart",e=>{
 if(e.touches.length===2){
  pinch={distance:Math.max(1,pinchDistance(e.touches)),zoom:state.zoom,time:state.time};
 }
},{passive:true});
$("timelineViewport").addEventListener("touchmove",e=>{
 if(!pinch||e.touches.length!==2)return;
 if(e.cancelable)e.preventDefault();
 const zoom=clamp(Math.round(pinch.zoom*pinchDistance(e.touches)/pinch.distance),25,180);
 if(zoom===state.zoom)return;
 state.zoom=zoom;
 $("zoom").value=zoom;
 renderTimeline();
 setTime(pinch.time);
},{passive:false});
for(const eventName of ["touchend","touchcancel"]){
 $("timelineViewport").addEventListener(eventName,e=>{
  if(e.touches.length!==2)pinch=null;
 },{passive:true});
}
for(const lane of document.querySelectorAll(".track-lane"))lane.addEventListener("pointerdown",e=>{if(e.target===lane){const rect=lane.getBoundingClientRect();const x=e.clientX-rect.left+$("timelineViewport").scrollLeft-lead;setTime(x/state.zoom);state.selected=null;renderTimeline();renderInspector();}});
window.addEventListener("keydown",keyboard);window.addEventListener("resize",()=>{const at=state.time;renderTimeline();setTime(at);});
window.addEventListener("pagehide",()=>{for(const el of videos.values())el.pause();});
}
wire();restore().then(()=>{renderCaptionGallery();requestAnimationFrame(tick);});
window.ClipForgeStudioV2={getState:()=>({clips:structuredClone(state.clips),mediaInfo:structuredClone(state.mediaInfo),time:state.time,zoom:state.zoom,aspect:state.aspect,captionStyle:state.captionStyle}),importFiles,splitAt,undo,redo,setTime};
})();