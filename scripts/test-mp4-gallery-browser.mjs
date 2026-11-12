import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdirSync,writeFileSync} from "node:fs";
import {chromium} from "playwright";
import {serveLocalSite} from "./test-http-server.mjs";

// A REAL fragmented MP4 reproduces the Android Gallery 0:00 duration symptom.
// fMP4 may play in a browser, but its moov/mvhd duration is zero or fragmented.
const raw=execFileSync("ffmpeg",[
 "-hide_banner","-loglevel","error",
 "-f","lavfi","-i","testsrc2=size=320x180:rate=20",
 "-f","lavfi","-i","sine=frequency=523:sample_rate=48000",
 "-t","2.2","-c:v","libx264","-pix_fmt","yuv420p",
 "-preset","ultrafast","-c:a","aac","-b:a","96k",
 "-movflags","frag_keyframe+empty_moov","-f","mp4","pipe:1"
],{maxBuffer:10*1024*1024});
assert.ok(raw.length>4000,"Need a real fragmented MP4 test input");
const site=await serveLocalSite({rootDir:"public"});
let browser;
try{
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage();
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(site.origin+"/tools/shorts/",{waitUntil:"domcontentloaded"});
 const report=await page.evaluate(async source=>{
  const {inspectMp4GalleryMetadata,finalizeGalleryMp4}=await import("/montage-mp4.js");
  const original=new Blob([new Uint8Array(source)],{type:"video/mp4"});
  const before=await inspectMp4GalleryMetadata(original);
  let lastProgress=-1;
  const result=await finalizeGalleryMp4(original,{onProgress:p=>{lastProgress=p}});
  const after=await inspectMp4GalleryMetadata(result);
  const noOp=await finalizeGalleryMp4(result);
  const mb=await import("https://cdn.jsdelivr.net/npm/mediabunny@1.62.1/+esm");
  const input=new mb.Input({formats:mb.ALL_FORMATS,source:new mb.BlobSource(result)});
  const video=await input.getPrimaryVideoTrack();
  const audio=await input.getPrimaryAudioTrack();
  const metadataDuration=await input.getDurationFromMetadata();
  const computedDuration=await input.computeDuration();
  const videoCodec=await video?.getCodec(),audioCodec=await audio?.getCodec();
  await input.close?.();
  let invalidRejected=false;
  try{await finalizeGalleryMp4(new Blob([new Uint8Array(4096)],{type:"video/mp4"}))}
  catch(_){invalidRejected=true}
  return {before,after,metadataDuration,computedDuration,videoCodec,audioCodec,
   noOp:noOp===result,invalidRejected,lastProgress,size:result.size,
   bytes:[...new Uint8Array(await result.arrayBuffer())]};
 },[...raw]);
 assert.equal(report.before.compatible,false,"Fragmented MP4 must not pass Gallery metadata checks");
 assert.equal(report.after.compatible,true,"Final file needs a nonfragmented moov with finite duration");
 assert.ok(report.after.duration>1.7&&report.after.duration<3.0,
  "Movie-header duration missing or wrong: "+report.after.duration);
 assert.ok(report.metadataDuration>1.7&&report.metadataDuration<3.0,
  "Metadata duration must be readable without decoding the media");
 assert.ok(report.computedDuration>1.7&&report.computedDuration<3.0,
  "Real media duration must match metadata: "+report.computedDuration);
 assert.equal(report.videoCodec,"avc","Keep/produce H.264 compatible with Android Gallery");
 assert.equal(report.audioCodec,"aac","Keep/produce AAC audio track");
 assert.equal(report.noOp,true,"Already-compatible MP4 must not be remuxed again");
 assert.equal(report.invalidRejected,true,"Corrupt MP4 must never be downloadable as a fake fix");
 assert.ok(report.lastProgress>=0);
 mkdirSync("reports",{recursive:true});
 const path="reports/mp4-gallery-fixed.mp4";
 writeFileSync(path,Buffer.from(report.bytes));
 const details=JSON.parse(execFileSync("ffprobe",[
  "-v","error","-show_entries","format=duration:stream=codec_name",
  "-of","json",path
 ]).toString());
 assert.ok(Number(details.format.duration)>1.7&&Number(details.format.duration)<3,
  "ffprobe must detect nonzero duration from exported MP4");
 assert.ok(details.streams.some(x=>x.codec_name==="h264"));
 assert.ok(details.streams.some(x=>x.codec_name==="aac"));
 assert.deepEqual(errors,[],"No browser runtime errors during MP4 repair");
 console.log("Gallery MP4 duration repair passed: real fMP4 → nonfragmented fast-start H.264/AAC MP4, mvhd "+
  report.after.duration.toFixed(2)+"s, ffprobe "+details.format.duration+"s, no-op and corruption checks.");
}finally{
 if(browser)await browser.close();
 await site.close();
}
