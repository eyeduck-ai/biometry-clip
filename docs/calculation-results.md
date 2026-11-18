# Save and export calculator results

The **Results** tab stores the candidate rows displayed by supported
calculators in Chrome. Use the saved history to review a calculation later or
link it to follow-up data for analysis. [Cross-site measurement transfer guide](user-guide.md#cross-site-measurements)

1. Open the calculator and select its tab in **Results**. For automatic capture,
   enable **Watch this tab** before calculating. The watcher saves new recognized
   results as they appear on a supported page for that calculator. For a result
   already displayed, select **Capture current results**.
2. Handle website terms, sign-in and reCAPTCHA if prompted, and press
   **Calculate** or its equivalent on the website. Choose **Stop watching** to
   end automatic capture. Closing the tab or leaving the calculator also ends
   the watch.
3. Open the saved record and check the eye, formula, candidate powers, predicted
   refraction and any Toric fields displayed by the site. To confirm a link,
   choose the saved patient or measurement in **Patients**, reopen the result
   record and select **Link to current selection**. A suggested link stays
   pending until confirmed. Switching cases during monitoring leaves subsequent
   captures unlinked.
4. Mark candidates to review later under **My annotations** and select
   **Save annotations**. The record preserves your annotations alongside the
   website's highlights and selections.
5. Use the site, patient or eye filters, then choose **JSON** or **CSV** under
   **Export current filter**. Both formats include all matching history pages.
   An eye filter finds runs containing that eye and retains the other tables
   in each exported run.

Each saved record has its own stable ID, capture time, site, captured URL without
query or fragment, adapter version and candidate tables. The original values stay
available after reopening the panel and after changes to the working draft or the
linked measurement. Automatic capture skips identical output in the same
document and changes limited to site highlights or selection marks. The manual
button can save another snapshot of that output.

The detail view separates inputs echoed in the result table from form data seen
when starting the watch, shortly before a Calculate interaction, and at capture.
These form observations can help when a site has no input echo. They are stored
separately because they do not establish which inputs produced a result.
Unknown eye, lens, value or axis information stays unknown. Toric residual and
implantation axes remain separate.

## Export contract

- **JSON** uses `biometry-clip-calculation-runs` version `1.0` with a nested
  run → group → candidate structure and an explicit output unit table.
  [JSON Schema](../schemas/biometry-calculation-runs.schema.json)
- **CSV** uses one row per candidate and includes `run_id`, group/row indices,
  site, formula, eye, lens, power, predicted refraction, cylinder/axis fields,
  annotation, verification of the patient link and input/context JSON columns.
  IDs are local references. Keep a consistent mapping if you combine data from
  several Chrome profiles or restore patient records with new IDs.
- Result records live in a separate IndexedDB store, with paged browsing and
  export. Patient/measurement backups and parser JSON exchange have their own
  formats. Use a result export to keep these rows outside the browser.

For postoperative error analysis, join confirmed records to the actual implanted
lens and postoperative refraction using your study's case and eye identifier.
The feature saves the original estimates and annotations. Recorded candidate
choices and actual implantation remain separate.

## Adapter verification

Versions 0.5.1 and 0.5.2 use sanitized result pages from synthetic calculations run on
the live sites on 2026-11-18. Coverage includes the following site flows.

| Calculator | Result checked |
| --- | --- |
| Barrett Universal II | Spherical prediction and displayed constants |
| Barrett True-K | Post-LVC spherical prediction and displayed constants |
| Barrett Toric | Spherical equivalent, IOL cylinder and residual cylinder/axis |
| Barrett True-K Toric | Post-LVC spherical equivalent and toric predictions |
| Barrett Rx | Exchange and piggyback predictions, including spherical/cylinder/axis values displayed for each option |
| PEARL-DGS Regular | Bilateral adjusted spherical results |
| PEARL-DGS Complex | Adjusted post-LVC results |
| PEARL-DGS Second Eye | Adjusted prediction after first-eye outcome input |
| PEARL-DGS Toric | Toric results after selecting a spherical power |
| Cooke K6 | Bilateral predictions from Print Preview |
| Kane | Bilateral spherical results and separate toric candidates |
| EVO 2.0 | Spherical results, including axial length and CCT echoed by the site |
| EVO Toric 2.0 | Spherical and toric results, including separate implantation and residual axes |
| TECNIS Toric | Lens codes, implantation axes, residual cylinder/axis and the selected candidate |
| ESCRS | Bilateral spherical results, OD Toric, and OS post-myopic LASIK/PRK results. Tested with two live synthetic cases. |

Barrett Toric, Barrett True-K Toric and Barrett Rx show the result eye in a
graphic. The text reader leaves these results marked **Eye not specified**.

The installed extension captured Barrett Universal II, all four PEARL-DGS
flows, and Cooke K6 directly from the live calculators. In 0.5.1, an isolated
replay used sanitized pages from 14 entries to confirm automatic capture,
persistence after panel reload and JSON/CSV export. It saved 15 runs, including
both Barrett Rx modes, and verified all 124 CSV rows against JSON.

ESCRS prints several formulas side by side. The archive preserves each eye's
formula columns separately. The Toric results retain IOL cylinder, implantation
axis, residual cylinder, residual axis, and the echoed SIA and incision axis.
The verified post-myopic result has an explicit LASIK/PRK note in the OS section.
The ordinary bilateral run returned six formulas per eye after an upstream
Barrett error. Its Cooke cell `-+0.00` stays available as source text in JSON;
the numerical refraction for that cell is blank.

In 0.5.2, the installed extension captured the live mixed ESCRS result and
preserved it after reopening the panel. All 70 rows matched the site and both
export formats, including 21 OD cylinder candidates and 26 OS post-myopic
rows. A same-page replay of that result verified automatic capture. A separate
bilateral spherical replay verified both manual and automatic capture across
all 72 source cells.

These checks cover the dated scenarios listed above. [Calculator entry list and field input coverage](supported-sites.md)
