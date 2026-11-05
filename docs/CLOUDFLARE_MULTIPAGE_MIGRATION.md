# ClipForge Cloudflare Pages multi-page migration
Status: transitional build on a separate GitHub branch, not yet validated for production.

## Build
Use Node.js 20+ and run npm install && npm run verify.
Cloudflare Pages build output directory: public. Build command: npm run build.
The generated directory contains the existing Pages _worker.js, static HTML pages, shared assets and eight shareable /tools/<name>/ URLs.

## Compatibility strategy
Existing root index.html, app.js, styles.css and _worker.js are unchanged as sources.
The generator copies the current app engines byte-for-byte and makes eight static entry HTML documents.
Each tool entry sets its previous #tool address hash in-place, preserving the original initialization behavior.
Navigation links target canonical tool paths. An unsaved selected-media navigation warning is included.
This is a transitional multipage shell, not yet a full per-tool DOM/engine split. The complete legacy DOM is retained in every generated page because the original JavaScript directly accesses all those elements.

## Production cutover blockers
Confirm Cloudflare production/preview build settings, output dir, branch rules and all API bindings in the actual dashboard.
Validate with isolated browser preview all eight URLs, existing routes, theme, navigation, media uploads, AI transcription, timeline and video/audio export.
Confirm no JavaScript console errors, missing static assets or output regressions.
Record the last good deployment SHA, old build/output settings and a coordinated rollback.
Do not merge or deploy to production before these checks pass.
