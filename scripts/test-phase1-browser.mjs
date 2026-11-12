import assert from "node:assert/strict";
import { chromium } from "playwright";
import { serveLocalSite } from "./test-http-server.mjs";

const server = await serveLocalSite();
let browser;
try {
  browser = await chromium.launch({headless:true,args:["--no-sandbox"]});
  const page = await browser.newPage({viewport:{width:1365,height:820}});
  const errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto(server.origin + "/",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>!!window.ClipForgeNavigation && !!window.ClipForgeEditor &&
      !!document.getElementById("cfCaptionsWorkspace"));
  await page.waitForTimeout(100);

  // Home does not eagerly construct either style gallery, including the new Captions-only templates.
  assert.equal(await page.locator("#cfCapTemplateGrid button").count(),0,"Captions gallery constructed before opening Captions");
  assert.equal(await page.locator("#cfShortTemplateGrid button").count(),0,"Shorts sample gallery constructed before opening Shorts");
  assert.equal(await page.evaluate(()=>performance.getEntriesByType("resource")
    .some(entry=>/\/dist\/editor\/(timeline|studio-ui)\.js$/.test(new URL(entry.name).pathname))),false,
    "Studio enhancement modules were fetched on the home page");

  await page.locator('[data-tool-route="captions"]').click();
  await page.waitForFunction(()=>location.pathname==="/tools/captions/" &&
    document.body.dataset.tool==="captions" && document.querySelectorAll("#cfCapTemplateGrid button").length===(window.ClipForgeCaptionStyles.list.length+window.ClipForgeStudioCaptions.presets.length));
  const styleCount=await page.evaluate(()=>window.ClipForgeCaptionStyles.list.length+window.ClipForgeStudioCaptions.presets.length);
  assert.equal(styleCount,63,"Captions Studio must show 55 existing and 8 new templates");
  assert.equal(await page.locator("#cfCapTemplateGrid canvas").count(),styleCount);
  const canvases=page.locator("#cfCapTemplateGrid canvas");
  await canvases.first().scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelectorAll('#cfCapTemplateGrid canvas[data-cf-painted="1"]').length>0);
  const count=await page.locator('#cfCapTemplateGrid canvas[data-cf-painted="1"]').count();
  assert.ok(count < styleCount,"Offscreen caption samples should remain unpainted");
  await page.locator('#cfCaptionsWorkspace .cf-style-category[data-cf-category="all"]').click();
  await canvases.last().scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('#cfCapTemplateGrid canvas:last-of-type') ||
     document.querySelector('#cfCapTemplateGrid button:last-child canvas')?.dataset.cfPainted==="1");
  await page.waitForFunction(()=>document.querySelector('#cfCapTemplateGrid button:last-child canvas')?.dataset.cfPainted==="1");
  await page.locator("#cfCapTemplateGrid button").last().click();
  assert.equal(await page.locator("#cfCapTemplateGrid button.is-selected").count(),1,
    "Selecting a different caption style must preserve selected state");

  // Repeated mobile caption-preview updates must not resize a full video
  // canvas every time, which reallocates GPU/bitmap memory on low-end phones.
  await page.setViewportSize({width:390,height:844});
  const reuse=await page.evaluate(()=>{
   const canvas=document.getElementById("cfCapLive"),video=document.getElementById("cfCapVideo");
   video.dispatchEvent(new Event("timeupdate")); // Set up the canvas once.
   const w=Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,"width");
   const h=Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,"height");
   let writes=0;
   Object.defineProperty(canvas,"width",{configurable:true,get(){return w.get.call(this)},set(n){writes++;w.set.call(this,n)}});
   Object.defineProperty(canvas,"height",{configurable:true,get(){return h.get.call(this)},set(n){writes++;h.set.call(this,n)}});
   for(let i=0;i<8;i++)video.dispatchEvent(new Event("timeupdate"));
   return {writes,width:canvas.width,height:canvas.height};
  });
  assert.equal(reuse.writes,0,"Mobile caption preview must reuse its canvas across timeupdates");
  assert.ok(reuse.width>0&&reuse.height>0,"Caption preview canvas should remain initialized");
  await page.setViewportSize({width:1365,height:820});
  const urlBefore=page.url();
  await page.locator('[data-tool-route="animator"]').click();
  await page.waitForFunction(()=>location.pathname==="/tools/animator/");
  const iframe=await (await page.locator("#iaTool iframe").elementHandle()).contentFrame();
  await iframe.waitForFunction(()=>!!window.ClipForgeAnimatorIdle);
  assert.equal(await iframe.evaluate(()=>window.ClipForgeAnimatorIdle.paused),false);

  await page.locator('[data-tool-route="reverse"]').click();
  await iframe.waitForFunction(()=>window.ClipForgeAnimatorIdle.paused===true);
  assert.equal(await page.locator("#iaTool iframe").count(),1,"Animator media state must stay mounted");
  await page.locator('[data-tool-route="animator"]').click();
  await iframe.waitForFunction(()=>window.ClipForgeAnimatorIdle.paused===false);

  await page.locator('[data-tool-route="editor"]').click();
  await page.waitForFunction(()=>location.pathname==="/tools/editor/" &&
     document.querySelector("#editorTool")?.dataset.proUiReady==="1");
  assert.ok(await page.locator("#stAppExport").count(),"Studio toolbar did not load on editor entry");
  assert.equal(await page.evaluate(()=>performance.getEntriesByType("resource")
    .some(entry=>new URL(entry.name).pathname==="/dist/editor/timeline.js")),true,
    "Studio modules should load when opening the Editor");
  // Playing while the Editor is inactive would waste CPU and emit audio.
  await page.evaluate(()=>{window.ClipForgeEditor.state.playing=true;window.ClipForgeNavigation.navigate("/tools/shorts/")});
  assert.equal(await page.evaluate(()=>window.ClipForgeEditor.state.playing),false,
    "Editor playback should stop when leaving the Editor");
  assert.equal(new URL(page.url()).hash,"");
  assert.ok(urlBefore.includes("/tools/captions/"));
  assert.deepEqual(errors,[],"Browser must not emit new uncaught errors");
  console.log("ClipForge Phase 1: lazy galleries, selected caption style, animator pause, editor lazy loading and preview cleanup passed.");
} finally {
  if(browser)await browser.close();
  await server.close();
}
