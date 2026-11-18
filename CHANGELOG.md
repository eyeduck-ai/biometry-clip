# Change log

Current user documentation is maintained in the [documentation index](docs/README.md). The [consolidated validation evidence](docs/validation-evidence.md) preserves each check's version and scope; it is not a cumulative claim that every website or report was retested for each release.

## 0.4.1

- Paste or upload biometry-parser JSON and export a working measurement for the Python kit.
- Retain compact source report summaries alongside editable measurements. Native backups containing a report use schema 1.4.
- Consolidate earlier acceptance records in [validation evidence](docs/validation-evidence.md).

## 0.4.0

- Rename the product and source package to **Biometry-Clip**; retain existing local storage and `biometry-clipboard` JSON compatibility.
- Add expandable official Gemini and PaddleOCR account/key instructions to recognition settings.
- Replace the chronological README with English/Traditional Chinese entry guides and dedicated usage, site, API and development documentation.
- Fix screenshot image decoding under the extension CSP and avoid redundant refreshes for irrelevant tab metadata changes. See the [architecture review](docs/architecture-review-0.4.0.md) for audit findings and validation.
- Publish the separate ESCRS seven-formula constants snapshot as JSON/CSV with an offline query page; historical raw research inputs remain outside the public repository. [Dataset](data/README.md).

[Release validation](docs/validation-0.4.0.md).

## 0.3.13

OD/OS editor tabs; compact condition controls; recognition stage and elapsed time; source preview beside paired-eye candidates; field-level OCR confidence highlighting and resource cleanup. [Evidence](docs/validation-evidence.md#ui-and-synthetic-regressions).

## 0.3.12

Native-text PDF routing, PP-OCRv6 Small/Tiny packaging, thumbnail page selection and optional official cloud API recognition. [Report evidence](docs/validation-evidence.md#iolmaster-700-report-checks) · [Cloud technical comparison](docs/ocr-cloud-0312.md).

## Earlier versions

- 0.3.9–0.3.11: interface, language, lens and field-mapping changes.
- 0.3.4–0.3.8: adapters, special modes, patient workflows, lens catalogs and import improvements.
- Earlier native calculator reports, synthetic/UI checks and the IOLMaster 700 comparisons are retained in one [evidence summary](docs/validation-evidence.md). Detailed superseded logs remain in [Git history](docs/validation-evidence.md#historical-source-records).
