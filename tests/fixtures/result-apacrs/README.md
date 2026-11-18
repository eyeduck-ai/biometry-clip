# APACRS result verification

## Live synthetic verification — 2026-11-18

All five APACRS calculator families produced actual outputs in a fresh, ordinary headed Chrome profile controlled through the isolated Playwright session `apacrs-live-headed`. This did not attach to the user's normal Chrome. There were no stealth settings, challenge workarounds, personal cases, or guessed request endpoints. The earlier headless attempt encountered security verification; ordinary headed Chrome loaded the normal calculators directly.

The following `live-*.html` files are sanitized actual DOM captures. Scripts, event handlers, hidden state, external resources and patient/surgeon summary headers are removed. Exact output IDs, structure, inline row styling, readonly summary values and displayed numeric cells remain. Each `*-url.txt` records its actual result URL. All observed result tabs stayed at the original calculator URL (an optional `#` was the only change). No extra result-route alias is established by these observations.

| Actual capture | Formula / output tab | Captured result groups |
| --- | --- | --- |
| `live-universal.html` | Barrett Universal II → Universal Formula | OD / OS; 7 alternatives each |
| `live-true-k.html` | Barrett True K → Universal Formula | OD / OS; 7 alternatives each; independent output Lens Factors |
| `live-toric.html` | Barrett Toric → Toric IOL | 3 spherical alternatives, 3 cylinder alternatives, displayed recommendation |
| `live-true-k-toric.html` | Barrett True-K Toric → Toric IOL | 3 spherical alternatives, 3 cylinder alternatives, recommendation with distinct IOL / refraction axes |
| `live-rx-exchange.html` | Barrett Rx → Rx Exchange IOL | Exchange spherical/cylinder alternatives and recommendation |
| `live-rx-piggyback.html` | Barrett Rx → Rx Piggy Back IOL | Negative-power piggyback alternatives and recommendation |

Synthetic input summaries:

- Universal II: OD AL 24, K 43/44, ACD 3.2, LT 4.5, WTW 11.8, target 0; OS AL 24.5, K 42.75/43.75, ACD 3.1, LT 4.4, WTW 11.7, target -0.5. Alcon SN60WF.
- True K: same biometry/lens. OD pre-LASIK -4 / post-LASIK 0; OS historical refractions blank. Myopic LASIK setting.
- Toric: OD AL 24, flat K 43 at 0°, steep K 44.5 at 90°, ACD 3.2, LT 4.5, WTW 11.8, target 0, SIA 0.1, incision 180°, Alcon SN6ATx, minus-cylinder display.
- True-K Toric: OS AL 24.5, flat K 42.75 at 10°, steep K 44.25 at 100°, ACD 3.1, LT 4.4, WTW 11.7, target -0.5, SIA 0.1, incision 0°, myopic LASIK -4 / 0, Alcon SN6ATx, minus-cylinder display.
- Rx: OD implanted IOL 20 D / T3 at 90°, postoperative sphere -0.5 / cylinder -0.75 at 10°, postoperative K 43 at 0° / 44.5 at 90°, AL 24, ACD 3.2, LT 4.5, WTW 11.8, target 0, SIA 0.1, incision 180°. Preoperative Ks matched postoperative synthetic Ks. Implant/exchange model Alcon SN6ATx; ELP setting; minus-cylinder display.

Regression tests assert every numeric alternative in these actual sources, constants, source model labels, exact raw source cells, and row highlighting. Ordinary zebra stripes are not highlighted recommendations. `Toric Power` contains model strings in Toric/Exchange but numeric cylinder values in Piggyback; the reader preserves that distinction. Spherical equivalent is never calculated from a displayed sphere and cylinder.

Universal II / True K identify OD/OS in the actual result DOM, with verified `GridView1` / `GridView2` correspondence. Toric, True-K Toric and Rx display their eye annotation only within a generated chart bitmap without an accessible eye label. Their DOM-only result groups deliberately retain `eye: null`; an unrelated current input selection is not substituted as result evidence. Their IOL-axis and residual-refraction axes are captured separately from explicit text.

Verified readonly output controls: Universal II/True K use `MainContent_Biomtery` (source typo), `Biometry0`, `Prediction[0]`, `Constants[0]`, `ModelSelected`. Toric/Exchange use `SelectedIOL`, `IOLcylinder`, `RefractTarget`, `GridView1/2`; Rx Piggyback has separate `pb` controls and `GridView3/4`. These exact result controls are read only if readonly and visible, never from arbitrary editable fields or lens dropdown options.

## Static contract fixtures

Older files without the `live-` prefix remain synthetic source-shaped contract fixtures, not captured APACRS HTML. Their `Results.aspx` / `Output.aspx` URLs are hypothetical directory descendants for route-scoping tests, not claims that those specific routes exist. They cover print-like tables, unknown/duplicate headers, hidden rows, ambiguous eyes and input-form false positives.

Actual sources:

- https://calc.apacrs.org/barrett_universal2105/
- https://calc.apacrs.org/Barrett_True_K_Universal_2105/
- https://calc.apacrs.org/toric_calculator20/Toric%20Calculator.aspx
- https://calc.apacrs.org/TrueKToricTK_preview/TrueKToricTK.aspx
- https://calc.apacrs.org/barrett_rx105/

## Eye-provenance inspection

The three `live-*-eye-evidence.json` files record actual completed output-page attributes. The inspected output controls `MainContent_Rad1` and `MainContent_Rad2` were absent in each output DOM. They were not read from a stale original form. `visibleTextHasEye` was false.

Published source attributes omit the generated image identifiers and query strings.

- Toric image `MainContent_Image1` used a generated `*-cCombinedImage.jpg` path without alt or title attributes.
- True-K Toric image `MainContent_Image1` used `Images/CombinedImage.jpg` without alt or title attributes.
- Rx Piggyback image `MainContent_Image3` used `Images/CombinedImagepb.jpg` without alt or title attributes. The `MainContent_Chart2` resource used `ChartImg.axd` with a generated query and empty alt.

These generated paths do not encode laterality. The original full-page screenshots visibly show Right Eye / Left Eye inside the bitmap; the DOM reader intentionally does not OCR or infer it. Captures were taken after visible output controls appeared, not while an ASP.NET postback was still pending.
