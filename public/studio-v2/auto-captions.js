/* Studio V2 transcription bridge. Shares the existing /api/v1/shorts/transcribe
 * service contract without altering Captions Studio or other ClipForge tools. */
(()=>{
"use strict";
function mono16k(buffer,start,end){
 const sr=buffer.sampleRate,channels=Array.from({length:buffer.numberOfChannels},(_,i)=>buffer.getChannelData(i));
 const from=Math.max(0,Math.floor(start*sr)),to=Math.min(buffer.length,Math.ceil(end*sr));
 const ratio=sr/16000,size=Math.max(1,Math.floor((to-from)/ratio)),out=new Float32Array(size);
 for(let i=0;i<size;i++){
  const p=from+i*ratio,j=Math.floor(p),f=p-j,next=Math.min(to-1,j+1);
  let v=0;
  for(const ch of channels)v+=(ch[j]||0)+((ch[next]||0)-(ch[j]||0))*f;
  out[i]=v/channels.length;
 }
 return out;
}
function wav64(pcm){
 const raw=new Uint8Array(44+pcm.length*2),dv=new DataView(raw.buffer);
 const put=(at,str)=>{for(let i=0;i<str.length;i++)raw[at+i]=str.charCodeAt(i);};
 put(0,"RIFF");dv.setUint32(4,36+pcm.length*2,true);put(8,"WAVE");
 put(12,"fmt ");dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,1,true);
 dv.setUint32(24,16000,true);dv.setUint32(28,32000,true);dv.setUint16(32,2,true);dv.setUint16(34,16,true);
 put(36,"data");dv.setUint32(40,pcm.length*2,true);
 for(let i=0;i<pcm.length;i++){const n=Math.max(-1,Math.min(1,pcm[i]));dv.setInt16(44+i*2,n<0?n*32768:n*32767,true);}
 let str="";
 for(let start=0;start<raw.length;start+=16000)str+=String.fromCharCode(...raw.subarray(start,start+16000));
 return btoa(str);
}
function phraseGroups(words,limit){
 const list=[],part=[];
 for(const word of words){
  part.push(word);
  if(part.length>=limit||/[.!?؟۔]+$/.test(word.text)){
   list.push(part.splice(0));
  }
 }
 if(part.length)list.push(part.splice(0));
 return list;
}
function splitSegment(segment,maxWords){
 const text=String(segment.text||"").trim(),start=Number(segment.start),end=Number(segment.end);
 if(!text||!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return [];
 const raw=Array.isArray(segment.words)?segment.words:[];
 const timed=raw.map(w=>({
  text:String(w.word||w.text||"").trim(),start:Number(w.start),end:Number(w.end)
 })).filter(w=>w.text&&Number.isFinite(w.start)&&Number.isFinite(w.end)&&w.end>w.start);
 const words=timed.length?timed:text.split(/\s+/).filter(Boolean).map(token=>({text:token}));
 const groups=phraseGroups(words,maxWords),total=groups.reduce((n,group)=>n+group.length,0);
 let previous=0;
 return groups.map((group,i)=>{
  const text=group.map(w=>w.text).join(" ").replace(/\s+([,.;:!?؟۔،؛])/g,"$1");
  let s,e;
  if(timed.length){
   s=Math.max(start,group[0].start);e=Math.min(end,group[group.length-1].end);
  }else{
   const fraction=previous/total;previous+=group.length;
   s=start+(end-start)*fraction;e=i===groups.length-1?end:start+(end-start)*(previous/total);
  }
  return {start:s,duration:e-s,text};
 }).filter(c=>c.text&&c.duration>.01);
}
async function transcribe({blob,start=0,end=null,language="urdu",maxWords=5,onProgress=()=>{},signal}={}){
 if(!(blob instanceof Blob))throw Error("Source video/audio is not available. Re-import the media first.");
 const Audio=window.AudioContext||window.webkitAudioContext;
 if(!Audio)throw Error("Your browser does not support audio decoding.");
 const ctx=new Audio();
 let audio;
 try{audio=await ctx.decodeAudioData(await blob.arrayBuffer());}
 catch(_){throw Error("This source audio codec cannot be decoded in your browser. Try an MP4/WAV or import SRT captions.");}
 finally{ctx.close().catch(()=>{});}
 const from=Math.max(0,Math.min(audio.duration,Number(start)||0));
 const until=end==null?audio.duration:Math.max(from,Math.min(audio.duration,Number(end)||0));
 if(until-from<.1)throw Error("Selected clip has no audio duration to transcribe.");
 const count=Math.ceil((until-from)/25),parts=[],lang={urdu:"ur",english:"en",hindi:"hi"}[language]||"ur";
 for(let index=0;index<count;index++){
  if(signal?.aborted)throw new DOMException("Transcription cancelled","AbortError");
  const a=from+index*25,b=Math.min(until,a+25);
  onProgress(Math.round(index/count*100),index+1,count);
  const response=await fetch("/api/v1/shorts/transcribe",{
   method:"POST",headers:{"content-type":"application/json","accept":"application/json"},
   signal,body:JSON.stringify({audio:wav64(mono16k(audio,a,b)),language:lang})
  });
  let result;
  try{result=await response.json();}
  catch(_){throw Error("Speech service returned an invalid response ("+response.status+").");}
  if(!response.ok)throw Error(result?.error||"Speech service failed ("+response.status+").");
  if(Array.isArray(result.segments)&&result.segments.length){
   for(const s of result.segments){
    const start=Number(s.start),end=Number(s.end);
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)continue;
    const timedWords=(Array.isArray(s.words)?s.words:[]).map(w=>({
     word:w.word||w.text,start:Number(w.start??w.s)+a,end:Number(w.end??w.e)+a
    }));
    parts.push({start:start+a,end:end+a,text:s.text,words:timedWords});
   }
  }else if(result?.text){
   parts.push({start:a,end:b,text:result.text,words:[]});
  }
 }
 onProgress(100,count,count);
 if(!parts.length)throw Error("No speech detected in the selected clip.");
 const cues=parts.flatMap(s=>splitSegment(s,Math.max(1,Math.min(12,Number(maxWords)||5))));
 return cues.filter(c=>c.duration>.01).slice(0,2000);
}
window.ClipForgeStudioAutoCaptions={transcribe};
})();