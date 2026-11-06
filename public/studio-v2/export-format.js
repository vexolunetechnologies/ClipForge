/* Studio V2 browser export finalizer.
 * Prefer H.264/AAC MP4 when available; otherwise preserve a playable WebM.
 * Rewrap WebM with complete metadata when possible, avoiding 0:00 Gallery files.
 * Keep old ClipForge cards completely independent.
 */
(()=>{
"use strict";
let imported;
async function load(){
 if(!imported)imported=import("https://cdn.jsdelivr.net/npm/mediabunny@1.62.1/+esm");
 return imported;
}
async function convert(blob,{container="webm",onProgress=()=>{}}={}){
 const mb=await load();
 const toMp4=container==="mp4";
 const input=new mb.Input({formats:mb.ALL_FORMATS,source:new mb.BlobSource(blob)});
 try{
  const video=await input.getPrimaryVideoTrack();
  if(!video)throw Error("No video stream in recorder output.");
  if(toMp4){
   if(!await mb.canEncode("avc"))throw Error("H.264 MP4 encoding is unavailable in this browser.");
   const audio=await input.getPrimaryAudioTrack();
   if(audio&&!await mb.canEncode("aac"))throw Error("AAC audio encoding is unavailable in this browser.");
  }
  const output=new mb.Output({
   format:toMp4?new mb.Mp4OutputFormat():new mb.WebMOutputFormat(),
   target:new mb.BufferTarget(),
  });
  const config={input,output,tracks:"primary"};
  if(toMp4){
   config.video={codec:"avc"};
   config.audio={codec:"aac"};
  }
  const job=await mb.Conversion.init(config);
  if(!job.isValid||job.discardedTracks?.some(record=>record.reason!=="discarded_by_user")){
   throw Error("Output codec conversion is unsupported on this device.");
  }
  job.onProgress=progress=>onProgress("Finishing "+container.toUpperCase()+" · "+Math.round(progress*100)+"%");
  await job.execute();
  if(!output.target.buffer?.byteLength)throw Error("No output media data generated.");
  return new Blob([output.target.buffer],{type:toMp4?"video/mp4":"video/webm"});
 }finally{try{await input.close?.();}catch(_){}}
}
async function finalize(blob,{prefer="mp4",onProgress=()=>{}}={}){
 if(!(blob instanceof Blob)||blob.size<500)throw Error("Video recording is empty.");
 const nativeMp4=blob.type.toLowerCase().includes("mp4");
 if(nativeMp4)return {blob,extension:"mp4",note:"MP4 recorded directly by browser"};
 if(prefer==="mp4"){
  try{
   onProgress("Encoding MP4…");
   const result=await convert(blob,{container:"mp4",onProgress});
   return {blob:result,extension:"mp4",note:"H.264/AAC MP4 encoded"};
  }catch(error){
   onProgress("MP4 is unavailable: "+error.message+" Saving WebM instead…");
  }
 }
 try{
  const result=await convert(blob,{container:"webm",onProgress});
  return {blob:result,extension:"webm",note:prefer==="mp4"?"WebM fallback with finalized duration metadata":"WebM with finalized duration metadata"};
 }catch(error){
  onProgress("WebM metadata finalization unavailable: "+error.message);
  return {blob,extension:"webm",note:"Original WebM fallback (duration may show incorrectly in some galleries)"};
 }
}
window.ClipForgeStudioExportFormat={finalize};
})();