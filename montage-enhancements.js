/* Video Montage enhancements only. Captions Studio, Shorts, Editor and Studio V2 stay unchanged. */
(()=>{'use strict';
 const $=id=>document.getElementById(id);
 const M={api:null,initialized:false,playing:false,switching:false,clipIndex:0,token:0,signature:'',
  audio:null,scoreContext:null,scoreTimer:null,scorePump:null,soundMode:null,generated:null,
  generationController:null,captionVersion:0};
 const clipLength=c=>Math.max(.05,c.end-c.start);
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const clock=t=>{t=Math.max(0,Math.floor(Number(t)||0));return Math.floor(t/60)+':'+String(t%60).padStart(2,'0')};
 const clips=()=>M.api?.state.clips||[];
 const total=()=>clips().reduce((sum,c)=>sum+clipLength(c),0);
 const signature=()=>clips().map(c=>c.url+'|'+c.start+'|'+c.end).join(';');
 const offsetOf=index=>clips().slice(0,index).reduce((n,c)=>n+clipLength(c),0);
 const v=()=>$('vmPreview');
 const progress=()=>clamp(offsetOf(M.clipIndex)+Math.max(0,(Number(v().currentTime)||0)-(clips()[M.clipIndex]?.start||0)),0,total());
 function updateControls(position){
  const t=clamp(position??progress(),0,total()),seek=$('vmCombinedSeek');
  seek.max=Math.max(.05,total());seek.disabled=!clips().length;
  seek.value=t;$('vmCombinedTime').textContent=clock(t)+' / '+clock(total());
  $('vmCombinedPlay').textContent=M.playing?'❚❚ Pause montage':'▶ Play full montage';
  $('vmCombinedPlay').disabled=!clips().length;
  $('vmPreviewBtn').disabled=!clips().length;
  const shade=$('vmTransitionShade');
  const c=clips()[M.clipIndex];
  if(shade){
   let opacity=0;
   if(c&&$('vmTransition').value==='fade'){
    const p=clamp(((Number(v().currentTime)||c.start)-c.start)/clipLength(c),0,1);
    const amount=p<.045?1-p/.045:p>.94?(p-.94)/.06:0;
    opacity=clamp(amount*.85,0,.85);
   }
   shade.style.opacity=String(opacity);
  }
 }
 function activeClip(index){
  M.clipIndex=index;M.api.state.selected=index;
  $('vmTimeline').querySelectorAll('.cf-clip').forEach((c,i)=>c.classList.toggle('active',i===index));
 }
 function stopSound(){
  if(M.audio){try{M.audio.pause();M.audio.removeAttribute('src');M.audio.load()}catch(e){} M.audio=null;}
  if(M.scoreTimer){clearInterval(M.scoreTimer);M.scoreTimer=null}
  if(M.scoreContext){M.scoreContext.close().catch(()=>{});M.scoreContext=null}
  M.scorePump=null;M.soundMode=null;
 }
 async function startSound(time=0){
  const state=M.api.state;
  const wanted=state.music?'upload:'+state.music:'preset:'+state.musicPreset;
  if(wanted===M.soundMode)return;
  stopSound();
  if(state.music){
   const audio=new Audio(state.music);audio.loop=true;audio.volume=.32;M.audio=audio;M.soundMode=wanted;
   try{
    await new Promise(resolve=>{
     if(audio.readyState>=1)return resolve();
     const t=setTimeout(resolve,900);
     audio.addEventListener('loadedmetadata',()=>{clearTimeout(t);resolve()},{once:true});
    });
    if(Number.isFinite(audio.duration)&&audio.duration>0)audio.currentTime=time%audio.duration;
    if(M.playing)await audio.play();
   }catch(e){M.api.setStatus('Music preview unavailable: '+e.message)}
  }else if(state.musicPreset&&state.musicPreset!=='none'){
   try{
    const context=new(window.AudioContext||window.webkitAudioContext)(),pump=M.api.createScore(context,context.destination,state.musicPreset);
    M.scoreContext=context;M.scorePump=pump;M.soundMode=wanted;
    await context.resume();pump();M.scoreTimer=setInterval(pump,300);
   }catch(e){stopSound();M.api.setStatus('Built-in music preview unavailable: '+e.message)}
  }
 }
 function pause(){
  M.playing=false;
  try{v().pause()}catch(e){}
  stopSound();updateControls();
 }
 function jump(index,local,autoplay){
  const arr=clips(),c=arr[index];if(!c){pause();updateControls(0);return}
  const token=++M.token;M.switching=true;activeClip(index);
  const video=v(),same=video.getAttribute('src')===c.url;
  const load=()=>new Promise((resolve,reject)=>{
   if(same&&video.readyState>=1)return resolve();
   const timeout=setTimeout(()=>finish(new Error('Could not open montage clip')),12000);
   const finish=err=>{clearTimeout(timeout);video.removeEventListener('loadedmetadata',onLoad);video.removeEventListener('error',onError);err?reject(err):resolve()};
   const onLoad=()=>finish(),onError=()=>finish(new Error('Video preview could not decode '+c.file.name));
   video.addEventListener('loadedmetadata',onLoad,{once:true});video.addEventListener('error',onError,{once:true});
   if(!same){video.src=c.url;video.load()}
  });
  load().then(async()=>{
   if(token!==M.token)return;
   const at=clamp(local,c.start,Math.max(c.start,c.end-.045));
   if(Math.abs(video.currentTime-at)>.035){
    try{video.currentTime=at}catch(e){}
   }
   M.api.updateOverlay();updateControls(offsetOf(index)+at-c.start);
   if(autoplay&&M.playing){
    try{await video.play();if(token===M.token)await startSound(progress())}
    catch(e){if(token===M.token){pause();M.api.setStatus('Tap Play to continue the montage preview: '+e.message)}}
   }
   if(token===M.token)M.switching=false;
  }).catch(e=>{if(token===M.token){M.switching=false;pause();M.api.setStatus(e.message)}});
 }
 function jumpTime(t,autoplay=false){
  const arr=clips();if(!arr.length){pause();return}
  const wanted=clamp(t,0,total()-Math.min(.01,total()/10));
  let elapsed=0;
  for(let i=0;i<arr.length;i++){
   const end=elapsed+clipLength(arr[i]);
   if(wanted<end||i===arr.length-1){
    jump(i,arr[i].start+clamp(wanted-elapsed,0,clipLength(arr[i])),autoplay);return;
   }
   elapsed=end;
  }
 }
 function next(){
  if(M.switching)return;
  const i=M.clipIndex+1;
  if(i>=clips().length){
   pause();updateControls(total());M.api.setStatus('Full montage preview finished.');
  }else jump(i,clips()[i].start,true);
 }
 function play(){
  if(!clips().length)return;
  if(M.playing){pause();return}
  M.playing=true;updateControls();
  const c=clips()[M.clipIndex];
  if(!c||v().ended||v().currentTime>=c.end-.06)jumpTime(0,true);
  else{
   v().play().then(()=>startSound(progress())).catch(e=>{
    jump(M.clipIndex,Math.max(c.start,v().currentTime||c.start),true);
   });
  }
 }
 function updatePreview(){
  const c=clips()[M.clipIndex];if(!c)return;
  const t=Number(v().currentTime)||0;
  if(M.playing&&!M.switching&&t>=c.end-.06){next();return}
  M.api.updateOverlay();updateControls();
 }
 function onTimelineChange(){
  if(!M.api)return;
  const newSignature=signature();
  if(newSignature!==M.signature){
   M.signature=newSignature;
   pause();
   if(M.generationController)M.generationController.abort();
   if(M.generated)rebuildGenerated();
   if(clips().length){activeClip(0);jump(0,clips()[0].start,false)}
   else{++M.token;v().removeAttribute('src');v().load();updateControls(0)}
  }
 }
 function onLoadPreview(){
  if(!M.api)return;
  if(!clips().length){pause();return}
  if(M.api.state.selected!==M.clipIndex){pause();jump(M.api.state.selected,clips()[M.api.state.selected].start,false)}
 }
 function transcriptSync(){
  const textarea=$('vmCaptionText'),cues=M.api.state.captions;
  if(document.activeElement!==textarea){
   textarea.value=cues.map(c=>c.text).join('\n');
  }
  textarea.disabled=!cues.length;$('vmApplyCaptionText').disabled=!cues.length;
 }
 function applyText(){
  const cues=M.api.state.captions,lines=$('vmCaptionText').value.split(/\r?\n/).map(s=>s.trim());
  if(lines.length!==cues.length||lines.some(x=>!x)){
   $('vmGenerationStatus').textContent='Keep the same '+cues.length+' non-empty lines so every caption keeps its timing.';
   return;
  }
  cues.forEach((q,i)=>{q.text=lines[i]});
  if(M.generated){
   const byTime=cues.slice();
   for(let i=0;i<clips().length;i++){
    const c=clips()[i],entries=M.generated.get(c.url);
    if(!entries)continue;
    const start=offsetOf(i);
    for(const entry of entries){
     const matching=byTime.find(q=>Math.abs(q.start-(start+entry.start))<.015);
     if(matching)entry.text=matching.text;
    }
   }
  }
  M.api.updateOverlay();$('vmGenerationStatus').textContent='Caption text changes applied to preview and export.';
 }
 const wav=pcm=>{
  const bytes=new Uint8Array(44+pcm.length*2),view=new DataView(bytes.buffer);
  const put=(i,s)=>{for(let j=0;j<s.length;j++)bytes[i+j]=s.charCodeAt(j)};
  put(0,'RIFF');view.setUint32(4,36+pcm.length*2,true);put(8,'WAVE');put(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);
  view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);
  view.setUint16(34,16,true);put(36,'data');view.setUint32(40,pcm.length*2,true);
  for(let i=0;i<pcm.length;i++){const val=clamp(pcm[i],-1,1);view.setInt16(44+i*2,val<0?val*32768:val*32767,true)}
  let base='';for(let i=0;i<bytes.length;i+=32768)base+=String.fromCharCode.apply(null,bytes.subarray(i,i+32768));
  return btoa(base);
 };
 function mono(buffer,from,to){
  const sr=buffer.sampleRate,step=sr/16000,first=Math.floor(from*sr),last=Math.min(buffer.length,Math.ceil(to*sr));
  const channels=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i));
  const n=Math.max(0,Math.floor((last-first)/step)),result=new Float32Array(n);
  for(let i=0;i<n;i++){
   const pos=first+i*step,idx=Math.floor(pos),frac=pos-idx;let value=0;
   for(const channel of channels)value+=(channel[idx]||0)+((channel[Math.min(last-1,idx+1)]||0)-(channel[idx]||0))*frac;
   result[i]=value/channels.length;
  }
  return result;
 }
 function segmentSpeech(start,end,text,words){
  const textWords=String(text||'').trim().split(/\s+/).filter(Boolean);if(!textWords.length)return [];
  const wordCues=(Array.isArray(words)?words:[]).map(w=>({
   start:Number(w.start),end:Number(w.end),text:String(w.word||w.text||'').trim()
  })).filter(w=>Number.isFinite(w.start)&&Number.isFinite(w.end)&&w.end>w.start&&w.text);
  const result=[];
  if(wordCues.length>=textWords.length*.65){
   for(let k=0;k<wordCues.length;k+=5){
    const group=wordCues.slice(k,k+5);
    result.push({start:Math.max(start,group[0].start),end:Math.min(end,group[group.length-1].end),text:group.map(w=>w.text).join(' ')});
   }
  }else{
   const count=Math.ceil(textWords.length/5),step=(end-start)/count;
   for(let k=0;k<count;k++)result.push({
    start:start+k*step,end:k===count-1?end:start+(k+1)*step,
    text:textWords.slice(k*5,(k+1)*5).join(' ')
   });
  }
  return result.filter(c=>c.text&&c.end>c.start).map(c=>({...c,start:Math.max(0,c.start),end:Math.max(0,c.end)}));
 }
 function rebuildGenerated(){
  if(!M.generated)return;
  const cues=[];let offset=0;
  for(const c of clips()){
   const entries=M.generated.get(c.url)||[];
   for(const e of entries)cues.push({start:offset+e.start,end:offset+e.end,text:e.text});
   offset+=clipLength(c);
  }
  M.api.setCaptions(cues);transcriptSync();
  $('vmGenerationStatus').textContent=cues.length+' captions aligned to '+clips().length+' montage clips. Re-generate after adding new media.';
 }
 async function generate(){
  if(!M.api||M.generationController||M.api.state.busy)return;
  if(!clips().length){$('vmGenerationStatus').textContent='Upload one or more video clips first.';return}
  const controller=new AbortController();M.generationController=controller;
  const key=signature(),source=clips().slice(),maps=new Map(),language=$('vmCaptionLang').value;
  $('vmGenerateCaptions').disabled=true;$('vmCancelGeneration').hidden=false;
  $('vmGenerationStatus').textContent='Preparing audio for transcription…';
  try{
   const Context=window.AudioContext||window.webkitAudioContext;
   if(!Context)throw Error('Audio decoding is not supported by this browser.');
   for(let i=0;i<source.length;i++){
    if(controller.signal.aborted)throw Error('Generation cancelled.');
    const clip=source[i],context=new Context();let buffer;
    try{buffer=await context.decodeAudioData(await clip.file.arrayBuffer())}
    catch(e){throw Error('Could not decode audio in '+clip.file.name+'. Try an MP4/AAC or browser-supported clip.')}
    finally{context.close().catch(()=>{})}
    const end=Math.min(clip.end,buffer.duration),start=clamp(clip.start,0,end),count=Math.ceil((end-start)/25);
    const cues=[];
    for(let block=0;block<count;block++){
     if(controller.signal.aborted)throw Error('Generation cancelled.');
     const t0=start+block*25,t1=Math.min(end,t0+25),data=mono(buffer,t0,t1);
     $('vmGenerationStatus').textContent='Transcribing clip '+(i+1)+'/'+source.length+' · part '+(block+1)+'/'+count;
     const body={audio:wav(data)};if(language!=='auto')body.language=language;
     const response=await fetch('/api/v1/shorts/transcribe',{
      method:'POST',headers:{'content-type':'application/json','accept':'application/json'},
      body:JSON.stringify(body),signal:controller.signal
     });
     const raw=await response.text();let json;
     try{json=JSON.parse(raw)}catch{throw Error('Speech service sent an invalid response ('+response.status+').')}
     if(!response.ok)throw Error(json.error||'Transcription failed ('+response.status+').');
     const segments=(Array.isArray(json.segments)&&json.segments.length)?json.segments:
      json.text?[{start:0,end:t1-t0,text:json.text}]:[];
     for(const seg of segments){
      const begin=t0-start+Number(seg.start),finish=t0-start+Number(seg.end);
      if(!Number.isFinite(begin)||!Number.isFinite(finish)||finish<=begin)continue;
      const parts=segmentSpeech(begin,finish,seg.text,Array.isArray(seg.words)?seg.words.map(w=>({
       start:t0-start+Number(w.start),end:t0-start+Number(w.end),word:w.word||w.text
      })):[]);
      cues.push(...parts.map(p=>({...p,start:clamp(p.start,0,clipLength(clip)),end:clamp(p.end,0,clipLength(clip))})));
     }
    }
    maps.set(clip.url,cues.filter(c=>c.end>c.start).sort((a,b)=>a.start-b.start));
   }
   if(controller.signal.aborted)throw Error('Generation cancelled.');
   if(signature()!==key)throw Error('Clips changed during generation. Please generate captions again.');
   M.generated=maps;
   rebuildGenerated();
   $('vmGenerationStatus').textContent=M.api.state.captions.length
    ?'Generated '+M.api.state.captions.length+' captions from all '+source.length+' clips. Review and edit before export.'
    :'No speech detected in the uploaded clips. You can still upload SRT/VTT.';
  }catch(e){
   $('vmGenerationStatus').textContent=e.name==='AbortError'||controller.signal.aborted?'Generation cancelled. Previous captions preserved.':'Caption generation failed: '+e.message;
  }finally{
   M.generationController=null;$('vmGenerateCaptions').disabled=false;$('vmCancelGeneration').hidden=true;
  }
 }
 function install(api){
  if(M.initialized||!api||!$('vmTool'))return;
  M.api=api;M.initialized=true;
  const video=v();video.controls=false;video.onended=null;video.onloadedmetadata=null;
  video.addEventListener('timeupdate',updatePreview);
  video.addEventListener('ended',()=>{if(M.playing)next()});
  video.addEventListener('pause',()=>{if(M.playing&&!M.switching)pause()});
  video.addEventListener('click',play);
  $('vmCombinedPlay').addEventListener('click',play);
  $('vmPreviewBtn').onclick=()=>{pause();jumpTime(0,false);M.playing=true;updateControls();jumpTime(0,true)};
  $('vmCombinedSeek').addEventListener('input',e=>{
   const t=Number(e.target.value);pause();jumpTime(t,false);updateControls(t);
  });
  $('vmTransition').addEventListener('change',updateControls);
  $('vmMusicPreset').addEventListener('change',()=>{if(M.playing)startSound(progress())});
  $('vmMusic').addEventListener('change',()=>{if(M.playing)startSound(progress())});
  $('vmGenerateCaptions').addEventListener('click',generate);
  $('vmCancelGeneration').addEventListener('click',()=>M.generationController?.abort());
  $('vmApplyCaptionText').addEventListener('click',applyText);
  $('vmCaptions').addEventListener('change',()=>{M.generated=null;setTimeout(transcriptSync,70)});
  $('vmCaptionClear').addEventListener('click',()=>{M.generated=null;setTimeout(transcriptSync,0)});
  $('vmCaptionStyle').addEventListener('change',()=>api.updateOverlay());
  window.addEventListener('beforeunload',()=>{stopSound();M.generationController?.abort()});
  M.signature=signature();
  if(clips().length){activeClip(0);jump(0,clips()[0].start,false)}
  updateControls(0);transcriptSync();
  window.ClipForgeMontageExtras=M;
 }
 M.install=install;M.timelineChanged=onTimelineChange;M.loadPreview=onLoadPreview;
 window.ClipForgeMontageExtras=M;
 if(window.ClipForgeMontageBindings)install(window.ClipForgeMontageBindings);
})();