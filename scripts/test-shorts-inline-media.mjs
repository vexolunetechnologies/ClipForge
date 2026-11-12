import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtempSync,mkdirSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {chromium} from "playwright";
import {serveLocalSite} from "./test-http-server.mjs";

const temp=mkdtempSync(join(tmpdir(),"clipforge-shorts-card-"));
// Chromium installed via Playwright may not ship proprietary H.264 decoders.
 // A genuine VP8/Opus WebM fixture tests the *preview workflow* consistently;
 // H.264/AAC MP4 export is verified in the separate Gallery/Montage regression.
const source=join(temp,"short-preview-fixture.webm");
execFileSync("ffmpeg",[
 "-hide_banner","-loglevel","error","-y",
 "-f","lavfi","-i","testsrc2=size=320x180:rate=15",
 "-f","lavfi","-i","sine=frequency=490:sample_rate=48000",
 "-t","9","-c:v","libvpx","-deadline","realtime","-cpu-used","8",
 "-b:v","360k","-c:a","libopus","-b:a","64k",source
],{maxBuffer:10*1024*1024});
const site=await serveLocalSite({rootDir:"public"});
let browser;
try{
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(site.origin+"/tools/shorts/",{waitUntil:"domcontentloaded"});
 await page.locator("#file").setInputFiles(source);
 try{await page.waitForFunction(()=>document.querySelector("#src")?.readyState>=1,null,{timeout:16000})}
 catch(error){
  const diag=await page.evaluate(()=>({
   hasFile:!!file,videoSrc:document.querySelector("#src")?.currentSrc,
   readyState:document.querySelector("#src")?.readyState,
   error:document.querySelector("#src")?.error?.message,
   workHidden:document.querySelector("#work")?.classList.contains("hide"),
   message:document.querySelector("#msg")?.textContent
  }));
  throw Error("Inline preview fixture failed to decode: "+JSON.stringify(diag)+"; "+error.message);
 }
 // The giant Shorts Live preview is redundant; its canvas must remain
 // mounted and capture-capable because MP4 export records from that canvas.
 const exportSurface=await page.evaluate(()=>{
  const canvas=document.querySelector("#cv");
  const panel=document.querySelector("#cfLivePreviewBlock");
  const stream=canvas.captureStream(1);
  const result={
   panelHidden:getComputedStyle(panel).display==="none",
   canvasNotLaidOut:canvas.getClientRects().length===0,
   canvasStillMounted:canvas.isConnected,
   size:[canvas.width,canvas.height],
   captureTrack:stream.getVideoTracks().some(track=>track.readyState==="live")
  };
  stream.getTracks().forEach(track=>track.stop());
  return result;
 });
 assert.deepEqual(exportSurface,{
  panelHidden:true,canvasNotLaidOut:true,canvasStillMounted:true,size:[720,1280],captureTrack:true
 },"Shorts should hide its redundant live preview without breaking the recording canvas");

 await page.evaluate(()=>{
  clips=[
   {s:1,e:5.6,score:88,tags:["Conversation"],reason:"Complete dialogue",blob:null,pcm:null},
   {s:6,e:8.6,score:null,tags:["Dialogue review"],reason:"Natural scene ending",blob:null,pcm:null}
  ];
  render();
  document.querySelector("#res").classList.remove("hide");
 });
 const cards=page.locator("#list .cf-short-card");
 assert.equal(await cards.count(),2);
 const first=cards.nth(0),second=cards.nth(1);
 const width=await first.evaluate(el=>({
  video:el.querySelector(".cf-short-preview").getBoundingClientRect().width,
  height:el.querySelector(".cf-short-preview").getBoundingClientRect().height,
  card:el.getBoundingClientRect().width,
  page:document.documentElement.scrollWidth,viewport:innerWidth,
  sourcePreview:el.querySelector(".cf-short-preview-label").textContent
 }));
 assert.ok(width.video>=100&&Math.abs(width.video/width.height-9/16)<.02,
  "Short preview must be a touch-friendly 9:16 portrait: "+JSON.stringify(width));
 assert.ok(width.card<width.viewport+1&&width.page<=width.viewport+2,
  "No horizontal mobile overflow: "+JSON.stringify(width));
 assert.equal(width.sourcePreview,"Source preview");

 // The only Preview control plays this card's source, not the top upload player.
 await first.locator(".cf-short-play").click();
 await page.waitForFunction(()=>{
  const v=document.querySelector("#list .cf-short-card:first-child video");
  return v&&!v.paused&&v.currentTime>=1.02;
 },null,{timeout:12000});
 assert.equal(await page.locator("#src").evaluate(v=>v.paused),true,
  "In-card preview must not restart the source player at the top");
 assert.equal(await first.locator(".cf-short-play").getAttribute("aria-label"),"Pause this Short");
 await second.locator(".cf-short-play").click();
 await page.waitForFunction(()=>{
  const v=document.querySelectorAll("#list .cf-short-card video")[1];
  return v&&!v.paused&&v.currentTime>=6;
 },null,{timeout:12000});
 assert.equal(await first.locator("video").evaluate(v=>v.paused),true,
  "Playing another Short must pause the previous preview");
 // A preview stops at the selected Short's out-point, not the end of the source.
 await second.locator("video").evaluate(v=>{
  v.currentTime=8.58;
  v.dispatchEvent(new Event("timeupdate"));
 });
 await page.waitForFunction(()=>{
  const v=document.querySelectorAll("#list .cf-short-card video")[1];
  return v.paused;
 },null,{timeout:4000});
 assert.equal(await second.locator(".cf-short-play").getAttribute("aria-label"),"Play this Short");
 await first.screenshot({path:join(temp,"card.png")});
 mkdirSync("reports",{recursive:true});
 // Only UI screenshot; no source media file saved to reports.
 await first.screenshot({path:"reports/shorts-inline-mobile.png"});

 // Real trim controls are hidden by default; changing them updates export boundaries.
 assert.equal(await first.locator(".cf-short-trim").isVisible(),false);
 await first.locator(".cf-short-trim-toggle").click();
 assert.equal(await first.locator(".cf-short-trim").isVisible(),true);
 await first.locator('input[aria-label="Short 1 trim start"]').evaluate(el=>{
  el.value="1.4";el.dispatchEvent(new Event("input",{bubbles:true}));
  el.dispatchEvent(new Event("change",{bubbles:true}));
 });
 assert.equal(await page.evaluate(()=>clips[0].s),1.4);
 assert.match(await first.locator(".cf-short-trim-readout").textContent(),/1\.4s – 5\.6s/);
 await first.locator(".cf-short-trim-toggle").click();
 assert.equal(await first.locator(".cf-short-trim").isVisible(),false);
 assert.equal(await first.locator(".cf-short-actions button.exp").count(),1);
 assert.equal(await first.locator(".cf-short-actions button").count(),2);

 // Once exported, playback is still in the same card and download/share stay.
 await page.evaluate(()=>{clips[0].blob=file;render()});
 assert.equal(await cards.nth(0).locator(".cf-short-preview-label").textContent(),"Exported video");
 assert.equal(await cards.nth(0).locator("button.exp").textContent(),"Save MP4");
 assert.equal(await cards.nth(0).locator(".cf-short-share").count(),1);
 await cards.nth(0).locator(".cf-short-trim-toggle").click();
 await cards.nth(0).locator('input[aria-label="Short 1 trim end"]').evaluate(el=>{
  el.value="5.2";el.dispatchEvent(new Event("input",{bubbles:true}));
 });
 assert.equal(await page.evaluate(()=>clips[0].blob),null,
  "Trim after export must invalidate stale exported MP4");
 assert.equal(await cards.nth(0).locator("button.exp").textContent(),"Export");
 assert.equal(await cards.nth(0).locator(".cf-short-share").count(),0);

 // Tool switching must release inline playback without affecting source state.
 await second.locator(".cf-short-play").click();
 await page.waitForFunction(()=>!document.querySelectorAll("#list video")[1].paused,null,{timeout:12000});
 await page.evaluate(()=>window.ClipForgeNavigation.navigate("/tools/captions/"));
 assert.equal(await second.locator("video").evaluate(v=>v.paused),true);
 assert.equal(await page.evaluate(()=>SHORT_ACTIVE),null);
 // Source reload cleanup is independent of the current workspace's
 // navigation guard (some tool tabs block navigation while processing).
 const refreshed=await page.evaluate(()=>{
  load(file);
  return {cards:document.querySelectorAll("#list .clip").length,
   active:SHORT_ACTIVE===null,objectUrls:SHORT_RENDER_URLS.length,planned:clips.length};
 });
 assert.deepEqual(refreshed,{cards:0,active:true,objectUrls:0,planned:0},
  "A fresh upload must not retain stale Short previews or outdated trim/export cards");
 assert.deepEqual(errors,[],"No uncaught errors while previewing, trimming, exporting and switching");
 console.log("Shorts inline preview: hidden redundant canvas remains capture-ready, real local video playback, source player isolation, one active preview, in/out limit, collapsed edit, export state, mobile 9:16 and navigation passed.");
}finally{
 if(browser)await browser.close();
 await site.close();
 rmSync(temp,{recursive:true,force:true});
}