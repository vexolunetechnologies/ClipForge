import assert from "node:assert/strict";
import {chromium} from "playwright";
import {mkdirSync} from "node:fs";
import {serveLocalSite} from "./test-http-server.mjs";

const site=await serveLocalSite();
let browser;
try{
 browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({viewport:{width:1280,height:880}});
 const errors=[];
 page.on("pageerror",error=>errors.push(error.message));
 await page.goto(site.origin+"/tools/captions/",{waitUntil:"domcontentloaded"});
 await page.waitForFunction(()=>window.ClipForgeCaptionStyles?.list?.length===55 &&
  document.querySelectorAll("#cfCapTemplateGrid button").length===63);
 const lib=await page.evaluate(()=>({
  count:window.ClipForgeCaptionStyles.list.length,
  modern:window.ClipForgeCaptionStyles.modernPresets.length,
  assigned:window.ClipForgeCaptionStyles.groups.filter(x=>x.id!=="all").reduce((n,x)=>n+x.ids.length,0)
 }));
 assert.deepEqual(lib,{count:55,modern:14,assigned:55});
 const ownership=await page.evaluate(()=>{
  const groups=window.ClipForgeCaptionStyles.groups;
  const owned=groups.filter(x=>x.id!=="all").flatMap(x=>x.ids);
  const all=groups.find(x=>x.id==="all").ids;
  const styles=window.ClipForgeCaptionStyles.list.map(x=>x[0]);
  return {groupIds:groups.map(x=>x.id),categoryTotal:owned.length,
   uniqueAssigned:new Set(owned).size,allCount:all.length,allUnique:new Set(all).size,
   coversEveryStyle:styles.every(x=>owned.includes(x)),
   originalCategoryExists:groups.some(x=>x.id==="classic")};
 });
 assert.equal(ownership.categoryTotal,55);
 assert.equal(ownership.uniqueAssigned,55,"No style should appear in two categories");
 assert.equal(ownership.allCount,55);
 assert.equal(ownership.allUnique,55,"All tab must never duplicate style cards");
 assert.ok(ownership.coversEveryStyle,"All 41 legacy styles must be categorized");
 assert.equal(ownership.originalCategoryExists,false,"No separate Original 41 section");
 const gallery=page.locator("#cfCaptionsWorkspace .cf-style-browser");
 assert.equal(await gallery.count(),1);
 const grid=page.locator("#cfCapTemplateGrid");
 const dims=await grid.evaluate(el=>({
  clientHeight:el.clientHeight,scrollHeight:el.scrollHeight,
  overflowY:getComputedStyle(el).overflowY,
  visible:[...el.querySelectorAll("button:not([hidden])")].length
 }));
 assert.equal(dims.visible,10,"Trending should contain 10 unique selected looks by default");
 assert.equal(dims.overflowY,"auto","Templates need a dedicated vertical scroll area");
 assert.ok(dims.clientHeight<=400,"Gallery should not scatter down the entire page");
 assert.ok(dims.scrollHeight>dims.clientHeight,"Gallery must be independently scrollable");
 assert.equal(await gallery.locator(".cf-style-selected").innerText(),"Selected: Creator Yellow");
 await gallery.locator('[data-cf-category="drama"]').click();
 const dramaCount=await grid.locator("button:visible").count();
 assert.ok(dramaCount>=6&&dramaCount<55,"Drama category must filter styles");
 await gallery.locator(".cf-style-search").fill("neon");
 const neonCount=await grid.locator("button:visible").count();
 assert.ok(neonCount>=2&&neonCount<10,"Search must find new and existing glow styles");
 await gallery.locator(".cf-style-search").fill("");
 await gallery.locator('[data-cf-category="all"]').click();
 assert.equal(await grid.locator('button:visible').count(),63,"All must show 63 unique choices in Captions Studio");
 assert.equal(await grid.locator('button[data-cf-preview-style]').count(),63,"Exactly one button per caption studio style ID");
 await gallery.locator('[data-cf-category="trending"]').click();
 await grid.locator('button[data-cf-preview-style="marker-sweep"]').click();
 assert.equal(await gallery.locator(".cf-style-selected").innerText(),"Selected: Marker Highlight");
 assert.equal(await grid.locator("button.is-selected").count(),1);
 assert.equal(await grid.locator('button[data-cf-preview-style="marker-sweep"]').getAttribute("aria-pressed"),"true");

 // Captions Studio adds 8 separate templates, without altering Shorts' original 55.
 await gallery.locator('[data-cf-category="motion-fx"]').click();
 assert.equal(await grid.locator('button:visible').count(),4);
 await gallery.locator('[data-cf-category="studio-pro"]').click();
 assert.equal(await grid.locator('button:visible').count(),4);
 await grid.locator('button[data-cf-preview-style="pro-lowerthird"]').click();
 assert.match(await gallery.locator(".cf-style-selected").innerText(),/Broadcast Lower Third/);
 assert.equal(await page.locator("#cfCapSize").count(),1);
 assert.equal(await page.locator("#cfCapMoveHandle").count(),1);
 await page.locator("#cfCapSize").evaluate(el=>{el.value="135";el.dispatchEvent(new Event("input",{bubbles:true}))});
 await page.locator("#cfCapPosX").evaluate(el=>{el.value="65";el.dispatchEvent(new Event("input",{bubbles:true}))});
 assert.equal(await page.locator("#cfCapSizeValue").innerText(),"135%");
 assert.equal(await page.locator("#cfCapPosXValue").innerText(),"65%");
 await page.locator("#cfCapResetPlace").click();
 assert.equal(await page.locator("#cfCapSizeValue").innerText(),"100%");
 assert.equal(await page.locator("#cfCapPosXValue").innerText(),"50%");
 const extra=await page.evaluate(()=>{
  const api=window.ClipForgeStudioCaptions;
  const samples={};
  function pixels(key,text,t,placement){
   const canvas=document.createElement("canvas");canvas.width=360;canvas.height=220;
   api.draw(canvas.getContext("2d"),text,key,360,220,t,2,placement);
   const data=canvas.getContext("2d").getImageData(0,0,360,220).data;
   let hash=2166136261,alpha=0;
   for(let i=0;i<data.length;i+=32){
    if(data[i+3]>0)alpha++;
    for(let j=0;j<4;j++)hash=Math.imul(hash^data[i+j],16777619)>>>0;
   }
   return {hash,alpha};
  }
  for(const [key] of api.presets)samples[key]=pixels(key,"STORY FIRST",.75,null);
  const moving={
   center:pixels("motion-rise","STORY FIRST",1,{x:.5,y:.65,size:1}),
   shifted:pixels("motion-rise","STORY FIRST",1,{x:.61,y:.42,size:1.25})
  };
  return {count:api.presets.length,unique:new Set(Object.values(samples).map(v=>v.hash)).size,
   allVisible:Object.values(samples).every(v=>v.alpha>10),
   motionA:pixels("motion-slide","STORY FIRST",.08,null),
   motionB:pixels("motion-slide","STORY FIRST",.75,null),
   urdu:pixels("pro-documentary","یہ کہانی بدل گئی",1,null),
   hindi:pixels("motion-rise","ये कहानी बदल गई",1,null),
   moving,clamped:api.safePlacement({x:0,y:1,size:1.5},"LONG CAPTIONS SHOULD STAY VISIBLE","pro-lowerthird",720,1280)};
 });
 assert.equal(extra.count,8);
 assert.ok(extra.unique>=7,"New templates must be visually distinct");
 assert.ok(extra.allVisible,"Every template needs visible output");
 assert.notEqual(extra.motionA.hash,extra.motionB.hash,"Animated templates should change over time");
 assert.notEqual(extra.moving.center.hash,extra.moving.shifted.hash,"Move and resize must change rendered pixels");
 assert.ok(extra.urdu.alpha>10&&extra.hindi.alpha>10,"Multilingual custom caption templates must render");
 assert.ok(extra.clamped.x>0&&extra.clamped.y<1,"Captions must stay within safe video bounds");
 await gallery.locator('[data-cf-category="trending"]').click();

 // All 14 modern styles must actually draw different pixels via the shared
 // caption renderer used by exported videos. Verify multilingual text paths.
 const rendered=await page.evaluate(()=>{
  const lib=window.ClipForgeCaptionStyles;
  function image(key,text){
   const canvas=document.createElement("canvas");canvas.width=360;canvas.height=220;
   const ctx=canvas.getContext("2d");
   lib.draw(ctx,text,key,360,220,1.4,3);
   const data=ctx.getImageData(0,0,360,220).data;
   let coverage=0,hash=2166136261;
   for(let i=0;i<data.length;i+=40){
    if(data[i+3]>0)coverage++;
    hash=Math.imul(hash^data[i],16777619)>>>0;
    hash=Math.imul(hash^data[i+1],16777619)>>>0;
    hash=Math.imul(hash^data[i+2],16777619)>>>0;
    hash=Math.imul(hash^data[i+3],16777619)>>>0;
   }
   return {coverage,hash};
  }
  return {
   english:lib.modernPresets.map(([key])=>({key,...image(key,"THIS IS OUR MOMENT")})),
   urdu:image("urdu-cinema","یہ کہانی بدل گئی"),
   hindi:image("creator-yellow","ये कहानी बदल गई"),
   classic:image("classic","The old style remains")
  };
 });
 assert.equal(rendered.english.length,14);
 assert.ok(rendered.english.every(x=>x.coverage>10),"Every new preset must render visible text");
 assert.ok(new Set(rendered.english.map(x=>x.hash)).size>=12,
  "New presets need visually distinct rendered designs, not renamed duplicates");
 assert.ok(rendered.urdu.coverage>10&&rendered.hindi.coverage>10&&rendered.classic.coverage>10);
 mkdirSync("reports",{recursive:true});
 await gallery.screenshot({path:"reports/trending-caption-gallery.png"});

 // Shorts uses the exact same library, with all 41 legacy styles still available.
 await page.locator('[data-tool-route="shorts"]').click();
 await page.waitForFunction(()=>location.pathname==="/tools/shorts/");
 assert.equal(await page.evaluate(()=>S.cs),"creator-yellow");
 // The Shorts settings appear after upload. This gallery-only regression exposes
 // the workspace without invoking the separate media-import workflow.
 await page.evaluate(()=>document.getElementById("work").classList.remove("hide"));
 await page.locator('#soBox [data-k="cap"][data-v="auto"]').click();
 await page.waitForFunction(()=>document.querySelectorAll("#cfShortTemplateGrid button").length===55);
 const short=page.locator("#stylebox .cf-style-browser");
 assert.equal(await short.count(),1);
 const shortHeight=await short.locator("#cfShortTemplateGrid").evaluate(el=>({
  client:el.clientHeight,scroll:el.scrollHeight,overflow:getComputedStyle(el).overflowY
 }));
 assert.ok(shortHeight.client<=310&&shortHeight.scroll>shortHeight.client);
 assert.equal(shortHeight.overflow,"auto");
 await short.locator('[data-cf-category="trending"]').click();
 await short.locator('button[data-cf-preview-style="podcast-lime"]').click();
 assert.equal(await page.evaluate(()=>S.cs),"podcast-lime");
 assert.match(await short.locator(".cf-style-selected").innerText(),/Podcast Lime/);
 assert.equal(new URL(page.url()).hash,"");

 // Small screens keep a two-column, bounded gallery rather than growing the page.
 await page.setViewportSize({width:390,height:844});
 const mobile=await short.locator("#cfShortTemplateGrid").evaluate(el=>({
  width:el.clientWidth,columns:getComputedStyle(el).gridTemplateColumns.split(" ").length,
  height:el.clientHeight,scroll:el.scrollHeight
 }));
 assert.equal(mobile.columns,2);
 assert.ok(mobile.height<=310 && mobile.scroll>mobile.height);
 assert.deepEqual(errors,[],"No uncaught browser errors");
 console.log("ClipForge captions: 55 shared styles plus 8 studio-only motion/pro templates, movable/resizable captions, export renderer, Urdu/Hindi, Shorts and mobile layout passed.");
}finally{
 if(browser)await browser.close();
 await site.close();
}
