# Supported calculators

Biometry-Clip currently registers **15 calculator entry pages**. The URLs and eye-mode capabilities below follow `src/sites.js` and its adapters. This is the supported integration list, not a claim that all sites passed a new live-browser acceptance run in the current release.

**Dual-capable** means OD+OS can be transferred together only when independent supported eye groups are detected in the current form. OD or OS can also be selected alone. **Single** means transfer one eye at a time, with the adapter selecting the site's eye control when available.

| Calculator / entry | Main use | Eye mode | Important modes or fields |
| --- | --- | --- | --- |
| [Barrett Universal II](https://calc.apacrs.org/barrett_universal2105/) | General IOL | Dual-capable | Shared biometry and Target |
| [Barrett True-K](https://calc.apacrs.org/Barrett_True_K_Universal_2105/) | Post-LVC / RK | Dual-capable | LVC type and available historical measurements |
| [Barrett Toric](https://calc.apacrs.org/toric_calculator20/Toric%20Calculator.aspx) | Toric | Single | K axes, SIA, incision axis, posterior/total K where exposed |
| [Barrett True-K Toric](https://calc.apacrs.org/TrueKToricTK_preview/TrueKToricTK.aspx) | Post-LVC + Toric | Single | LVC and Toric inputs remain separate |
| [Barrett Rx / Exchange](https://calc.apacrs.org/barrett_rx105/) | Postoperative / exchange | Single | Refraction, implanted IOL and pre-/postoperative K |
| [ESCRS IOL Calculator](https://iolcalculator.escrs.org/) | Multiple formulas / special modes | Dual-capable | Toric, KC, Argos and Post LASIK/PRK/RK mode controls |
| [Cooke K6](https://cookeformula.com/) | General / available LVC modes | Dual-capable | Biometer mapping, including Argos and other instruments |
| [Kane Formula](https://www.iolformula.com/) | General / Toric / available KC modes | Dual-capable | Fields follow the selected original-site mode |
| [EVO 2.0](https://www.evoiolcalculator.com/Calculator.aspx) | General / available LVC modes | Single | Eye control, CCT in µm, explicit LVC state |
| [EVO Toric 2.0](https://www.evoiolcalculator.com/Toric.aspx) | Toric | Single | CCT in µm, K axes, SIA and incision axis |
| [PEARL-DGS · Regular](https://iolsolver.com/regular) | General | Dual-capable | Eye switch and biometer controls |
| [PEARL-DGS · Complex](https://iolsolver.com/complex) | Post-LVC / special cornea | Single | Mode-dependent special/history measurements |
| [PEARL-DGS · Second Eye](https://iolsolver.com/second) | Second eye | Single | Fellow-eye measurements, implanted IOL and refraction |
| [PEARL-DGS · Toric](https://iolsolver.com/toric) | Toric after spherical calculation | Single | Complete spherical calculation and select IOL Power first |
| [TECNIS Toric](https://tecnistoriccalc.com/calculator/) | Toric | Single | Planned SE IOL Power, lens family, K units, SIA and incision axis |

## Mode and transfer rules

- The **Sites** tab groups entries by use: general, Toric, post-LVC/RK, special cornea/KC, postoperative/exchange and second eye. A calculator can appear in more than one group.
- Required fields are derived from the detected current form. Original-site mode changes may reveal additional fields; the extension cannot fill a field the site has not exposed.
- ESCRS combined switches are treated as mode controls, not numeric measurements. Post-LVC subtype and remaining original-site selections still require review. A compatible default biometer can drive Argos-specific controls; IOLMaster 700 is the default instrument preference.
- Toric SIA and incision defaults apply only to missing applicable data. The preferred cylinder display is `−ve` where supported. Conventional K, total K and posterior K are separate values.
- LVC defaults do not turn a measured normal eye into a myopic-LVC eye. Explicit No LVC, Myopic, Hyperopic and RK states are mapped separately. Historical unknown values require review.
- **PEARL-DGS Toric:** first complete the spherical IOL calculation on the original site, select an **IOL Power**, then enter Toric calculation. The extension reminds the user when this prerequisite is missing; it does not run the calculation automatically.
- **TECNIS:** Planned SE IOL Power is distinct from Target, implanted IOL power and fellow-eye IOL power. They are never substituted for one another.
- Lens selection requires a supported unambiguous model/family mapping. Constants are site-specific and excluded from ordinary paste by default. [Lens transfer reference](lens-transfer.md).

Terms, login, CAPTCHA and original-site calculation actions remain on the website. A site may change its markup or available fields; review the transfer result on the original form. Report a problem with the entry URL, mode, eye and field names, using synthetic values.

## What has been validated

See [result capture evidence](calculation-results.md#adapter-verification) for the separate output adapters.

Automated adapter tests cover synthetic field mapping, eye groups, mode controls and units. Historical live-site checks and user acceptance results are recorded separately in the [documentation archive](README.md#research-and-validation-archive). The installed-extension IOLMaster 700 tests validate report import/review; they do not establish a fresh successful cross-tab run across all 15 calculators.
