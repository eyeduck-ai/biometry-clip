# Development

Biometry-Clip is a Chrome Manifest V3 extension, with a Vite-based editor and bundled OCR/PDF processing. No backend is required for local operation.

## Reproduce the build

Requires **Node.js 22.13 or newer**, npm, and Chrome 140+. Development has been tested with Node.js 24. Optional release packaging uses Python 3 standard-library modules.

```sh
git clone https://github.com/eyeduck-ai/biometry-clip.git
cd biometry-clip
npm ci
npm run vendor:ocr
npm run check
```

Initial installation/vendoring needs network access. `vendor:ocr` obtains the official Small/Tiny detector and recognizer model archives, verifies the expected byte counts and SHA-256 hashes in `scripts/ocr-models.json` for both cached and downloaded archives, and prepares the matching ONNX Runtime, PDF.js resources and third-party notices. Generated runtime/model binaries are excluded from source control; keep the package lock and vendoring definitions aligned. Do not combine assets from a different ONNX Runtime version or relax the extension CSP to load an unverified remote runtime.

Load `dist` at `chrome://extensions` → Developer mode → Load unpacked. Rebuild, reload the extension and refresh calculator tabs after changes. Keep the installed path stable to retain the same unpacked extension identity and local storage. The existing workspace directory does not have to be renamed to use the new product name.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local editor UI preview; does not reproduce Chrome permissions, service worker or installed OCR sandbox |
| `npm test` | Unit, synthetic adapter DOM and state/format tests |
| `npm run build` | Production UI and extension files in `dist` |
| `npm run check` | Tests followed by production build |
| `npm run vendor:ocr` | Prepare generated local OCR/PDF assets before the first build |

The production build uses stable extension entry names and excludes development-only preview and acceptance harness pages. Verify changes in an installed extension when they depend on CSP, Chrome APIs, workers, permissions or cross-tab behavior.

## Module boundaries

| Area | Main modules | Responsibility |
| --- | --- | --- |
| Interface | `src/app.js`, `src/styles.css`, `src/i18n.js` | Editor, workflow and responsive presentation |
| Shared draft | `src/editor-state.js`, `src/session-store.js` | Per-eye updates, revision/case-token guards and session state |
| Saved history | `src/library-store.js` | Patient/measurement CRUD and append-only validated import |
| Browser transport | `src/platform.js`, `src/background.js` | Chrome messaging, active tabs, permissions and storage ownership |
| Site integration | `src/sites.js`, `src/adapters/`, `src/bridge.js`, `src/tab-transfer.js` | URL matching, field inspection/read/fill, eyes, modes and units |
| Lens data | `src/lens-*` | Source selection, canonical identity, site-specific mappings and constants |
| Import and OCR | `src/ocr/` | Native PDF routing, selected-page rasterization, local/cloud OCR and field evidence |
| Review | `src/import-review-ui.js`, `src/import-preview.js`, `src/import-progress.js` | OD/OS candidates, bounded source preview, resource cleanup and elapsed time |
| Exchange | `src/interchange.js`, `schemas/` | Versioned public JSON contract |

The service worker owns shared storage mutations. Independent panels send guarded field updates instead of replacing a whole stale case. Saved measurements are snapshots; ordinary draft edits do not write through to the patient library.

The editor is intentionally separate from page adapters. Site scripts exchange validated field data rather than executing report text or importing arbitrary page code. Recognition evidence is transient; only explicit cleaned patient/eye fields enter saved cases and interchange JSON.

## Memory and processing constraints

- PDF page selection is required before expensive recognition, with at most three selected PDF pages per batch.
- Native PDF text and coordinates are used before OCR. Each PDF document has a worker; selected raster images are bounded to 1800 px / 2.5 MP.
- Review decodes one source page at a time, bounded to 1400 px / 1.5 MP, rather than retaining every full-resolution page.
- Cancellation, replacement, closing review and page teardown invalidate late work and release workers, canvases, bitmaps and object URLs.
- Local OCR uses packaged PP-OCRv6 Small by default, Tiny optionally, through the browser sandbox and single-thread WASM runtime. Large inputs can still be expensive; bounds reduce rather than eliminate memory use.

The [v0.4.0 architecture review](architecture-review-0.4.0.md) records concrete fixes and remaining risks. Profile a measured bottleneck before adding caching, parallel OCR workers or a new application framework.

## Add or repair a calculator

1. Inspect the actual calculator and its modes with synthetic data. Record label, selector, units, eye group, required state and any prerequisite.
2. Add/update the adapter and the `SITES` registry. Keep URL matching restricted to supported HTTPS hosts/paths; update launch categories, manifest permissions and QA metadata when needed.
3. Select OD/OS through the site's own control before filling. Offer OD+OS only when distinct supported groups are detected. Refuse ambiguous fields or units.
4. Keep Toric/KC/LVC controls separate from measurements. Do not substitute historical, total/posterior K, implanted, planned or fellow-eye values for one another.
5. Add focused tests for the failure being repaired, then verify the relevant installed-extension read → draft → save/load → cross-tab fill flow. Test both eyes and applicable modes.
6. Update [supported sites](supported-sites.md), not just the adapter code. Record live-browser evidence separately from synthetic DOM test results.

Do not automatically submit clinical calculations or silently guess a lens model. IOL constants are site-specific and ordinary transfer leaves them disabled by default.

## Compatibility and publishing

The product is now **Biometry-Clip**; the established case/library protocol deliberately remains `biometry-clipboard` version 1.3, with imports for 1.0–1.2. Keep storage keys and migrations compatible. See [interchange](interchange.md) and [the schema](../schemas/biometry-clipboard.schema.json). Lens catalog JSON uses its own versioned format.

The public [ESCRS constants snapshot](../data/README.md) is queryable directly with `node scripts/query-escrs-constants.mjs SN60WF`. Its read-only CLI does not depend on local research artifacts. Historical reconstruction/checkpoint scripts still need the non-distributed research inputs described in the [collection record](research-escrs-constants-039.md#重建與查詢).

Run `npm run check` and inspect the generated manifest/CSP before packaging. The optional `scripts/package-extension.py` verifies a recorded successful check log, archive bytes and ZIP CRC; it is a release workflow, not a replacement for tests or manual browser checks. Follow that script's current log/artifact expectations when preparing a release.

Source and release artifacts must exclude API keys, local reports, patient identifiers, raw screenshots and private browser profiles. Use synthetic fixtures in committed tests. Keep third-party licenses/notices with the corresponding redistributed runtime/model assets. No project source license should be inferred from a dependency's license.

## Evidence limits

`npm test` passing establishes the checked code paths and synthetic fixtures; it does not establish a fresh live run across all calculators. The principal OCR report family is IOLMaster 700, with two supplied PDF formats and representative-page comparisons of 18 shared numerical fields. See [user-guide scope](user-guide.md#report-types-and-validation) and the [archive](README.md#research-and-validation-archive) for dated evidence.
