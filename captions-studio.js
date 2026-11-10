/* Isolated Captions Studio add-on; existing Shorts engine remains untouched. */
(function(){
'use strict';
const ST=window.ClipForgeCaptionStyles.list;
const STUDIO=window.ClipForgeStudioCaptions;
const STUDIO_LIST=[...ST,...STUDIO.presets];
const BROWSER_GROUPS=window.ClipForgeCaptionStyles.groups;
const STUDIO_GROUPS=[...BROWSER_GROUPS.filter(g=>g.id!=="all"),
 {id:"motion-fx",label:"Animated",ids:STUDIO.presets.filter(p=>p[0].startsWith("motion-")).map(p=>p[0])},
 {id:"studio-pro",label:"Professional",ids:STUDIO.presets.filter(p=>p[0].startsWith("pro-")).map(p=>p[0])},
 {id:"all",label:"All styles",ids:STUDIO_LIST.map(p=>p[0])}];
const isStudioHost=host=>host?.id==="cfCapTemplateGrid";
const catalogFor=host=>isStudioHost(host)?STUDIO_LIST:ST;
const groupsFor=host=>isStudioHost(host)?STUDIO_GROUPS:BROWSER_GROUPS;
const SAMPLE={english:'THIS CHANGES EVERYTHING',urdu:'یہ کہانی بدل گئی',hindi:'ये कहानी बदल गई'};
const $=id=>document.getElementById(id),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let file=null,video=null,cues=[],sourceCues=[],style='creator-yellow',busy=false,stop=false,outUrl=null,activeOutput=null,activeInput=null;
let placement=STUDIO.defaultPlacement(),animationFrame=0;
let look=STUDIO.defaultLook(),past=[],future=[],refreshStyles=()=>{};
function draw(ctx,text,key,w,h,t=0,d=2){window.ClipForgeCaptionStyles.draw(ctx,text,key,w,h,t,d)}
function studioDraw(ctx,text,key,w,h,t=0,d=2,p=null){return STUDIO.draw(ctx,text,key,w,h,t,d,p,look)}
/* Keep all 41 style buttons, but paint sample canvases only near the viewport. */
const previewObservers=new WeakMap();

function styleBrowser(host){
 if(host.parentElement?.classList.contains("cf-style-browser"))return;
 const wrapper=document.createElement("section");
 wrapper.className="cf-style-browser";
 wrapper.setAttribute("aria-label","Caption style gallery");
 const top=document.createElement("div");
 top.className="cf-style-header";
 top.innerHTML='<div><strong>Style Gallery</strong><small>Each style appears in one category only</small></div><span class="cf-style-selected" aria-live="polite"></span>';
 const categories=document.createElement("div");
 categories.className="cf-style-categories";
 categories.setAttribute("role","group");
 categories.setAttribute("aria-label","Caption categories");
 groupsFor(host).forEach(group=>{
  const button=document.createElement("button");button.type="button";
  button.className="cf-style-category";button.dataset.cfCategory=group.id;
  button.textContent=group.label;
  button.setAttribute("aria-pressed",String(group.id==="trending"));
  button.onclick=()=>{
   host.dataset.cfStyleCategory=group.id;
   wrapper.querySelector(".cf-style-search").value="";
   host.dataset.cfStyleSearch="";
   applyStyleFilter(host);
   host.scrollTop=0;
  };
  categories.append(button);
 });
 const search=document.createElement("input");
 search.type="search";search.className="cf-style-search";search.placeholder="Search caption styles…";
 search.setAttribute("aria-label","Search caption styles");
 search.oninput=()=>{
  host.dataset.cfStyleSearch=search.value.trim().toLowerCase();
  if(host.dataset.cfStyleSearch)host.dataset.cfStyleCategory="all";
  applyStyleFilter(host);host.scrollTop=0;
 };
 const status=document.createElement("div");status.className="cf-style-status";
 status.setAttribute("aria-live","polite");
 host.dataset.cfStyleCategory="trending";host.dataset.cfStyleSearch="";
 const parent=host.parentNode;
 parent.insertBefore(wrapper,host);
 wrapper.append(top,categories,search,host,status);
 host.tabIndex=0;
 host.setAttribute("aria-label","Scrollable caption style choices");
}
function applyStyleFilter(host){
 if(!host)return;
 const wrapper=host.closest(".cf-style-browser");
 if(!wrapper)return;
 const category=host.dataset.cfStyleCategory||"trending";
 const query=host.dataset.cfStyleSearch||"";
 const selected=host.dataset.cfSelectedStyle||"creator-yellow";
 const allGroups=groupsFor(host),group=allGroups.find(x=>x.id===category)||allGroups[0];
 let count=0;
 host.querySelectorAll(".cf-cap-template").forEach(button=>{
  const key=button.dataset.cfPreviewStyle;
  const label=button.dataset.cfPreviewLabel||"";
  const visible=group.ids.includes(key)&&(!query||label.includes(query)||key.includes(query));
  button.hidden=!visible;
  if(visible)count++;
 });
 wrapper.querySelectorAll(".cf-style-category").forEach(button=>{
  button.setAttribute("aria-pressed",String(button.dataset.cfCategory===category));
 });
 const chosen=catalogFor(host).find(x=>x[0]===selected);
 wrapper.querySelector(".cf-style-selected").textContent="Selected: "+(chosen?chosen[1]:selected);
 wrapper.querySelector(".cf-style-status").textContent=count+" of "+catalogFor(host).length+" styles · Scroll to browse";
}

function grid(host,lang,selected,pick,force=false){
 if(!host)return;
 styleBrowser(host);
 const catalog=catalogFor(host);
 host.dataset.cfSelectedStyle=selected;
 if(!force&&host.dataset.cfPreviewLang===lang&&host.children.length===catalog.length){
  Array.from(host.children).forEach(button=>{
   button.classList.toggle('is-selected',button.dataset.cfPreviewStyle===selected);
   button.setAttribute('aria-pressed',String(button.dataset.cfPreviewStyle===selected));
   button.onclick=()=>pick(button.dataset.cfPreviewStyle);
  });
  applyStyleFilter(host);
  return;
 }
 const previous=previewObservers.get(host);if(previous)previous.disconnect();
 host.textContent='';host.dataset.cfPreviewLang=lang;
 const fragment=document.createDocumentFragment();
 const paint=canvas=>{
  if(canvas.dataset.cfPainted==='1')return;
  if(isStudioHost(host))studioDraw(canvas.getContext('2d'),SAMPLE[lang]||SAMPLE.english,canvas.dataset.cfPreviewStyle,180,108,1,2);
  else draw(canvas.getContext('2d'),SAMPLE[lang]||SAMPLE.english,canvas.dataset.cfPreviewStyle,180,108);
  canvas.dataset.cfPainted='1';
 };
 const observer=typeof IntersectionObserver==='function'
  ?new IntersectionObserver(entries=>{
    entries.forEach(entry=>{if(entry.isIntersecting){paint(entry.target);observer.unobserve(entry.target)}});
   },{rootMargin:'96px 0px'}):null;
 if(observer)previewObservers.set(host,observer);
 catalog.forEach(([key,label])=>{
  const button=document.createElement('button');
  button.type='button';button.className='cf-cap-template'+(key===selected?' is-selected':'');
  button.dataset.cfPreviewStyle=key;
  button.dataset.cfPreviewLabel=label.toLowerCase();
  button.setAttribute('aria-pressed',String(key===selected));
  const canvas=document.createElement('canvas');canvas.width=180;canvas.height=108;
  canvas.dataset.cfPreviewStyle=key;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#171b25';ctx.fillRect(0,0,180,108);
  const title=document.createElement('span');title.textContent=label;
  button.append(canvas,title);button.onclick=()=>pick(key);fragment.append(button);
 });
 host.append(fragment);
 applyStyleFilter(host);
 host.querySelectorAll('canvas').forEach(canvas=>{if(observer)observer.observe(canvas);else if(!canvas.closest('button').hidden)paint(canvas)});
}
function shortLang(){const b=document.querySelector('#autobox [data-k="lang"].on');return b&&b.dataset.v!=='auto'?b.dataset.v:'english'}
function ensureShortStyleButtons(){
 const row=document.querySelector('#stylebox .row');if(!row)return;
 ST.forEach(([key,label])=>{if(document.querySelector('#stylebox [data-k="cs"][data-v="'+key+'"]'))return;
  const b=document.createElement('button');b.type='button';b.className='chip';b.dataset.k='cs';b.dataset.v=key;b.textContent=label;row.append(b);
 });
}
function shortGrid(force=false){const host=$('cfShortTemplateGrid');if(!host)return;const b=document.querySelector('#stylebox [data-k="cs"].on'),sel=b?b.dataset.v:'classic';grid(host,shortLang(),sel,k=>{const chip=document.querySelector('#stylebox [data-k="cs"][data-v="'+k+'"]');if(chip)chip.click();shortGrid()},force)}
function workspace(){if($('cfCaptionsWorkspace'))return;const s=document.createElement('section');s.id='cfCaptionsWorkspace';s.className='cf-workspace';s.style.display='none';s.innerHTML='<a class="cf-back" href="#tools">← All creative tools</a><div class="cf-page-head"><div><div class="cf-kicker">CLIPFORGE / CAPTIONS</div><h2>Captions Studio</h2><p>Upload a full video, transcribe dialogue, choose a caption style and export.</p></div></div><div class="cf-cap-layout"><div class="cf-panel"><div class="cf-field"><label>UPLOAD FULL VIDEO</label><input id="cfCapFile" type="file" accept="video/*"></div><div class="cf-cap-video-wrap"><video id="cfCapVideo" class="cf-preview" controls playsinline></video><canvas id="cfCapLive" aria-hidden="true"></canvas><div id="cfCapMoveHandle" class="cf-cap-move-handle" role="button" tabindex="0" aria-label="Drag to move captions. Arrow keys move the caption position."></div></div><div class="cf-cap-placement" aria-label="Caption placement and text size"><div class="cf-cap-place-heading"><strong>Caption position &amp; size</strong><button class="sm" type="button" id="cfCapResetPlace">Reset</button></div><p class="cf-muted">Drag the caption directly on the video with your finger or mouse. Use sliders for precise adjustments. The exported MP4 keeps the same position and size.</p><div class="cf-cap-place-control"><label for="cfCapSize">Text size</label><output id="cfCapSizeValue" for="cfCapSize">100%</output><input type="range" id="cfCapSize" min="60" max="150" step="5" value="100"></div><div class="cf-cap-place-control"><label for="cfCapPosX">Horizontal</label><output id="cfCapPosXValue" for="cfCapPosX">50%</output><input type="range" id="cfCapPosX" min="0" max="100" step="1" value="50"></div><div class="cf-cap-place-control"><label for="cfCapPosY">Vertical</label><output id="cfCapPosYValue" for="cfCapPosY">77%</output><input type="range" id="cfCapPosY" min="0" max="100" step="1" value="77"></div></div> <div class="cf-cap-edit-toolbar" aria-label="Edit history"> <button class="sm" type="button" id="cfCapUndo" disabled title="Undo last captions edit">↶ Undo</button> <button class="sm" type="button" id="cfCapRedo" disabled title="Redo captions edit">↷ Redo</button> <span class="cf-muted">Up to 40 styling, movement, and text changes</span> </div> <details class="cf-cap-feature" open> <summary>Text styling · Fonts, colors &amp; outline</summary> <div class="cf-cap-feature-body"> <div class="cf-cap-feature-grid"> <label>Font <select id="cfCapFont"><option value="auto">Template default</option><option value="arial">Arial</option><option value="georgia">Georgia</option><option value="impact">Impact</option><option value="mono">Courier New</option><option value="nastaliq">Urdu Nastaliq</option><option value="naskh">Urdu Naskh</option><option value="devanagari">Hindi Devanagari</option></select> </label> <label>Text color <span class="cf-cap-color-row"><input type="color" id="cfCapColor" value="#ffffff" aria-label="Caption text color"><label class="cf-cap-inline-check"><input type="checkbox" id="cfCapCustomColor"> Use</label></span> </label> <label>Outline color <input type="color" id="cfCapOutlineColor" value="#050505" aria-label="Caption outline color"> </label> <label>Outline width <output id="cfCapOutlineValue">0</output> <input type="range" id="cfCapOutline" min="0" max="12" value="0"> </label> <label>Shadow strength <output id="cfCapShadowValue">0</output> <input type="range" id="cfCapShadow" min="0" max="30" value="0"> </label> <label>Background opacity <output id="cfCapBackgroundValue">0%</output> <input type="range" id="cfCapBackground" min="0" max="85" value="0"> </label> <label>Letter spacing <output id="cfCapTrackingValue">0 px</output> <input type="range" id="cfCapTracking" min="-2" max="8" value="0"> </label> </div> <div class="cf-cap-feature-action"><button type="button" class="sm" id="cfCapResetLook">Reset styling &amp; animation</button></div> </div> </details> <details class="cf-cap-feature"> <summary>Animation controls · Effect, duration &amp; speed</summary> <div class="cf-cap-feature-body"> <div class="cf-cap-feature-grid"> <label>Animation effect <select id="cfCapEffect"><option value="template">Template original</option><option value="fade">Fade in</option><option value="slide">Slide up</option><option value="bounce">Bounce in</option><option value="typewriter">Typewriter reveal</option></select> </label> <label>Animation duration <output id="cfCapDurationValue">0.6s</output> <input type="range" id="cfCapDuration" min="0.2" max="2" step="0.1" value="0.6"> </label> <label>Animation speed <output id="cfCapSpeedValue">1.0×</output> <input type="range" id="cfCapSpeed" min="0.5" max="2" step="0.1" value="1"> </label> </div> <p class="cf-muted">Effects are applied to the selected template. Play or seek the video to preview their entrance.</p> </div> </details> <details class="cf-cap-feature"> <summary>Safe area · TikTok, Reels &amp; Shorts</summary> <div class="cf-cap-feature-body"> <label class="cf-cap-inline-check"><input type="checkbox" id="cfCapSafe"> Show safe-area guide on preview</label> <label>Platform <select id="cfCapPlatform"><option value="reels">Instagram Reels</option><option value="tiktok">TikTok</option><option value="shorts">YouTube Shorts</option></select> </label> <p class="cf-muted">Guides help avoid app buttons. The guide is never burned into the MP4. Preview positioning is approximate and may differ by device.</p> </div> </details> <div class="cf-row cf-cap-controls"><label>Speech language</label><select id="cfCapLang"><option value="english">English</option><option value="urdu">Urdu</option><option value="hindi">Hindi</option></select></div><div class="cf-row cf-cap-controls"><label>Caption length</label><select id="cfCapDensity"><option value="3">Short · 2–3 words</option><option value="5" selected>Balanced · 4–5 words</option><option value="7">Long · 6–7 words</option></select></div><button class="main" id="cfCapTranscribe" disabled>Transcribe full video</button><p class="cf-muted" id="cfCapStatus">Choose a video to begin. Audio is sent in short chunks to Cloudflare Workers AI.</p><div class="cf-cap-progress"><i id="cfCapProgress"></i></div><div class="cf-field"><label>REVIEW / EDIT CAPTIONS · ONE CAPTION PER LINE</label><textarea id="cfCapText" rows="9" disabled placeholder="Transcribed captions appear here."></textarea></div><div class="cf-row"><button class="sm" id="cfCapSrt" disabled>Download SRT</button><button class="sm" id="cfCapVtt" disabled>Download VTT</button></div></div><div class="cf-panel"><div class="cf-kicker">CAPTION STYLE LIBRARY</div><p class="cf-muted">Choose from trending looks, animated reveals and professional broadcast templates. Preview and exported MP4 share the same rendering. Word highlights are approximate unless transcription provides word-level timing.</p><div id="cfCapTemplateGrid" class="cf-cap-template-grid"></div><div class="cf-field"><label>EXPORT QUALITY</label><select id="cfCapQuality"><option value="720">720p · faster</option><option value="1080" selected>1080p · recommended</option></select></div><button class="main" id="cfCapExport" disabled>Export captioned video</button><div id="cfCapOutput" class="cf-output"></div><button class="sm" id="cfCapStop" disabled>Stop export</button></div></div>';(document.querySelector('.wrap')||document.body).insertBefore(s,$('tool')||null)}
function status(t){$('cfCapStatus').textContent=t}
function enabled(){const ready=!!cues.length;$('cfCapFile').disabled=busy;$('cfCapQuality').disabled=busy;$('cfCapLang').disabled=busy;$('cfCapDensity').disabled=busy;$('cfCapTranscribe').disabled=!file||busy;$('cfCapExport').disabled=!file||!ready||busy;$('cfCapText').disabled=!ready||busy;$('cfCapSrt').disabled=!ready||busy;$('cfCapVtt').disabled=!ready||busy;$('cfCapStop').disabled=!busy;const gridHost=$('cfCapTemplateGrid');if(gridHost)gridHost.querySelectorAll('button').forEach(b=>b.disabled=busy);['cfCapSize','cfCapPosX','cfCapPosY','cfCapResetPlace','cfCapResetLook','cfCapFont',
'cfCapColor','cfCapCustomColor','cfCapOutlineColor','cfCapOutline','cfCapShadow',
'cfCapBackground','cfCapTracking','cfCapEffect','cfCapDuration','cfCapSpeed','cfCapSafe','cfCapPlatform'
].forEach(id=>{if($(id))$(id).disabled=busy});updateHistoryButtons()}
function wav(pcm){const b=new Uint8Array(44+pcm.length*2),v=new DataView(b.buffer),put=(o,s)=>{for(let i=0;i<s.length;i++)b[o+i]=s.charCodeAt(i)};put(0,'RIFF');v.setUint32(4,36+pcm.length*2,true);put(8,'WAVE');put(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);put(36,'data');v.setUint32(40,pcm.length*2,true);for(let i=0;i<pcm.length;i++){let x=Math.max(-1,Math.min(1,pcm[i]));v.setInt16(44+i*2,x<0?x*32768:x*32767,true)}let z='';for(let i=0;i<b.length;i+=32768)z+=String.fromCharCode.apply(null,b.subarray(i,Math.min(b.length,i+32768)));return btoa(z)}
function mono(buf,start,end){const sr=buf.sampleRate,a=Array.from({length:buf.numberOfChannels},(_,i)=>buf.getChannelData(i)),from=Math.floor(start*sr),to=Math.min(buf.length,Math.ceil(end*sr)),step=sr/16000,n=Math.floor((to-from)/step),o=new Float32Array(n);for(let i=0;i<n;i++){let p=from+i*step,j=Math.floor(p),f=p-j,v=0;for(const ch of a)v+=(ch[j]||0)+((ch[Math.min(to-1,j+1)]||0)-(ch[j]||0))*f; o[i]=v/a.length}return o}
function normalizeWords(words,segment){
 const out=[];
 (Array.isArray(words)?words:[]).forEach(w=>{
  const text=String(w.word||w.text||'').trim(),s=Number(w.s??w.start),e=Number(w.e??w.end);
  if(!text||!Number.isFinite(s)||!Number.isFinite(e)||e<=s)return;
  if(/^[,.;:!?؟۔،؛]+$/.test(text)&&out.length){
   out[out.length-1].text+=text;out[out.length-1].e=Math.max(out[out.length-1].e,e);
  }else out.push({s:Math.max(segment.s,s),e:Math.min(segment.e,e),text});
 });
 return out.filter(w=>w.e>w.s);
}
function splitIntoGroups(tokens,maxWords){
 const phrases=[],phrase=[];
 tokens.forEach(token=>{
  phrase.push(token);
  if(/[.!?؟۔]+$/.test(token.text||''))phrases.push(phrase.splice(0));
 });
 if(phrase.length)phrases.push(phrase.splice(0));
 const groups=[];
 phrases.forEach(words=>{
  const count=Math.ceil(words.length/maxWords),base=Math.floor(words.length/count),extra=words.length%count;
  let cursor=0;
  for(let i=0;i<count;i++){
   const size=base+(i<extra?1:0);
   groups.push(words.slice(cursor,cursor+size));cursor+=size;
  }
 });
 return groups.filter(group=>group.length);
}
function splitCue(cue,maxWords){
 const timed=normalizeWords(cue.words,cue);
 const tokens=timed.length?timed:String(cue.text||'').trim().split(/\s+/).filter(Boolean).map(text=>({text}));
 if(!tokens.length)return [];
 const groups=splitIntoGroups(tokens,maxWords);
 if(timed.length){
  return groups.map(group=>({
   s:Math.max(cue.s,group[0].s),
   e:Math.min(cue.e,group[group.length-1].e),
   text:group.map(w=>w.text).join(' ').replace(/\s+([,.;:!?؟۔،؛])/g,'$1')
  })).filter(q=>q.text&&q.e>q.s);
 }
 const weights=groups.map(group=>group.reduce((sum,w)=>{
  const plain=w.text.replace(/[^\p{L}\p{N}]/gu,'');
  const punctuation=/[.!?؟۔]+$/.test(w.text)?0.55:/[,،;:؛]+$/.test(w.text)?0.25:0;
  return sum+Math.max(1,[...plain].length)+punctuation;
 },0));
 const total=weights.reduce((a,b)=>a+b,0)||groups.length,duration=Math.max(.05,cue.e-cue.s);
 let elapsed=0;
 return groups.map((group,index)=>{
  const s=cue.s+duration*(elapsed/total);elapsed+=weights[index];
  const e=index===groups.length-1?cue.e:cue.s+duration*(elapsed/total);
  return {s,e,text:group.map(w=>w.text).join(' ').replace(/\s+([,.;:!?؟۔،؛])/g,'$1'),estimatedTiming:true};
 }).filter(q=>q.text&&q.e>q.s);
}
function segmentTranscript(segments){
 const maxWords=Math.max(3,Math.min(7,Number($('cfCapDensity').value)||5));
 return segments.flatMap(segment=>splitCue(segment,maxWords)).sort((a,b)=>a.s-b.s);
}
function renderCaptionLines(){ $('cfCapText').value=cues.map(q=>q.text).join('\n');enabled() }
async function transcribe(){
 if(!file||busy)return;stop=false;busy=true;enabled();cues=[];sourceCues=[];$('cfCapProgress').style.width='0%';
 try{status('Decoding audio…');const C=window.AudioContext||window.webkitAudioContext;if(!C)throw Error('Audio decoding is not supported by this browser.');const ac=new C();let buf;try{buf=await ac.decodeAudioData(await file.arrayBuffer())}finally{ac.close().catch(()=>{})}
  const duration=buf.duration,total=Math.ceil(duration/25),result=[];
  for(let i=0;i<total;i++){if(stop)throw Error('Stopped');const start=i*25,end=Math.min(duration,(i+1)*25),pcm=mono(buf,start,end);status('Transcribing audio · '+(i+1)+'/'+total+' parts…');const r=await fetch('/api/v1/shorts/transcribe',{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({audio:wav(pcm),language:{english:'en',urdu:'ur',hindi:'hi'}[$('cfCapLang').value]})});const raw=await r.text();let d;try{d=JSON.parse(raw)}catch{throw Error('Speech service returned an invalid response ('+r.status+').')}if(!r.ok)throw Error(d.error||'Transcription failed ('+r.status+').');(d.segments||[]).forEach(q=>{let s=Number(q.start)+start,e=Number(q.end)+start;if(q.text&&e>s){const words=(Array.isArray(q.words)?q.words:[]).map(word=>({s:Number(word.start)+start,e:Number(word.end)+start,text:String(word.word||word.text||'').trim()})).filter(word=>word.text&&Number.isFinite(word.s)&&Number.isFinite(word.e)&&word.e>word.s);result.push({s,e,text:String(q.text).trim(),words})}});if(!(d.segments||[]).length&&d.text)result.push({s:start,e,text:d.text,words:[]});$('cfCapProgress').style.width=((i+1)/total*100)+'%'}
  sourceCues=result.sort((a,b)=>a.s-b.s);if(!sourceCues.length)throw Error('No speech was detected.');cues=segmentTranscript(sourceCues);clearHistory();if(!cues.length)throw Error('Could not create caption segments from this transcript.');renderCaptionLines();
  const timed=sourceCues.filter(q=>q.words&&q.words.length).length;
  status('Transcription complete · '+cues.length+' short captions. '+(timed+' of '+sourceCues.length+' speech segments include word-level timing.')+' Review the text before export.');
 }catch(e){status('Could not transcribe: '+e.message)}finally{busy=false;enabled()}
}
function sync(){const lines=$('cfCapText').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),old=cues.slice();cues=lines.map((text,i)=>old[i]?{...old[i],text}:{s:old.length?old[old.length-1].e:0,e:(old.length?old[old.length-1].e:0)+2,text});enabled()}
function stamp(t,dot){let n=Math.round(Math.max(0,t)*1000),h=Math.floor(n/3600000),m=Math.floor(n%3600000/60000),s=Math.floor(n%60000/1000),ms=n%1000;return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')+(dot?'.':',')+String(ms).padStart(3,'0')}
function download(name,type,text){const u=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1200)}
function subs(vtt){sync();const text=vtt?'WEBVTT\n\n'+cues.map(q=>stamp(q.s,true)+' --> '+stamp(q.e,true)+'\n'+q.text).join('\n\n'):cues.map((q,i)=>(i+1)+'\n'+stamp(q.s,false)+' --> '+stamp(q.e,false)+'\n'+q.text).join('\n\n');download((file.name||'captions').replace(/\.[^.]+$/,'')+(vtt?'.vtt':'.srt'),vtt?'text/vtt':'application/x-subrip',text)}
function paint(ctx,w,h){if(!video.videoWidth)return;let sc=Math.max(w/video.videoWidth,h/video.videoHeight),dw=video.videoWidth*sc,dh=video.videoHeight*sc;ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);ctx.drawImage(video,(w-dw)/2,(h-dh)/2,dw,dh);let q=cues.find(x=>video.currentTime>=x.s&&video.currentTime<=x.e);if(q)studioDraw(ctx,q.text,style,w,h,video.currentTime-q.s,Math.max(.2,q.e-q.s),placement)}
async function exportVideo(){
 sync();
 if(!file||!cues.length||busy)return;
 busy=true;stop=false;enabled();
 const quality=Number($('cfCapQuality').value),baseName=(file.name||'video').replace(/\.[^.]+$/,'');
 const outputName=baseName+'-captioned.mp4';
 const estimatedBytes=Math.max(0,Number(video.duration)||0)*(quality===1080?6500000:3500000)/8*1.15;
 let pickerPromise=null,saveHandle=null,writable=null,input=null,output=null,target=null;
 const outputBox=$('cfCapOutput');
 outputBox.innerHTML='<p class="cf-muted" id="cfExportState">Preparing offline export…</p><div class="cf-cap-export-progress"><i id="cfExportBar"></i></div>';
 const setExport=(message,percent)=>{
  const label=$('cfExportState'),bar=$('cfExportBar');
  if(label)label.textContent=message;
  if(bar)bar.style.width=Math.max(0,Math.min(100,percent))+'%';
 };
 try{
  // Large outputs stream directly to a user-selected file instead of filling browser memory.
  if(estimatedBytes>90*1024*1024&&typeof window.showSaveFilePicker==='function'){
   status('Choose where to save the large MP4…');
   pickerPromise=window.showSaveFilePicker({
    suggestedName:outputName,
    types:[{description:'MP4 video',accept:{'video/mp4':['.mp4']}}]
   });
  }else if(estimatedBytes>100*1024*1024){
   throw Error('This export is too large for this browser’s in-memory download. Open ClipForge in the latest Chrome or Edge to save large videos directly to disk.');
  }
  if(pickerPromise){
   saveHandle=await pickerPromise;
   if(stop)throw Error('Stopped');
   writable=await saveHandle.createWritable();
  }
  setExport('Loading the offline video engine…',1);
  status('Loading offline video decoder and encoder…');
  const mb=await import('https://cdn.jsdelivr.net/npm/mediabunny@1.62.1/+esm');
  if(stop)throw Error('Stopped');
  if(!await mb.canEncode('avc'))throw Error('This browser cannot encode H.264 MP4 video. Please use the latest Chrome or Edge.');
  if(!await mb.canEncode('aac'))throw Error('This browser cannot encode AAC audio for MP4. Please use the latest Chrome or Edge.');
  input=new mb.Input({formats:mb.ALL_FORMATS,source:new mb.BlobSource(file)});
  activeInput=input;
  const videoTrack=await input.getPrimaryVideoTrack();
  if(!videoTrack)throw Error('No video track was found in this file.');
  if(!await videoTrack.canDecode())throw Error('This video codec cannot be decoded by this browser.');
  const audioTrack=await input.getPrimaryAudioTrack();
  if(audioTrack&&!await audioTrack.canDecode())throw Error('The original audio track cannot be decoded by this browser.');
  const baseTime=await input.getFirstTimestamp([videoTrack]);
  const sourceWidth=await videoTrack.getDisplayWidth(),sourceHeight=await videoTrack.getDisplayHeight();
  const ratio=(sourceWidth>0&&sourceHeight>0)?sourceWidth/sourceHeight:(video.videoWidth/video.videoHeight);
  if(!ratio||!Number.isFinite(ratio))throw Error('Could not read the uploaded video dimensions.');
  const width=Math.max(2,Math.round((quality*ratio)/2)*2),height=quality;
  const duration=Math.max(Number(video.duration)||0,(await videoTrack.computeDuration())-baseTime);
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');
  if(!ctx)throw Error('Canvas rendering is unavailable.');
  const videoSource=new mb.VideoSampleSource({
   codec:'avc',
   quality:new mb.Quality({bitrate:quality===1080?6500000:3500000})
  });
  const audioSource=audioTrack?new mb.AudioSampleSource({
   codec:'aac',
   quality:new mb.Quality({bitrate:128000})
  }):null;
  target=writable?new mb.StreamTarget(writable):new mb.BufferTarget();
  output=new mb.Output({format:new mb.Mp4OutputFormat(),target});
  activeOutput=output;
  output.addVideoTrack(videoSource);
  if(audioSource)output.addAudioTrack(audioSource);
  await output.start();
  setExport('Decoding and rendering video frames offline…',2);
  status('Rendering captions offline. The source video does not need to play.');
  const renderCues=cues.slice().sort((a,b)=>a.s-b.s);
  let cueIndex=0,frameCount=0,lastUi=0,lastPercent=2;
  const videoSink=new mb.VideoSampleSink(videoTrack);
  const audioSink=audioTrack?new mb.AudioSampleSink(audioTrack):null;
  const pumpVideo=async()=>{
   for await(const frame of videoSink.samples()){
    if(stop){frame.close();throw Error('Stopped')}
    const relativeTime=frame.timestamp-baseTime;
    if(relativeTime+frame.duration<=0){frame.close();continue}
    ctx.fillStyle='#000';ctx.fillRect(0,0,width,height);
    const sw=frame.displayWidth||sourceWidth,sh=frame.displayHeight||sourceHeight;
    const scale=Math.max(width/sw,height/sh),dw=sw*scale,dh=sh*scale;
    frame.draw(ctx,(width-dw)/2,(height-dh)/2,dw,dh);
    while(cueIndex<renderCues.length&&renderCues[cueIndex].e<relativeTime)cueIndex++;
    const activeCue=renderCues[cueIndex];
    if(activeCue&&relativeTime>=activeCue.s&&relativeTime<=activeCue.e){
     studioDraw(ctx,activeCue.text,style,width,height,relativeTime-activeCue.s,Math.max(.2,activeCue.e-activeCue.s),placement);
    }
    const timestamp=Math.max(0,relativeTime),frameDuration=Math.max(.001,frame.duration||1/30);
    const renderedFrame=new mb.VideoSample(canvas,{timestamp,duration:frameDuration});
    try{await videoSource.add(renderedFrame)}finally{renderedFrame.close();frame.close()}
    frameCount++;
    const now=Date.now();
    if(now-lastUi>250){
     const percent=duration>0?Math.max(2,Math.min(97,(timestamp+frameDuration)/duration*97)):lastPercent;
     lastPercent=percent;lastUi=now;
     setExport('Rendering video frames · '+Math.round(percent)+'%',percent);
    }
   }
   videoSource.close();
   if(!frameCount)throw Error('No video frames could be decoded from this file.');
  };
  const pumpAudio=async()=>{
   if(!audioSink)return;
   for await(const rawSample of audioSink.samples()){
    if(stop){rawSample.close();throw Error('Stopped')}
    let sample=rawSample;
    const sampleEnd=sample.timestamp+sample.duration;
    if(sampleEnd<=baseTime){sample.close();continue}
    if(sample.timestamp<baseTime){
     const trimFrames=Math.min(sample.numberOfFrames,Math.max(0,Math.ceil((baseTime-sample.timestamp)*sample.sampleRate)));
     if(trimFrames>=sample.numberOfFrames){sample.close();continue}
     sample=sample.trim(trimFrames);
     rawSample.close();
    }
    sample.setTimestamp(Math.max(0,sample.timestamp-baseTime));
    try{await audioSource.add(sample)}finally{sample.close()}
   }
   audioSource.close();
  };
  const tasks=[pumpVideo()];
  if(audioSource)tasks.push(pumpAudio());
  await Promise.all(tasks.map(task=>task.catch(error=>{try{if(input&&!input.disposed)input.dispose()}catch(_){}throw error})));
  if(stop)throw Error('Stopped');
  setExport('Finalizing MP4…',98);
  await output.finalize();
  setExport('Preparing your finished video…',100);
  let blob;
  if(saveHandle){
   blob=await saveHandle.getFile();
  }else{
   if(!target.buffer)throw Error('The MP4 encoder did not return a finished file.');
   blob=new Blob([target.buffer],{type:'video/mp4'});
  }
  if(blob.size<1500)throw Error('The MP4 export is empty. Please try again.');
  if(outUrl)URL.revokeObjectURL(outUrl);
  outUrl=URL.createObjectURL(blob);
  outputBox.innerHTML='<p class="cf-muted">Your captioned MP4 is ready · '+(blob.size/1048576).toFixed(1)+' MB</p><video class="cf-cap-output-video" controls playsinline src="'+outUrl+'"></video><a class="sm p" style="display:inline-block;margin-top:10px" href="'+outUrl+'" download="'+esc(outputName)+'">Download captioned video</a>';
  status(saveHandle?'Export complete. The MP4 was saved to your selected location.':'Export complete. Preview the finished video below, then download it.');
 }catch(error){
  if(error&&error.name==='AbortError'){
   setExport('Export cancelled.',0);status('Export cancelled.');
  }else if(stop||error.message==='Stopped'){
   setExport('Export stopped.',0);status('Export stopped. You can start a new export when ready.');
  }else{
   setExport('Export failed: '+(error.message||error),0);status('Export failed: '+(error.message||error));
  }
 }finally{
  try{if(output&&output.state!=='finalized'&&output.state!=='canceled')await output.cancel()}catch(_){}
  try{if(input&&!input.disposed)input.dispose()}catch(_){}
  try{if(writable&&!output)await writable.abort()}catch(_){}
  activeInput=null;activeOutput=null;busy=false;enabled();
 }
}
/* Captions Studio edit history: bounded snapshots, no storage or changes to other tools. */
const editLimit=40,controlSnapshots=new WeakMap();
function captureEdit(){
 return {style,placement:{...placement},look:{...look},text:$('cfCapText')?.value||""};
}
function updateHistoryButtons(){
 if($('cfCapUndo'))$('cfCapUndo').disabled=busy||!past.length;
 if($('cfCapRedo'))$('cfCapRedo').disabled=busy||!future.length;
}
function recordEdit(before){
 if(!before||JSON.stringify(before)===JSON.stringify(captureEdit()))return;
 past.push(before);if(past.length>editLimit)past.shift();
 future.length=0;updateHistoryButtons();
}
function clearHistory(){past=[];future=[];updateHistoryButtons()}
function restoreEdit(state){
 if(!state||busy)return;
 style=state.style;placement=STUDIO.normalisePlacement(state.placement);
 look=STUDIO.normaliseLook(state.look);
 if($('cfCapText')){$('cfCapText').value=state.text;sync()}
 syncPlacementControls();syncLookControls();refreshStyles();livePreview();
 updateHistoryButtons();
}
function travelHistory(direction){
 if(busy)return;
 const from=direction==="undo"?past:future,to=direction==="undo"?future:past;
 if(!from.length)return;
 const current=captureEdit(),previous=from.pop();
 to.push(current);restoreEdit(previous);
}
function syncLookControls(){
 const pairs={
  cfCapFont:look.font,cfCapColor:look.color,cfCapCustomColor:look.customColor,
  cfCapOutlineColor:look.outlineColor,cfCapOutline:look.outline,
  cfCapShadow:look.shadow,cfCapBackground:look.background,cfCapTracking:look.tracking,
  cfCapEffect:look.effect,cfCapDuration:look.duration,
  cfCapSpeed:look.speed,cfCapSafe:look.safe,cfCapPlatform:look.platform
 };
 for(const [id,v] of Object.entries(pairs)){
  const el=$(id);if(!el)continue;
  if(el.type==="checkbox")el.checked=!!v;else el.value=String(v);
 }
 for(const [id,label] of Object.entries({
  cfCapOutlineValue:String(look.outline),
  cfCapShadowValue:String(look.shadow),
  cfCapBackgroundValue:look.background+"%",
  cfCapTrackingValue:look.tracking+" px",
  cfCapDurationValue:look.duration.toFixed(1)+"s",
  cfCapSpeedValue:look.speed.toFixed(1)+"×"
 })){if($(id))$(id).textContent=label}
}
function watchEditorInput(el){
 if(!el)return;
 const capture=()=>{if(!busy&&!controlSnapshots.has(el))controlSnapshots.set(el,captureEdit())};
 const finish=()=>{const before=controlSnapshots.get(el);controlSnapshots.delete(el);recordEdit(before)};
 el.addEventListener("pointerdown",capture);
 el.addEventListener("focus",capture);
 el.addEventListener("change",finish);
 el.addEventListener("blur",finish);
}
function videoBox(){
 if(!video)return null;
 const rect=video.getBoundingClientRect();
 if(!rect.width||!rect.height)return null;
 const aspect=video.videoWidth>0&&video.videoHeight>0?video.videoWidth/video.videoHeight:rect.width/rect.height;
 if(!aspect||!Number.isFinite(aspect))return null;
 const w=Math.min(rect.width,rect.height*aspect),h=w/aspect;
 return {x:(rect.width-w)/2,y:(rect.height-h)/2,w,h};
}
function constrainPlacement(){
 const box=videoBox();if(!box)return;
 const active=cues.find(q=>video.currentTime>=q.s&&video.currentTime<=q.e);
 const text=active?active.text:(SAMPLE[$('cfCapLang').value]||SAMPLE.english);
 const safe=STUDIO.safePlacement(placement,text,style,box.w,box.h);
 placement.x=safe.x;placement.y=safe.y;
}
function syncPlacementControls(){
 const pairs=[['cfCapSize',Math.round(placement.size*100)],['cfCapPosX',Math.round(placement.x*100)],['cfCapPosY',Math.round(placement.y*100)]];
 pairs.forEach(([id,n])=>{if($(id))$(id).value=String(n);const value=$(id+'Value');if(value)value.textContent=n+'%'});
}
function livePreview(){
 const canvas=$('cfCapLive'),box=videoBox();
 if(!canvas||!box)return;
 const rect=video.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);
 canvas.width=Math.max(1,Math.round(rect.width*dpr));
 canvas.height=Math.max(1,Math.round(rect.height*dpr));
 const ctx=canvas.getContext('2d');if(!ctx)return;
 ctx.setTransform(dpr,0,0,dpr,0,0);
 ctx.save();ctx.translate(box.x,box.y);
 ctx.beginPath();ctx.rect(0,0,box.w,box.h);ctx.clip();
 const active=cues.find(q=>video.currentTime>=q.s&&video.currentTime<=q.e);
 const text=active?active.text:(SAMPLE[$('cfCapLang').value]||SAMPLE.english);
 const actual=studioDraw(ctx,text,style,box.w,box.h,active?video.currentTime-active.s:1,
  active?Math.max(.2,active.e-active.s):2,placement);
 if(look.safe)STUDIO.drawSafeGuide(ctx,box.w,box.h,look.platform);
 ctx.restore();
 const handle=$('cfCapMoveHandle');
 if(handle&&actual){
  handle.style.left=(box.x+box.w*actual.x)+'px';
  handle.style.top=(box.y+box.h*actual.y)+'px';
  handle.style.width=Math.min(box.w*.94,Math.max(70,box.w*actual.widthRatio))+'px';
  handle.style.height=Math.min(box.h*.68,Math.max(38,box.h*actual.heightRatio))+'px';
  handle.setAttribute('aria-label','Drag captions: '+Math.round(actual.x*100)+'% across, '+Math.round(actual.y*100)+'% down. Arrow keys adjust position.');
 }
}
function animatePreview(){
 animationFrame=0;
 if(!video||video.paused||video.ended)return;
 livePreview();
 animationFrame=requestAnimationFrame(animatePreview);
}
function init(){
 workspace();video=$('cfCapVideo');
 syncPlacementControls();syncLookControls();
 if(document.fonts){Promise.all([document.fonts.load('700 48px "Noto Nastaliq Urdu"','اردو کیپشن'),document.fonts.load('700 48px "Noto Sans Devanagari"','हिन्दी')]).then(()=>{if(activeRoute()==='captions')refresh(true);if(['shorts','trailer'].includes(activeRoute())&&$('cfShortTemplateGrid')?.children.length)shortGrid(true)}).catch(()=>{})}
 $('cfCapFile').onchange=e=>{file=e.target.files[0]||null;stop=false;cues=[];sourceCues=[];placement=STUDIO.defaultPlacement();look=STUDIO.defaultLook();syncPlacementControls();syncLookControls();clearHistory();$('cfCapText').value='';$('cfCapOutput').innerHTML='';if(video.src)URL.revokeObjectURL(video.src);if(file){video.src=URL.createObjectURL(file);video.load();status(file.name+' selected.');livePreview()}else{video.removeAttribute('src');status('Choose a video to begin.')}enabled()};
 $('cfCapTranscribe').onclick=transcribe;$('cfCapLang').onchange=()=>{refresh();livePreview()};$('cfCapDensity').onchange=()=>{if(!sourceCues.length)return;cues=segmentTranscript(sourceCues);clearHistory();renderCaptionLines();status('Caption length updated · '+cues.length+' captions.');livePreview()};video.addEventListener('timeupdate',livePreview);
 video.addEventListener('loadedmetadata',livePreview);
 video.addEventListener('seeked',livePreview);
 video.addEventListener('play',()=>{if(!animationFrame)animationFrame=requestAnimationFrame(animatePreview)});
 video.addEventListener('pause',()=>{if(animationFrame)cancelAnimationFrame(animationFrame);animationFrame=0;livePreview()});
 video.addEventListener('ended',()=>{if(animationFrame)cancelAnimationFrame(animationFrame);animationFrame=0;livePreview()});
 window.addEventListener('resize',livePreview);
 const controlSize=$('cfCapSize'),controlX=$('cfCapPosX'),controlY=$('cfCapPosY');
 controlSize.oninput=()=>{placement.size=Number(controlSize.value)/100;constrainPlacement();syncPlacementControls();livePreview()};
 controlX.oninput=()=>{placement.x=Number(controlX.value)/100;constrainPlacement();syncPlacementControls();livePreview()};
 controlY.oninput=()=>{placement.y=Number(controlY.value)/100;constrainPlacement();syncPlacementControls();livePreview()};
 $('cfCapResetPlace').onclick=()=>{const before=captureEdit();placement=STUDIO.defaultPlacement();syncPlacementControls();livePreview();recordEdit(before)};
 const moveHandle=$('cfCapMoveHandle');let drag=null;
 moveHandle.addEventListener('pointerdown',e=>{
  if(busy||!videoBox())return;
  e.preventDefault();moveHandle.setPointerCapture(e.pointerId);
  drag={id:e.pointerId,clientX:e.clientX,clientY:e.clientY,x:placement.x,y:placement.y,before:captureEdit()};
  moveHandle.classList.add('is-dragging');
 });
 moveHandle.addEventListener('pointermove',e=>{
  if(!drag||drag.id!==e.pointerId)return;
  const box=videoBox();if(!box)return;
  placement.x=Math.max(0,Math.min(1,drag.x+(e.clientX-drag.clientX)/box.w));
  placement.y=Math.max(0,Math.min(1,drag.y+(e.clientY-drag.clientY)/box.h));
  constrainPlacement();syncPlacementControls();livePreview();
 });
 const endDrag=e=>{if(drag&&drag.id===e.pointerId){const before=drag.before;drag=null;recordEdit(before);moveHandle.classList.remove('is-dragging');if(moveHandle.hasPointerCapture(e.pointerId))moveHandle.releasePointerCapture(e.pointerId)}};
 moveHandle.addEventListener('pointerup',endDrag);
 moveHandle.addEventListener('pointercancel',endDrag);
 moveHandle.addEventListener('keydown',e=>{
  if(busy)return;
  const before=captureEdit(),step=e.shiftKey?.05:.015;
  if(e.key==='ArrowLeft')placement.x-=step;
  else if(e.key==='ArrowRight')placement.x+=step;
  else if(e.key==='ArrowUp')placement.y-=step;
  else if(e.key==='ArrowDown')placement.y+=step;
  else return;
  e.preventDefault();
  placement=STUDIO.normalisePlacement(placement);
  constrainPlacement();syncPlacementControls();livePreview();recordEdit(before);
 });
 // Appearance and motion settings are Studio-only, never written into Shorts.
 const settings=[
  ["cfCapFont","font"],["cfCapColor","color"],["cfCapCustomColor","customColor"],
  ["cfCapOutlineColor","outlineColor"],["cfCapOutline","outline"],
  ["cfCapShadow","shadow"],["cfCapBackground","background"],
  ["cfCapTracking","tracking"],["cfCapEffect","effect"],
  ["cfCapSpeed","speed"],["cfCapDuration","duration"],
  ["cfCapSafe","safe"],["cfCapPlatform","platform"]
 ];
 settings.forEach(([id,key])=>{
  const el=$(id);if(!el)return;
  const update=()=>{
   if(busy)return;
   const value=el.type==="checkbox"?el.checked:
    el.type==="range"?Number(el.value):el.value;
   look=STUDIO.normaliseLook({...look,[key]:value,
    ...(key==="color"?{customColor:true}:{})});
   syncLookControls();livePreview();
  };
  el.addEventListener(el.tagName==="SELECT"||el.type==="checkbox"?"change":"input",update);
  watchEditorInput(el);
 });
 [controlSize,controlX,controlY,$("cfCapText")].forEach(watchEditorInput);
 $("cfCapUndo").onclick=()=>travelHistory("undo");
 $("cfCapRedo").onclick=()=>travelHistory("redo");
 $("cfCapResetLook").onclick=()=>{
  if(busy)return;
  const before=captureEdit();
  const {safe,platform}=look;look={...STUDIO.defaultLook(),safe,platform};
  syncLookControls();livePreview();recordEdit(before);
 };
 $('cfCapText').oninput=()=>{sync();livePreview()};$('cfCapSrt').onclick=()=>subs(false);$('cfCapVtt').onclick=()=>subs(true);$('cfCapExport').onclick=exportVideo;$('cfCapStop').onclick=()=>{stop=true;try{if(activeInput&&!activeInput.disposed)activeInput.dispose()}catch(e){}try{if(activeOutput&&activeOutput.state!=='finalized'&&activeOutput.state!=='canceled')activeOutput.cancel().catch(()=>{})}catch(e){}};
 function refresh(force=false){grid($('cfCapTemplateGrid'),$('cfCapLang').value,style,k=>{const before=captureEdit();style=k;refresh();livePreview();recordEdit(before)},force)}
 refreshStyles=()=>refresh();
 function activeRoute(){return window.ClipForgeNavigation?.current?.()||'top'}
 function activatePreviews(){
  const route=activeRoute();
  if(route==='captions')refresh();
  if((route==='shorts'||route==='trailer')&&!$('stylebox')?.classList.contains('hide'))shortGrid();
 }
 window.addEventListener('hashchange',activatePreviews);
 enabled();
 function syncShortsCaptionPanels(){
  const chosen=document.querySelector('#soBox [data-k="cap"].on');
  const mode=chosen?chosen.dataset.v:'off';
  const trimSpeech=!!document.querySelector('#soBox [data-k="tr"][data-v="speech"].on');
  const fileBox=$('capbox'),autoBox=$('autobox'),styleBox=$('stylebox'),note=$('capnote');
  if(fileBox)fileBox.classList.toggle('hide',mode!=='file');
  if(autoBox)autoBox.classList.toggle('hide',mode!=='auto'&&!trimSpeech);
  if(styleBox)styleBox.classList.toggle('hide',mode==='off');
  if(note)note.classList.toggle('hide',mode!=='auto'&&!trimSpeech);
  if(mode!=='off'&&['shorts','trailer'].includes(activeRoute()))shortGrid();
 }
 document.addEventListener('click',e=>{
  if(e.target.closest('#soBox [data-k="cap"]'))syncShortsCaptionPanels();
  if(e.target.closest('#stylebox [data-k="cs"]')){shortGrid();livePreview()}
  if(e.target.closest('#autobox [data-k="lang"]'))setTimeout(shortGrid,0);
 });
 ensureShortStyleButtons();syncShortsCaptionPanels();activatePreviews();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();