/**
 * ClipForge Cloudflare Pages output generator.
 * Preserve working legacy engines while exposing eight shareable tool pages.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const site = join(root, "public");
const tools = ["shorts", "trailer", "animator", "reverse", "montage", "highlights", "editor", "captions"];
const read = (path) => readFileSync(join(root, path), "utf8");
const ensure = (file) => mkdirSync(dirname(file), { recursive: true });
const put = (relative, content) => {
  const file = join(site, relative);
  ensure(file);
  writeFileSync(file, content, "utf8");
};
const copy = (from, to = from) => {
  const destination = join(site, to);
  ensure(destination);
  copyFileSync(join(root, from), destination);
};

for (const file of [
  "_worker.js", "about.html", "contact.html", "privacy.html", "terms.html",
  "cookies.html", "copyright.html", "styles.css", "editor-mobile-layout.css", "app.js", "navigation.js",
  "caption-style-library.js", "captions-studio.js", "highlights-studio.js", "transcription-queue.js",
  "editor-loader.js", "animator-idle.js",
  "dist/editor/layout.js", "dist/editor/timeline.js",
  "dist/editor/studio-ui.js", "dist/editor/types.js"
]) copy(file);

copy("styles.css", "assets/css/styles.css");
copy("app.js", "assets/js/core/app.js");
copy("editor-loader.js", "assets/js/core/editor-loader.js");
copy("animator-idle.js", "assets/js/core/animator-idle.js");
copy("navigation.js", "assets/js/core/navigation.js");
copy("caption-style-library.js", "assets/js/shared/caption-style-library.js");
copy("captions-studio.js", "assets/js/tools/captions-studio.js");
copy("highlights-studio.js", "assets/js/tools/highlights-studio.js");
copy("transcription-queue.js", "assets/js/shared/transcription-queue.js");

const editorLayout = read("dist/editor/layout.js");
const selector = '.toolcard[href="#editor"]';
if (editorLayout.split(selector).length !== 2) {
  throw new Error("Editor card selector changed; review before publishing.");
}
put("dist/editor/layout.js", editorLayout.replace(
  selector, '.toolcard[href="#editor"], .toolcard[href="/tools/editor/"]'
));

const original = read("index.html");
const linkTo = {
  "#top": "/", "#tools": "/#tools", "#features": "/#features",
  "#faq": "/#faq", "#how": "/#how", "#tool": "/tools/shorts/",
  ...Object.fromEntries(tools.map((tool) => ["#" + tool, "/tools/" + tool + "/"]))
};
function rewriteLinks(html) {
  return html.replace(/href=(["'])(#[a-zA-Z0-9-]+)\1/g, (match, quote, hash) => (
    linkTo[hash] ? "href=" + quote + linkTo[hash] + quote : match
  ));
}
function page(tool = null) {
  let html = rewriteLinks(original);
  const paths = new Map([
    ["/styles.css", "/assets/css/styles.css"],
    ["/caption-style-library.js", "/assets/js/shared/caption-style-library.js"],
    ["/app.js", "/assets/js/core/app.js"],
    ["/editor-loader.js", "/assets/js/core/editor-loader.js"],
    ["/navigation.js", "/assets/js/core/navigation.js"],
    ["/captions-studio.js", "/assets/js/tools/captions-studio.js"],
    ["/highlights-studio.js", "/assets/js/tools/highlights-studio.js"],
    ["/transcription-queue.js", "/assets/js/shared/transcription-queue.js"]
  ]);
  for (const [oldPath, newPath] of paths) {
    // Preserve cache-busting query strings in versioned asset URLs.
    html = html.split('"' + oldPath + '?').join('"' + newPath + '?');
    html = html.split('"' + oldPath + '"').join('"' + newPath + '"');
  }
  if (tool) {
    const canonical = '<link rel="canonical" href="https://clipforgestudio.pages.dev/tools/' + tool + '/" />';
    html = html.replace("</head>", canonical + "\n</head>");
  }
  return html;
}
put("index.html", page());
for (const tool of tools) put("tools/" + tool + "/index.html", page(tool));
console.log("ClipForge: generated homepage, eight tool pages, shared assets and Pages Worker in public/");
