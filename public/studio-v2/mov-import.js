/* ClipForge Studio V2 — MOV container compatibility bridge.
 * Nothing here modifies or loads into the old ClipForge cards/editor.
 * MOV is a container, not a codec. Native playback is preferred. Where necessary,
 * H.264/HEVC QuickTime is repackaged to MP4 using Mediabunny in the browser.
 * Codec decoding still depends on the device; do not silently accept bad imports.
 */
(()=>{
"use strict";
const LIB="https://cdn.jsdelivr.net/npm/mediabunny@1.62.1/+esm";
const timeout=(ms)=>new Promise(resolve=>setTimeout(()=>resolve(null),ms));
async function inspectPlayable(blob,ms=3500){
 const url=URL.createObjectURL(blob),v=document.createElement("video");v.muted=true;v.playsInline=true;v.preload="metadata";
 try{
  const result=await Promise.race([
   new Promise(resolve=>{
    v.onloadedmetadata=()=>resolve(Number.isFinite(v.duration)&&v.duration>0?{duration:v.duration,width:v.videoWidth,height:v.videoHeight}:null);
    v.onerror=()=>resolve(null);
    v.src=url;
   }),timeout(ms)
  ]);
  return result;
 }finally{
  v.pause();v.removeAttribute("src");v.load();URL.revokeObjectURL(url);
 }
}
function isMov(file){return /\.mov$/i.test(file?.name||"")||/^video\/(quicktime|x-quicktime)$/i.test(file?.type||"");}
async function convert(file,{onProgress=()=>{}}={}){
 if(!isMov(file))return {blob:file,container:"native",duration:0};
 const native=await inspectPlayable(file);
 if(native)return {blob:file,duration:native.duration,container:"MOV · native",converted:false};
 const mobile=/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
 const limit=(mobile?200:600)*1024*1024;
 if(file.size>limit)throw Error("This MOV is too large for safe in-browser conversion ("+(file.size/1048576).toFixed(0)+" MB). Use a desktop editor to convert it to H.264/AAC MP4 first.");
 let mb;
 try{onProgress("Loading MOV compatibility engine…");mb=await import(LIB);}
 catch(_){throw Error("MOV converter could not load. Check your internet connection, or convert this file to H.264/AAC MP4.");}
 let input;
 try{
  input=new mb.Input({formats:mb.ALL_FORMATS,source:new mb.BlobSource(file)});
  const videoTrack=await input.getPrimaryVideoTrack();
  if(!videoTrack)throw Error("No video track found in this MOV file.");
  // Container-only conversion is fast and lossless. ProRes and legacy DV codecs
  // still need their own decoder, which is not included in this phase.
  const output=new mb.Output({format:new mb.Mp4OutputFormat(),target:new mb.BufferTarget()});
  const conversion=await mb.Conversion.init({input,output,tracks:"primary",copy:{mode:"preferred"}});
  if(!conversion.isValid){
   const reasons=conversion.discardedTracks?.map(x=>x.reason).join(", ")||"unsupported codec";
   throw Error("MOV cannot be converted in this browser ("+reasons+"). ProRes, DV and some HEVC files may need desktop transcoding.");
  }
  if(conversion.discardedTracks?.some(x=>x.track.type==="video"||x.reason==="undecodable_source_codec")){
   throw Error("MOV video codec is not supported in this browser. Convert the source to H.264 MP4.");
  }
  conversion.onProgress=progress=>onProgress("Preparing MOV for editing · "+Math.round(progress*100)+"%");
  await conversion.execute();
  if(!output.target.buffer?.byteLength)throw Error("MOV conversion produced no video data.");
  const mp4=new Blob([output.target.buffer],{type:"video/mp4"});
  const playable=await inspectPlayable(mp4,6000);
  if(!playable)throw Error("MOV was rewrapped, but its video codec is not playable on this device. Convert the original file to H.264/AAC MP4.");
  return {blob:mp4,duration:playable.duration,container:"MOV → MP4",converted:true};
 }catch(error){
  if(error.message?.startsWith("MOV "))throw error;
  throw Error("Could not read this MOV file. "+(error.message||"Unsupported QuickTime codec."));
 }finally{try{await input?.close?.();}catch(_){}}
}
window.ClipForgeStudioMov={isMov,inspectPlayable,convert};
})();