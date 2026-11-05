(function(){
'use strict';
const $=id=>document.getElementById(id);
const root=$('highlightsTool');if(!root||root.dataset.ready==='1')return;root.dataset.ready='1';
const el={file:$('hsVideo'),video:$('hsSourcePreview'),videoInfo:$('hsVideoInfo'),duration:$('hsDuration'),ratio:$('hsRatio'),mood:$('hsMood'),music:$('hsMusic'),musicInfo:$('hsMusicInfo'),sfx:$('hsSfx'),generate:$('hsGenerate'),stop:$('hsStop'),progress:$('hsProgress'),status:$('hsStatus'),empty:$('hsEmpty'),plan:$('hsPlan'),count:$('hsCount'),planDuration:$('hsPlanDuration'),output:$('hsOutput')};
const state={file:null,url:null,music:null,clips:[],cancel:false,busy:false,controller:null,outputUrl:null};
const say=t=>{el.status.textContent=t||''};
const progress=n=>{el.progress.style.width=Math.max(0,Math.min(100,n))+'%'};
const fmt=t=>{t=Math.max(0,Math.floor(Number(t)||0));return Math.floor(t/60)+':'+String(t%60).padStart(2,'0')};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function setBusy(on){state.busy=on;el.generate.disabled=on;el.stop.style.display=on?'inline-block':'none';el.file.disabled=on;el.duration.disabled=on;el.ratio.disabled=on;el.mood.disabled=on;el.music.disabled=on;el.sfx.disabled=on}
el.file.addEventListener('change',()=>{
 const f=el.file.files&&el.file.files[0];if(!f)return;
 if(state.url)URL.revokeObjectURL(state.url);if(state.outputUrl){URL.revokeObjectURL(state.outputUrl);state.outputUrl=null}
 state.file=f;state.url=URL.createObjectURL(f);el.video.src=state.url;el.video.style.display='block';
 el.video.onloadedmetadata=()=>{el.videoInfo.textContent=f.name+' · '+fmt(el.video.duration)+' · '+(f.size/1048576).toFixed(1)+' MB';say('Video ready. Choose your final duration and generate. ');};
 state.clips=[];el.plan.innerHTML='';el.empty.style.display='block';el.count.textContent='0 scenes';el.planDuration.textContent='No highlight plan yet';el.output.innerHTML='';
});
el.music.addEventListener('change',()=>{state.music=el.music.files&&el.music.files[0]||null;el.musicInfo.textContent=state.music?'Using '+state.music.name+' instead of generated mood music.':'No uploaded track. The selected mood will be used.';});
function to16k(buffer){
 const n=buffer.length,ch=buffer.numberOfChannels,sr=buffer.sampleRate,outN=Math.floor(n*16000/sr),out=new Float32Array(outN);
 const channels=[];for(let c=0;c<ch;c++)channels.push(buffer.getChannelData(c));
 for(let i=0;i<outN;i++){const a=Math.floor(i*sr/16000),b=Math.min(n,Math.max(a+1,Math.floor((i+1)*sr/16000)));let sum=0;for(let j=a;j<b;j++){let x=0;for(let c=0;c<ch;c++)x+=channels[c][j]/ch;sum+=x}out[i]=sum/(b-a)}
 return out;
}
function wavBase64(pcm){
 const bytes=new Uint8Array(44+pcm.length*2),v=new DataView(bytes.buffer),put=(o,s)=>{for(let i=0;i<s.length;i++)bytes[o+i]=s.charCodeAt(i)};
 put(0,'RIFF');v.setUint32(4,36+pcm.length*2,true);put(8,'WAVE');put(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,16000,true);v.setUint32(28,32000,true);v.setUint16(32,2,true);v.setUint16(34,16,true);put(36,'data');v.setUint32(40,pcm.length*2,true);
 for(let i=0;i<pcm.length;i++){const x=Math.max(-1,Math.min(1,pcm[i]));v.setInt16(44+i*2,x<0?x*32768:x*32767,true)}
 let bin='';for(let i=0;i<bytes.length;i+=0x8000)bin+=String.fromCharCode.apply(null,bytes.subarray(i,Math.min(bytes.length,i+0x8000)));return btoa(bin);
}
async function transcribeBlock(pcm,offset){
 const r=await fetch('/api/v1/shorts/transcribe',{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({audio:wavBase64(pcm)}),signal:state.controller.signal});
 const raw=await r.text();let data;try{data=JSON.parse(raw)}catch(e){throw new Error('Speech service returned an unreadable response ('+r.status+').')}
 if(!r.ok)throw new Error(data.error||('Speech transcription failed ('+r.status+').'));
 const rows=Array.isArray(data.segments)?data.segments:[];
 return rows.map(q=>({start:offset+Math.max(0,Number(q.start)||0),end:offset+Math.max(0,Number(q.end)||0),text:String(q.text||'').trim()})).filter(q=>q.text&&q.end>q.start);
}
async function extractTranscript(file,duration){
 say('Opening audio track…');progress(3);
 const mb=await import('https://cdn.jsdelivr.net/npm/mediabunny@1.62.1/+esm');
 if(state.cancel)throw new Error('Stopped.');
 const input=new mb.Input({formats:mb.ALL_FORMATS,source:new mb.BlobSource(file)}),track=await input.getPrimaryAudioTrack();
 if(!track)throw new Error('No audio track was found in this video.');
 if(!await track.canDecode())throw new Error('This video audio format cannot be decoded in this browser.');
 const blockSize=30*16000;
 async function* audioChunks(){
  const sink=new mb.AudioSampleSink(track),parts=[];
  let length=0,offset=0;
  function take(count){
   const pcm=new Float32Array(count);let p=0,remain=count;
   while(remain>0&&parts.length){
    const head=parts[0],n=Math.min(remain,head.length);
    pcm.set(head.subarray(0,n),p);p+=n;remain-=n;
    if(n===head.length)parts.shift();else parts[0]=head.subarray(n);
   }
   length-=count;
   const item={pcm,offset,seconds:count/16000};
   offset+=item.seconds;
   return item;
  }
  for await(const sample of sink.samples()){
   if(state.cancel||state.controller.signal.aborted)throw new Error('Stopped.');
   try{
    const pcm=to16k(sample.toAudioBuffer());let p=0;
    while(p<pcm.length){
     const amount=Math.min(blockSize-length,pcm.length-p);
     parts.push(pcm.subarray(p,p+amount));length+=amount;p+=amount;
     if(length>=blockSize)yield take(blockSize);
    }
   }finally{try{sample.close()}catch(e){}}
  }
  if(length)yield take(length);
 }
 let transcribedSeconds=0;
 const batches=await window.ClipForgeAudioQueue.orderedMap(audioChunks(),
  chunk=>transcribeBlock(chunk.pcm,chunk.offset),{
   concurrency:2,signal:state.controller.signal,
   onComplete({item}){
    transcribedSeconds+=item.seconds;
    say('Transcribing source audio · '+Math.min(duration,transcribedSeconds).toFixed(0)+' / '+Math.round(duration)+' seconds');
    progress(5+Math.min(65,transcribedSeconds/Math.max(1,duration)*65));
   },
   onError(){try{state.controller.abort()}catch(e){}}
  });
 const transcript=batches.flat().sort((a,b)=>a.start-b.start);
 if(!transcript.length)throw new Error('No clear dialogue was detected. This version needs audible dialogue to guide AI scene selection.');
 if(transcript.length>2500)throw new Error('This video contains more than 2,500 transcript segments for one AI pass. Try a shorter source or a section.');
 return transcript;
}
function renderPlan(){
 el.plan.innerHTML='';el.empty.style.display=state.clips.length?'none':'block';
 state.clips.forEach((c,i)=>{
  const row=document.createElement('div');row.className='cf-clip';
  row.innerHTML='<strong>Scene '+(i+1)+' · '+esc(c.category||'Highlight')+'</strong><small>'+fmt(c.start)+' – '+fmt(c.end)+' · '+(c.end-c.start).toFixed(1)+'s · Score '+c.score+'</small><small>'+esc(c.reason||'AI-selected moment')+'</small>';
  el.plan.append(row);
 });
 const total=state.clips.reduce((n,c)=>n+c.end-c.start,0);
 el.count.textContent=state.clips.length+' scenes';el.planDuration.textContent=fmt(total)+' total · requested '+fmt(Number(el.duration.value));
}
async function requestPlan(duration,segments){
 say('AI is selecting the strongest short scenes…');progress(76);
 const r=await fetch('/api/v1/highlights/plan',{method:'POST',headers:{'content-type':'application/json','accept':'application/json'},body:JSON.stringify({duration,targetDuration:Number(el.duration.value),language:'auto',segments}),signal:state.controller.signal});
 const raw=await r.text();let data;try{data=JSON.parse(raw)}catch(e){throw new Error('AI highlight service returned an unreadable response ('+r.status+').')}
 if(!r.ok)throw new Error(data.error||('AI highlight selection failed ('+r.status+').'));
 if(!Array.isArray(data.clips)||!data.clips.length)throw new Error('AI did not return any usable highlight scenes.');
 return data;
}
function waitFor(target,event,timeout=20000){return new Promise((resolve,reject)=>{let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);target.removeEventListener(event,finish);target.removeEventListener('error',bad);resolve()};const bad=()=>{if(done)return;done=true;clearTimeout(timer);reject(new Error('The source video could not be decoded.'))};const timer=setTimeout(()=>{if(done)return;done=true;target.removeEventListener(event,finish);target.removeEventListener('error',bad);reject(new Error('Timed out while opening a selected scene.'))},timeout);target.addEventListener(event,finish,{once:true});target.addEventListener('error',bad,{once:true})})}
function dimensions(){const r=el.ratio.value;if(r==='16:9')return[1280,720];if(r==='1:1')return[1080,1080];return[720,1280]}
function addGeneratedMusic(ctx,dest,mood){
 if(mood==='none')return()=>{};
 const master=ctx.createGain();master.gain.value=.16;master.connect(dest);
 const settings={cinematic:[110,164.81,220],emotional:[130.81,164.81,196],dramatic:[73.42,110,146.83],funny:[261.63,329.63,392],action:[55,82.41,110],suspense:[65.41,77.78,98]};
 const notes=settings[mood]||settings.cinematic,oscs=[];
 notes.forEach((hz,i)=>{const o=ctx.createOscillator(),g=ctx.createGain(),f=ctx.createBiquadFilter();o.type=i===0?'triangle':'sine';o.frequency.value=hz;f.type='lowpass';f.frequency.value=mood==='action'?900:480;g.gain.value=i===0?.45:.18;o.connect(f);f.connect(g);g.connect(master);o.start();oscs.push(o)});
 const lfo=ctx.createOscillator(),lg=ctx.createGain();lfo.frequency.value=.12;lg.gain.value=.025;lfo.connect(lg);lg.connect(master.gain);lfo.start();return()=>{oscs.forEach(o=>{try{o.stop()}catch(e){}});try{lfo.stop()}catch(e){};master.disconnect()};
}
function createSfx(ctx,dest,kind){
 if(kind==='off')return()=>{};
 const noise=ctx.createBuffer(1,Math.floor(ctx.sampleRate*.8),ctx.sampleRate),d=noise.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
 return function(at){
  const t=at||ctx.currentTime;
  const src=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();src.buffer=noise;filter.type='bandpass';filter.frequency.setValueAtTime(500,t);filter.frequency.exponentialRampToValueAtTime(5200,t+.22);filter.Q.value=.7;gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(.16,t+.035);gain.gain.exponentialRampToValueAtTime(.0001,t+.32);src.connect(filter);filter.connect(gain);gain.connect(dest);src.start(t);src.stop(t+.34);
  if(kind==='whoosh-impact'){const osc=ctx.createOscillator(),og=ctx.createGain();osc.type='sine';osc.frequency.setValueAtTime(95,t+.16);osc.frequency.exponentialRampToValueAtTime(42,t+.42);og.gain.setValueAtTime(.0001,t+.16);og.gain.exponentialRampToValueAtTime(.22,t+.19);og.gain.exponentialRampToValueAtTime(.0001,t+.48);osc.connect(og);og.connect(dest);osc.start(t+.16);osc.stop(t+.5)}
 };
}
async function exportMontage(){
 if(!state.clips.length)throw new Error('Generate a highlight plan first.');
 if(!window.MediaRecorder||!HTMLCanvasElement.prototype.captureStream)throw new Error('This browser cannot export video. Try the latest Chrome or Edge.');
 const [w,h]=dimensions(),canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{alpha:false}),stream=canvas.captureStream(30);
 const mime=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(x=>MediaRecorder.isTypeSupported(x));
 if(!mime)throw new Error('This browser does not provide a supported MP4/WebM recorder.');
 const audioCtx=new(window.AudioContext||window.webkitAudioContext)(),audioDest=audioCtx.createMediaStreamDestination();
 // A disconnected destination creates a silent track without audio clock data.
 // On Chromium this can make a 5s canvas recording mux as ~1.67s of video.
 // Do not add an audio track when the user selected no music or sound effects.
 const hasAudio=!!state.music||el.mood.value!=='none'||el.sfx.value!=='off';
 let silentClock=null;
 if(hasAudio){
  // Keep a zero-level audio source running so effects-only recordings retain
  // correct timestamps even during silent gaps. This source is inaudible.
  if(typeof audioCtx.createConstantSource==='function'){
   silentClock=audioCtx.createConstantSource();silentClock.offset.value=0;
   silentClock.connect(audioDest);
  }else{
   const oscillator=audioCtx.createOscillator(),gain=audioCtx.createGain();
   gain.gain.value=0;oscillator.connect(gain);gain.connect(audioDest);
   silentClock=oscillator;
  }
  silentClock.start();
  audioDest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));
 }
 let musicEl=null,musicUrl=null,musicSource=null,musicGain=null,stopSynth=()=>{},recorder=null,raf=0,sourceVideo=document.createElement('video'),chunks=[];
 sourceVideo.muted=true;sourceVideo.playsInline=true;sourceVideo.preload='auto';sourceVideo.src=state.url;sourceVideo.load();if(sourceVideo.readyState<1)await waitFor(sourceVideo,'loadedmetadata');
 let sfx=createSfx(audioCtx,audioDest,el.sfx.value);
 try{
  await audioCtx.resume();
  if(state.music){
   musicUrl=URL.createObjectURL(state.music);musicEl=new Audio(musicUrl);musicEl.loop=true;musicEl.preload='auto';musicSource=audioCtx.createMediaElementSource(musicEl);musicGain=audioCtx.createGain();musicGain.gain.value=.82;musicSource.connect(musicGain);musicGain.connect(audioDest);await musicEl.play();
  }else stopSynth=addGeneratedMusic(audioCtx,audioDest,el.mood.value);
  const recorderOptions={mimeType:mime,videoBitsPerSecond:Math.min(12000000,w*h*8),audioBitsPerSecond:192000};recorder=new MediaRecorder(stream,recorderOptions);
  const finished=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=e=>reject(e.error||new Error('Video recording failed.'))});
  recorder.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};recorder.start(500);
  let elapsed=0,total=state.clips.reduce((n,c)=>n+c.end-c.start,0);
  for(let i=0;i<state.clips.length;i++){
   if(state.cancel)throw new Error('Stopped.');
   const c=state.clips[i];const start=Math.max(0,Math.min(sourceVideo.duration-.05,c.start));
   if(Math.abs(sourceVideo.currentTime-start)>.04){const seek=waitFor(sourceVideo,'seeked');sourceVideo.currentTime=start;await seek}
   if(i>0&&el.sfx.value!=='off')sfx(audioCtx.currentTime);
   await sourceVideo.play();
   while(sourceVideo.currentTime<c.end-.04&&!sourceVideo.ended){
    if(state.cancel)throw new Error('Stopped.');
    const vw=sourceVideo.videoWidth||w,vh=sourceVideo.videoHeight||h,scale=Math.max(w/vw,h/vh),dw=vw*scale,dh=vh*scale;
    ctx.fillStyle='#05070d';ctx.fillRect(0,0,w,h);ctx.drawImage(sourceVideo,(w-dw)/2,(h-dh)/2,dw,dh);
    const local=Math.max(0,sourceVideo.currentTime-c.start),len=c.end-c.start;
    if(local<.12){ctx.fillStyle='rgba(0,0,0,'+Math.max(0,1-local/.12)*.35+')';ctx.fillRect(0,0,w,h)}
    const done=elapsed+local;progress(80+done/Math.max(1,total)*19);say('Rendering highlights · scene '+(i+1)+' / '+state.clips.length+' · '+fmt(done)+' / '+fmt(total));
    await new Promise(resolve=>{raf=requestAnimationFrame(resolve)});
   }
   sourceVideo.pause();elapsed+=c.end-c.start;
  }
  if(recorder.state!=='inactive')recorder.stop();await finished;
  const blob=new Blob(chunks,{type:mime.split(';')[0]});if(blob.size<2000)throw new Error('The exported video was empty.');
  if(state.outputUrl)URL.revokeObjectURL(state.outputUrl);state.outputUrl=URL.createObjectURL(blob);
  const ext=mime.includes('mp4')?'mp4':'webm';
  el.output.innerHTML='<video controls playsinline src="'+state.outputUrl+'"></video><div class="cf-row" style="margin-top:10px"><a class="sm p" style="text-decoration:none;padding:10px 14px" download="clipforge-highlights-'+Date.now()+'.'+ext+'" href="'+state.outputUrl+'">Download '+ext.toUpperCase()+'</a><span class="cf-muted">'+(blob.size/1048576).toFixed(1)+' MB</span></div>';
  progress(100);say('Highlights ready. Original video audio was muted; selected music and sound effects were mixed into the export.');
 }finally{
  cancelAnimationFrame(raf);sourceVideo.pause();sourceVideo.removeAttribute('src');sourceVideo.load();
  if(recorder&&recorder.state!=='inactive'){try{recorder.stop()}catch(e){}}
  if(musicEl){musicEl.pause();musicEl.removeAttribute('src')}if(musicUrl)URL.revokeObjectURL(musicUrl);
  stopSynth();if(silentClock){try{silentClock.stop()}catch(e){}try{silentClock.disconnect()}catch(e){}}stream.getTracks().forEach(t=>t.stop());audioCtx.close().catch(()=>{});
 }
}
el.generate.addEventListener('click',async()=>{
 if(state.busy)return;if(!state.file)return say('Choose a source video first.');
 const target=Number(el.duration.value);if(!Number.isFinite(target)||target<5||target>300)return say('Choose an output duration between 5 and 300 seconds.');
 state.cancel=false;state.controller=new AbortController();setBusy(true);progress(0);el.output.innerHTML='';
 try{
  const v=el.video,duration=await new Promise((resolve,reject)=>{if(Number.isFinite(v.duration)&&v.duration>0)return resolve(v.duration);v.onloadedmetadata=()=>resolve(v.duration);v.onerror=()=>reject(new Error('Could not read the source video.'))});
  if(duration>21600)throw new Error('The current AI service accepts source videos up to 6 hours per analysis.');
  const segments=await extractTranscript(state.file,duration);if(state.cancel)throw new Error('Stopped.');
  const data=await requestPlan(duration,segments);state.clips=data.clips.map(c=>({start:c.start,end:c.end,score:c.score,category:c.category,reason:c.reason}));
  renderPlan();progress(80);
  if(!data.complete)say('AI found '+fmt(data.actualDuration)+' of the requested '+fmt(target)+'. You can still render this shorter result.');
  else say(state.clips.length+' highlight scenes selected. Preparing final montage…');
  await exportMontage();
 }catch(e){if(e.name==='AbortError'||e.message==='Stopped.')say('Stopped.');else say(e.message||'Highlights generation failed.');}
 finally{state.controller=null;setBusy(false)}
});
el.stop.addEventListener('click',()=>{state.cancel=true;try{state.controller&&state.controller.abort()}catch(e){}say('Stopping…')});
window.addEventListener('beforeunload',()=>{if(state.url)URL.revokeObjectURL(state.url);if(state.outputUrl)URL.revokeObjectURL(state.outputUrl)});
})();