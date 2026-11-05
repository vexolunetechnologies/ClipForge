# ClipForge Cloudflare Pages multipage and fast navigation

## Current production
Cloudflare Pages currently deploys the repository root using the existing no-op build command. The `main` branch is production. Any navigation changes in this feature branch are not live unless separately merged and successfully deployed.

## Output and URLs
The root site retains standalone static entry files under `tools/<name>/index.html` for all eight tools. The `npm run build` script creates the alternative `public/` output with corresponding pages and shared assets. A future change to the Pages build output directory requires a coordinated release, not a settings-only switch.

## Client-side navigation
`navigation.js` is loaded before `app.js` so all legacy tool controllers can obtain the active route from `window.ClipForgeNavigation.current()`. It derives the active tool from `/tools/<name>/`, including direct loads and refreshes. Old tool bookmarks such as `/#shorts` and `/tools/shorts/#shorts` are normalized to `/tools/shorts/` with `history.replaceState` and do not reload.

Normal internal card/sidebar navigation uses `history.pushState` and emits the legacy `hashchange` notification for previously initialized tool controllers. Therefore the existing full application DOM and media-processing engines remain mounted and are not reloaded between cards. Browser Back/Forward uses `popstate`. Working media is kept in memory, and active renders are guarded to prevent accidental navigation.

Normal homepage anchors (such as `/#tools` and `/#faq`) keep their meanings. Company/legal pages still use ordinary navigation. File uploads, video encoding, Cloudflare Worker APIs, fonts and styling retain their existing implementation.

## Tests and release gates
- `npm run verify`: TypeScript validation, generation of `public/`, static route checks and Node-based History API navigation tests.
- Confirm each of eight routes loads directly, refreshes cleanly, has no redundant tool-name hash and supports Back/Forward.
- Run true browser tests for Shorts, Trailer, Image Animator, Reverse, Montage, Highlights, Editor and Captions: upload, preview, cancellation, existing media state, exported video/audio, Urdu RTL, and mobile layout.
- Confirm Cloudflare staging output and AI bindings before a production merge, then confirm deployed commit and rollback steps.

**Do not merge this branch into production until the regression criteria are reviewed.** The code deliberately does not attempt to split each tool engine into independently loaded modules; that would be a larger, separate refactor.
