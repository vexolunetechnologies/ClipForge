import assert from "node:assert/strict";
import {chromium} from "playwright";
import {execFileSync} from "node:child_process";
import {readFileSync,mkdtempSync,rmSync,mkdirSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {serveLocalSite} from "./test-http-server.mjs";
const dir=mkdtempSync(join(tmpdir(),"cf-studio-v2-"));
const path=join(dir,"sample.webm");
let site,browser;
try{
 execFileSync("ffmpeg",["-hide_banner","-loglevel","error","-y","-f","lavfi","-i","testsrc2=size=320x180:rate=12","-t","2",
  "-c:v","libvpx","-deadline","realtime","-cpu-used","8","-b:v","300k","-an",path],{timeout:30000});
 const buffer=readFileSync(path);
 site=await serveLocalSite({rootDir:"public"});
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 for(const device of [{name:"desktop",width:1440,height:900,mobile:false},{name:"mobile",width:390,height:844,mobile:true}]){
  const page=await browser.newPage({viewport:{width:device.width,height:device.height},isMobile:device.mobile,hasTouch:device.mobile});
  const errors=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto(site.origin+"/studio-v2/",{waitUntil:"load"});
  await page.waitForFunction(()=>!!window.ClipForgeStudioV2);
  assert.ok(await page.locator(".timeline").isVisible());
  assert.ok(await page.locator("#preview").isVisible());
  const widths=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+2,monitor:document.querySelector(".monitor").getBoundingClientRect().width,preview:document.querySelector("#preview").getBoundingClientRect().width}));
  assert.equal(widths.overflow,false,JSON.stringify(widths));assert.ok(widths.preview>=200,JSON.stringify(widths));
  if(device.mobile){
   const layout=await page.evaluate(()=>{
    const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom};};
    return {header:rect(".topbar"),monitor:rect(".monitor"),transport:rect(".transport"),timeline:rect(".timeline"),dock:rect(".mobile-dock"),playhead:rect("#playhead"),tabs:[...document.querySelectorAll(".mobile-dock button")].map(b=>b.lastChild?.textContent.trim()),css:[...document.styleSheets].some(s=>s.href?.includes("mobile-capcut.css"))};
   });
   assert.ok(layout.css,"CapCut reference layout sheet must be loaded");
   assert.ok(Math.abs(layout.monitor.w-device.width)<3,JSON.stringify(layout));
   assert.ok(layout.monitor.h>=220&&layout.monitor.h<=device.width+2,JSON.stringify(layout));
   assert.ok(layout.transport.y>=layout.monitor.bottom-2,JSON.stringify(layout));
   assert.ok(layout.timeline.y>=layout.transport.bottom-2,JSON.stringify(layout));
   assert.ok(layout.timeline.h>=190,JSON.stringify(layout));
   assert.ok(Math.abs(layout.playhead.x-device.width/2)<3,JSON.stringify(layout));
   assert.deepEqual(layout.tabs,["Edit","Audio","Text","Effects","Overlay","Captions"]);
   assert.ok(layout.dock.bottom<=device.height+2,JSON.stringify(layout));
   const hiddenDrawerTops=await page.evaluate(()=>[...document.querySelectorAll(".assets,.inspector")].map(el=>el.getBoundingClientRect().top));
   assert.ok(hiddenDrawerTops.every(top=>top>=device.height-1),
    "Closed mobile drawers must not cover the bottom dock: "+JSON.stringify(hiddenDrawerTops));
   assert.ok(await page.locator("#videoLane .empty-lane-action").isVisible(),"Add video should be visible when timeline is empty");
   assert.ok(await page.locator("#audioLane .empty-lane-action").isVisible(),"Add audio should be visible when timeline is empty");
   assert.ok(await page.locator("#textLane .empty-lane-action").isVisible(),"Add text should be visible when timeline is empty");
   mkdirSync("reports",{recursive:true});
   await page.screenshot({path:"reports/studio-v2-mobile-reference-empty.png"});
   await page.locator('[data-action="overlay"]').click();
   assert.ok(await page.locator("#tabOverlay.active").isVisible());
   await page.locator("#sheetBackdrop").click();
   assert.ok(await page.locator(".mobile-dock").isVisible());
   await page.locator('[data-action="text"]').click();assert.ok(await page.locator(".assets.sheet-open").isVisible());await page.locator("#sheetBackdrop").click();
  }
  else{assert.ok(await page.locator(".inspector").isVisible());assert.ok(await page.locator(".assets").isVisible());}
  await page.locator("#fileInput").setInputFiles({name:"sample.webm",mimeType:"video/webm",buffer});
  await page.waitForFunction(()=>window.ClipForgeStudioV2.getState().clips.length===1);
  assert.equal((await page.evaluate(()=>window.ClipForgeStudioV2.getState())).clips[0].kind,"video");
  await page.waitForFunction(()=>document.querySelectorAll("#videoLane .clip").length===1);
  await page.evaluate(()=>window.ClipForgeStudioV2.setTime(.8));
  if(device.mobile){
   const before=await page.evaluate(()=>window.ClipForgeStudioV2.getState());
   await page.evaluate(()=>{
    const timeline=document.querySelector("#timelineViewport");
    const t=(id,x)=>new Touch({identifier:id,target:timeline,clientX:x,clientY:570});
    const dispatch=(type,a,b)=>timeline.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,
      touches:[t(1,a),t(2,b)],targetTouches:[t(1,a),t(2,b)],changedTouches:[t(1,a),t(2,b)]}));
    dispatch("touchstart",150,250);
    dispatch("touchmove",125,275);
    timeline.dispatchEvent(new TouchEvent("touchend",{bubbles:true,cancelable:true,touches:[],changedTouches:[t(1,125),t(2,275)]}));
   });
   const after=await page.evaluate(()=>window.ClipForgeStudioV2.getState());
   assert.ok(after.zoom>before.zoom,"Pinch-out should zoom timeline without altering source media");
   assert.ok(Math.abs(after.time-before.time)<.08,"Pinch zoom must keep the playhead anchored to same time");
   assert.equal(after.clips.length,before.clips.length,"Pinch zoom must not change clip count");
  }
  await page.locator("#splitBtn").click();
  await page.waitForFunction(()=>window.ClipForgeStudioV2.getState().clips.length===2);
  await page.locator(device.mobile?"#mobileUndo":"#undoBtn").click();
  await page.waitForFunction(()=>window.ClipForgeStudioV2.getState().clips.length===1);
  await page.locator(device.mobile?"#mobileRedo":"#redoBtn").click();
  await page.waitForFunction(()=>window.ClipForgeStudioV2.getState().clips.length===2);
  await page.locator("#playBtn").click();
  await page.waitForTimeout(220);
  await page.locator("#playBtn").click();
  assert.ok((await page.evaluate(()=>window.ClipForgeStudioV2.getState())).time>=0);
  if(device.mobile){await page.waitForTimeout(270);mkdirSync("reports",{recursive:true});await page.screenshot({path:"reports/studio-v2-mobile-timeline.png"});}
  if(device.mobile)await page.locator('[data-action="text"]').click();
  else await page.locator('[data-tab="text"]').click();
  await page.locator("#newText").fill("Hello ClipForge");
  await page.locator("#addText").click();
  await page.waitForFunction(()=>window.ClipForgeStudioV2.getState().clips.some(c=>c.kind==="text"));
  assert.equal((await page.evaluate(()=>window.ClipForgeStudioV2.getState())).clips.length,3);
  // Caption creation works independently of the existing text tool.
  if(device.mobile)await page.locator('[data-action="captions"]').click();
  else await page.locator('[data-tab="captions"]').click();
  await page.locator("#newCaption").fill("سلام ClipForge");
  await page.locator("#addCaption").click();
  await page.waitForFunction(()=>window.ClipForgeStudioV2.getState().clips.some(c=>c.kind==="caption"&&c.text.includes("سلام")));
  // Import real SRT timestamps, preserve cue timing and content.
  const srt=["1","00:00:00,500 --> 00:00:01,700","SRT test caption","","2","00:00:02,000 --> 00:00:03,000","Next caption"].join("\n");
  await page.locator("#captionInput").setInputFiles({name:"captions.srt",mimeType:"text/plain",buffer:Buffer.from(srt)});
  await page.waitForFunction(()=>window.ClipForgeStudioV2.getState().clips.filter(c=>c.kind==="caption").length===3);
  const cues=await page.evaluate(()=>window.ClipForgeStudioV2.getState().clips.filter(c=>c.kind==="caption"));
  assert.ok(cues.some(c=>Math.abs(c.start-.5)<.001&&Math.abs(c.duration-1.2)<.001));
  // Place a real PNG overlay on the timeline and confirm it is selectable.
  const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==","base64");
  if(device.mobile)await page.locator('[data-action="overlay"]').click();
  else await page.locator('[data-tab="overlay"]').click();
  await page.locator("#overlayInput").setInputFiles({name:"overlay.png",mimeType:"image/png",buffer:png});
  await page.waitForFunction(()=>window.ClipForgeStudioV2.getState().clips.some(c=>c.kind==="overlay"));
  assert.equal(await page.locator("#textLane .clip.overlay").count(),1);
  assert.equal(await page.locator("#textLane .clip.caption").count(),3);
  if(device.mobile){
   const videoBefore=await page.evaluate(()=>window.ClipForgeStudioV2.getState().clips.find(c=>c.kind==="video").volume);
   await page.locator("#mobileMuteClip").click();
   const videoAfter=await page.evaluate(()=>window.ClipForgeStudioV2.getState().clips.find(c=>c.kind==="video").volume);
   assert.notEqual(videoBefore,videoAfter,"Mobile Mute Clip button must change real video volume");
   const coverDownload=page.waitForEvent("download",{timeout:15000});
   await page.locator("#mobileCover").click();
   const cover=await coverDownload;
   assert.ok(cover.suggestedFilename().endsWith(".png"));
   assert.ok(readFileSync(await cover.path()).length>500);
  }
  mkdirSync("reports",{recursive:true});
  await page.waitForTimeout(280);
  await page.screenshot({path:"reports/studio-v2-"+device.name+".png"});
  if(!device.mobile){
   // Export real video from canvas, verify downloadable media has a valid duration.
   const field=page.locator('#inspectorContent [data-field="duration"]');
   await field.fill("1");await field.dispatchEvent("change");
   const editedOverlay=await page.evaluate(()=>window.ClipForgeStudioV2.getState().clips.find(c=>c.kind==="overlay"));
   assert.equal(editedOverlay.duration,1,"Overlay duration must not become NaN when edited in inspector");
   const downloading=page.waitForEvent("download",{timeout:30000});
   await page.locator("#exportBtn").click();
   await page.locator("#startExport").click();
   let downloaded;
   try{downloaded=await downloading;}catch(error){
    const debug=await page.evaluate(()=>({
      status:document.querySelector("#status")?.textContent,
      exportText:document.querySelector("#exportText")?.textContent,
      exportDisabled:document.querySelector("#startExport")?.disabled,
      modalHidden:document.querySelector("#exportModal")?.hidden,
      state:window.ClipForgeStudioV2.getState(),
    }));
    console.error("V2 export diagnostics",JSON.stringify(debug),"page errors",JSON.stringify(errors));
    throw error;
   }
   const output=await downloaded.path();
   const bytes=readFileSync(output);
   assert.ok(bytes.length>2000,"Export must produce a real media file");
   const probe=JSON.parse(execFileSync("ffprobe",["-v","error","-show_format","-show_streams","-of","json",output],{encoding:"utf8",timeout:20000}));
   assert.ok(probe.streams.some(s=>s.codec_type==="video"),"Video track required in export");
   assert.ok(Number(probe.format?.duration)>1,"Export duration metadata must be valid: "+JSON.stringify(probe.format));
  }
  assert.deepEqual(errors,[],device.name+" uncaught JS errors");
  await page.close();
 }
 console.log("Studio V2 passed: desktop/mobile layout, real WebM import, timeline split, undo/redo, playback, text overlay.");
}finally{await browser?.close();await site?.close();rmSync(dir,{recursive:true,force:true});}
