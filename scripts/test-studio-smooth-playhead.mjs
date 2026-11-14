/*
 * Studio desktop: compact category toolbar, compositor playhead,
 * paced preview and non-jumping timeline follow.
 * Tests real media import as well as scrolling over a longer sequence.
 */
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {mkdtempSync,readFileSync,rmSync,mkdirSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {chromium} from "playwright";
import {serveLocalSite} from "./test-http-server.mjs";

const working=mkdtempSync(join(tmpdir(),"clipforge-studio-playhead-"));
const sample=join(working,"studio-playhead.webm");
execFileSync("ffmpeg",[
  "-hide_banner","-loglevel","error","-y",
  "-f","lavfi","-i","testsrc2=size=640x360:rate=24:duration=4",
  "-c:v","libvpx","-b:v","280k","-an",sample
],{timeout:30000});
const site=await serveLocalSite({rootDir:"public"});
let browser;
try{
  browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  const page=await browser.newPage({viewport:{width:1600,height:900}});
  const errors=[];
  page.on("pageerror",err=>errors.push(err.message));
  await page.goto(site.origin+"/tools/editor/",{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>document.querySelector("#editorTool")?.dataset.phase1Ready==="1");
  await page.waitForFunction(()=>!!document.querySelector('link[data-studio-phase1]')?.sheet);
  const editor=page.locator("#editorTool");
  const toolbar=editor.locator(".st-p1-toolbar");
  assert.equal(await toolbar.locator("button").count(),8,"All working tool categories remain");
  const appearance=await page.evaluate(()=>{
    const toolbar=document.querySelector(".st-p1-toolbar");
    const button=toolbar.querySelector("button");
    return {
      height:toolbar.getBoundingClientRect().height,
      buttonHeight:button.getBoundingClientRect().height,
      icons:toolbar.querySelectorAll("button .st-p1-icon svg").length,
      workspaceTop:document.querySelector("#editorTool>.st-workspace").getBoundingClientRect().top,
      toolbarBottom:toolbar.getBoundingClientRect().bottom
    };
  });
  assert.ok(appearance.height<=46,"Compact desktop tool strip: "+JSON.stringify(appearance));
  assert.ok(appearance.buttonHeight<=39,"Compact action button: "+JSON.stringify(appearance));
  assert.equal(appearance.icons,8,"Consistent SVG icons on every category");
  assert.ok(appearance.toolbarBottom<=appearance.workspaceTop+3,
    "Tool strip must not overlap the viewport-bound workspace");
  await toolbar.locator('[data-p1-tool="transitions"]').click();
  const transitions=await editor.locator('[data-st-pane="transitions"] .st-effect-grid button').all();
  assert.equal(transitions.length,5,"All original transition actions preserved");
  const thumbnails=await page.evaluate(()=>{
    const pane=document.querySelector('[data-st-pane="transitions"]');
    const title=getComputedStyle(pane,"::before").content;
    const previews=[...pane.querySelectorAll(".st-effect-grid button")].map(b=>getComputedStyle(b,"::before").content);
    return {title,previews};
  });
  assert.match(thumbnails.title,/Transitions/);
  assert.ok(thumbnails.previews.every(x=>x!=='none'&&x!=='""'),
    "Transition cards need distinct diagrams instead of blank boxes: "+JSON.stringify(thumbnails));

  await editor.locator("#stImport").setInputFiles({
    name:"studio-playhead.webm",mimeType:"video/webm",buffer:readFileSync(sample)
  });
  await page.waitForFunction(()=>window.ClipForgeEditor?.state?.media?.some(m=>m.kind==="video"));
  await editor.locator("#stMedia .st-media-item").first().click();
  await page.waitForFunction(()=>window.ClipForgeEditor?.state?.clips?.length===1);
  const motion=await page.evaluate(()=>new Promise(resolve=>{
    const state=window.ClipForgeEditor.state,head=document.querySelector("#stPlayhead");
    const entries=[],start=performance.now();
    document.querySelector("#stPlay").click();
    const frame=()=>{
      const transform=head.style.transform;
      const x=Number((transform.match(/translate3d\(([-\d.]+)px/)||[])[1]);
      entries.push({time:state.time,x});
      if(performance.now()-start>=650){
        document.querySelector("#stPlay").click();
        resolve(entries);
      }else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }));
  assert.ok(motion.length>=5,"Playback must render several animation frames");
  const first=motion[0],last=motion[motion.length-1];
  assert.ok(last.time-first.time>.22,"Actual video playback time must advance: "+JSON.stringify({first,last}));
  const uniqueX=new Set(motion.filter(s=>Number.isFinite(s.x)).map(s=>s.x.toFixed(2)));
  assert.ok(uniqueX.size>=5,"Playhead must advance in smooth fractional-pixel steps: "+JSON.stringify({count:uniqueX.size,first,last}));
  assert.ok(motion.every((s,i)=>i===0||s.x>=motion[i-1].x-1),
    "Playhead must not jump backwards while playing");
  assert.ok(motion.every(s=>Number.isFinite(s.x)),"Desktop playhead must use a compositor transform");
  assert.ok(await editor.locator("#stAppExport").isVisible(),"Original export stays visible");

  // Exercise auto-follow with a long sequence: scroll starts easing without
  // snapping the timeline fully to the playhead's position in one frame.
  const follow=await page.evaluate(()=>{
    const api=window.ClipForgeEditor,state=api.state,sc=document.querySelector(".st-timeline-scroll");
    state.titles.push({id:"test-sequence-end",name:"Sequence marker",text:"",
      start:18,in:0,out:1,duration:1,color:"#fff",size:5,animation:"None"});
    state.zoom=180;
    api.render();
    sc.scrollLeft=0;
    api.seek(11);
    state.playing=true;
    state.lastFollowAt=0;
    const samples=[sc.scrollLeft];
    for(let i=0;i<15;i++){api.draw();samples.push(sc.scrollLeft)}
    state.playing=false;
    return {samples,maxScroll:sc.scrollWidth-sc.clientWidth};
  });
  assert.ok(follow.maxScroll>200,"A long sequence must overflow the timeline viewport");
  assert.ok(follow.samples[1]>follow.samples[0],"Playback should follow an offscreen playhead");
  assert.ok(follow.samples[1]<follow.maxScroll*.8,"Auto-follow must ease rather than snap to end");
  assert.ok(follow.samples.every((s,i)=>i===0||s>=follow.samples[i-1]-1),
    "Auto-follow scroll must be monotonic over continuous playback");
  assert.ok(follow.samples.at(-1)>follow.samples[1],
    "Auto-follow should continue smoothly as playback advances");

  // Test narrower desktop widths; category strip can scroll, never oversize.
  await page.setViewportSize({width:820,height:650});
  const resized=await page.evaluate(()=>({
    toolbarHeight:document.querySelector(".st-p1-toolbar").getBoundingClientRect().height,
    timelineBottom:document.querySelector(".st-timeline-panel").getBoundingClientRect().bottom,
    viewport:innerHeight,
    documentWidth:document.documentElement.scrollWidth,
    viewportWidth:innerWidth
  }));
  assert.ok(resized.toolbarHeight<=46,"Toolbar must remain compact at 820px");
  assert.ok(resized.timelineBottom<=resized.viewport+4,
    "Timeline must stay visible after browser resize: "+JSON.stringify(resized));
  assert.ok(resized.documentWidth<=resized.viewportWidth+3,
    "Tool strip should scroll locally, not create document overflow");

  assert.deepEqual(errors,[],"No JavaScript errors during playback, controls or resize");
  await page.setViewportSize({width:1600,height:900});
  mkdirSync("reports",{recursive:true});
  await toolbar.locator('[data-p1-tool="transitions"]').click();
  await page.screenshot({path:"reports/studio-compact-toolbar-playhead.png",fullPage:true});
  console.log("Studio motion: compact toolbar, vector icons, transition diagrams, real-video playhead, eased scroll and responsive viewport passed.");
}finally{
  await browser?.close();
  await site.close();
  rmSync(working,{recursive:true,force:true});
}
