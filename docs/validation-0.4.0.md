# Validation — Biometry-Clip 0.4.0

Date: 2026-11-17. Environment: Windows, Node.js 24.15.0, an independent Chromium preview. The installed directory remains at its original `biometry-clipboard/dist` path to preserve the existing unpacked-extension identity.

## Automated checks

- `npm run vendor:ocr`: all four cached official PP-OCRv6 Small/Tiny archives matched pinned sizes and SHA-256 values.
- `npm run check`: **657 passed, 0 failed, 0 skipped**, followed by a successful Chrome MV3 production build.
- Regression coverage includes CSP-safe screenshot decoding/error handling, irrelevant tab-update filtering, provider instructions, model integrity validation, and existing patient/transfer/OCR/adapter behavior.
- Four source-based lens/TECNIS tests now use small, inert committed public-site excerpts. No tests require ignored local research artifacts.
- ZIP packaging passed archive CRC, file count, manifest/version and selected output-byte comparisons: 234 files, 63,546,967 bytes, SHA-256 `f8dc2104daba995f897e9573ec29a8357168fc5f80e3d9779ad41b1c4a2f2bdb`.

## Interface checks

An isolated local preview showed the new product name/version and English by default. Both official provider instruction panels opened normally, and opening/closing help preserved an unsaved synthetic credential. Traditional Chinese switching and the 380 px narrow layout were checked visually; neither 380 px nor 1180 px viewport showed horizontal overflow.

These are UI preview checks and synthetic regressions. This release did not repeat live read/save/cross-tab paste on all 15 calculator entrances, and did not perform a new clinical-report OCR accuracy comparison. Earlier report validation remains bounded to the documented IOLMaster 700 samples; [consolidated evidence](validation-evidence.md) separates installed-site reports, report recognition and synthetic checks.

## Review and limits

See [architecture review](architecture-review-0.4.0.md) for fixes, the measured duplicate WASM package asset, polling/lifecycle follow-up and module boundaries. Large OCR chunks still produce Vite's size warning; this is recorded, not hidden by increasing the warning threshold.

The public source excludes user reports, credentials, local profiles, raw research artifacts and generated runtime binaries. Legacy storage keys and the version 1.3 `biometry-clipboard` JSON protocol remain unchanged.
