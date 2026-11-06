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
    const output=new mb.Output({format:new mb.Mp4OutputFormat(),target:new mb.BufferTarget()});
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
