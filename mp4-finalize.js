/* ClipForge MP4 metadata finalizer.
 * Chrome's native MediaRecorder produces fragmented MP4. Some Android galleries
 * show these as 00:00 even when playback works. Remux to an indexed MP4 with
 * populated duration headers, without changing video or audio samples.
 * This is a best-effort fix: the original playable file remains available on
 * devices where remuxing is unsupported, times out or would use too much RAM.
 */
(function(){
 "use strict";
 const MAX_BYTES=160*1024*1024; // Constrain phone memory: both blobs exist during muxing.
 let modulePromise=null;
 const getModule=()=>modulePromise||(modulePromise=import(
  "https://cdn.jsdelivr.net/npm/mediabunny@1.62.1/+esm"
 ).catch(error=>{modulePromise=null;throw error}));
 const result=(blob,changed=false,warning="")=>({blob,changed,warning});
 async function finalize(blob,options={}){
  if(!(blob instanceof Blob)||blob.size<1024)return result(blob);
  if(!/video\/mp4/i.test(blob.type))return result(blob);
  if(blob.size>MAX_BYTES)return result(blob,false,
   "This MP4 is too large to safely finalize on a mobile browser. The original is kept; Gallery may show 00:00. Use a desktop remux for large files.");
  let input=null,outputInput=null;
  try{
   const m=await getModule();
   input=new m.Input({source:new m.BlobSource(blob),formats:[m.MP4]});
   if(!(await input.canRead()))throw Error("Unrecognized MP4");
   const originalTracks=await input.getTracks();
   if(!originalTracks.some(t=>t.type==="video"||t.type==="video-track")&&!(await input.getPrimaryVideoTrack()))
    throw Error("Video track missing");
   // The regular MP4 path already writes index/duration metadata; keep it.
   const metadata=await input.getDurationFromMetadata();
   if(options.force!==true&&Number.isFinite(metadata)&&metadata>.1)return result(blob);
   const output=new m.Output({
    target:new m.BufferTarget(),
    format:new m.Mp4OutputFormat({fastStart:"in-memory"})
   });
   const converter=await m.Conversion.init({input,output});
   if(!converter.isValid||converter.discardedTracks.length>0||
      converter.utilizedTracks.length<originalTracks.length)
    throw Error("Not all tracks could be safely copied");
   await converter.execute();
   if(!output.target.buffer)throw Error("No finalized output");
   const fixed=new Blob([output.target.buffer],{type:"video/mp4"});
   if(fixed.size<1024)throw Error("Finalized file was empty");
   outputInput=new m.Input({source:new m.BlobSource(fixed),formats:[m.MP4]});
   const duration=await outputInput.getDurationFromMetadata();
   if(!Number.isFinite(duration)||duration<=.1)
    throw Error("Finished MP4 still has no indexed duration");
   return result(fixed,true);
  }catch(error){
   return result(blob,false,"The MP4 plays, but Gallery duration could not be finalized on this device ("+
    String(error?.message||"unsupported format").slice(0,110)+"). Try a desktop MP4 remux.");
  }finally{
   try{input?.dispose()}catch(error){}
   try{outputInput?.dispose()}catch(error){}
  }
 }
 window.ClipForgeMp4={finalize};
})();