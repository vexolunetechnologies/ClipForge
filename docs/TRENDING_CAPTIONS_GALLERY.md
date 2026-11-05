# ClipForge: Trending Captions & dedicated style gallery

Feature branch `feat/trending-caption-style-gallery-20261106`. Do not merge or deploy until regression review.

## Style direction, November 2026
Creator caption pattern research indicates high-contrast bold type, active-word emphasis, karaoke fills, marker highlights, pill/box, clean cinematic subtitles and short readable phrases in current Shorts/Reels/TikTok edits. Inspirations are generic visual patterns, not copied proprietary designs or claimed objective popularity rankings.

Relevant industry guides:
- https://capsubs.com/blog/viral-caption-styles-explained
- https://www.captioncraft.studio/guides/caption-styles-for-videos
- https://recapo.ai/blog/best-caption-styles-for-shorts/

## Changes
- Adds 14 distinctive, original presets: Creator Yellow, Word Spotlight, Bold Pop, Karaoke Wave, Marker Highlight, Glass Subtitle, Cinema Gold, Drama Dialogue, Podcast Lime, Bubble Blue, Editorial Minimal, Coral Glow, Urdu Cinema, Stacked Hook.
- Keeps all 41 legacy preset IDs and renderers for compatibility with existing saved settings/projects. Total gallery now 55.
- Shared `ClipForgeCaptionStyles.draw()` handles new thumbnails and burn-in exports in both Captions Studio and Shorts; the new presets are not thumbnail-only labels.
- Dedicated, independently vertically scrollable panel for **both** Captions Studio and Shorts, with category tabs Trending / Drama / Bold & Pop / Clean / Original 41 / All, style search and selected-style indicator.
- Short preview grid remains lazy-painted via IntersectionObserver; styles are created only when relevant tool is opened.
- Creator Yellow is the new default. The original styles can be selected under Original 41 or All.
- No changes to AI transcription, timing/word alignment, video/audio encoding, scene selection, navigation, Worker APIs or output presets.
- Word highlights animate based on phrase-relative estimates when source transcript lacks verified per-word timings. The UI does not claim word-perfect alignment.

## Validation
- `node scripts/test-caption-gallery.mjs` uses Chromium to check 55 styles, 14 new originals, categories/search/selection, independent scroll, actual renderer pixel differentiation, Urdu/Hindi, Shorts matching style selection and mobile gallery layout. Uploads a screenshot artifact.
- Existing `npm run verify`, `npm run test:browser`, `npm run test:phase1`, Shorts semantic/framing tests and Highlights real-media export tests must pass.
- Before production: manually preview real drama footage under captions, check native Urdu fonts, line timing, English/Hindi/Urdu readability, and export at 720/1080 where supported.

## Update: mutually exclusive categories

The former **Original 41** tab was removed. All 41 legacy styles are distributed across the regular groups: Trending, Drama & Urdu, Bold & Pop, Clean & Minimal, Karaoke & Motion, Neon & Glow, Podcast & News. Each of the 55 style IDs is assigned to **exactly one** of these categories. "All styles" is a single deduplicated view, not a copy of the templates in the DOM. Existing saved style IDs and shared export rendering are unchanged. Both Shorts and Captions Studio reuse the same definitions. A startup invariant and Playwright regressions assert full coverage, no repeat IDs, no hidden Original 41 section and no repeated cards in All.
