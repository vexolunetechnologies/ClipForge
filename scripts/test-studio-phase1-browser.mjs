import assert from "node:assert/strict";
import {chromium} from "playwright";
import {serveLocalSite} from "./test-http-server.mjs";
import {mkdirSync} from "node:fs";

const site = await serveLocalSite({rootDir:"public"});
let browser;
try {
  browser = await chromium.launch({headless:true,args:["--no-sandbox"]});
  const page = await browser.newPage({viewport:{width:1600,height:900}});
  const errors = [];
  page.on("pageerror",error => errors.push(error.message));
  await page.goto(site.origin+"/tools/editor/",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(() =>
    document.querySelector("#editorTool")?.dataset.phase1Ready === "1");
  await page.locator('link[data-studio-phase1]').evaluate(link => new Promise((resolve,reject) => {
    if(link.sheet) return resolve();
    link.addEventListener("load",resolve,{once:true});
    link.addEventListener("error",reject,{once:true});
  }));
  const editor = page.locator("#editorTool");
  const bounds = await page.evaluate(() => {
    const rect=selector=>{const {x,y,width,height,bottom}=document.querySelector(selector).getBoundingClientRect();
      return {x,y,width,height,bottom};};
    return {
      media:rect("#editorTool .st-assets"),
      monitor:rect("#editorTool .st-preview-panel"),
      inspector:rect("#editorTool .st-source-panel"),
      timeline:rect("#editorTool .st-timeline-panel"),
      toolbar:rect("#editorTool .st-p1-toolbar"),
      viewport:innerWidth,
      overflow:document.documentElement.scrollWidth>innerWidth+2
    };
  });
  assert.ok(bounds.media.width>260,"Media panel must have usable width: "+JSON.stringify(bounds));
  assert.ok(bounds.monitor.width>350,"Player must have usable width: "+JSON.stringify(bounds));
  assert.ok(bounds.inspector.width>=270,"Inspector must have usable width: "+JSON.stringify(bounds));
  assert.ok(bounds.media.x<bounds.monitor.x && bounds.monitor.x<bounds.inspector.x,
    "Layout order must match Media / Player / Inspector: "+JSON.stringify(bounds));
  assert.ok(bounds.timeline.y>=bounds.monitor.bottom-4 && bounds.timeline.width>1350,
    "Full-width timeline must remain below player: "+JSON.stringify(bounds));
  assert.ok(!bounds.overflow,"Editor must not cause document horizontal overflow");
  assert.equal(await editor.locator(".st-p1-toolbar button").count(),8);
  assert.ok(await editor.locator("#stAppExport").isVisible(),"Original export must stay visible");
  assert.ok(await editor.locator("#stProjectName").isVisible(),"Original project name must stay editable");
  for(const [key,original] of [
    ["audio","audio"],["text","text"],["stickers","stickers"],["effects","effects"],
    ["transitions","transitions"],["filters","effects"],["adjustment","effects"]
  ]){
    await editor.locator('[data-p1-tool="'+key+'"]').click();
    assert.equal(await editor.locator('[data-p1-tool="'+key+'"]').getAttribute("aria-pressed"),"true",
      "Category should activate: "+key);
    assert.ok(await editor.locator('[data-st-tab="'+original+'"].active').count(),
      "Category must delegate to real working editor pane: "+key);
    assert.ok(await editor.locator('[data-project-pane="tools"]').isVisible(),
      "Category tools must actually show: "+key);
  }
  await editor.locator('[data-p1-tool="media"]').click();
  assert.ok(await editor.locator('[data-project-pane="project"]').isVisible());
  assert.ok(await editor.locator("#stImport").count());
  const mediaSearch = editor.locator("#stP1Search");
  await mediaSearch.fill("nonexistent");
  assert.equal(await mediaSearch.inputValue(),"nonexistent");
  for(const category of ["video","audio","image","all"]){
    await editor.locator('[data-p1-filter="'+category+'"]').click();
    assert.equal(await editor.locator('[data-p1-filter="'+category+'"]').getAttribute("aria-pressed"),"true");
  }
  await mediaSearch.fill("");
  await editor.locator('[data-p1-tool="text"]').click();
  const previous = await page.evaluate(() => window.ClipForgeEditor.state.titles.length);
  await editor.locator('[data-st-action="text"]').click();
  assert.equal(await page.evaluate(() => window.ClipForgeEditor.state.titles.length),previous+1,
    "Text button must create a real editable title, not a placeholder");
  await editor.locator('[data-p1-inspector="animation"]').click();
  assert.ok(await editor.locator("#pAnim").isVisible(),"Animation tab must reveal actual text animation");
  await editor.locator('[data-p1-inspector="video"]').click();
  assert.ok(await editor.locator("#pStart").isVisible(),"Video tab must display real timeline start control");
  for(const key of ["audio","speed","adjust","source","video"]){
    await editor.locator('[data-p1-inspector="'+key+'"]').click();
    assert.equal(await editor.locator('[data-p1-inspector="'+key+'"]').getAttribute("aria-pressed"),"true",
      "Inspector tab must switch: "+key);
  }
  assert.ok(await editor.locator("#stSplit").count(),"Original split must remain mounted");
  assert.ok(await editor.locator("#stZoomFit").count(),"Original fit timeline must remain mounted");
  assert.ok(await editor.locator("#stAppSave").count(),"Original save project must remain mounted");
  await editor.locator('[data-p1-tool="stickers"]').click();
  const count = await page.evaluate(() => window.ClipForgeEditor.state.overlays.length);
  await editor.locator('[data-st-action="sticker"]').click();
  assert.equal(await page.evaluate(() => window.ClipForgeEditor.state.overlays.length),count+1,
    "Stickers action must create real overlay state");
  assert.deepEqual(errors,[],"No browser exceptions: "+errors.join(" | "));
  mkdirSync("reports",{recursive:true});
  await page.screenshot({path:"reports/studio-phase1-desktop.png",fullPage:true});
  console.log("Studio Phase 1: Desktop geometry, eight working toolbar categories, inspector switching, title/sticker creation and original export controls passed.");
} finally {
  await browser?.close();
  await site.close();
}
