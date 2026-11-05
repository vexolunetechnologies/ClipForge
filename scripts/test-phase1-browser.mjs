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

  // Home does not eagerly construct either set of 41 sample cards.
  assert.equal(await page.locator("#cfCapTemplateGrid button").count(),0,"Captions gallery constructed before opening Captions");
  assert.equal(await page.locator("#cfShortTemplateGrid button").count(),0,"Shorts sample gallery constructed before opening Shorts");
  assert.equal(await page.evaluate(()=>performance.getEntriesByType("resource")
    .some(entry=>/\/dist\/editor\/(timeline|studio-ui)\.js$/.test(new URL(entry.name).pathname))),false,
    "Studio enhancement modules were fetched on the home page");

  await page.locator('[data-tool-route="captions"]').click();
  await page.waitForFunction(()=>location.pathname==="/tools/captions/" &&
    document.body.dataset.tool==="captions" && document.querySelectorAll("#cfCapTemplateGrid button").length===41);
  assert.equal(await page.locator("#cfCapTemplateGrid canvas").count(),41);
  const canvases=page.locator("#cfCapTemplateGrid canvas");
  await canvases.first().scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelectorAll('#cfCapTemplateGrid canvas[data-cf-painted="1"]').length>0);
  const count=await page.locator('#cfCapTemplateGrid canvas[data-cf-painted="1"]').count();
  assert.ok(count < 41,"Offscreen caption samples should remain unpainted");
  await canvases.last().scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('#cfCapTemplateGrid canvas:last-of-type') ||
     document.querySelector('#cfCapTemplateGrid button:last-child canvas')?.dataset.cfPainted==="1");
  await page.waitForFunction(()=>document.querySelector('#cfCapTemplateGrid button:last-child canvas')?.dataset.cfPainted==="1");
  await page.locator("#cfCapTemplateGrid button").last().click();
  assert.equal(await page.locator("#cfCapTemplateGrid button.is-selected").count(),1,
    "Selecting a different caption style must preserve selected state");

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
