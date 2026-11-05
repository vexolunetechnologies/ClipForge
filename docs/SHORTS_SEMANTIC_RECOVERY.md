# Shorts semantic-plan recovery

**Issue:** With a fully transcribed video, the selected AI model could return clips that fell outside the user's target-duration filter (e.g. requested 45s, returned 25s or 60s). The Worker silently rejected every candidate and returned `AI dialogue analysis failed: No valid clip suggestions were returned`.

**Fix:** The Worker accepts valid AI clips unchanged, makes limited +/- time adjustments for near-miss clips, or when the model produces no valid clip, constructs continuous transcript-anchored review windows (never stitches two disjoint source intervals). The recovery uses already-transcribed dialogue; **no additional Workers AI request and no invented speech**. If dialogue is too sparse for useful review windows, it reports a specific length/coverage error instead of producing fake Shorts. Shorts UI labels fallback picks `Dialogue review`, shows an explicit timing-review reason, and omits fabricated quality scores. The user can preview and adjust start/end before export.

**Scope:** `_worker.js` and `app.js`; no changes to transcription, video frame processing, export, music, captions or existing routes.

**Tests:** `node scripts/test-shorts-semantic.mjs` verifies exact AI outputs, adjustment, empty/malformed results, sparse transcript, rate/AI calls and service errors. `node scripts/test-shorts-browser.mjs` verifies Shorts UI shows fallback reasons, not a fake quality score. All existing build/navigation/export tests also run.

**Limitations:** Transcript-grounded fallback does not replace genuine semantic quality assessment. Mocked AI tests cannot verify live Workers AI model output, rate-limit behavior, real episode editing quality, or correctness of Urdu transcriptions. Release should only proceed after manual review on a real episode; changes should be merged independently of unrelated optimizations.

## Auto Duration & smooth smart framing (November 2026)

- Shorts default to **Auto Duration**. Worker receives `autoDuration:true`, preferring complete dialogue scenes about 15–75 seconds, while accepting any natural **8–110 second** continuous scene. It no longer forces the Auto mode into the 45-second 36–56s validation range.
- Fixed 15/30/45/60/90 and Custom durations remain optional targets using the original 80%–125% tolerance. AI suggestions are still editable by the user.
- Correct AI JSON shape uses a target-appropriate duration example instead of misleading 30-second output, plus increased answer budget for multi-candidate output.
- Smart Reframe retains genuine shot-to-shot cuts but treats speaker changes **within one shot** as a smooth pan. A slower damped follow and per-frame speed cap avoid face-detector jumps; smart face tracking still runs on export, not homepage preview.
- Tests: `scripts/test-shorts-semantic.mjs` (Auto flexible durations), `scripts/test-shorts-framing.mjs` (face switch / actual cuts / max pan speed), `scripts/test-shorts-browser.mjs` (Auto default, recovery UI).
- Browser performance and export-specific tests stay unchanged. A real drama episode should still be inspected for correct emotional beat boundaries and multi-face framing.
