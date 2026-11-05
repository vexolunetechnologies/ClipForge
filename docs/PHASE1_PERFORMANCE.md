# ClipForge Phase 1 safe performance work

Base version: `e4436e4`. Scope: startup work and inactive previews only. Do not merge or deploy without explicit approval.

## Changes
- Captions Studio and Shorts sample galleries initialize on demand rather than at home-page load.
- The 41 samples stay as clickable style buttons; each canvas paints only as it nears the viewport. Style selection changes highlight without rebuilding the entire gallery. Language and font changes re-render the samples when required.
- The existing lightweight Editor layout module remains eager so card design does not change. The more expensive timeline and Studio UI enhancements import only on the first Editor visit. The core Editor engine remains unchanged.
- On navigation away from Editor, normal playback stops and media sources remain mounted. Image Animator now receives a visibility event and cancels its *preview* animation frames when inactive. It does not cancel exports and it does not discard uploaded images or audio.
- Cloudflare Worker, encoded media algorithms, captions renderer, URLs and stylesheets unchanged.

## Reproducible checks
Run `npm install && npm run verify && npx playwright install chromium && npm run test:browser && npm run test:phase1 && npm run bench:phase1`.
- `scripts/test-phase1-browser.mjs` verifies no eager caption card construction, lazy canvas painting, working caption selection, first-use editor enhancement loading, animator iframe persistence and paused preview, and editor playback cleanup.
- `scripts/benchmark-performance.mjs` logs three fresh local browser runs and saves `reports/phase1-performance.json`. It measures browser DOM readiness and two-frame route settling, not AI calls, file import, media decoding or export duration. Compare with the same script on the original base commit to claim speedup.
- Existing tests verify all eight tool routes, back/forward navigation, editor layout and clean URLs.

## Before any production release
Run separate real-media tests for every tool, ensure 41 styles and Urdu RTL draw correctly, compare 720p/1080p video/audio outputs, confirm Recorder cancellation and exports, test long videos and Safari/Chrome/Edge, and confirm Cloudflare bindings. Automated browser smoke tests do not prove media export speed or fidelity.
