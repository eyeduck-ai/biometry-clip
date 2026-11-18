# Biometry-Clip

Biometry-Clip is a Chrome extension for reusing eye measurements across IOL calculators and saving their calculation results for later review or analysis.

[繁體中文](README.zh-TW.md) · [User guide](docs/user-guide.md) · [15 supported calculators](docs/supported-sites.md) · [API setup](docs/api-setup.md) · [Development](docs/development.md)

## Install

Requires **Chrome 140 or newer**.

1. Extract the packaged release ZIP to a permanent folder. The selected folder must contain `manifest.json`.
2. Open `chrome://extensions`, turn on **Developer mode**, and choose **Load unpacked**.
3. Select that folder and pin **Biometry-Clip** to the toolbar.
4. Open a [supported calculator](docs/supported-sites.md) and click the extension icon.

When building from source, select the generated `dist` folder instead. Keep the installed folder at the same path when updating, reload the extension, and refresh calculator tabs. Moving an unpacked extension can change its Chrome identity and the associated local data.

## Transfer measurements between calculators

1. Use **Copy site** on a supported calculator with completed inputs, enter values in **Data**, or use **Import** to recognize a PDF, image, or pasted screenshot. **Import** also accepts structured JSON from Biometry-Clip and biometry-parser.
2. Review the **OD** and **OS** values and each eye's Toric, KC, and LVC settings. **Patients** lets you save and reload multiple measurements per patient.
3. Open another [supported calculator](docs/supported-sites.md) from **Sites** or in your own tab. Choose **Paste OD**, **Paste OS**, or **Paste OD+OS** where the site supports bilateral entry. The extension fills the corresponding fields and selects the requested eye on supported single-eye forms. Lens selection transfers when the mapping is unambiguous. You can opt in to transferring IOL constants.
4. Handle any terms prompt or reCAPTCHA yourself when it appears. Check the fields and run the calculation on the website.

[Measurement transfer guide](docs/user-guide.md#cross-site-measurements)

## Save and export calculator results

1. In **Results**, choose the calculator tab. Select **Watch this tab** before calculating for automatic capture, or **Capture current results** after the website displays its results.
2. Open the saved record to review the available eye, formula, IOL candidates, predicted refraction, and Toric fields. You can confirm a link to a patient and measurement and annotate the candidates you considered.
3. Filter by website, patient, or eye and use **Export current filter**. JSON keeps the nested calculation records, and CSV contains one row per candidate.

[Result capture, export format, and verification](docs/calculation-results.md)

On a supported calculator, the toolbar icon opens a draggable, resizable floating panel. Elsewhere it opens a wider workbench. English is the default, and the header language button switches to Traditional Chinese.

## PDF and image recognition

PDFs show page thumbnails before recognition, with up to **three selected PDF pages per batch**. Native PDF text and layout are read first; image-only or insufficient-text pages use OCR automatically. The default local engine is **PP-OCRv6 Small**, packaged with the extension and usable offline. Tiny is also available.

Review presents the source and paired OD/OS fields, with a processing stage and elapsed time. Fields with an actual OCR confidence below **85%** have a dark red highlight. Native PDF extraction and models without a confidence score remain unscored.

The principal report family tested is **ZEISS IOLMaster 700**: a native-text PDF and a scanned PDF. Representative pages matched **18/18 shared numerical fields** against human-reviewed answers in installed-extension tests. This is a bounded test result, not an accuracy claim for every report or device. Argos is supported as a calculator instrument preference, but has not been independently validated as an OCR report type. See the [report scope](docs/user-guide.md#report-types-and-validation) and [recorded validation](docs/validation-evidence.md#iolmaster-700-report-checks).

## Data and optional cloud services

The working draft uses Chrome session storage. The patient library, preferences, and API credentials use local extension storage, which is **not encrypted**. Local OCR needs no cloud account. Gemini and official PaddleOCR APIs are optional; settings include application instructions and require only a key/token and model choice in normal mode. Actual cloud image requests require upload confirmation. A readable native PDF does not get uploaded merely because a cloud provider is selected.

Case/library backups use `biometry-clipboard` **1.3** or **1.4** when they include a report summary. Imports support 1.0–1.4. Use the measurement export to share a case with the Python kit, and the **Results** export to archive local calculation history. [Backup schema](docs/interchange.md) · [biometry-parser exchange](docs/parser-exchange.md) · [Calculation result schema](schemas/biometry-calculation-runs.schema.json)

## Build from source

Requires Node.js **22.13 or newer**; development has been tested with Node.js 24 and npm. Initial dependency/model downloads require network access.

```sh
npm ci
npm run vendor:ocr
npm run check
```

`npm run check` runs tests and builds `dist`. `npm run dev` starts the development UI; it does not install the Chrome extension. Runtime/model assets are generated by `vendor:ocr` rather than committed binaries. See [development and architecture](docs/development.md) and the [v0.4.0 architecture review](docs/architecture-review-0.4.0.md).

The separate [ESCRS seven-formula constants dataset](data/README.md) includes JSON, CSV and an offline searchable page for 645 source lens options. It preserves site-specific observations rather than treating one constant as universal.

Repository: [eyeduck-ai/biometry-clip](https://github.com/eyeduck-ai/biometry-clip). See the [documentation index](docs/README.md) for current guides, schema references, and historical research/validation records.
