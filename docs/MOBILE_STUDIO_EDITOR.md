# Mobile Studio Editor (portrait workflow)

## Goal
Match the layout hierarchy of the user's supplied CapCut screenshot on small screens, without copying CapCut branding or replacing ClipForge editing engines.

- Top condensed app bar with project name and **Export** button.
- Real program canvas as the central upper monitor with play/pause and scrub transport.
- The **existing multi-track timeline** fills the lower editing area; track contents, trim handles, select, split, zoom and waveform retain original handlers.
- Fixed bottom tool dock: Edit, Audio, Text, Effects, Overlay, Captions.
- A media import control opens the real project media bin as a scrollable bottom sheet. Tool buttons open original effect/text/caption/audio/sticker panes. Edit opens actual clip Inspector rather than an inert mockup.
- Quick undo, redo and split buttons, plus live time indicator are wired to the existing native actions.
- Layout scoped to actual `body.solo[data-tool="editor"]` state. Earlier mobile styles targeted `body.studio-app`, which isn't guaranteed on this navigation route; the v2 rules override them without changing desktop editing.
- Respect mobile viewport and safe-area; no changes to algorithms, export/audio engine, encoding, media import or cloud services.

## Testing
`npm run test:mobile-editor` tests 390px and 320px Chromium mobile layouts, real tool categories and Edit inspector, document overflow, export accessibility, desktop multi-panel preservation and page errors. CI uploads screenshots for review.

## Caveats
The UI is **CapCut-like, not an exact CapCut clone**. The existing timeline engine remains a browser NLE, with its preexisting clip and audio capabilities. Real Android Chrome touch gestures, pinch zoom, long-media playback, caption editing and MP4 exporting should be tested before production rollout. A green desktop/headless Chromium test is not evidence those device-specific behaviors work.
