import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const from = (p) => readFileSync(join(root, p), "utf8");
const has = (p) => assert.ok(existsSync(join(root, p)), "Missing: " + p);
const tools = ["shorts", "trailer", "animator", "reverse", "montage", "highlights", "editor", "captions"];
const files = [
  ["_worker.js", "public/_worker.js"],
  ["styles.css", "public/assets/css/styles.css"],
  ["editor-mobile-layout.css", "public/editor-mobile-layout.css"],
  ["editor-mobile-thumbnails.js", "public/editor-mobile-thumbnails.js"],
  ["app.js", "public/assets/js/core/app.js"],
  ["navigation.js", "public/navigation.js"],
  ["navigation.js", "public/assets/js/core/navigation.js"],
  ["editor-loader.js", "public/editor-loader.js"],
  ["animator-idle.js", "public/animator-idle.js"],
  ["editor-loader.js", "public/assets/js/core/editor-loader.js"],
  ["animator-idle.js", "public/assets/js/core/animator-idle.js"],
  ["caption-style-library.js", "public/assets/js/shared/caption-style-library.js"],
  ["captions-studio.js", "public/assets/js/tools/captions-studio.js"],
  ["captions-studio-enhancements.js", "public/assets/js/tools/captions-studio-enhancements.js"],
  ["highlights-studio.js", "public/assets/js/tools/highlights-studio.js"],
  ["transcription-queue.js", "public/transcription-queue.js"],
  ["transcription-queue.js", "public/assets/js/shared/transcription-queue.js"],
  ["dist/editor/studio-ui.js", "public/dist/editor/studio-ui.js"],
  ["dist/editor/timeline.js", "public/dist/editor/timeline.js"]
];
for (const [source, destination] of files) {
  has(destination);
  assert.equal(from(source), from(destination), "Unexpected engine change: " + source);
}
has("public/index.html");
const page = from("public/index.html");
assert.match(page, /\/tools\/shorts\//);
assert.match(page, /\/assets\/js\/core\/app\.js/);
for (const tool of tools) {
  const pathname = "public/tools/" + tool + "/index.html";
  has(pathname);
  const html = from(pathname);
  assert.doesNotMatch(html, /data-cf-tool-bootstrap|data-cf-link-bridge/);
  assert.ok(html.includes("https://clipforgestudio.pages.dev/tools/" + tool + "/"), "Missing clean canonical URL");
  assert.match(html, /\/assets\/css\/styles\.css/);
  assert.match(html, /\/editor-mobile-layout\.css\?v=capcut-reference-2/, "CapCut-inspired editor stylesheet must load on tool pages");
  assert.match(html, /src="\/assets\/js\/core\/editor-loader\.js(?:\?[^"]*)?"/);
  assert.doesNotMatch(html, /<script[^>]+src="\/dist\/editor\/(?:timeline|studio-ui)\.js"/);
  assert.match(html, /src="\/assets\/js\/core\/navigation\.js"/);
}
for (const name of ["about", "contact", "privacy", "terms", "cookies", "copyright"]) {
  has("public/" + name + ".html");
}
const worker = from("public/_worker.js");
for (const endpoint of [
  "/api/v1/shorts/transcribe", "/api/v1/shorts/semantic-plan",
  "/api/v1/highlights/plan", "/api/v1/media/import"
]) assert.ok(worker.includes(endpoint), "Missing API: " + endpoint);
assert.match(worker, /env\.ASSETS\.fetch\(request\)/);
assert.match(from("public/dist/editor/layout.js"), /toolcard\[href="\/tools\/editor\/"\]/);

const rootHome = from("index.html");
assert.match(rootHome, /src="\/navigation\.js"/);
assert.match(rootHome, /src="\/transcription-queue\.js"/);
assert.ok(rootHome.indexOf('src="/transcription-queue.js"') < rootHome.indexOf('src="/highlights-studio.js?v=20261112-gallery-duration-1"'),"Queue must load before Highlights Studio");
for (const tool of tools) {
  const standalone = "tools/" + tool + "/index.html";
  has(standalone);
  const html = from(standalone);
  assert.doesNotMatch(html, /data-cf-tool-bootstrap|data-cf-link-bridge/);
  assert.ok(html.includes("https://clipforgestudio.pages.dev/tools/" + tool + "/"), "Missing canonical route");
  assert.match(html, /src="\/app\.js(?:\?[^"]+)?"/);
  assert.match(html, /src="\/navigation\.js"/);
  assert.match(html, /href="#editor"/);
}

// Deployment fallback regression: direct tool HTML may be served without running
// the public/ generator. Both layouts must wrap the redundant recording canvas.
for (const tool of tools) {
  const direct = from("tools/" + tool + "/index.html");
  assert.ok(direct.includes('<div id="cfLivePreviewBlock">'),
    "Direct tool HTML must wrap the live preview canvas: " + tool);
  assert.ok(direct.includes('href="/styles.css?v=20261112-compact-tools-v1"'),
    "Direct tool HTML needs fresh preview-hiding stylesheet: " + tool);
  const generated = from("public/tools/" + tool + "/index.html");
  assert.ok(generated.includes('<div id="cfLivePreviewBlock">'),
    "Generated tool HTML must also wrap the preview: " + tool);
}
for (const tool of tools) {
 const html=from("tools/" + tool + "/index.html");
 assert.ok(html.includes('id="toast" role="alert"'),"Direct "+tool+" page needs accessible toast");
}
assert.match(from("app.js"), /navigator\.wakeLock\.request\('screen'\)/,
 "Screen Wake Lock support must remain available");
assert.match(from("app.js"), /scanWake=await navigator\.wakeLock\.request\('screen'\)/,
 "AI scanning should request a Wake Lock");
assert.match(from("app.js"), /await scanWake\.release\(\)/,
 "AI scan Wake Lock must be released");
// Compact All Tools design must be consistent with every direct and built entry point.
for (const [label, markup] of [
 ["root", rootHome],["built home",page],
 ...tools.map(t=>["direct "+t,from("tools/"+t+"/index.html")]),
 ...tools.map(t=>["built "+t,from("public/tools/"+t+"/index.html")])
]) {
 assert.equal((markup.match(/class="cf-card-summary"/g)||[]).length,8,
  label+" should show eight concise card descriptions");
 assert.equal((markup.match(/class="tool-icon"/g)||[]).length>=4,true,
  label+" must include compact first-row icons");
 assert.ok(markup.includes('href="#editor"')||markup.includes('href="/tools/editor/"'),
  label+" must preserve Studio Editor navigation");
}
const css = from("styles.css");
assert.ok(css.includes('body[data-tool="shorts"] #cfLivePreviewBlock{display:none!important}'),
  "Shorts must hide the wrapper rather than removing the export canvas");
assert.match(css, /body\[data-page="workspace"\]\[data-tool="animator"\] #top\.wrap/);
assert.match(css, /body\[data-page="workspace"\]\[data-tool="reverse"\] #top\.wrap/);
assert.match(css, /display:none!important;/);
// Search crawlability & original content checks. No AdSense ID is fabricated.
has("public/robots.txt");
has("public/sitemap.xml");
has("public/guides.css");
has("public/guides/index.html");
const robots = from("public/robots.txt");
assert.ok(robots.includes("User-agent: *\nAllow: /\nSitemap: https://clipforgestudio.pages.dev/sitemap.xml\n"),
  "Crawler directives should contain real newlines and a public sitemap URL");
const sitemap = from("public/sitemap.xml");
assert.match(sitemap, /^<\?xml version="1\.0"/);
assert.ok(sitemap.includes("<urlset xmlns="));
assert.equal((sitemap.match(/<loc>/g)||[]).length, 20, "Every guide, legal page and tool should have a discoverable URL");
const guides = ["long-video-to-shorts","urdu-hindi-captions","export-video-formats","browser-video-privacy"];
const pageGuide = from("public/guides/index.html");
for(const slug of guides){
 const location = "/guides/" + slug + "/";
 has("public/guides/" + slug + "/index.html");
 assert.ok(sitemap.includes("https://clipforgestudio.pages.dev" + location));
 assert.ok(pageGuide.includes('href="' + location + '"'),"Learning Center must link to " + slug);
 const article = from("public/guides/" + slug + "/index.html");
 assert.ok(article.includes('<link rel="canonical" href="https://clipforgestudio.pages.dev' + location + '">'));
 assert.ok(article.includes("<h1>")&&article.includes("<h2>"));
 const wordCount = article.replace(/<script[\s\S]*?<\/script>/g," ").replace(/<[^>]*>/g," ").trim().split(/\s+/).length;
 assert.ok(wordCount>=400,"Guides should contain substantive original reading material: " + slug + " (" + wordCount + " words)");
}
assert.match(page, /href="\/guides\/"/);
assert.match(page, /id="learning-center"/);
assert.match(page, /<meta name="description" content="[^"]{30,}"/);
assert.ok(page.includes('<link rel="canonical" href="https://clipforgestudio.pages.dev/">'));
for(const tool of tools){
 const html=from("public/tools/" + tool + "/index.html");
 assert.equal((html.match(/rel="canonical"/g)||[]).length,1,"Exactly one canonical for "+tool);
 assert.ok(html.includes('href="https://clipforgestudio.pages.dev/tools/' + tool + '/"'));
 assert.ok(html.includes('<meta name="description"'),"Tool needs a unique summary: "+tool);
}
assert.ok(!sitemap.includes("ca-pub-"),"Do not invent an AdSense publisher ID");
// Regression checks: hero media, guide page layout and company footer links.
assert.match(page, /class="cf-hero-art"/, "Homepage must contain the hero artwork container");
assert.match(page, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 850 700"/, "Homepage must embed hero SVG so no image request can fail");
assert.doesNotMatch(page, /src="\/assets\/clipforge-hero-studio\.svg"/, "Hero must not rely on an external SVG path");
assert.ok(page.includes('href="https://vexolunetech.pages.dev/"'), "Company attribution must link to Vexolune");
for (const path of ["public/guides/index.html", ...guides.map(slug => "public/guides/" + slug + "/index.html")]) {
  const html = from(path);
  assert.doesNotMatch(html, /href="\/styles\.css"/, path + " must not load the studio's fixed-sidebar stylesheet");
  assert.match(html, /href="\/guides\.css\?v=3"/, path + " must load the standalone guide stylesheet");
  assert.ok(html.includes('href="https://vexolunetech.pages.dev/"'), path + " needs company footer link");
}
assert.match(from("public/guides.css"), /\.cf-guide-page > \.cf-guide-header/, "Guide header layout must be independently scoped");
// Mobile hero regression: legacy .hero zeroes horizontal padding below 760px.
assert.match(css, /body:not\(\.studio-app\) \.hero\.hero-banner\s*\{\s*padding:clamp\(20px,5vw,28px\)!important;/,
  "Mobile hero must override legacy zero-horizontal-padding rule");
assert.ok(rootHome.includes("/styles.css?v=20261112-compact-tools-v1"),
  "Homepage should load the refreshed Shorts preview CSS version");
// Captions Studio-only enhancements must be wired in preview and export while Shorts remains independent.
const captionsPage=from("public/tools/captions/index.html");
assert.match(captionsPage,/src="\/assets\/js\/tools\/captions-studio-enhancements\.js\?v=20261110-style-motion-v2"/);
assert.match(captionsPage,/src="\/assets\/js\/tools\/captions-studio\.js\?v=20261112-caption-timing"/);
assert.ok(captionsPage.indexOf("captions-studio-enhancements.js")<captionsPage.indexOf("captions-studio.js"),
 "Caption template renderer must load before workspace setup");
const captionScript=from("captions-studio.js"),captionExtras=from("captions-studio-enhancements.js");
for(const control of ["cfCapMoveHandle","cfCapSize","cfCapPosX","cfCapPosY","cfCapResetPlace"]){
 assert.ok(captionScript.includes(control),"Missing caption placement control: "+control);
}
assert.match(captionScript,/studioDraw\(ctx,activeCue\.text,style,width,height/, "MP4 export must render custom placement");
assert.match(captionScript,/studioDraw\(ctx,text,style,box\.w,box\.h/, "Preview must use export renderer");
assert.match(captionExtras,/motion-rise/);
assert.match(captionExtras,/pro-lowerthird/);
assert.ok(!from("caption-style-library.js").includes("motion-rise"),
 "New templates must not change the shared Shorts style library");
// Captions Studio clean presentation: preserve draggable overlay but no floating label.
const studioCode=from("captions-studio.js");
assert.doesNotMatch(studioCode, /<span>✥ Drag caption<\/span>/, "Floating drag label must not appear");
assert.match(studioCode, /id="cfCapMoveHandle"/, "Dragging must remain available");
assert.match(studioCode, /<option value="1080" selected>1080p/, "1080p must be the default export quality");
assert.match(studioCode, /<option value="720">720p/, "720p alternative must stay available");
assert.match(rootHome, /\/captions-studio\.js\?v=20261112-caption-timing/, "Load fresh caption UI script after change");
// New controls remain scoped to Captions Studio, never the shared Shorts renderer.
for(const id of ["cfCapUndo","cfCapRedo","cfCapFont","cfCapColor","cfCapCustomColor",
 "cfCapOutline","cfCapShadow","cfCapBackground","cfCapTracking",
 "cfCapEffect","cfCapDuration","cfCapSpeed","cfCapSafe","cfCapPlatform"]){
 assert.ok(captionScript.includes('id="'+id+'"'),"Missing advanced Captions Studio control "+id);
}
assert.match(captionExtras,/function drawSafeGuide/, "Safe-area overlay must be drawn only in preview");
assert.match(captionExtras,/function decorateContext/, "Custom text styling renderer missing");
assert.match(captionScript,/if\(look\.safe\)STUDIO\.drawSafeGuide/, "Preview-only guide integration missing");
assert.ok(!from("caption-style-library.js").includes("drawSafeGuide"),
 "Shared Shorts caption renderer should not be altered");
assert.ok(rootHome.includes('id="counts" role="group"'),"Short count should be accessible as a main setting");
assert.ok(!rootHome.includes("<summary>Short count and extra options</summary>"),"Count must no longer be collapsed");
assert.match(rootHome, /class="chip on" data-k="res" data-v="1080"/, "1080p must be the visible Shorts default");
assert.match(rootHome, /class="chip" data-k="res" data-v="720"/, "720p must remain optional");
assert.match(from("app.js"), /cs:'creator-yellow',res:'1080',tr:'off'/, "Actual export state must default to 1080p");
for (const tool of tools) {
 const direct=from("tools/" + tool + "/index.html");
 assert.ok(direct.includes('id="counts" role="group"'),"Direct "+tool+" page should show count controls");
 assert.ok(direct.includes('data-k="res" data-v="1080"'),"Direct "+tool+" page must expose 1080p");
 assert.ok(direct.includes('src="/app.js?v=20261112-processing-wake-v1"'),"Direct "+tool+" page needs fresh Shorts logic");
}
assert.match(from("app.js"),/cf-short-trim/,"Shorts preview trim UI must remain available");
assert.match(rootHome,/\/app\.js\?v=20261112-processing-wake-v1/,"Home must load latest Shorts defaults and card features");
assert.match(from("captions-studio.js"),/cfCapTimingList/,"Cue timing editor must remain included in Captions Studio");
// Android Gallery duration fix: every raw MP4 recorder must finalize metadata before download.
const galleryFinalizer=from("montage-mp4.js");
assert.match(galleryFinalizer,/export async function finalizeGalleryMp4/);
assert.match(galleryFinalizer,/function movieHeaderDuration/);
assert.match(galleryFinalizer,/fastStart:'in-memory'/);
assert.match(from("app.js"),/Finalizing MP4 duration metadata for phone Gallery/);
assert.match(from("app.js"),/Finalizing MP4 duration for phone Gallery/);
assert.match(from("highlights-studio.js"),/finalizeGalleryMp4/);
assert.match(rootHome,/\/highlights-studio\.js\?v=20261112-gallery-duration-1/);
const shortsCardCode=from("app.js");
assert.match(shortsCardCode,/className='clip cf-short-card'/,"Each Short must get an inline card");
assert.match(shortsCardCode,/function startInlineShort/,"Card previews must run locally");
assert.match(shortsCardCode,/cf-short-trim-toggle/,"Professional Edit trim must remain available");
assert.doesNotMatch(shortsCardCode,/\['◂ start','s',-1\]/,"Redundant Start\/End button row must be removed");
console.log("ClipForge: static build checks passed for all eight routes, assets and Worker APIs.");
