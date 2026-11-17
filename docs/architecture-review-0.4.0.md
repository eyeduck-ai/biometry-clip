# Architecture and performance review — 0.4.0

Reviewed on 2026-11-17. This review covers source, synthetic regression tests,
and the locally generated extension bundle. It does not imply a new live clinical
validation of every calculator or a complete security audit.

## Fixed in this release

### Screenshot recognition blocked by extension CSP

The capture preview used an image data URL successfully, then tried to convert
that URL into a Blob with `fetch()`. Extension pages intentionally do not allow
`data:` in `connect-src`, so confirming a screenshot could fail even when its
preview looked normal. The asynchronous button handler also lacked an error
handler.

The confirmation action now uses the existing bounded `decodeImageDataUrl()`
helper, preserves the original case-token guard, and reports decoding errors.
The helper accepts only PNG/JPEG/WebP data URLs and enforces the existing 25 MiB
limit. The extension CSP remains unchanged.

Regression coverage simulates a CSP-blocked fetch and confirms that screenshot
bytes reach OCR without fetching the data URL. A second test checks that malformed
capture data produces a visible error without running OCR or modifying a case.

### Unnecessary refreshes from browser tab metadata

Every `chrome.tabs.onUpdated` event previously triggered the panel's tab-list
refresh and potentially a calculator DOM inspection. Audio, mute, favicon,
pinned-state, and group changes do not change calculator fields. With multiple
panels open, each such event could repeat the work in every panel.

Tab subscriptions now forward URL, loading-status, and title updates, plus normal
activation/removal events. Navigation away from a supported calculator continues
to refresh the target list. The returned unsubscribe function removes the exact
wrapped listeners.

Regression coverage checks ignored metadata, mixed relevant/irrelevant updates,
navigation away, loading completion, activation, removal, and unsubscription.

## Existing safeguards checked

- The background service worker owns serialized working-case and patient-library
  mutations. Case tokens and revisions guard edits and transfers; synthetic tests
  cover stale reads and cross-panel changes.
- Session and local Chrome storage are restricted to trusted extension contexts.
  Background endpoints reject website senders before reading case/library data.
- Calculator transfers use the verified top document and check the target URL,
  site, source generation, and revision rather than injecting into arbitrary
  nested frames.
- OCR remains lazy. Local inference runs in a separate sandbox, processes one
  inference at a time, and removes its sandbox after completion or failure.
- PDF text extraction precedes raster OCR. PDF processing is limited to three
  selected pages per job, rasterization is bounded, and workers have explicit
  cancellation, load timeouts, and bounded cleanup.
- Preview code releases stale source results, object URLs, bitmaps, and canvases;
  switching preview pages cancels the previous load.
- Cloud requests use explicit provider configuration, timeouts and cancellation.
  API keys are sent in headers rather than query strings. Upload consent is
  checked for the current recognition job.

These are source/test observations, not a promise that no other defect exists.

## Measured follow-up work

### Duplicate ONNX runtime binary in the generated package

The reviewed build contains the same 29,520,971-byte JSEP WASM binary in both
`dist/assets/ort-wasm-simd-threaded.jsep-*.wasm` and
`dist/vendor-ocr/ort-wasm-simd-threaded.jsep.wasm`. Their SHA-256 hashes match.
The SDK emits its fallback asset while the application configures a packaged
`wasmPaths` directory.

This is a disk/package-size opportunity, not evidence that both binaries are
loaded into memory during one inference. Simply deleting the generated asset is
unsafe: bundled SDK code still references it. A later change should consolidate
the asset through the build resolver and verify offline Small/Tiny OCR in an
installed extension, including a cold start and failure paths.

### Polling and lifecycle

The app still polls dynamic calculator requirements every 1.8 seconds while its
document is visible. Collapsing a floating iframe with CSS does not itself
guarantee that the child document becomes hidden. Explicit shell-visibility
signaling could suspend this polling while retaining freshness after expansion.
That change needs a browser-level test of collapse, capture-hide/restore,
navigation and expansion before implementation.

The app's `pagehide` cleanup does not currently coordinate all subscriptions,
timers, and a possible `pageshow` restoration. Whether extension documents enter
the browser's back-forward cache needs verification. Adding unconditional editor
disposal would risk disabling a restored page, so this review does not make that
speculative change.

### Module boundaries

`app.js` still coordinates navigation, forms, patient actions, import dialogs,
and lifecycle. Extracting import orchestration and tab-inventory scheduling into
separate controllers would make lifecycle tests easier. This is a maintenance
improvement; no broad rewrite was required to fix the identified defects.

The shared registry/i18n build chunk is roughly 0.56 MB uncompressed in the
reviewed build. Before changing catalog loading, measure workbench startup and
memory with a representative patient library; splitting a shared chunk without
measurements can introduce extra parsing or duplicate catalog copies.

## Verification for these changes

```sh
node --test tests/platform.test.js tests/app-transfer.test.js
```

Result at the time of this review: **65 passed, 0 failed**. The release workflow
must also run the complete test suite and extension build after integrating the
other 0.4.0 changes. These tests use synthetic data and mocked Chrome transport;
they do not replace installed-extension or live calculator verification.
