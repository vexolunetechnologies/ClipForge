# ClipForge Android Gallery duration, Trailer preview, mobile Studio fixes

## Known issues and patch
1. **Android Gallery shows 00:00 on otherwise playable MP4**. Chrome mobile's native MP4 MediaRecorder can emit fragmented MP4 without movie-level duration metadata (see https://blog.addpipe.com/duration-in-mp4-files-produced-by-chrome-safari/). ClipForge now tries a copy-only remux using Mediabunny 1.62.1, converting native recorded MP4 into standard indexed fast-start MP4. This requires the CDN and an intact source file. It is best-effort, capped at 160MiB on mobile to avoid RAM crashes. If it fails, retain the original playable file and display a warning. MP4s already encoded using the nonfragmented muxer (e.g. Captions Studio) are unchanged. New pipeline is used for Shorts, Trailer, Highlights, Montage and Studio Editor MP4 exports.
2. **Trailer preview looked permanently 9:16**. Shared source preview was hardcoded 720×1280. Now the Trailer defaults to 1280×720, switches to 720×1280 only on explicit vertical selection, restores that aspect after exporting, and draws the original full source frame in its previews without clipping.
3. **Mobile editor layout screenshot**. Screen showed overlapped brand/project title and half-width preview. Scoped Android CSS now sets a fixed compact brand button, properly flexed project title and Export button, a full-width program monitor, narrower 84px timeline track labels and aligned preview seek/playhead math. Does not change desktop editor appearance or underlying video/audio rendering.

## Tests
- Existing Chromium mobile tests enhanced with full-width monitor, unobstructed project header and track label width.
- New `npm run test:fix-three-issues` validates Trailer 16:9 default, 9:16 opt-in, Shorts 9:16 and safe MP4 helper guard behavior.
- Existing Highlights real-video export and other eight-tool regressions must pass.
- **Still requires physical Android Gallery validation.** Headless Chromium can establish browser playback but cannot guarantee a specific handset's Gallery will display the time. Test one MP4 per affected export tool on the reported phone before enabling this on production.
- Large MP4 files need a desktop remux rather than attempting high-memory browser conversion.
