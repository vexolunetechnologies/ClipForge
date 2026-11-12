/* ClipForge Video Montage: real MP4 export, not a WebM rename.
 * Only imported by the Montage workspace. Editor and every other tool remain unchanged.
 * Uses native MP4 recording when possible, or transcodes browser WebM through WebCodecs.
 */
const BUNNY_URL = "https://cdn.jsdelivr.net/npm/mediabunny@1.62.1/+esm";
const AAC_URL = "https://cdn.jsdelivr.net/npm/@mediabunny/aac-encoder@1.62.1/+esm";
let bunnyPromise;
function bunny(){
  if(!bunnyPromise)bunnyPromise=import(BUNNY_URL).catch(error=>{
    bunnyPromise=null;
    throw new Error("MP4 converter could not load. Check your internet connection and try again. ("+error.message+")");
  });
  return bunnyPromise;
}
async function ensureAac(mb){
  if(await mb.canEncode("aac"))return;
  try{
    const addon=await import(AAC_URL);
    addon.registerAacEncoder();
    if(await mb.canEncode("aac"))return;
  }catch(error){
    throw new Error("AAC audio encoding is unavailable on this browser: "+error.message);
  }
  throw new Error("AAC audio encoding is unavailable on this browser.");
}
export async function preflightMontageMp4(){
  const mb=await bunny();
  if(!await mb.canEncode("avc")){
    throw new Error("H.264 MP4 encoding is not supported on this browser/device. Try updated Chrome, Edge or Safari.");
  }
  await ensureAac(mb);
}
const cancelledError=()=>new Error("MP4 export stopped.");
function isMp4(blob){return blob.type.toLowerCase().includes("mp4");}
async function validMp4Blob(blob){
  if(!blob||blob.size<2000)return false;
  const header=new Uint8Array(await blob.slice(4,12).arrayBuffer());
  const text=String.fromCharCode(...header);
  return text.startsWith("ftyp");
}
export async function finalizeMontageMp4(recording,{onProgress=()=>{},isCancelled=()=>false}={}){
  if(!(recording instanceof Blob)||recording.size<2000)throw new Error("Empty video export.");
  if(isCancelled())throw cancelledError();
  let mb;
  try{mb=await bunny();}
  catch(error){
    throw error;
  }
  const input=new mb.Input({formats:mb.ALL_FORMATS,source:new mb.BlobSource(recording)});
  let conversion=null,nativeIsCompatible=false;
  try{
    const videoTrack=await input.getPrimaryVideoTrack(),audioTrack=await input.getPrimaryAudioTrack();
    if(!videoTrack)throw new Error("The recording does not contain a video track.");
    const sourceIsMp4=isMp4(recording);
    const videoCodec=await videoTrack.getCodec();
    const audioCodec=audioTrack?await audioTrack.getCodec():null;
    nativeIsCompatible=sourceIsMp4&&videoCodec==="avc"&&(!audioTrack||audioCodec==="aac");
    if(!nativeIsCompatible){
      if(!await mb.canEncode("avc"))throw new Error("H.264 encoding is unavailable on this device.");
      if(audioTrack)await ensureAac(mb);
    }
    if(isCancelled())throw cancelledError();
    const output=new mb.Output({format:new mb.Mp4OutputFormat({fastStart:'in-memory'}),target:new mb.BufferTarget()});
    conversion=await mb.Conversion.init({
      input,output,tracks:"primary",
      // Explicit H.264 and AAC avoids mislabeled MP4 and silent audio loss.
      video:{codec:"avc",forceTranscode:!nativeIsCompatible},
      audio:{codec:"aac",forceTranscode:!nativeIsCompatible},
    });
    if(!conversion.isValid||
       !conversion.utilizedTracks.includes(videoTrack)||
       (audioTrack&&!conversion.utilizedTracks.includes(audioTrack))){
      const problems=conversion.discardedTracks?.map(r=>r.reason).filter(Boolean).join(", ");
      throw new Error("This browser cannot encode the montage as H.264/AAC MP4"+(problems?" ("+problems+")":"")+".");
    }
    conversion.onProgress=p=>{
      if(isCancelled()){conversion.cancel().catch(()=>{});return;}
      onProgress(Math.round(p*100));
    };
    onProgress(0);
    await conversion.execute();
    if(isCancelled())throw cancelledError();
    const mp4=new Blob([output.target.buffer],{type:"video/mp4"});
    if(!await validMp4Blob(mp4))throw new Error("MP4 finalization returned an invalid file.");
    return mp4;
  }catch(error){
    if(isCancelled())throw cancelledError();
    // If native MediaRecorder already created MP4, keep the native file when
    // only the optional remux pass fails. Never serve WebM as MP4.
    if(nativeIsCompatible&&await validMp4Blob(recording))return recording;
    throw new Error("MP4 conversion failed: "+(error.message||String(error))+". Try a shorter montage or another browser.");
  }finally{
    try{await input.close?.();}catch(_){}
  }
}


/* Shared MP4 Gallery compatibility check for Shorts, Trailer and other raw
 * MediaRecorder exports. Fragmented MP4 may play in Chrome but show 0:00 in
 * Android Gallery, whose extractors often rely on the standard moov/mvhd
 * duration. Parse the file's own metadata; player seekability alone is not
 * enough. Fast-start, non-fragmented MP4s are returned untouched. */
const BOX_SCAN_BYTES=4*1024*1024;
function mp4Box(view,at,limit){
 if(at+8>limit)return null;
 let size=view.getUint32(at),header=8;
 const type=String.fromCharCode(view.getUint8(at+4),view.getUint8(at+5),view.getUint8(at+6),view.getUint8(at+7));
 if(size===1){
  if(at+16>limit)return null;
  const big=view.getBigUint64(at+8);
  if(big>BigInt(Number.MAX_SAFE_INTEGER))return null;
  size=Number(big);header=16;
 }
 if(size<header)return null;
 return {type,start:at,end:at+size,header};
}
function movieHeaderDuration(view,box){
 const at=box.start+box.header;
 if(at+4>box.end)return null;
 const version=view.getUint8(at);
 let scale,duration;
 if(version===0){
  if(at+20>box.end)return null;
  scale=view.getUint32(at+12);
  duration=view.getUint32(at+16);
 }else if(version===1){
  if(at+32>box.end)return null;
  scale=view.getUint32(at+20);
  duration=Number(view.getBigUint64(at+24));
 }else return null;
 const seconds=duration/scale;
 return scale>0&&Number.isFinite(seconds)?seconds:null;
}
export async function inspectMp4GalleryMetadata(blob){
 const no={compatible:false,duration:null};
 if(!(blob instanceof Blob)||blob.size<32)return no;
 const prefix=new DataView(await blob.slice(0,Math.min(blob.size,BOX_SCAN_BYTES)).arrayBuffer());
 let top=0,ftyp=false;
 while(top+8<=prefix.byteLength){
  const box=mp4Box(prefix,top,prefix.byteLength);
  if(!box)return no;
  if(box.type==="ftyp")ftyp=true;
  if(box.type==="mdat"||box.type==="moof")return no; // Movie metadata must precede media.
  if(box.type==="moov"){
   if(!ftyp||box.end>prefix.byteLength)return no;
   let at=box.start+box.header,mvhd=null,fragmented=false;
   while(at+8<=box.end){
    const child=mp4Box(prefix,at,box.end);
    if(!child||child.end>box.end)return no;
    if(child.type==="mvhd")mvhd=movieHeaderDuration(prefix,child);
    if(child.type==="mvex")fragmented=true;
    at=child.end;
   }
   return {compatible:!fragmented&&mvhd!==null&&mvhd>=.75,duration:mvhd};
  }
  if(box.end>prefix.byteLength)return no;
  top=box.end;
 }
 return no;
}
export async function finalizeGalleryMp4(recording,options={}){
 if(!(recording instanceof Blob)||recording.size<2000)throw new Error("The video recording was empty.");
 if(options.isCancelled?.())throw cancelledError();
 const original=await inspectMp4GalleryMetadata(recording);
 if(original.compatible){options.onProgress?.(100);return recording;}
 // Remux to standard fast-start MP4 with a populated movie header duration.
 // Conversion stream-copies compatible H.264/AAC tracks and only re-encodes
 // unsupported codecs. A failed remux must NOT silently save the bad original.
 const result=await finalizeMontageMp4(recording,options);
 const repaired=await inspectMp4GalleryMetadata(result);
 if(!repaired.compatible){
  throw new Error("The MP4 duration metadata could not be finalized for phone Gallery. Please retry on an updated Chrome or Edge browser.");
 }
 return result;
}
