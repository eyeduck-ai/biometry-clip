# Change log

Current user documentation is maintained in the [documentation index](docs/README.md). Historical validation records preserve their original version-specific scope; they are not a cumulative claim that every website or report was retested for each release.

## 0.4.0

- Rename the product and source package to **Biometry-Clip**; retain existing local storage and `biometry-clipboard` JSON compatibility.
- Add expandable official Gemini and PaddleOCR account/key instructions to recognition settings.
- Replace the chronological README with English/Traditional Chinese entry guides and dedicated usage, site, API and development documentation.
- Fix screenshot image decoding under the extension CSP and avoid redundant refreshes for irrelevant tab metadata changes. See the [architecture review](docs/architecture-review-0.4.0.md) for audit findings and validation.
- Publish the separate ESCRS seven-formula constants snapshot as JSON/CSV with an offline query page; historical raw research inputs remain outside the public repository. [Dataset](data/README.md).

[Release validation](docs/validation-0.4.0.md).

## 0.3.13

OD/OS editor tabs; compact condition controls; recognition stage and elapsed time; source preview beside paired-eye candidates; field-level OCR confidence highlighting and resource cleanup. [Validation](docs/validation-0.3.13.md).

## 0.3.12

Native-text PDF routing, PP-OCRv6 Small/Tiny packaging, thumbnail page selection and optional official cloud API recognition. [Validation](docs/validation-0.3.12.md) · [Cloud comparison](docs/ocr-cloud-0312.md).

## Earlier versions

- [0.3.11](docs/validation-0.3.11.md), [0.3.10](docs/validation-0.3.10.md), [0.3.9](docs/validation-0.3.9.md): interface, language, lens and field-mapping changes.
- [0.3.8](docs/validation-0.3.8.md), [0.3.7](docs/validation-0.3.7.md), [0.3.6](docs/validation-0.3.6.md), [0.3.4](docs/validation-0.3.4.md): adapters, modes, patient workflows and import improvements.
- [Installed 0.3.1](docs/validation-installed-0.3.1.md), [0.3 UI](docs/validation-ui-0.3.md), [0.3 validation](docs/validation-0.3.md): initial installed-extension and synthetic acceptance work.
