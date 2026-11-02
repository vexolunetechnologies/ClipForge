/* ClipForge V2 — Vexolune Technologies. No project persistence. */
(function(){
'use strict';
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const toast=(msg)=>{const t=$('#toast');if(t){t.textContent=msg;t.style.display='block';setTimeout(()=>t.style.display='none',6500)}};
const brand=$('header .brand');
if(brand)brand.innerHTML='<svg width="34" height="34" viewBox="0 0 36 36" aria-hidden="true"><defs><linearGradient id="cfmark" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#8b7cff"/><stop offset="1" stop-color="#4dd8e8"/></linearGradient></defs><rect x="1" y="1" width="34" height="34" rx="11" fill="url(#cfmark)"/><path d="M14 10.5 26 18l-12 7.5z" fill="#fff"/></svg><span>ClipForge<small style="display:block;font-size:9px;letter-spacing:.12em;color:var(--muted);font-weight:700;text-transform:uppercase">by Vexolune Technologies</small></span>';
const hero=$('.hero');
if(hero){hero.innerHTML='<h1>Make every frame<br><span style="background:linear-gradient(100deg,var(--accent),var(--accent-2));background-clip:text;-webkit-background-clip:text;color:transparent">count.</span></h1><p>One creative workspace for shorts, trailers, animated visuals and professional video edits. Built by Vexolune Technologies.</p>'}
const oldCards=$$('.toolcard');
oldCards.forEach(a=>{const h=a.querySelector('h3');if(h&&/Image Animator/i.test(h.textContent))h.textContent='Picture to Video';if(h&&/Long Video/i.test(h.textContent))h.textContent='AI Shorts Maker'});
const cardGrid=$('.tools');
if(cardGrid){
 const add=(href,tag,title,desc,bullets)=>{const a=document.createElement('a');a.className='card toolcard';a.href=href;a.innerHTML='<span class="ttag">'+tag+'</span><h3>'+title+'</h3><p>'+desc+'</p><ul>'+bullets.map(x=>'<li>'+x+'</li>').join('')+'</ul><span class="go">Open workspace ↗</span>';cardGrid.append(a)};
 add('#montage','MULTI-CLIP WORKFLOW','Video Montage Maker','Combine multiple clips into one polished sequence.',['Add and reorder multiple videos','Trim each clip independently','Choose aspect ratio and fade transitions','Add a music track and title overlay','Preview and export a single video']);
 add('#editor','MULTI-TRACK STARTER','Editor','A practical browser-based editing workspace for everyday video production.',['Import multiple video clips','Trim, split, reorder and remove clips','Set canvas ratio, visual look and title text','Add a music bed and export the timeline','No project saving — export your finished edit']);
}
const footerCopy=$('.copy');
if(footerCopy){footerCopy.innerHTML='<span>© '+new Date().getFullYear()+' ClipForge Studio. A Vexolune Technologies product.</span><span>Temporary browser sessions · Your media stays on your device</span>'}
const how=$('#how');if(how){const p=how.querySelector('.grid');if(p&&p.children[0])p.children[0].querySelector('p').textContent='Choose a creative tool and import media directly from your device.';if(p&&p.children[1])p.children[1].querySelector('p').textContent='Configure the workflow, review your edit and adjust the details.';if(p&&p.children[2])p.children[2].querySelector('p').textContent='Render in your browser, preview the result and download it.'}
const featureCards=$$('#features .card');
if(featureCards[3]){featureCards[3].querySelector('h3').textContent='Private, temporary sessions';featureCards[3].querySelector('p').textContent='Media is processed in your browser. ClipForge does not keep a project library or save your editing sessions.'}
/* Remove the old local project restore system. Theme preference remains separate. */
try{localStorage.removeItem('cf_projects')}catch(e){}
if(typeof window.projSave==='function')window.projSave=function(){};
if(typeof window.projOffer==='function')window.projOffer=function(){};
const addWorkspace=(id,html)=>{let el=document.getElementById(id);if(!el){el=document.createElement('section');el.id=id;el.style.display='none';const before=$('#how');before?before.parentNode.insertBefore(el,before):document.body.append(el)}el.innerHTML=html;return el};
const shell=(title,desc,tag)=>'<a class="cf-back" href="#tools">← All creative tools</a><div class="cf-page-head"><div><div class="cf-kicker">'+tag+'</div><h2>'+title+'</h2><p>'+desc+'</p></div><span class="cf-badge">● Local browser session</span></div>';
const montageHTML=shell('Video Montage Maker','Bring multiple clips together, refine the order and create a clean montage with optional music and title text.','CLIPFORGE / MONTAGE')+
'<div class="cf-grid"><div class="cf-panel"><div class="cf-field"><label>ADD VIDEO CLIPS</label><input id="vmFiles" type="file" accept="video/*" multiple></div><div id="vmEmpty" class="cf-empty">Choose two or more video clips to start your montage.</div><div id="vmTimeline" class="cf-timeline"></div><video id="vmPreview" class="cf-preview" controls playsinline></video><div class="cf-row" style="margin-top:12px"><button class="sm" id="vmPreviewBtn">Preview selected clip</button><button class="sm" id="vmClear">Clear clips</button></div></div><div class="cf-panel"><div class="cf-kicker">OUTPUT SETTINGS</div><div class="cf-field"><label>VIDEO FORMAT</label><select id="vmRatio"><option value="9:16">9:16 · Reels / Shorts</option><option value="16:9" selected>16:9 · YouTube</option><option value="1:1">1:1 · Square</option></select></div><div class="cf-field"><label>TRANSITION</label><select id="vmTransition"><option value="fade">Fade between clips</option><option value="cut">Straight cuts</option></select></div><div class="cf-field"><label>VIDEO TITLE (OPTIONAL)</label><input id="vmTitle" maxlength="90" placeholder="Your montage title"></div><div class="cf-field"><label>BACKGROUND MUSIC (OPTIONAL)</label><input id="vmMusic" type="file" accept="audio/*"></div><div class="cf-stat"><b id="vmCount">0 clips</b><span id="vmDuration">Add media to calculate duration</span></div><button class="main" id="vmExport">Render montage</button><button class="sm" id="vmStop" style="display:none;margin-top:8px">Stop rendering</button><div class="cf-progress"><i id="vmProgress"></i></div><div id="vmStatus" class="cf-status" role="status"></div><div id="vmOutput" class="cf-output"></div></div></div>';
const editorHTML=shell('Editor','A focused editing workspace with a clip timeline, trim controls, split and reorder tools, visual treatments, titles and export.','CLIPFORGE / EDITOR')+
'<div class="cf-panel"><div class="cf-row cf-toolbar"><label class="sm" for="edFiles" style="cursor:pointer">＋ Import videos</label><input id="edFiles" type="file" accept="video/*" multiple style="display:none"><button class="sm" id="edSplit">Split selected</button><button class="sm" id="edRemove">Remove selected</button><button class="sm" id="edClear">Clear timeline</button><span class="cf-muted" id="edCount">0 clips</span></div><div id="edEmpty" class="cf-empty" style="margin-top:12px">Import videos to build your editing timeline.</div><div id="edTimeline" class="cf-timeline"></div></div>'+
'<div class="cf-grid"><div class="cf-panel"><video id="edPreview" class="cf-preview" controls playsinline></video><div class="cf-row" style="margin-top:12px"><button class="sm" id="edPlay">Preview selected</button><span class="cf-muted" id="edPreviewInfo">Select a clip to inspect it.</span></div></div><div class="cf-panel"><div class="cf-kicker">CLIP CONTROLS</div><div class="cf-field"><label>TRIM START (SECONDS)</label><input id="edStart" type="number" min="0" step=".1" value="0"></div><div class="cf-field"><label>TRIM END (SECONDS)</label><input id="edEnd" type="number" min="0" step=".1" value="0"></div><button class="sm p" id="edApply">Apply trim</button><div class="cf-field"><label>CANVAS RATIO</label><select id="edRatio"><option value="9:16">9:16 · Vertical</option><option value="16:9" selected>16:9 · Landscape</option><option value="1:1">1:1 · Square</option></select></div><div class="cf-field"><label>VISUAL LOOK</label><select id="edFilter"><option value="none">Original</option><option value="cinema">Cinematic</option><option value="mono">Black &amp; white</option><option value="warm">Warm</option></select></div><div class="cf-field"><label>TITLE / TEXT OVERLAY</label><input id="edTitle" maxlength="100" placeholder="Add a title to your video"></div><div class="cf-field"><label>BACKGROUND MUSIC (OPTIONAL)</label><input id="edMusic" type="file" accept="audio/*"></div><div class="cf-stat"><b id="edDuration">0:00</b><span>Timeline duration</span></div><button class="main" id="edExport">Export edited video</button><button class="sm" id="edStop" style="display:none;margin-top:8px">Stop export</button><div class="cf-progress"><i id="edProgress"></i></div><div id="edStatus" class="cf-status" role="status"></div><div id="edOutput" class="cf-output"></div></div></div>'+
'<p class="cf-muted">Note: this first editor release is a browser-rendered single video timeline. Advanced multi-track keyframes and project recovery are not part of this no-save version.</p>';
addWorkspace('vmTool',montageHTML);addWorkspace('editorTool',editorHTML);
const activeWorkspace=()=>['montage','editor'].includes(location.hash.slice(1));
function routeV2(){
 const h=location.hash.replace('#','');
 if(h==='montage'||h==='editor'){
  document.body.classList.add('solo');document.body.dataset.tool=h;document.title=(h==='montage'?'Video Montage Maker':'Editor')+' – ClipForge Studio';
  window.scrollTo(0,0);
 }else if(h==='tools'||h===''){
  document.body.classList.remove('solo');document.body.dataset.tool='shorts';document.title='ClipForge Studio – Vexolune Technologies';
 }
}
addEventListener('hashchange',routeV2);routeV2();
/* Reusable in-memory timeline engine. Files and exports are never written to storage. */
function mountTimeline(prefix,mode){
 const el=id=>document.getElementById(prefix+id),state={clips:[],selected:0,music:null,busy:false,cancel:false,outUrl:null};
 const isEditor=mode==='editor';
 const ratio=()=>el('Ratio').value;
 const setStatus=t=>{el('Status').textContent=t||''};
 const duration=()=>state.clips.reduce((n,c)=>n+Math.max(.05,c.end-c.start),0);
 const fmt=t=>{t=Math.max(0,Math.floor(t||0));return Math.floor(t/60)+':'+String(t%60).padStart(2,'0')};
 const selected=()=>state.clips[state.selected]||null;
 const revoke=c=>{try{URL.revokeObjectURL(c.url)}catch(e){}};
 const render=()=>{
  const timeline=el('Timeline'),empty=el('Empty');timeline.innerHTML='';
  empty.style.display=state.clips.length?'none':'block';
  state.clips.forEach((c,i)=>{
   const d=document.createElement('div');d.className='cf-clip'+(i===state.selected?' active':'');
   d.innerHTML='<strong>'+esc(c.file.name)+'</strong><small>'+fmt(c.end-c.start)+' · '+c.width+'×'+c.height+'</small>';
   const actions=document.createElement('div');actions.className='cf-clip-actions';
   const btn=(label,fn)=>{const b=document.createElement('button');b.className='sm';b.textContent=label;b.onclick=fn;actions.append(b)};
   btn('Select',()=>{state.selected=i;render();loadPreview()});
   btn('↑',()=>move(i,-1));btn('↓',()=>move(i,1));btn('Remove',()=>remove(i));d.append(actions);timeline.append(d);
  });
  if(isEditor){el('Count').textContent=state.clips.length+' clips';el('Duration').textContent=fmt(duration());}
  else{el('Count').textContent=state.clips.length+' clips';el('Duration').textContent=state.clips.length?fmt(duration())+' total duration':'Add media to calculate duration'}
  const c=selected();
  if(isEditor){el('Start').value=c?c.start.toFixed(1):0;el('End').value=c?c.end.toFixed(1):0;el('Start').max=c?c.duration:0;el('End').max=c?c.duration:0;el('PreviewInfo').textContent=c?c.file.name+' · '+fmt(c.duration)+' source length':'Select a clip to inspect it.'}
 };
 function loadPreview(){
  const c=selected(),v=el('Preview');
  if(!c){v.removeAttribute('src');v.load();return}
  v.src=c.url;v.onloadedmetadata=()=>{v.currentTime=Math.min(c.start,Math.max(0,c.duration-.05))};
  v.onended=()=>{try{v.pause()}catch(e){}};
 }
 function move(i,dir){const j=i+dir;if(j<0||j>=state.clips.length)return;[state.clips[i],state.clips[j]]=[state.clips[j],state.clips[i]];state.selected=j;render();loadPreview()}
 function remove(i){const c=state.clips[i];if(c)revoke(c);state.clips.splice(i,1);state.selected=Math.max(0,Math.min(state.selected,state.clips.length-1));render();loadPreview()}
 async function addFiles(files){
  for(const file of Array.from(files||[])){
   if(!file.type.startsWith('video/'))continue;
   const url=URL.createObjectURL(file),v=document.createElement('video');v.preload='metadata';v.muted=true;v.src=url;
   try{await new Promise((res,rej)=>{v.onloadedmetadata=res;v.onerror=()=>rej(new Error('Could not read '+file.name))});
    if(!isFinite(v.duration)||v.duration<=0)throw new Error('Invalid video duration');
    state.clips.push({file,url,duration:v.duration,start:0,end:v.duration,width:v.videoWidth,height:v.videoHeight});
   }catch(e){URL.revokeObjectURL(url);setStatus(e.message)}
  }
  if(state.clips.length)state.selected=state.clips.length-1;
  render();loadPreview();setStatus(state.clips.length+' clips ready. Files remain in this browser session only.');
 }
 const input=el('Files');input.addEventListener('change',e=>{addFiles(e.target.files);e.target.value=''});
 if(isEditor){
  el('Apply').onclick=()=>{const c=selected();if(!c)return setStatus('Import and select a clip first.');
   const a=Math.max(0,Math.min(c.duration,Number(el('Start').value)||0)),b=Math.max(a+.1,Math.min(c.duration,Number(el('End').value)||c.duration));
   if(b<=a)return setStatus('End time must be after start time.');c.start=a;c.end=b;render();loadPreview();setStatus('Trim applied to '+c.file.name)};
  el('Split').onclick=()=>{const c=selected();if(!c)return setStatus('Select a clip to split.');
   const mid=c.start+(c.end-c.start)/2;if(mid-c.start<.15||c.end-mid<.15)return setStatus('Clip is too short to split.');
   const second={...c,start:mid};c.end=mid;state.clips.splice(state.selected+1,0,second);state.selected++;render();loadPreview();setStatus('Clip split into two editable timeline segments.')};
  el('Remove').onclick=()=>{if(!selected())return;remove(state.selected);setStatus('Selected clip removed.')};
  el('Clear').onclick=clear;
 }else{
  el('Clear').onclick=clear;
  el('PreviewBtn').onclick=()=>{const c=selected(),v=el('Preview');if(!c)return setStatus('Add a clip first.');v.currentTime=c.start;v.play().catch(()=>setStatus('Tap the preview player to start playback.'))};
 }
 function clear(){if(state.busy)return;state.clips.forEach(revoke);state.clips=[];state.selected=0;render();loadPreview();setStatus('Timeline cleared.');}
 const musicInput=el('Music');
 musicInput.addEventListener('change',e=>{const f=e.target.files[0];if(state.music)URL.revokeObjectURL(state.music);state.music=f?URL.createObjectURL(f):null;setStatus(f?'Music track ready.':'Music removed.');e.target.value=''});
 function dimensions(){
  const r=ratio(),long=isEditor?1080:1080;
  if(r==='9:16')return[720,1280];if(r==='1:1')return[1080,1080];return[1280,720];
 }
 const waitEvent=(target,event,timeout=15000)=>new Promise((res,rej)=>{let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);target.removeEventListener(event,finish);target.removeEventListener('error',bad);res()};const bad=()=>{if(done)return;done=true;clearTimeout(timer);rej(new Error('The selected video could not be decoded.'))};const timer=setTimeout(()=>{if(done)return;done=true;target.removeEventListener(event,finish);target.removeEventListener('error',bad);rej(new Error('Timed out while opening a video.'))},timeout);target.addEventListener(event,finish,{once:true});target.addEventListener('error',bad,{once:true})});
 function drawFrame(ctx,v,w,h,title,filter,alpha){
  ctx.save();ctx.globalAlpha=alpha==null?1:alpha;ctx.fillStyle='#05070d';ctx.fillRect(0,0,w,h);
  const vw=v.videoWidth||w,vh=v.videoHeight||h,scale=Math.max(w/vw,h/vh),dw=vw*scale,dh=vh*scale;
  ctx.filter=filter==='mono'?'grayscale(1)':filter==='warm'?'sepia(.28) saturate(1.2)':filter==='cinema'?'contrast(1.12) saturate(1.08)':'none';
  ctx.drawImage(v,(w-dw)/2,(h-dh)/2,dw,dh);ctx.filter='none';
  if(title){const size=Math.max(24,Math.round(w*.042)),y=h*.82;ctx.font='800 '+size+'px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.lineWidth=Math.max(4,size*.13);ctx.strokeStyle='rgba(0,0,0,.82)';ctx.fillStyle='#fff';const words=title.split(/\s+/);let lines=[],line='';for(const word of words){const test=line?line+' '+word:word;if(ctx.measureText(test).width>w*.84&&line){lines.push(line);line=word}else line=test}if(line)lines.push(line);lines.slice(0,3).forEach((t,i)=>{const yy=y+(i-(Math.min(3,lines.length)-1)/2)*size*1.2;ctx.strokeText(t,w/2,yy);ctx.fillText(t,w/2,yy)})}
  ctx.restore();
 }
 async function exportTimeline(){
  if(state.busy)return;if(!state.clips.length)return setStatus('Add at least one video clip first.');
  const clips=state.clips.slice();state.busy=true;state.cancel=false;
  const button=el('Export'),stop=el('Stop'),bar=el('Progress'),output=el('Output');button.disabled=true;stop.style.display='inline-block';output.innerHTML='';bar.style.width='0%';
  if(state.outUrl){URL.revokeObjectURL(state.outUrl);state.outUrl=null}
  let recorder=null,stream=null,video=null,audioCtx=null,musicEl=null,raf=0;
  try{
   const [w,h]=dimensions(),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{alpha:false});
   stream=canvas.captureStream(30);
   const mime=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(t=>window.MediaRecorder&&MediaRecorder.isTypeSupported(t));
   if(!mime)throw new Error('This browser cannot export video. Try the latest Chrome or Edge.');
   let audioDest=null,source=null;
   try{
    audioCtx=new(window.AudioContext||window.webkitAudioContext)();audioDest=audioCtx.createMediaStreamDestination();
    video=document.createElement('video');video.playsInline=true;video.preload='auto';video.muted=false;
    source=audioCtx.createMediaElementSource(video);source.connect(audioDest);source.connect(audioCtx.destination);
    if(state.music){musicEl=new Audio(state.music);musicEl.loop=true;musicEl.crossOrigin='anonymous';const ms=audioCtx.createMediaElementSource(musicEl);const gain=audioCtx.createGain();gain.gain.value=.32;ms.connect(gain);gain.connect(audioDest);await audioCtx.resume();musicEl.play().catch(()=>{});}
    audioDest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
   }catch(e){setStatus('Video audio will be omitted on this browser. Rendering video…')}
   recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:Math.min(12000000,w*h*8)});
   const chunks=[];recorder.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};
   const finished=new Promise((res,rej)=>{recorder.onstop=res;recorder.onerror=e=>rej(e.error||new Error('Recording failed'))});
   recorder.start(500);
   const total=clips.reduce((n,c)=>n+(c.end-c.start),0),transition=el('Transition')?el('Transition').value:'fade',title=el('Title')?el('Title').value.trim():'',filter=isEditor?el('Filter').value:'none';
   let elapsed=0;const fps=30;
   for(let i=0;i<clips.length;i++){
    if(state.cancel)throw new Error('Export stopped.');
    const c=clips[i];video.src=c.url;video.load();await waitEvent(video,'loadedmetadata');
    video.currentTime=Math.min(c.start,Math.max(0,c.duration-.05));await waitEvent(video,'seeked');
    await video.play();const start=performance.now(),clipDur=c.end-c.start;
    while(video.currentTime<c.end-.035&&!video.ended){
     if(state.cancel)throw new Error('Export stopped.');
     const p=Math.max(0,Math.min(1,(video.currentTime-c.start)/clipDur));
     drawFrame(ctx,video,w,h,title,filter,1);
     if(transition==='fade'&&(p<.045||p>.94)){const a=p<.045?1-p/.045:(p-.94)/.06;ctx.fillStyle='rgba(0,0,0,'+Math.max(0,Math.min(.85,a*.85))+')';ctx.fillRect(0,0,w,h)}
     const done=elapsed+Math.max(0,video.currentTime-c.start);bar.style.width=Math.min(99,done/total*100)+'%';el('Status').textContent='Rendering clip '+(i+1)+' of '+clips.length+' · '+fmt(done)+' / '+fmt(total);
     await new Promise(r=>{raf=requestAnimationFrame(r)});
     if(performance.now()-start>Math.max(clipDur*5000,clipDur*10000))throw new Error('Rendering is taking too long. Try shorter clips or lower resolution.');
    }
    video.pause();elapsed+=clipDur;
   }
   if(recorder.state!=='inactive')recorder.stop();await finished;
   const blob=new Blob(chunks,{type:mime.split(';')[0]});if(blob.size<2000)throw new Error('The exported video is empty. Please try again.');
   state.outUrl=URL.createObjectURL(blob);const ext=mime.includes('mp4')?'mp4':'webm';
   output.innerHTML='<video controls playsinline src="'+state.outUrl+'"></video><div class="cf-row" style="margin-top:10px"><a class="sm p" style="text-decoration:none;padding:10px 14px" download="clipforge-'+mode+'-'+Date.now()+'.'+ext+'" href="'+state.outUrl+'">Download '+ext.toUpperCase()+'</a><span class="cf-muted">'+(blob.size/1048576).toFixed(1)+' MB</span></div>';
   bar.style.width='100%';setStatus('Export complete. Your file is ready to download. This session will not be saved.');
  }catch(e){if(recorder&&recorder.state!=='inactive'){try{recorder.stop()}catch(x){}}setStatus(e.message||'Export failed.');}
  finally{
   cancelAnimationFrame(raf);if(video){video.pause();video.removeAttribute('src');video.load()}
   if(musicEl){musicEl.pause();musicEl.removeAttribute('src')}
   if(stream)stream.getTracks().forEach(t=>t.stop());if(audioCtx)audioCtx.close().catch(()=>{});
   state.busy=false;button.disabled=false;stop.style.display='none';
  }
 }
 el('Export').onclick=exportTimeline;el('Stop').onclick=()=>{state.cancel=true;setStatus('Stopping export…')};
 render();loadPreview();
 window.addEventListener('beforeunload',()=>{state.clips.forEach(revoke);if(state.music)URL.revokeObjectURL(state.music);if(state.outUrl)URL.revokeObjectURL(state.outUrl)});
}
mountTimeline('vm','montage');mountTimeline('ed','editor');
/* Clear temporary output URLs when navigating away from the tool page. */
addEventListener('hashchange',()=>{if(!activeWorkspace()){$$('.cf-output video').forEach(v=>{v.pause();v.removeAttribute('src')})}});
})();