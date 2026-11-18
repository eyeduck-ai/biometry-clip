# Validation evidence and limits

This page consolidates the useful evidence from the earlier 0.3 validation logs. It preserves the version and type of each check; results from different versions or environments are not combined into a new pass rate. Current release checks are recorded in [0.4.0 validation](validation-0.4.0.md).

| Evidence | Recorded scope | What it does not establish |
| --- | --- | --- |
| Synthetic unit/DOM tests | State, storage, adapter mappings, units, modes and failure handling | A live installed-extension run on every calculator |
| Direct live-page DOM checks, 0.3 | 14 URLs opened; 12 available forms filled/read with synthetic data | Extension toolbar, service worker, Chrome storage or cross-tab transfer |
| User-supplied native QA, 0.3.3 / 0.3.6 | Installed-extension field transfer/readback and isolated storage checks, detailed below | All 15 current entries or every mode passing in a later release |
| Independent installed Chromium, 0.3.12 / 0.3.13 | Local import/review of two IOLMaster 700 representative pages | Calculator-site end-to-end coverage or general OCR accuracy |
| Independent local UI previews, 0.3.9–0.3.13 | Layout, editing, patient history, language, source review and confidence presentation | Installed Chrome permission/CSP behavior unless separately tested |

<a id="installed-calculator-checks"></a>

## Installed calculator checks

The following results came from two user-supplied native synthetic-QA reports dated 2026-11-15, not a new agent-run acceptance test:

- **0.3.3:** 14 entries, 8 passed / 6 skipped; all 8 session/patient/history checks passed; `allPassed` was false. Toric checks recorded 4 passed / 3 requiring manual review, and LVC checks 4 passed / 4 requiring manual review.
- **0.3.6:** 15 registered entries, with 13 processed: 6 passed / 7 skipped; DGS Toric was waiting for its prerequisite and TECNIS had not started. All 8 isolated-storage checks passed. The report was incomplete.

Counts below are fields successfully filled and read back, including mapped identifiers/constants where applicable. They are not counts of validated clinical measurements or calculation results. OD+OS was called OU in those reports. A skipped entry can contain successful partial field checks. Different requirements and modes mean the two reports' aggregate pass counts are not a regression comparison.

| Entry | 0.3.3 status | 0.3.6 status | 0.3.6 successful OD / OS / OU field counts | Remaining scope in those reports |
| --- | --- | --- | --- | --- |
| Barrett Universal II | Passed | Passed | 11 / 11 / 18 | No additional Toric/LVC claim |
| Barrett True-K | Passed | Passed | 14 / 14 / 24 | Only enabled history modes |
| Barrett Toric | Passed | Passed | 15 / 15 / single-eye form | Initial eye selection needed manual confirmation in 0.3.3 |
| Barrett True-K Toric | Passed | Passed | 18 / 18 / single-eye form | Initial eye selection needed manual confirmation in 0.3.3 |
| Barrett Rx / Exchange | Passed | Passed | 26 / 26 / single-eye form | Postoperative fields are distinct from general biometry |
| ESCRS | Skipped | Skipped | 11 / 11 / 7 | Hidden Toric fields and bilateral rerendering |
| Cooke K6 | Skipped | Skipped | 12 / 12 / 21 | Special-mode fields incomplete |
| Kane | Skipped | Skipped | 13 / 13 / 21 | Toric fields incomplete |
| EVO | Passed | Skipped | 16 / 18 / single-eye form | LVC history incomplete on the first pass; 0.3.3 did not cover CCT |
| EVO Toric | Passed | Skipped | 22 / 24 / single-eye form | LVC history incomplete on the first pass; 0.3.3 did not cover CCT |
| PEARL-DGS Regular | Passed | Passed | 9 / 9 / 17 | Custom lens/instrument selections still required review |
| PEARL-DGS Complex | Skipped | Skipped | 12 / 12 / single-eye form | Special/history fields incomplete |
| PEARL-DGS Second Eye | Skipped | Skipped | OD 16; OS incomplete | Required fields and eye confirmation incomplete |
| PEARL-DGS Toric | Skipped | Waiting | None | Spherical calculation and IOL Power prerequisite |
| TECNIS Toric | Not registered | Not started | None | No installed-site result in either report |

Later fixes added eye-control handling, mode preparation, instrument/default mappings and field repairs. Their automated regressions and public-source checks do not retroactively change these native report results. There is no recorded fresh successful full installed-extension run across all 15 current entries. The current integration list and prerequisites are in [supported sites](supported-sites.md).

The earlier blank-panel investigation observed an empty `srcdoc` overriding the extension iframe's valid `src`; the writer of that attribute was not established. The user subsequently confirmed 0.3.3 normal operation and supplied native QA. Detailed mechanism and recovery history remain in [panel-loading diagnostics](panel-loading-diagnostics.md).

<a id="iolmaster-700-report-checks"></a>

## IOLMaster 700 report checks

Recorded on 2026-11-15 with two supplied **ZEISS IOLMaster 700** reports:

| Sample/path | Scope and result |
| --- | --- |
| Native-text PDF, 8 pages | Native-first routing checked on all 8 pages without OCR/raster calls; original page 6 compared numerically |
| Scanned/image PDF, 7 pages | Original page 2 processed by packaged PP-OCRv6 Small and compared numerically |
| Installed extension, 0.3.12 / 0.3.13 | Separate Chromium profile loaded production `dist`; native page 6 and scanned page 2 displayed correct eye groups and decoded source previews; shared numeric comparisons were 18/18 for each |

The **18 shared numerical fields** are AL, ACD, LT, CCT, WTW, K1, K1 axis, K2 and K2 axis for each eye. Human-reviewed reference answers were used for scoring, not supplied to the parser/model. The scan also contained explicit Target values for both eyes, outside the 18-field denominator; unmeasured TK dashes stayed blank.

In the 0.3.13 installed test, the provider was confirmed as Local PP-OCRv6 Small and external connections were blocked by the independent browser context. The native page used no OCR; the scan completed local inference, displayed stage/elapsed time, then released its OCR sandbox. No cloud call or formula calculation was made, and the user's Chrome was not taken over.

These are representative-page comparisons, not an all-page/all-field accuracy estimate. Other report versions, devices and low-quality scans were not established by this sample. Another project's 37-field benchmark is not the extension's 18-field validation. Argos support here is a calculator instrument preference, not independently validated Argos report OCR.

### Optional cloud comparison

The official JavaScript cloud adapters each processed the same two visually checked, deidentified representative-page images once: four jobs total, without retry. Gemini 3.5 Flash-Lite and PaddleOCR API PP-OCRv6 each matched 18/18 shared fields per page. Recorded times were approximately 19 seconds for Gemini and 19–25 seconds for Paddle. This was not a full-file test; billing was not checked and zero cost was not claimed. [Technical methods and results](ocr-cloud-0312.md).

<a id="ui-and-synthetic-regressions"></a>

## UI and synthetic regressions

Independent local previews checked the wide workbench and 300/360 px compact layouts in English and Traditional Chinese, including OD/OS switching, separate Toric/KC/LVC state, patient/measurement editing and duplication, lens search/selection, focus and unsaved-input preservation. These previews used synthetic transport/data and are not calculator-site acceptance results.

Import review checks covered paired OD/OS values, source selection/zoom, preserving edits and selected fields, cancellation and late-result invalidation, resource cleanup, and stage/elapsed timers. The dark red below-85% style was visually tested with an explicitly synthetic low-confidence value. OCR-scored accepted fields in the actual 0.3.13 scanned-page test were at least 85%, so that test did not itself exercise the red state. Native PDF/VLM output without scores remained unscored; no confidence was invented.

Lens/source catalog observations and constant collection are documented separately in [lens transfer](lens-transfer.md) and the [public ESCRS dataset](../data/README.md). Catalog coverage is not proof that every lens choice was transferred in an installed browser.

<a id="historical-source-records"></a>

## Historical source records

Twelve repetitive 0.3 validation files were consolidated into this page on 2026-11-18. Their original detailed text, per-version test counts and operational notes remain in [Git history at the 0.4.0 release commit](https://github.com/eyeduck-ai/biometry-clip/tree/8f6434776e9cdd25d564a70b527c171180369d76/docs). Current procedures belong in the [user guide](user-guide.md), [API setup](api-setup.md) and [development guide](development.md), rather than old release logs.

Raw reports, patient identifiers, API keys, browser profiles and private screenshots are not distributed. Local evidence artifact names in retained research records do not imply those files are included in the repository. This consolidation did not rerun tests, change reported outcomes, or validate clinical formula results.
