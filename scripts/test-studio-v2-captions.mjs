import assert from "node:assert/strict";
import {chromium} from "playwright";
import {execFileSync} from "node:child_process";
import {readFileSync,mkdtempSync,rmSync,mkdirSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {serveLocalSite} from "./test-http-server.mjs";
const temp=mkdtempSync(join(tmpdir(),"cf-v2-captions-"));
const wav=join(temp,"dialogue.wav");
let site,browser;
try{
 execFileSync("ffmpeg",["-hide_banner","-loglevel","error","-y","-f","lavfi","-i","sine=frequency=550:sample_rate=16000","-t","2.5","-ac","1","-ar","16000","-c:a","pcm_s16le",wav],{timeout:30000});
 const data=readFileSync(wav);
 site=await serveLocalSite({rootDir:"public"});
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true});
 const errors=[],calls=[];
 page.on("pageerror",e=>errors.push(e.message));
 await page.route("**/api/v1/shorts/transcribe",async route=>{
  const payload=route.request().postDataJSON();
  calls.push({language:payload.language,isWav:typeof payload.audio==="string"&&payload.audio.startsWith("UklGR")});
  await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({
   segments:[{start:.2,end:1.8,text:"یہ ایک خوبصورت کہانی ہے",words:[
    {start:.2,end:.4,word:"یہ"},{start:.4,end:.7,word:"ایک"},
    {start:.7,end:1.05,word:"خوبصورت"},{start:1.05,end:1.35,word:"کہانی"},
    {start:1.35,end:1.8,word:"ہے"}]}]
  })});
 });
 await page.goto(site.origin+"/studio-v2/",{waitUntil:"load"});
 await page.waitForFunction(()=>!!window.ClipForgeStudioV2&&!!window.ClipForgeCaptionStyles&&!!window.ClipForgeStudioAutoCaptions);
 const lib=await page.evaluate(()=>({
  list:window.ClipForgeCaptionStyles.list,
  categories:window.ClipForgeCaptionStyles.groups.filter(g=>g.id!=="all"),
  all:window.ClipForgeCaptionStyles.groups.find(g=>g.id==="all").ids
 }));
 assert.equal(lib.list.length,55,"Expected the whole 55-style library from legacy Captions Studio");
 assert.equal(new Set(lib.list.map(([id])=>id)).size,55,"Preset IDs must be unique");
 assert.equal(lib.all.length,55,"All styles category must contain the complete library");
 const byCategory=lib.categories.flatMap(g=>g.ids);
 assert.equal(new Set(byCategory).size,55,"Each style should appear in only one category");
 await page.locator('[data-action="captions"]').click();
 await page.locator('#captionCategories [data-category="all"]').click();
 assert.equal(await page.locator("#captionStyleGallery .caption-style-card").count(),55);
 await page.locator('#captionStyleGallery [data-style="urdu-cinema"]').click();
 assert.equal((await page.evaluate(()=>window.ClipForgeStudioV2.getState())).captionStyle,"urdu-cinema");
 await page.locator("#captionStyleSearch").fill("cinema");
 assert.ok(await page.locator("#captionStyleGallery .caption-style-card").count()>=1);
 await page.locator("#captionStyleSearch").fill("");
 await page.locator("#closeMobileAssets").click();
 await page.locator("#fileInput").setInputFiles({name:"dialogue.wav",mimeType:"audio/wav",buffer:data});
 await page.waitForFunction(()=>window.ClipForgeStudioV2.getState().clips.some(c=>c.kind==="audio"));
 await page.locator('[data-action="captions"]').click();
 await page.locator("#autoCaptionLanguage").selectOption("urdu");
 await page.locator("#autoCaptionWords").selectOption("3");
 await page.locator("#autoCaptions").click();
 await page.waitForFunction(()=>window.ClipForgeStudioV2.getState().clips.filter(c=>c.kind==="caption").length===2,{timeout:20000});
 const captions=await page.evaluate(()=>window.ClipForgeStudioV2.getState().clips.filter(c=>c.kind==="caption").sort((a,b)=>a.start-b.start));
 assert.ok(Math.abs(captions[0].start-.2)<.05&&Math.abs(captions[0].duration-.85)<.07,"Word-level source timestamps should be mapped to the timeline");
 assert.ok(captions.every(c=>c.style==="urdu-cinema"),"Generated captions should use the selected style");
 assert.equal(calls.length,1,"Use the existing transcription endpoint");
 assert.equal(calls[0].language,"ur");
 assert.ok(calls[0].isWav,"Transcription service receives real WAV audio");
 const capture=(type,selector)=>{
  const p=page.waitForEvent("download",{timeout:12000});
  return page.locator(selector).click().then(()=>p).then(async download=>({
   filename:download.suggestedFilename(),content:readFileSync(await download.path(),"utf8")
  }));
 };
 const srt=await capture("srt","#exportCaptionSrt");
 assert.match(srt.content,/00:00:00,200 --> 00:00:01,050/);
 assert.ok(srt.content.includes("خوبصورت"));
 const vtt=await capture("vtt","#exportCaptionVtt");
 assert.ok(vtt.content.startsWith("WEBVTT\n\n"));
 await page.locator('#captionStyleGallery [data-style="cinema-gold"]').click();
 await page.locator("#applyAllCaptionStyles").click();
 let state=await page.evaluate(()=>window.ClipForgeStudioV2.getState());
 assert.ok(state.clips.filter(c=>c.kind==="caption").every(c=>c.style==="cinema-gold"));
 await page.locator("#closeMobileAssets").click();
 await page.evaluate(()=>window.ClipForgeStudioV2.setTime(.45));
 const painted=await page.evaluate(async()=>{
  const lib=window.ClipForgeCaptionStyles,previous=lib.draw;
  let hits=0;
  lib.draw=function(...args){hits++;return previous.apply(this,args);};
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  lib.draw=previous;
  return hits;
 });
 assert.ok(painted>0,"The editor's program monitor should use the same preset renderer as the caption library");
 mkdirSync("reports",{recursive:true});
 await page.locator('[data-action="captions"]').click();
 await page.screenshot({path:"reports/studio-v2-caption-gallery.png",fullPage:false});
 assert.deepEqual(errors,[],"Caption gallery / transcription should not throw page errors");
 console.log("Studio V2 captions passed: 55 unique styles/categories, language service request, word timing, styling, SRT/VTT, draw pipeline.");
}finally{
 await browser?.close();await site?.close();rmSync(temp,{recursive:true,force:true});
}