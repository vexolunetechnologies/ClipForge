# Shorts semantic-plan recovery

**Issue:** With a fully transcribed video, the selected AI model could return clips that fell outside the user's target-duration filter (e.g. requested 45s, returned 25s or 60s). The Worker silently rejected every candidate and returned `AI dialogue analysis failed: No valid clip suggestions were returned`.

**Fix:** The Worker accepts valid AI clips unchanged, makes limited +/- time adjustments for near-miss clips, or when the model produces no valid clip, constructs continuous transcript-anchored review windows (never stitches two disjoint source intervals). The recovery uses already-transcribed dialogue; **no additional Workers AI request and no invented speech**. If dialogue is too sparse for useful review windows, it reports a specific length/coverage error instead of producing fake Shorts. Shorts UI labels fallback picks `Dialogue review`, shows an explicit timing-review reason, and omits fabricated quality scores. The user can preview and adjust start/end before export.

**Scope:** `_worker.js` and `app.js`; no changes to transcription, video frame processing, export, music, captions or existing routes.

**Tests:** `node scripts/test-shorts-semantic.mjs` verifies exact AI outputs, adjustment, empty/malformed results, sparse transcript, rate/AI calls and service errors. `node scripts/test-shorts-browser.mjs` verifies Shorts UI shows fallback reasons, not a fake quality score. All existing build/navigation/export tests also run.

**Limitations:** Transcript-grounded fallback does not replace genuine semantic quality assessment. Mocked AI tests cannot verify live Workers AI model output, rate-limit behavior, real episode editing quality, or correctness of Urdu transcriptions. Release should only proceed after manual review on a real episode; changes should be merged independently of unrelated optimizations.
