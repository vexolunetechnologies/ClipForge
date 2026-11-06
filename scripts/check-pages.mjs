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
assert.ok(rootHome.indexOf('src="/transcription-queue.js"') < rootHome.indexOf('src="/highlights-studio.js"'),"Queue must load before Highlights Studio");
for (const tool of tools) {
  const standalone = "tools/" + tool + "/index.html";
  has(standalone);
  const html = from(standalone);
  assert.doesNotMatch(html, /data-cf-tool-bootstrap|data-cf-link-bridge/);
  assert.ok(html.includes("https://clipforgestudio.pages.dev/tools/" + tool + "/"), "Missing canonical route");
  assert.match(html, /src="\/app\.js"/);
  assert.match(html, /src="\/navigation\.js"/);
  assert.match(html, /href="#editor"/);
}

const css = from("styles.css");
assert.match(css, /body\[data-page="workspace"\]\[data-tool="animator"\] #top\.wrap/);
assert.match(css, /body\[data-page="workspace"\]\[data-tool="reverse"\] #top\.wrap/);
assert.match(css, /display:none!important;/);
console.log("ClipForge: static build checks passed for all eight routes, assets and Worker APIs.");
