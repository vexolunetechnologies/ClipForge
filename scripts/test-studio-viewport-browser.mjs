/* Desktop Studio must stay fully visible after real video import and window resize. */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtempSync, readFileSync, rmSync, mkdirSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {chromium} from "playwright";
import {serveLocalSite} from "./test-http-server.mjs";

const working = mkdtempSync(join(tmpdir(),"clipforge-studio-viewport-"));
const sample = join(working,"studio-fit-test.mp4");
execFileSync("ffmpeg",[
  "-hide_banner","-loglevel","error","-y",
  "-f","lavfi","-i","testsrc2=size=640x360:rate=15:duration=2",
  "-c:v","libx264","-pix_fmt","yuv420p","-movflags","+faststart",sample
],{timeout:30000});

const site = await serveLocalSite({rootDir:"public"});
let browser;
try {
  browser = await chromium.launch({headless:true,args:["--no-sandbox"]});
  const page = await browser.newPage({viewport:{width:1589,height:928}});
  const errors=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto(site.origin+"/tools/editor/",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.querySelector("#editorTool")?.dataset.phase1Ready==="1");
  await page.waitForFunction(()=>!!document.querySelector('link[data-studio-phase1]')?.sheet);
  const editor = page.locator("#editorTool");
  const geometry = () => page.evaluate(() => {
    const rect = sel => {
      const node=document.querySelector(sel);
      const r=node?.getBoundingClientRect();
      return r?{top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height}:null;
    };
    const scroll=document.querySelector("#editorTool .st-timeline-scroll");
    return {
      viewport:{width:innerWidth,height:innerHeight},
      root:rect("#editorTool"),
      appbar:rect("#editorTool > .st-appbar"),
      toolbar:rect("#editorTool > .st-p1-toolbar"),
      workspace:rect("#editorTool > .st-workspace"),
      media:rect("#editorTool .st-assets"),
      preview:rect("#editorTool .st-preview-panel"),
      inspector:rect("#editorTool .st-source-panel"),
      timeline:rect("#editorTool .st-timeline-panel"),
      timelineScroll:rect("#editorTool .st-timeline-scroll"),
      scrollHeight:scroll?.scrollHeight,
      visibleScrollHeight:scroll?.clientHeight,
      pageWidth:document.documentElement.scrollWidth
    };
  });
  async function verifyFit(stage) {
    await page.evaluate(()=>new Promise(requestAnimationFrame));
    const m=await geometry();
    const margin=4;
    assert.ok(m.root.height<=m.viewport.height+margin,stage+" root exceeds viewport "+JSON.stringify(m));
    assert.ok(m.timeline.bottom<=m.viewport.height+margin,
      stage+" timeline disappears below browser "+JSON.stringify(m));
    assert.ok(m.timeline.top>=m.preview.bottom-margin,
      stage+" timeline overlaps preview "+JSON.stringify(m));
    assert.ok(m.timeline.height>=145,
      stage+" timeline height unusable "+JSON.stringify(m));
    assert.ok(m.timelineScroll.height>=75,
      stage+" timeline lanes hidden "+JSON.stringify(m));
    assert.ok(m.preview.height>=150,
      stage+" preview height unusable "+JSON.stringify(m));
    assert.ok(m.pageWidth<=m.viewport.width+margin,
      stage+" editor creates horizontal browser scrolling "+JSON.stringify(m));
    assert.ok(m.toolbar.bottom<=m.workspace.top+margin,
      stage+" toolbar overlaps workspace "+JSON.stringify(m));
    console.log("Studio viewport:",stage,JSON.stringify({
      viewport:m.viewport,root:m.root.height,preview:m.preview.height,
      timeline:m.timeline.height,timelineBottom:m.timeline.bottom,
      timelineScroll:m.timelineScroll.height,contentScrollHeight:m.scrollHeight
    }));
  }

  await verifyFit("initial 1589x928");

  // Import a genuine H.264 MP4, then put it on the existing timeline.
  await editor.locator("#stImport").setInputFiles({
    name:"studio-fit-test.mp4",mimeType:"video/mp4",buffer:readFileSync(sample)
  });
  await page.waitForFunction(() =>
    window.ClipForgeEditor?.state?.media?.some(media=>media.kind==="video"),null,{timeout:15000});
  await editor.locator("#stMedia .st-media-item").first().click();
  await page.waitForFunction(()=>window.ClipForgeEditor?.state?.clips?.length>0);
  await verifyFit("imported video");

  // Keep the actual selection/properties inspector open, like the user screenshot.
  await editor.locator('[data-p1-tool="text"]').click();
  await editor.locator('[data-st-action="text"]').click();
  assert.ok(await editor.locator("#pStart").count());
  await editor.locator('[data-p1-inspector="video"]').click();
  await verifyFit("selected overlay inspector");

  for (const [width,height] of [[1600,900],[1280,720],[1024,768],[820,650],[1589,928]]) {
    await page.setViewportSize({width,height});
    await verifyFit("resized "+width+"x"+height);
    assert.ok(await editor.locator("#stAppExport").isVisible(),"Export must remain accessible");
    assert.ok(await editor.locator("#stSplit").isVisible(),"Split must remain accessible");
    assert.ok(await editor.locator(".st-timeline-scroll").isVisible(),"Timeline must stay visible");
  }
  await page.setViewportSize({width:1589,height:928});
  mkdirSync("reports",{recursive:true});
  await page.screenshot({path:"reports/studio-viewport-after-import-desktop.png",fullPage:true});
  assert.deepEqual(errors,[],"No browser exceptions: "+errors.join(" | "));
  console.log("Studio viewport: real video import + inspector + five window sizes passed.");
} finally {
  await browser?.close();
  await site.close();
  rmSync(working,{recursive:true,force:true});
}
