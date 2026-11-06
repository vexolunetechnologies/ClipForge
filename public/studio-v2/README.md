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
- Centered fixed playhead and scrollable timeline, thumbnail filmstrips, three content lanes, zoom and snapping.
- Drag/reposition, trim handles, split, undo/redo, duplicate, delete, manual text overlays, basic color adjustments.
- Live canvas preview, 30 fps timeline clock, in/out marks and markers.
- Export through browser MediaRecorder (MP4 when supported; WebM fallback), canvas composite and mixed browser audio.
- Local IndexedDB media persistence (best effort) and JSON project manifest.
- Keyboard shortcuts: Space, V, C, Ctrl/Cmd+K, Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, I/O, M, S, left/right arrows, J/K/L, Q/W, +/-.

## Important limitations
- This is **not** a finished Premiere/CapCut replacement. Browser codec support, very long source videos, memory/storage quotas and export duration must be validated on target devices.
- This prototype has one main video lane, one audio lane and a text lane. Complex compositing, multi-camera, advanced audio mixing, GPU effects, time remapping, and customizable shortcut dialog are planned, not implemented.
- Project JSON alone does **not** embed source media. IndexedDB autosave stays in one browser profile only. Keep original files.
- A WebM exported by MediaRecorder may have duration metadata limitations in some gallery players; this remains an open issue for a later muxer-based exporter.
- No existing ClipForge card is connected to V2. "Edit in Studio" handoff is a later separate integration with approval.

## Development safety
Keep V2 isolated, test with real media, review mobile/desktop screenshots and get approval before changing the existing editor or modifying any tool card. Legacy code cleanup should be a separate, later PR.
