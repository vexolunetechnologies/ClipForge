# ClipForge Studio V2 (isolated first build)

This is a **working, isolated V2 prototype**. It does **not replace or modify** the existing Studio Editor, old media engines, or other ClipForge tools. No default navigation card points to it yet.

## Try it
Open `public/studio-v2/index.html` via a local web server, or a Cloudflare Pages branch preview if enabled.

Example from repository root:
```sh
python3 -m http.server 8080 -d public
```
Then visit http://localhost:8080/studio-v2/

## Implemented in V2 foundation
- Dedicated CapCut-style touch layout and Premiere-inspired desktop panels.
- Video/photo/audio import and timeline clip creation.
- QuickTime MOV import for clips with playable codecs. Native MOV playback is used where available; supported H.264/HEVC QuickTime streams can be repackaged into MP4 with the lazy-loaded Mediabunny converter. Unsupported codecs receive a clear error rather than a fake-duration clip.
- Centered fixed playhead and scrollable timeline, thumbnail filmstrips, three content lanes, zoom and snapping.
- Drag/reposition, trim handles, split, undo/redo, duplicate, delete, manual text overlays, basic color adjustments.
- Live canvas preview, 30 fps timeline clock, in/out marks and markers.
- Editable picture overlays with position, scale, opacity and separate timeline clips.
- Editable captions with text styling and timed SRT/VTT import, rendered in preview and export.
- All **55 unique** styles from the existing shared ClipForge Captions Studio library, grouped by category (Drama & Urdu, Trending, Motion, etc.) with searchable live previews, default per project, per-clip style overrides and apply-to-all.
- Auto captions for the selected video/audio clip through the existing Cloudflare speech endpoint (Urdu, Hindi and English); caption length controls, reviewable timeline clips and timed words when provided. Requires internet and browser-decodable source audio.
- Export edited captions as .srt and .vtt for use in other editors.
- Mobile Mute Clip and PNG Cover Frame controls.
- Fade In / Fade Out duration controls for video, audio, text, captions and image overlays; fades are composited in the preview and recorder output.
- Pointer/touch scrubbing on the timeline ruler, and wider selected clip trim handles on phones.
- Mobile Edit drawer with Open/Save Project, format selection and Delete selected clip; action feedback toast.
- MP4-preferred export with H.264/AAC conversion where supported, otherwise explicit WebM fallback and metadata finalization. Encoder capability depends on the browser. Live canvas and audio mixing are retained.
- Local IndexedDB media persistence (best effort) and JSON project manifest.
- Keyboard shortcuts: Space, V, C, Ctrl/Cmd+K, Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, I/O, M, S, left/right arrows, J/K/L, Q/W, +/-.

## Important limitations
- This is **not** a finished Premiere/CapCut replacement. Browser codec support, very long source videos, memory/storage quotas and export duration must be validated on target devices.
- This prototype has one main video lane, one audio lane and a shared text/graphics lane for titles, captions and image overlays. Video-on-video overlays, AI clipper, AI UHD enhancement, multi-camera, advanced audio mixing, GPU effects, time remapping and customizable shortcut dialog are planned, not implemented.
- Project JSON alone does **not** embed source media. IndexedDB autosave stays in one browser profile only. Keep original files.
- The finalizer attempts to repair WebM duration metadata or convert to MP4 when the browser can encode H.264/AAC. Gallery 0:00 duration compatibility is not universally guaranteed and must be checked on the target device.
- MOV is a container, not a codec. Legacy DV or ProRes MOV cannot be decoded without additional codec support. MOV remuxing may require an internet connection; very large MOV files are protected by a conversion size limit.
- Word-by-word effects use the shared style renderer's approximate progress within each cue. True per-word highlighting across clips requires retaining aligned word timestamps per caption, and may differ from native Captions Studio results.
- Auto captions need the working `/api/v1/shorts/transcribe` service and a browser that can decode the source audio; they are not available offline.
- No existing ClipForge card is connected to V2. "Edit in Studio" handoff is a later separate integration with approval.

## Development safety
Keep V2 isolated, test with real media, review mobile/desktop screenshots and get approval before changing the existing editor or modifying any tool card. Legacy code cleanup should be a separate, later PR.
