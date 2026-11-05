# ClipForge Phase 2: bounded Highlights transcription

Status: testing on isolated `perf/phase2-highlights-transcription-20261106` branch, **not a production release**.

## Scope
- Highlights Studio already decoded audio samples incrementally and sent 30-second WAV/base64 chunks to `/api/v1/shorts/transcribe` in a strictly sequential loop.
- New `transcription-queue.js` exposes an ordered asynchronous mapping utility with **at most two in-flight transcription requests**. Its streaming input means a long video never accumulates all outstanding PCM chunks in memory.
- The original media decoder, resampling, WAV format, chunk size, AI endpoint, highlights AI selection request and exported video engine remain unchanged.
- Transcript row offsets are established before network requests begin; results are concatenated in source order and then sorted by original timestamps. Completion-based progress remains monotonic.
- Stop aborts in-flight requests through the existing AbortController. Errors propagate; they are not swallowed.
- No changes to Captions Studio audio extraction, Reverse Video, Studio Editor, CSS, font style or user-facing URLs.

## Test
Run `npm install && npm run verify && npx playwright install chromium && npm run test:browser && npm run test:phase1 && npm run bench:phase2`.
- `scripts/test-transcription-queue.mjs` covers chronological ordering when responses arrive out-of-order, two-request concurrency cap, error reporting, and cancellation.
- `scripts/benchmark-transcription-queue.mjs` compares simulated 24 ms asynchronous requests sequentially and concurrently in Node; these synthetic numbers are not actual end-to-end encoding/transcription times.
- Existing Chromium tests cover all eight tool pages, preview setup and route behavior.

## Release validation still required
- Use sample videos with known dialogue to compare full transcript text and timestamps against production's sequential approach.
- Confirm Highlights exports, original media audio policy, output duration and cancellation on mobile and desktop; test worker binding/concurrency quotas using a preview environment.
- Compare actual transcription duration at 1, 3 and 15 minutes under real network conditions, especially rate-limited or weak connections.
- Confirm proper failures on absent audio, errors, no speech and 2,500 segment limit.
- **No merge, deployment, or production settings change without user approval.**
