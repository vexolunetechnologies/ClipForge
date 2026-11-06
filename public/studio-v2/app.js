(()=>{
"use strict";
const $=id=>document.getElementById(id), clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const uid=()=>crypto.randomUUID?.()||"cf-"+Math.random().toString(36).slice(2);
const media=new Map(),videos=new Map(),images=new Map(),audioNodes=new Map();
const state={clips:[],mediaInfo:[],aspect:"16:9",name:"Untitled Project",time:0,zoom:85,playing:false,selected:null,tool:"select",snap:true,markers:[],markIn:null,markOut:null,history:[],redo:[],exporting:false,rate:1};
let lead=180,suppressScroll=false,lastTick=0,activeMedia=new Set(),audioCtx=null,audioBus=null,exportCanvas=null,recorder=null,recordChunks=[],exportTimer=0,exportCancel=false,inspectorSnapshot=false,drag=null,saveTimer=0;
const log=(s)=>{$("status").textContent=s;};
const maxEnd=()=>Math.max(0,...state.clips.map(c=>c.start+c.duration));
const fmt=(t,frames=false)=>{t=Math.max(0,t||0);const h=Math.floor(t/3600),m=Math.floor(t/60)%60,s=Math.floor(t)%60,f=Math.floor((t%1)*30);const two=n=>String(n).padStart(2,"0");return frames?[h,m,s,f].map(two).join(":"):[m,s].map(two).join(":");};
const snapshot=()=>JSON.stringify({clips:state.clips,aspect:state.aspect,name:state.name,markers:state.markers});
function remember(){state.history.push(snapshot());if(state.history.length>70)state.history.shift();state.redo=[];updateButtons();}
function undo(){if(!state.history.length)return;state.redo.push(snapshot());Object.assign(state,JSON.parse(state.history.pop()));state.selected=null;rebuild();log("Undo");}
function redo(){if(!state.redo.length)return;state.history.push(snapshot());Object.assign(state,JSON.parse(state.redo.pop()));state.selected=null;rebuild();log("Redo");}
function updateButtons(){$("undoBtn").disabled=!state.history.length;$("redoBtn").disabled=!state.redo.length;}
function persist(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{localStorage.setItem("cf-studio-v2",JSON.stringify({clips:state.clips,mediaInfo:state.mediaInfo,aspect:state.aspect,name:state.name,markers:state.markers}));}catch(e){console.warn("Project save failed",e);}},450);}
const dbReady=new Promise(resolve=>{if(!("indexedDB" in window)){resolve(null);return;}try{const req=indexedDB.open("clipforge-studio-v2",1);req.onupgradeneeded=()=>{req.result.createObjectStore("assets");};req.onsuccess=()=>resolve(req.result);req.onerror=()=>resolve(null);}catch(_){resolve(null);}});
async function storeBlob(id,blob){const db=await dbReady;if(!db)return false;return new Promise(resolve=>{try{const tx=db.transaction("assets","readwrite");tx.objectStore("assets").put(blob,id);tx.oncomplete=()=>resolve(true);tx.onerror=()=>resolve(false);}catch(_){resolve(false);}});}
async function loadBlob(id){const db=await dbReady;if(!db)return null;return new Promise(resolve=>{try{const tx=db.transaction("assets","readonly"),req=tx.objectStore("assets").get(id);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>resolve(null);}catch(_){resolve(null);}});}
function durationOf(file,url,kind){if(kind==="image")return Promise.resolve(5);return new Promise(resolve=>{const el=document.createElement(kind==="video"?"video":"audio");el.preload="metadata";let finished=false;const done=v=>{if(finished)return;finished=true;el.removeAttribute("src");el.load();resolve(v);};el.onloadedmetadata=()=>done(Number.isFinite(el.duration)&&el.duration>0?el.duration:8);el.onerror=()=>done(8);el.src=url;setTimeout(()=>done(8),5000);});}
async function importFiles(files){const accepted=[...files].filter(file=>/^(video|audio|image)\//.test(file.type));if(!accepted.length){log("Choose a supported video, image or audio file");return;}for(const file of accepted){const kind=file.type.split("/")[0],id=uid(),url=URL.createObjectURL(file),dur=await durationOf(file,url,kind);const info={id,name:file.name,kind,duration:kind==="image"?5:dur,size:file.size};media.set(id,{...info,url,blob:file});state.mediaInfo.push(info);storeBlob(id,file).then(ok=>{if(!ok)log("Media imported. Browser storage may be unavailable, so keep your source files.");});const clip=insertClip(id,true);if(clip)state.selected=clip.id;}renderMedia();rebuild();log(accepted.length+" media file(s) imported");}
function insertClip(mediaId,automatic=false){const asset=media.get(mediaId);if(!asset)return null;remember();const kind=asset.kind==="audio"?"audio":"video";const start=kind==="video"?Math.max(0,...state.clips.filter(x=>x.kind==="video").map(x=>x.start+x.duration)):state.time;
const clip={id:uid(),mediaId,kind,start,duration:asset.duration,sourceIn:0,volume:1,speed:1,brightness:100,contrast:100,saturation:100,scale:100};state.clips.push(clip);if(!automatic)state.selected=clip.id;return clip;}
function addText(){const text=$("newText").value.trim()||"Your title";remember();const clip={id:uid(),kind:"text",start:state.time,duration:4,text,fontSize:62,color:"#ffffff",x:50,y:78};state.clips.push(clip);state.selected=clip.id;rebuild();closeSheets();log("Text added");}
function safeName(s){return String(s||"Clip").replace(/[<>]/g,"");}
const getClip=id=>state.clips.find(c=>c.id===id),getAsset=c=>media.get(c?.mediaId);
function renderMedia(){const grid=$("mediaGrid");grid.textContent="";for(const item of state.mediaInfo){const m=media.get(item.id);const button=document.createElement("button");button.className="media-card";button.title="Add "+item.name+" to timeline";button.dataset.mid=item.id;const thumb=document.createElement("div");thumb.className="media-thumb";const pic=document.createElement("img");if(m?.thumb){pic.src=m.thumb;thumb.append(pic);}else if(item.kind==="audio")thumb.textContent="♫";else thumb.textContent=item.kind==="image"?"▧":"▶";const name=document.createElement("span");name.textContent=item.name;const duration=document.createElement("small");duration.textContent=fmt(item.duration)+" · "+item.kind;button.append(thumb,name,duration);button.addEventListener("click",()=>{if(!media.has(item.id)){log("Missing media. Please re-import this file.");return;}const clip=insertClip(item.id);if(clip){rebuild();closeSheets();log("Added to timeline");}});grid.append(button);}
$("mediaStatus").textContent=state.mediaInfo.length+" media file(s)";}
function makeThumb(asset){if(!asset||asset.thumb||asset.thumbBusy||asset.kind==="audio")return;asset.thumbBusy=true;if(asset.kind==="image"){const image=new Image();image.onload=()=>{const c=document.createElement("canvas");c.width=150;c.height=84;const x=c.getContext("2d");x.drawImage(image,0,0,c.width,c.height);asset.thumb=c.toDataURL("image/jpeg",.72);renderMedia();renderTimeline();};image.src=asset.url;return;}
const v=document.createElement("video");v.muted=true;v.preload="auto";v.playsInline=true;let done=false;const finish=()=>{if(done)return;done=true;try{v.removeAttribute("src");v.load();}catch(_){};};v.onloadedmetadata=()=>{try{v.currentTime=Math.min(.35,Math.max(.01,v.duration*.15));}catch(_){finish();}};v.onseeked=()=>{try{const c=document.createElement("canvas");c.width=150;c.height=84;const x=c.getContext("2d");x.drawImage(v,0,0,150,84);asset.thumb=c.toDataURL("image/jpeg",.72);renderMedia();renderTimeline();}catch(_){}finish();};v.onerror=finish;v.src=asset.url;setTimeout(finish,6000);
}
function rebuild(){state.time=clamp(state.time,0,maxEnd());$("aspect").value=state.aspect;$("projectName").value=state.name;setAspect();renderMedia();for(const m of media.values())makeThumb(m);renderTimeline();renderInspector();updateButtons();persist();}
function setAspect(){const [a,b]=state.aspect.split(":").map(Number),w=a>=b?960:Math.round(960*a/b),h=a>=b?Math.round(960*b/a):960;const c=$("preview");c.width=w;c.height=h;c.style.aspectRatio=a+"/"+b;$("monitorLabel").textContent=state.aspect+" · Live Preview";}
function renderTimeline(){const view=$("timelineViewport"),content=$("timelineContent");lead=Math.max(40,view.clientWidth/2);const scale=state.zoom,total=Math.max(maxEnd()+12,30),width=Math.ceil(total*scale+lead*2);content.style.width=width+"px";const ruler=$("ruler");ruler.textContent="";const step=scale<50?10:scale<100?5:2;for(let t=0;t<=total;t+=step){const el=document.createElement("span");el.className="tick";el.style.left=(lead+t*scale)+"px";el.textContent=fmt(t);ruler.append(el);}for(const kind of ["video","text","audio"]){const lane=$(kind+"Lane");lane.textContent="";lane.style.width=width+"px";const laneClips=state.clips.filter(c=>c.kind===kind).sort((a,b)=>a.start-b.start);laneClips.forEach(clip=>{const asset=getAsset(clip),el=document.createElement("div");el.className="clip "+kind+(state.selected===clip.id?" selected":"");el.dataset.clipId=clip.id;el.style.left=(lead+clip.start*scale)+"px";el.style.width=Math.max(8,clip.duration*scale)+"px";const film=document.createElement("span");film.className=kind==="video"?"filmstrip":kind==="audio"?"audio-wave":"";if(asset?.thumb&&kind==="video")film.style.backgroundImage='url("'+asset.thumb+'")';el.append(film);const label=document.createElement("span");label.className="clip-label";label.textContent=kind==="text"?"T "+clip.text:asset?.name||"Missing file";el.append(label);for(const side of ["left","right"]){const handle=document.createElement("span");handle.className="trim "+side;handle.dataset.trim=side;el.append(handle);}el.addEventListener("pointerdown",clipPointerDown);lane.append(el);});
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
remember();drag={pointer:e.pointerId,client:e.clientX,original:{start:clip.start,duration:clip.duration,sourceIn:clip.sourceIn},mode,id:clip.id,changed:false};el.setPointerCapture(e.pointerId);el.addEventListener("pointermove",clipPointerMove);el.addEventListener("pointerup",clipPointerUp,{once:true});el.addEventListener("pointercancel",clipPointerUp,{once:true});e.stopPropagation();}
function clipPointerMove(e){if(!drag||e.pointerId!==drag.pointer)return;const clip=getClip(drag.id);if(!clip)return;const delta=(e.clientX-drag.client)/state.zoom;if(Math.abs(delta)<.005)return;drag.changed=true;const o=drag.original;
if(drag.mode==="move")clip.start=snapTime(Math.max(0,o.start+delta),clip.id);
if(drag.mode==="left"){const limit=Math.max(-o.sourceIn/(clip.speed||1),-(o.start));let dt=clamp(delta,limit,o.duration-.12);clip.start=snapTime(o.start+dt,clip.id);dt=clip.start-o.start;clip.duration=o.duration-dt;clip.sourceIn=o.sourceIn+dt*(clip.speed||1);}
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
function drawComposite(ctx,width,height,time){ctx.save();ctx.fillStyle="#000000";ctx.fillRect(0,0,width,height);const clip=activeClip("video",time);if(clip){const asset=getAsset(clip);const el=asset?.kind==="video"?getVideoElement(asset):getImage(asset);if(el&&(el.readyState>=2||el.complete&&el.naturalWidth)){const iw=el.videoWidth||el.naturalWidth,ih=el.videoHeight||el.naturalHeight;if(iw&&ih){const fit=Math.min(width/iw,height/ih)*(clip.scale||100)/100,ow=iw*fit,oh=ih*fit;ctx.filter="brightness("+(clip.brightness||100)+"%) contrast("+(clip.contrast||100)+"%) saturate("+(clip.saturation||100)+"%)";try{ctx.drawImage(el,(width-ow)/2,(height-oh)/2,ow,oh);}catch(_){}ctx.filter="none";}}}
for(const text of state.clips.filter(c=>c.kind==="text"&&time>=c.start&&time<c.start+c.duration)){ctx.save();const size=Math.max(12,(text.fontSize||62)*height/540);ctx.font="700 "+size+"px Arial, sans-serif";ctx.fillStyle=text.color||"#fff";ctx.strokeStyle="#000a";ctx.lineWidth=3;ctx.textAlign="center";ctx.textBaseline="middle";const x=width*(text.x??50)/100,y=height*(text.y??78)/100;ctx.strokeText(text.text||"",x,y,width*.95);ctx.fillText(text.text||"",x,y,width*.95);ctx.restore();}
ctx.restore();}
function drawPreview(){const c=$("preview"),ctx=c.getContext("2d");if(!ctx)return;drawComposite(ctx,c.width,c.height,state.time);if(exportCanvas)drawComposite(exportCanvas.getContext("2d"),exportCanvas.width,exportCanvas.height,state.time);$("emptyState").hidden=state.clips.some(c=>c.kind==="video");}
function prepareAudio(){if(audioCtx)return;try{audioCtx=new (window.AudioContext||window.webkitAudioContext)();audioBus=audioCtx.createMediaStreamDestination();}catch(e){log("Audio engine unavailable");}}
function connectElement(el,volume=1){if(!audioCtx||!el)return;let item=audioNodes.get(el);if(!item){try{const src=audioCtx.createMediaElementSource(el),gain=audioCtx.createGain();src.connect(gain);gain.connect(audioCtx.destination);gain.connect(audioBus);item={gain};audioNodes.set(el,item);}catch(e){console.warn(e);return;}}item.gain.gain.value=clamp(volume,0,2);}
function syncPlayers(){const target=new Set();for(const kind of ["video","audio"]){const c=activeClip(kind,state.time);if(!c)continue;const asset=getAsset(c);if(!asset||asset.kind==="image")continue;const el=kind==="video"?getVideoElement(asset):getAudioElement(asset);if(!el)continue;target.add(el);const seconds=Math.max(0,c.sourceIn+(state.time-c.start)*(c.speed||1));if(Math.abs((el.currentTime||0)-seconds)>.16&&Number.isFinite(seconds)){try{el.currentTime=seconds;}catch(_){}}
if(state.playing){prepareAudio();connectElement(el,c.volume??1);el.playbackRate=clamp(c.speed||1,.25,4);if(el.paused)el.play().catch(()=>{});}else if(!el.paused)el.pause();}
for(const el of activeMedia){if(!target.has(el)&&!el.paused)el.pause();}
activeMedia=target;drawPreview();}
function pause(){state.playing=false;$("playBtn").textContent="▶";lastTick=0;for(const el of activeMedia)el.pause();}
function play(){if(!state.clips.length){log("Import media first");return;}if(state.time>=maxEnd()-.01)setTime(0);state.playing=true;$("playBtn").textContent="Ⅱ";prepareAudio();audioCtx?.resume().catch(()=>{});syncPlayers();}
function togglePlay(){state.playing?pause():play();}
function tick(now){if(state.playing){if(lastTick){const next=state.time+Math.min(.1,(now-lastTick)/1000)*state.rate;if(next>=maxEnd()){setTime(maxEnd());pause();if(state.exporting)stopExport();}else setTime(next);}lastTick=now;}drawPreview();requestAnimationFrame(tick);}
function inspectorLabel(name,value,id,type="number",min="",max=""){return '<label>'+name+'<input data-field="'+id+'" type="'+type+'" value="'+String(value??"").replace(/"/g,"&quot;")+'" '+(min!==""?'min="'+min+'"':'')+' '+(max!==""?'max="'+max+'"':'')+' step="'+(type==="number"?"0.1":"1")+'"></label>';}
function renderInspector(){const c=getClip(state.selected),body=$("inspectorContent");$("selectionHint").textContent=c?c.kind.toUpperCase():"No selection";if(!c){body.innerHTML='<div class="placeholder">Select a video, soundtrack or title on the timeline to inspect and edit it.<br><br>Keyboard: V select · C razor · Space play · Ctrl/Cmd+K split · I/O marks · J/K/L playback.</div>';return;}
const asset=getAsset(c);let html="<h3>"+safeName(asset?.name||(c.kind==="text"?"Text overlay":"Clip"))+"</h3><p class=\"hint\">"+c.kind.toUpperCase()+" CLIP</p>";
html+=inspectorLabel("Start (seconds)",c.start,"start","number",0);
html+=inspectorLabel("Duration (seconds)",c.duration,"duration","number",.1);
if(c.kind==="text"){html+='<label>Text<textarea data-field="text" rows="3">'+safeName(c.text)+'</textarea></label>';html+=inspectorLabel("Font size",c.fontSize,"fontSize","number",10,180);html+=inspectorLabel("Horizontal position %",c.x,"x","number",0,100);html+=inspectorLabel("Vertical position %",c.y,"y","number",0,100);html+=inspectorLabel("Color",c.color,"color","color");}
else {html+=inspectorLabel("Speed",c.speed,"speed","number",.25,4);html+=inspectorLabel("Volume",c.volume,"volume","number",0,2);}
if(c.kind==="video"){html+="<hr><h3>Visual adjustments</h3>";html+=inspectorLabel("Brightness %",c.brightness,"brightness","range",0,200);html+=inspectorLabel("Contrast %",c.contrast,"contrast","range",0,200);html+=inspectorLabel("Saturation %",c.saturation,"saturation","range",0,200);html+=inspectorLabel("Scale %",c.scale,"scale","range",20,300);}
html+='<button class="full" id="duplicateClip">Duplicate Clip</button>';body.innerHTML=html;
for(const el of body.querySelectorAll("[data-field]")){el.oninput=()=>{const target=getClip(state.selected);if(!target)return;if(!inspectorSnapshot){remember();inspectorSnapshot=true;}const f=el.dataset.field;let v=el.type==="color"||f==="text"?el.value:Number(el.value);if(f==="start")v=Math.max(0,v||0);if(f==="duration")v=Math.max(.1,v||.1);if(f==="speed")v=clamp(v||1,.25,4);if(f==="volume")v=clamp(v,0,2);if(f==="duration"&&target.mediaId){const a=getAsset(target);if(a)v=Math.min(v,Math.max(.1,(a.duration-target.sourceIn)/(target.speed||1)));}
target[f]=v;renderTimeline();syncPlayers();persist();};el.onchange=()=>{inspectorSnapshot=false;renderInspector();};}
$("duplicateClip").onclick=()=>{remember();const copy={...c,id:uid(),start:c.start+c.duration};state.clips.push(copy);state.selected=copy.id;rebuild();log("Clip duplicated");};}
function chooseTab(tab){for(const b of document.querySelectorAll("[data-tab]"))b.classList.toggle("active",b.dataset.tab===tab);for(const section of document.querySelectorAll(".tab-content"))section.classList.toggle("active",section.id==="tab"+tab[0].toUpperCase()+tab.slice(1));}
function openSheet(which){closeSheets();if(matchMedia("(max-width:760px)").matches){if(which==="inspector")$("app").querySelector(".inspector").classList.add("sheet-open");else{$("app").querySelector(".assets").classList.add("sheet-open");chooseTab(which);} $("sheetBackdrop").hidden=false;}else if(which!=="inspector")chooseTab(which);for(const b of document.querySelectorAll("[data-action]"))b.classList.toggle("active",b.dataset.action===which);}
function closeSheets(){document.querySelector(".assets").classList.remove("sheet-open");document.querySelector(".inspector").classList.remove("sheet-open");$("sheetBackdrop").hidden=true;}
function download(content,name,type){const b=content instanceof Blob?content:new Blob([content],{type}),url=URL.createObjectURL(b),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),4000);}
function saveProject(){download(JSON.stringify({version:2,name:state.name,aspect:state.aspect,clips:state.clips,mediaInfo:state.mediaInfo,markers:state.markers,note:"Media files are stored locally in this browser; this JSON does not contain video bytes."},null,2),(state.name||"project").replace(/[^\w-]+/g,"_")+".clipforge.json","application/json");log("Project JSON saved. Keep your original media files for transfer.");}
async function openProject(file){try{const data=JSON.parse(await file.text());if(data.version!==2||!Array.isArray(data.clips))throw Error("Unsupported project");remember();pause();state.clips=data.clips;state.mediaInfo=data.mediaInfo||[];state.aspect=data.aspect||"16:9";state.name=data.name||"Imported Project";state.markers=data.markers||[];state.selected=null;for(const info of state.mediaInfo){if(!media.has(info.id)){const blob=await loadBlob(info.id);if(blob)media.set(info.id,{...info,blob,url:URL.createObjectURL(blob)});}}rebuild();log("Project opened. Missing files must be re-imported.");}catch(e){log("Cannot open project: "+e.message);}}
async function restore(){try{const saved=JSON.parse(localStorage.getItem("cf-studio-v2")||"null");if(saved?.clips?.length){Object.assign(state,{clips:saved.clips,mediaInfo:saved.mediaInfo||[],aspect:saved.aspect||"16:9",name:saved.name||"Untitled Project",markers:saved.markers||[]});for(const info of state.mediaInfo){const blob=await loadBlob(info.id);if(blob)media.set(info.id,{...info,blob,url:URL.createObjectURL(blob)});}log("Previous project recovered");}}catch(e){console.warn("Recovery unavailable",e);}rebuild();}
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
for(const id of ["importBtn","emptyImport"])$(id).onclick=()=>{$("fileInput").accept="video/*,audio/*,image/*";$("fileInput").click();};
$("importAudio").onclick=()=>{$("fileInput").accept="audio/*";$("fileInput").click();};
$("dropzone").onclick=()=>$("importBtn").click();$("dropzone").onkeydown=e=>{if(e.key==="Enter")$("importBtn").click();};for(const name of ["dragover","dragenter"])$("dropzone").addEventListener(name,e=>{e.preventDefault();e.currentTarget.classList.add("dragging");});$("dropzone").ondragleave=e=>e.currentTarget.classList.remove("dragging");$("dropzone").ondrop=e=>{e.preventDefault();e.currentTarget.classList.remove("dragging");importFiles(e.dataTransfer.files);};
for(const b of document.querySelectorAll("[data-tab]"))b.onclick=()=>chooseTab(b.dataset.tab);for(const b of document.querySelectorAll("[data-action]"))b.onclick=()=>openSheet(b.dataset.action);$("sheetBackdrop").onclick=closeSheets;
$("mobileSearch").onclick=()=>openSheet("media");
$("mobileUndo").onclick=undo;$("mobileRedo").onclick=redo;
$("mobileFullscreen").onclick=()=>{const el=document.querySelector(".monitor");if(document.fullscreenElement)document.exitFullscreen?.();else el?.requestFullscreen?.().catch(()=>log("Fullscreen not available in this browser"));};
$("addText").onclick=addText;$("playBtn").onclick=togglePlay;$("jumpStart").onclick=()=>setTime(0);$("jumpEnd").onclick=()=>setTime(maxEnd());$("stepBack").onclick=()=>{pause();setTime(state.time-1/30);};$("stepForward").onclick=()=>{pause();setTime(state.time+1/30);};
$("selectTool").onclick=()=>chooseTool("select");$("razorTool").onclick=()=>chooseTool("razor");$("splitBtn").onclick=()=>splitAt(state.time);$("deleteBtn").onclick=deleteSelected;$("undoBtn").onclick=undo;$("redoBtn").onclick=redo;
$("snapBtn").onclick=()=>{state.snap=!state.snap;$("snapBtn").classList.toggle("active",state.snap);$("snapStatus").textContent=state.snap?"Snapping on":"Snapping off";};
$("zoom").oninput=e=>changeZoom(Number(e.target.value)-state.zoom);$("zoomOut").onclick=()=>changeZoom(-15);$("zoomIn").onclick=()=>changeZoom(15);
$("aspect").onchange=e=>{remember();state.aspect=e.target.value;setAspect();persist();};$("projectName").onchange=e=>{state.name=e.target.value||"Untitled Project";persist();};
$("saveProject").onclick=saveProject;$("openProject").onclick=()=>$("projectInput").click();$("projectInput").onchange=e=>{if(e.target.files[0])openProject(e.target.files[0]);e.target.value="";};
$("resetEffects").onclick=()=>{const c=getClip(state.selected);if(!c||c.kind!=="video"){log("Select a video clip first");return;}remember();Object.assign(c,{brightness:100,contrast:100,saturation:100,scale:100});rebuild();};
$("exportBtn").onclick=()=>{$("exportModal").hidden=false;};$("closeExport").onclick=()=>{if(!state.exporting)$("exportModal").hidden=true;};$("cancelExport").onclick=()=>{if(state.exporting){exportCancel=true;stopExport();}else $("exportModal").hidden=true;};$("startExport").onclick=startExport;
$("timelineViewport").addEventListener("scroll",()=>{if(!suppressScroll){state.time=clamp($("timelineViewport").scrollLeft/state.zoom,0,maxEnd());updateClock();syncPlayers();}},{passive:true});
$("timelineViewport").addEventListener("wheel",e=>{if(e.ctrlKey){e.preventDefault();changeZoom(e.deltaY<0?10:-10);}},{passive:false});
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
wire();restore().then(()=>{requestAnimationFrame(tick);});
window.ClipForgeStudioV2={getState:()=>({clips:structuredClone(state.clips),mediaInfo:structuredClone(state.mediaInfo),time:state.time,zoom:state.zoom,aspect:state.aspect}),importFiles,splitAt,undo,redo,setTime};
})();