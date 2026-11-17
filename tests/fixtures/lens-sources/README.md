# Public calculator source fixtures

Small, inert excerpts of public calculator menus and control markup captured during the 2026-11-15 source review. They let tests run in a fresh clone without local research artifacts or network access. These are source evidence, not generated from the extension registry.

HTML retains the original tested controls, values, labels, scopes and event attributes. Unneeded ASP.NET state, external script resources and image sources are omitted. Patient/surgeon controls in the TECNIS form are blank; no patient report, API credential, cookie, browser state or calculation result is included. JavaScript snippets are read as text and never evaluated.

The site-specific constants remain public source data and must not be treated as interchangeable clinical recommendations.

| Fixture | Official source | Retained scope | Original capture SHA-256 |
| --- | --- | --- | --- |
| evo-regular.html | https://www.evoiolcalculator.com/Calculator.aspx | Native lens menu and A-constant input, unchanged options and onchange. | 1f1a1eb713ddd543a7f2862727afbeadc7b7da281c0407a34947914892003bf8 |
| evo-toric.html | https://www.evoiolcalculator.com/Toric.aspx | Native lens menu and A-constant input, unchanged options and onchange. | 180ed23774f6034d03610535d3bda06c4cefe71b4911f36c178f516f718dc094 |
| tecnis-calculator.html | https://tecnistoriccalc.com/calculator/ | Main blank calculator form, lens family menu, and separate cylinder preference. | 7273d4db9d62c4b806cd428da3b35209e63e8c1ec5c8bc09fcfb755dc0242423 |
| tecnis-matrix.js | https://tecnistoriccalc.com/calculator/ | Published const matrix only. | 7f522f722b7584791e8cb8d75878027ce270f23ecf017e2dead809d17544d4be |
| apacrs-sources.json | https://calc.apacrs.org/ | Six public lens menu snapshots only; derived entries and preset tables omitted. | 8d7f987d0656459d642232588638340a442c6c8dcaf7f13ff58e84c52e9aed25 |
| cooke-lenses.js | https://cookeformula.com/ | Published 23-item default lens literal only. | b6207bb95e88ce919a276b507c7781d1f85f509212be5b5230985b4205cd5cf5 |
| dgs-lenses.js | https://iolsolver.com/regular | IOLModelItems and Toric style literals only. | 988f8e3394c557d9650d551c58164702719b99e44e7814f87ee6fe145c721133 |
| kane-handlers.js | https://www.iolformula.com/ | SetControlsForIOL and both native IOL change handlers only. | 14bc7380b4b5f1ebd8af6766d26516b9e1f195bd12d905808164deb485075d5f |
| kane-options.json | https://www.iolformula.com/ | Both public IOL selects and their published ioltypes constant table. | b57092992337ed492a1852476cdc0bd9b8e9ac4bef5bdac1c7b0a163ec43e914 |
