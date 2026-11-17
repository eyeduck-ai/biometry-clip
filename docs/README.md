# Documentation

Current product name: **Biometry-Clip**. The guides below describe the current interface; older research and validation records retain the version and product name used when recorded.

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
| [Change log](../CHANGELOG.md) | Current changes and links to historical validation |

## Data references

- [Interchange specification](interchange.md): case/library JSON and version compatibility. The `biometry-clipboard` protocol name is retained after the product rename.
- [JSON Schema](../schemas/biometry-clipboard.schema.json): current machine-readable case/library contract.
- [Lens transfer](lens-transfer.md) and [lens registry](lens-registry-038.md): site-specific lens selection, model precision and constants.
- [Public ESCRS seven-formula constants](../data/README.md): 645 source lens options, JSON/CSV, offline searchable page, coverage and independent recheck summaries.
- [Site adapter reference](site-adapters.md): technical field mapping background; use the current [site list](supported-sites.md) for product scope.

## Research and validation archive

These records describe observations at a particular version/date. They do not establish that every current website or report format passed a new end-to-end run.

- [v0.3.13](validation-0.3.13.md): OD/OS editor, progress, source review, confidence and installed-extension local OCR.
- [v0.3.12](validation-0.3.12.md) and [cloud OCR notes](ocr-cloud-0312.md): native PDF/local OCR and bounded cloud comparisons.
- [v0.3.11](validation-0.3.11.md), [v0.3.10](validation-0.3.10.md), [v0.3.9](validation-0.3.9.md): earlier UI, language, lens and field-mapping work.
- [ESCRS constants](research-escrs-constants-039.md), [ESCRS Toric](research-escrs-toric-039.md), [lens catalog](research-lens-catalog.md), [other lens sources](research-lens-other-038.md).
- [APACRS](research-apacrs.md), [TECNIS](research-tecnis.md), [DGS controls](research-dgs-controls.md), [special modes](research-modes-037.md).
- [Earlier OCR design](ocr.md) and [panel loading diagnostics](panel-loading-diagnostics.md): implementation history, not current setup instructions.

Private input reports, patient identifiers, API credentials and raw screenshots are excluded from this documentation. A reference to a local evidence artifact in an archived record does not imply that the private artifact is distributed with the repository.
