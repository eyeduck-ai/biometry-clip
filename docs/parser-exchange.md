# Send report measurements from biometry-parser to Biometry-Clip

Biometry-Clip reads the Python kit's `ExtractionResult` JSON, schema **1.2**.
The report format keeps each eye, unit, source state and verification state explicit.
Clip keeps a separate editable set of values for calculator forms and a compact
snapshot of the report for later review. The usual flow is **parse the report
→ paste the measurement JSON → review OD and OS → fill a calculator**.
[Parser data contract](https://github.com/eyeduck-ai/biometry-parser/blob/main/docs/data-contract.md)

## Parser to Biometry-Clip

Use compact JSON when copying a result to Clip. Native-text PDFs can use
`--backend native`.

```sh
biometry-parser extract report.pdf --compact -o exchange.json
```

```python
from pathlib import Path
import json
from biometry_parser import BiometryParser, to_exchange_document

result = BiometryParser().parse("report.pdf")
Path("result.json").write_text(result.model_dump_json(indent=2), encoding="utf-8")
Path("exchange.json").write_text(
    json.dumps(to_exchange_document(result), ensure_ascii=False, indent=2),
    encoding="utf-8",
)
```

In **Import**, choose **Paste JSON** for the text or **Upload JSON** for the file.
Review OD and OS and select the fields you want to apply. Unverified candidates
start unchecked. **Select candidates for empty fields** selects candidates for empty fields
after review. Existing values require an explicit choice to overwrite.
[Synthetic example](../examples/biometry-parser.synthetic.json)

Parser schema 1.2 carries two kinds of data. The top-level measurement fields
and `eyes` contain the measured values. The `iol_calculations` array contains
the report's tables, including each eye, lens model, formula, printed
constants and candidate power/refraction rows where available. The compact
form keeps both sets of structured data and trims OCR evidence. The Python
example produces both files from the same parse.

| Parser result | Clip treatment |
| --- | --- |
| AL, ACD, LT, WTW in `mm`; CCT in `um` | Editable per-eye fields |
| K1/K2 and TK1/TK2 power in `D`, independently supplied axes in `degree` | Editable per-eye fields |
| Patient ID and gender | Editable, with text IDs preserved |
| Measurement date, mean K, anterior corneal astigmatism and axis, pupil size | Retained in the report summary |
| Conflicts, blanks, unreadable and explicitly unmeasured fields | Kept as source states in the summary where supplied. They leave editable fields empty |
| Report IOL tables | Kept in the parser result for later comparison. Clip uses the reported measurements to fill calculator inputs |
| Page references, OCR observations and run evidence | Available in the full parser result. Clip stores the compact measurement summary |

The report date stays a calendar date. The **Save measurement** date and time
are set separately. The summary records source values as they appeared at
import, even after editing working fields. It travels with the saved
measurement and in native backups with `schemaVersion: "1.4"`. Clip emits 1.3
when there are no report summaries.

## Optional export from Biometry-Clip to Python

Choose **Export biometry-parser JSON** under **Import → Export and data formats**.
This exports one working measurement in the same 1.2 format. After editing a
measurement, read the current shared field from `candidate_value`. Clip records
edited measurements as unverified candidates. Original supplemental report
fields retain their source state. The document records the provenance of the
attached summary in `metadata.biometry_clip.report_source`.
When the draft and the source carry different patient IDs, review the IDs
before exporting the report fields.

```python
from pathlib import Path
from biometry_parser import ExtractionResult

result = ExtractionResult.model_validate_json(
    Path("biometry-parser.json").read_text(encoding="utf-8")
)
od = result.eyes["OD"]
print(od.al.candidate_value, od.al.unit)
print(od.pupil.candidate_value, od.pupil.data_status)
```

Use [Clip's native case/library backup](interchange.md) for calculator settings,
lens selection, patient histories and the full retained summaries. The
Python kit's original output is the place to keep OCR evidence, source pages
and IOL calculation tables.

## Proposed storage for website calculation results

Keep measurements and calculation runs as independently versioned records.
A measurement can have many calculations, each with its own eye, source,
settings and output rows. A single report or a future case bundle can carry
both record types. The usual paste operation needs only the measurement.

A website run should store these pieces:

| Part | Suggested contents |
| --- | --- |
| Source | Site and formula identifiers, source URL without identifying query parameters, capture time, adapter version and formula version when available |
| Input | Eye, reference to the saved measurement and a snapshot of the effective inputs confirmed on that website, including the biometry used, target, lens, constants, mode, units and relevant defaults |
| Result | Candidate lens powers, predicted refractions and, when shown, toric model, axis and residual cylinder with notation and plane. Keep exact source labels and distinguish missing values, visual highlights and explicit user selections |
| Link status | Record whether the result is tied to the saved input snapshot. If the page does not provide enough evidence, show it as unlinked in review |

The saved input snapshot keeps earlier runs interpretable after a measurement
is edited. Candidate rows from the same site can differ by input, lens,
formula or calculation run. Save each run independently. Report tables and
website tables can share the result fields their sources actually expose,
with distinct provenance such as report page versus website capture time.
When importing a bundle, remap calculation links alongside the new
measurement IDs assigned by the patient library.

Start with read-only capture after the user calculates, using one adapter
for a site with a stable result table. Review the source eye, inputs and
results before saving. Extend to other sites after testing changed inputs
with stale rows, repeated calculations, Toric notation and unavailable cells.

Use versioned UTF-8 JSON for importing, exporting and case bundles. CSV is a
derived export for comparing candidates in a spreadsheet. If result history
grows enough to need indexed queries, use IndexedDB for per-run local storage
while continuing to export JSON.
