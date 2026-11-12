import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, statSync, mkdirSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { chromium } from "playwright";

const root = resolve(".");
const types = {".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json"};
const server = createServer((req, res) => {
  const uri = new URL(req.url, "http://localhost");
  const suffix = uri.pathname.endsWith("/") ? uri.pathname + "index.html" : uri.pathname;
  const file = resolve(root, "." + decodeURIComponent(suffix));
  if (!file.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
  try {
    if (!statSync(file).isFile()) throw Error("not a file");
    res.setHeader("Content-Type", types[extname(file)] || "application/octet-stream");
    res.end(readFileSync(file));
  } catch {
    res.writeHead(404, {"Content-Type":"text/plain"});
    res.end("Not found");
  }
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const base = "http://127.0.0.1:" + server.address().port;

let browser;
try {
  browser = await chromium.launch({headless:true, args:["--no-sandbox"]});
  const page = await browser.newPage({viewport:{width:1440,height:900}});
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e)));

  await page.goto(base + "/", {waitUntil:"domcontentloaded"});
  await page.waitForFunction(() => !!window.ClipForgeNavigation &&
    !!window.ClipForgeEditor && !!document.getElementById("cfCaptionsWorkspace"));
  await page.evaluate(() => { window.__clipForgeBrowserMarker = "same-document"; });
  assert.equal(await page.locator("#learning-center").isVisible(),true,
    "Free Creator Guides must remain visible on homepage");
  await page.locator('[data-route="tools"]').click();
  await page.waitForFunction(()=>document.body.dataset.page==="tools");
  assert.equal(await page.locator("#learning-center").isVisible(),true,
    "Free Creator Guides must remain visible on All Tools");


  const tools = ["shorts","trailer","animator","reverse","montage","highlights","captions","editor"];
  for (const tool of tools) {
    await page.locator('[data-tool-route="' + tool + '"]').click();
    await page.waitForFunction(t => location.pathname === "/tools/" + t + "/" &&
      document.body.dataset.page === "workspace" && document.body.dataset.tool === t, tool);
    assert.equal(new URL(page.url()).hash, "", "Duplicate hash in " + tool + " route");
    assert.equal(await page.evaluate(() => window.__clipForgeBrowserMarker), "same-document",
      "Switching " + tool + " unexpectedly reloaded the document");
    const visible = {shorts:"tool",trailer:"tool",animator:"iaTool",reverse:"rvTool",
      montage:"vmTool",highlights:"highlightsTool",captions:"cfCaptionsWorkspace",editor:"editorTool"}[tool];
    assert.equal(await page.locator("#" + visible).isVisible(), true, tool + " workspace not visible");
    assert.equal(await page.locator("#learning-center").isVisible(),false,
      tool+" must not show the Free Creator Guides section");
    assert.equal(await page.locator(".cf-lower-sections").isVisible(),false,
      tool+" must show only its tool-specific workspace without common marketing sections");

    if(tool==="highlights") {
      await page.waitForFunction(()=>document.getElementById("highlightsTool")?.dataset.ready==="1");
      assert.equal(await page.locator("#highlightsTool .cf-hs-media-panel").count(),1,
        "Highlights needs one Montage-style preview/scene panel");
      assert.equal(await page.locator("#highlightsTool .cf-hs-settings-panel").count(),1,
        "Highlights needs one separate output settings panel");
      const layout=await page.evaluate(()=>{
        const media=document.querySelector("#highlightsTool .cf-hs-media-panel").getBoundingClientRect(),
              settings=document.querySelector("#highlightsTool .cf-hs-settings-panel").getBoundingClientRect();
        return {mediaX:media.x,settingsX:settings.x,mediaRight:media.right,mediaY:media.y,
          settingsY:settings.y,bodyWidth:document.documentElement.scrollWidth,viewport:innerWidth};
      });
      assert.ok(layout.settingsX>layout.mediaRight,
        "Desktop Highlights must be two side-by-side Montage-style panels: "+JSON.stringify(layout));
      assert.ok(layout.bodyWidth<=layout.viewport+2,
        "Desktop Highlights should not overflow horizontally: "+JSON.stringify(layout));
      for(const id of ["hsVideo","hsSourcePreview","hsPlan","hsOutput","hsDuration","hsRatio",
        "hsMood","hsMusic","hsSfx","hsGenerate","hsStop","hsProgress","hsStatus"])
        assert.equal(await page.locator("#"+id).count(),1,"Highlights must preserve control "+id);
      const placeholder=page.locator("#highlightsTool .cf-hs-preview-empty");
      assert.equal(await placeholder.isVisible(),true,"Preview needs a useful upload placeholder");
      await page.evaluate(()=>document.getElementById("hsSourcePreview").style.display="block");
      assert.equal(await placeholder.isVisible(),false,
        "Placeholder must disappear when the existing JS reveals video");
      await page.evaluate(()=>document.getElementById("hsSourcePreview").style.display="none");
      await page.screenshot({path:"reports/highlights-workspace-desktop.png",fullPage:true});
      await page.locator("#hsGenerate").click();
      assert.equal((await page.locator("#hsStatus").textContent()).trim(),
        "Choose a source video first.","Unchanged Generate behavior must remain wired");
    }
    if (tool === "animator" || tool === "reverse") {
      const bounds = await page.locator("#" + visible).boundingBox();
      assert.ok(bounds && bounds.y < 180, tool + " retained the large top gap");
    }
    if (tool === "animator") await page.locator("#iaTool iframe").waitFor();
    if (tool === "captions") {
      assert.ok(await page.locator("#cfCapTemplateGrid button").count() >= 41,
        "Caption library lost its 41 styles");
    }
  }

  await page.locator("a.st-app-exit").click();
  await page.waitForFunction(() => location.pathname === "/" &&
    document.body.dataset.page === "home");
  assert.equal(await page.evaluate(() => window.__clipForgeBrowserMarker), "same-document");

  await page.goBack();
  await page.waitForFunction(() => location.pathname === "/tools/editor/" &&
    document.body.dataset.tool === "editor");

  await page.goto(base + "/tools/shorts/#shorts", {waitUntil:"domcontentloaded"});
  await page.waitForFunction(() => location.pathname === "/tools/shorts/" &&
    location.hash === "" && document.body.dataset.tool === "shorts");
  await page.reload({waitUntil:"domcontentloaded"});
  await page.waitForFunction(() => document.body.dataset.tool === "shorts");
  assert.equal(new URL(page.url()).hash, "");


  // All Tools compact-only redesign: responsive grid and untouched route behavior.
  mkdirSync("reports", {recursive:true});
  for (const width of [320, 390, 1440]) {
    const screen = await browser.newPage({viewport:{width,height:900},hasTouch:width<901,isMobile:width<901});
    const screenErrors=[];
    screen.on("pageerror", error=>screenErrors.push(String(error.message||error)));
    try {
      await screen.goto(base + "/#tools",{waitUntil:"domcontentloaded"});
      await screen.waitForFunction(()=>
        document.body.dataset.page==="tools" &&
        document.querySelectorAll("#tools a.toolcard").length===8 &&
        !!document.querySelector("#tools a.toolcard .cf-card-summary"),
        null,{timeout:10000});
      const sizes=await screen.evaluate(()=>{
        const section=document.querySelector("#tools");
        const grid=section.querySelector(".tools");
        const cards=Array.from(grid.querySelectorAll("a.toolcard"));
        const computed=getComputedStyle(grid);
        const boxes=cards.map(card=>{
          const r=card.getBoundingClientRect();
          return {left:Math.round(r.left),top:Math.round(r.top),
            width:Math.round(r.width),height:Math.round(r.height),
            hiddenList:getComputedStyle(card.querySelector("ul")).display==="none",
            visibleTitle:card.querySelector("h3").getBoundingClientRect().height>0,
            visibleDesc:card.querySelector(".cf-card-summary").getBoundingClientRect().height>0,
            visibleAction:card.querySelector(".go").getBoundingClientRect().height>0,
            icon:!!card.querySelector(".tool-icon")};
        });
        return {
          columns:computed.gridTemplateColumns.split(" ").filter(Boolean).length,
          cards:boxes,gridWidth:grid.clientWidth,gridScroll:grid.scrollWidth,
          viewport:innerWidth,documentWidth:document.documentElement.scrollWidth
        };
      });
      const expected=width>=1280?4:2;
      assert.equal(sizes.columns,expected,width+"px must show "+expected+" compact card columns");
      assert.equal(sizes.cards.length,8,"All original eight tool cards must remain");
      assert.ok(sizes.gridScroll<=sizes.gridWidth+2,
        "All Tools grid must not scroll sideways: "+width+" "+JSON.stringify(sizes));
      assert.ok(sizes.documentWidth<=sizes.viewport+2,
        "All Tools page must fit viewport: "+width);
      assert.ok(sizes.cards.every(card=>
        card.hiddenList && card.visibleTitle && card.visibleDesc && card.visibleAction &&
        card.icon && card.height<=180 && card.width>0),
        "All card content must be visible and compact at "+width+"px: "+JSON.stringify(sizes.cards));
      if(width<901) {
        const rows=new Set(sizes.cards.map(b=>b.top));
        assert.equal(rows.size,4,"Eight cards must form 2 columns × 4 rows on mobile");
      }
      await screen.locator("#tools").screenshot({path:"reports/compact-tools-"+width+".png"});
      assert.equal(await screen.locator("#learning-center").isVisible(),true,
        "All Tools guides should be visible on "+width+"px screens");
      if(width===390){
        await screen.locator('#tools a.toolcard[href="#captions"]').click();
        await screen.waitForFunction(()=>
          location.pathname==="/tools/captions/" && document.body.dataset.tool==="captions");
        assert.equal(await screen.locator("#learning-center").isVisible(),false,
          "Individual Captions Studio must not show guides on mobile");

      }
      assert.deepEqual(screenErrors,[],"No browser runtime error in compact All Tools at "+width);
    } finally {
      await screen.close();
    }
  }

  // The same Highlights workspace must remain usable and unclipped on phones.
  for(const width of [390,320]){
    const phone=await browser.newPage({viewport:{width,height:844},isMobile:true,hasTouch:true});
    const problems=[];
    phone.on("pageerror",e=>problems.push(String(e.message||e)));
    try{
      await phone.goto(base+"/tools/highlights/",{waitUntil:"domcontentloaded"});
      await phone.waitForFunction(()=>document.body.dataset.tool==="highlights" &&
        document.getElementById("highlightsTool")?.dataset.ready==="1");
      const layout=await phone.evaluate(()=>{
        const parent=document.querySelector("#highlightsTool"),
              media=parent.querySelector(".cf-hs-media-panel").getBoundingClientRect(),
              settings=parent.querySelector(".cf-hs-settings-panel").getBoundingClientRect(),
              go=parent.querySelector("#hsGenerate").getBoundingClientRect();
        return {media,settings,go,scroll:document.documentElement.scrollWidth,viewport:innerWidth};
      });
      assert.ok(layout.media.width>0&&layout.settings.width>0&&
        layout.settings.top>=layout.media.bottom-3,
        "Phone Highlights must stack preview then settings: "+JSON.stringify(layout));
      assert.ok(layout.scroll<=width+2,
        "Phone Highlights must not scroll horizontally: "+JSON.stringify(layout));
      assert.ok(layout.go.width>180&&layout.go.right<=width+1,
        "Phone Generate button must fit the screen: "+JSON.stringify(layout));
      await phone.screenshot({path:"reports/highlights-workspace-mobile-"+width+".png",fullPage:true});
      const choose=phone.waitForEvent("filechooser");
      await phone.locator('label[for="hsVideo"]').click();
      const picker=await choose;
      assert.ok(picker,"Highlights source upload must still open device file selection");
      assert.deepEqual(problems,[],"Highlights layout must have no JS errors");
    }finally{await phone.close();}
  }

  assert.deepEqual(errors, [], "Unexpected browser runtime errors");
  console.log("ClipForge: Chromium routing, eight workspaces, Back/Forward, refresh and clean URLs passed.");
} finally {
  if (browser) await browser.close();
  await new Promise((ok) => server.close(ok));
}
