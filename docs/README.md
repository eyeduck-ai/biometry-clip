# Documentation

Current product name: **Biometry-Clip**. The guides describe the current interface. Repetitive earlier validation logs have been consolidated into one evidence summary; dated technical research retains its original scope.

## Start here

| Document | Contents |
| --- | --- |
| [English overview](../README.md) / [繁體中文](../README.zh-TW.md) | Installation and basic workflow |
| [User guide](user-guide.md) | Floating editor, transfer, patients, import/review, settings and report scope |
| [Supported calculators](supported-sites.md) | Exact 15 entry URLs, eye modes and prerequisites |
| [API setup](api-setup.md) | Official Gemini and PaddleOCR account/key instructions |
| [Development](development.md) | Build, module boundaries, test scope and extension updates |
| [v0.4.0 architecture review](architecture-review-0.4.0.md) | Audit findings, fixes and remaining limits |
| [v0.4.0 validation](validation-0.4.0.md) | Current release checks and their scope |
| [Validation evidence](validation-evidence.md) | Earlier native per-site QA, IOLMaster 700 import checks and evidence limits |
| [Change log](../CHANGELOG.md) | Product changes and source-history references |

## Data references

- [Interchange specification](interchange.md): case/library JSON and version compatibility. The `biometry-clipboard` protocol name is retained after the product rename.
- [biometry-parser exchange](parser-exchange.md): paste or upload parser JSON, preserve report summaries, and read Clip exports in Python.
- [JSON Schema](../schemas/biometry-clipboard.schema.json): current machine-readable case/library contract.
- [Lens transfer](lens-transfer.md) and [lens registry](lens-registry-038.md): site-specific lens selection, model precision and constants.
- [Public ESCRS seven-formula constants](../data/README.md): 645 source lens options, JSON/CSV, offline searchable page, coverage and independent recheck summaries.
- [Site adapter reference](site-adapters.md): technical field mapping background; use the current [site list](supported-sites.md) for product scope.

## Research and validation archive

Research records describe observations at a particular version/date. They do not establish that every current website or report format passed a new end-to-end run. Original detailed 0.3 validation logs remain in Git history, linked from the consolidated summary.

- [Consolidated validation evidence](validation-evidence.md): versioned installed-site results, representative report comparisons and synthetic/UI scope.
- [Cloud OCR technical notes](ocr-cloud-0312.md): hosted API integration and bounded representative-page comparison.
- [ESCRS constants](research-escrs-constants-039.md), [ESCRS Toric](research-escrs-toric-039.md), [lens catalog](research-lens-catalog.md), [other lens sources](research-lens-other-038.md).
- [APACRS](research-apacrs.md), [TECNIS](research-tecnis.md), [DGS controls](research-dgs-controls.md), [special modes](research-modes-037.md).
- [Earlier OCR design](ocr.md) and [panel loading diagnostics](panel-loading-diagnostics.md): implementation history, not current setup instructions.

Private input reports, patient identifiers, API credentials and raw screenshots are excluded from this documentation. A reference to a local evidence artifact in an archived record does not imply that the private artifact is distributed with the repository.
