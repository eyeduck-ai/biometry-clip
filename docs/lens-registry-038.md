# Cross-calculator IOL registry

`src/lens-registry.js` joins the approved public ESCRS manufacturer menus with APACRS, EVO, TECNIS, Cooke K6, Kane and DGS option metadata. The module has no browser, storage or network side effects.

The ESCRS capture covers all 41 manufacturers in both non-toric and toric modes: 82 inspected branches, 74 nonempty menus and 645 displayed option rows. The source arrays retain duplicated labels. A single menu contains 14 rows whose names are indistinguishable from another row; these do not become unique writable selections after serialization.

## Identity and projection

- An exact alias identifies one manufacturer's displayed model code. Alcon and ZEISS marketing prefixes are removed only when the label ends in the explicit complete model code. Original labels remain in the aliases.
- Canonical IDs retain power-sign variants, model/injector suffixes and regional qualifiers. `AR40e` and `AR40E` remain distinct publisher model names.
- A `targets` row records a one-way, evidenced relation to a destination model group, series or optical geometry. A group cannot imply which physical member was originally selected.
- ESCRS ranges such as `AcrySof SN6AT (2-9)` are families. Their explicitly named series can transfer to APACRS `Alcon SN6ATx`, EVO `SN6ATx` and Kane's `Alcon SN6ATx` family. J&J `ZCU`, `DIU` and other displayed series remain families.
- Named manufacturer families such as enVista Aspire and Aspire Toric preserve the spherical/toric distinction when matching ESCRS, Kane and EVO menus.
- TECNIS's published matrix supplies 118 physical model codes and their family membership. These are not forged as exact input aliases: the calculator's input selects a family. `ZCB00` belongs to two published families and remains ambiguous where no unique family is specified.
- EVO's documented Standard/posterior/anterior/bitoric choices are recorded as geometry relations. Such a choice does not claim to preserve a physical model identity. DGS's geometry choices have separate evidence requirements; EVO's guide is not applied to DGS.

Parameters live in `entry.parameters` with source site, control and optional formula. APACRS preset parameters come from 222 actual selection/postback/readbacks, with distinct implanted/exchange roles in Barrett Rx. ESCRS's seven formula parameters remain separate. A selection plan never contains a source parameter to write into another formula.

## Integration API

```js
import {
  DEFAULT_LENS_CATALOG,
  LENS_DEFINITIONS,
  mergeLensCatalog,
  planLensSelections,
} from './lens-registry.js';

const catalog = mergeLensCatalog(storedCatalog); // optional stored/custom JSON
const plan = planLensSelections(caseData, profile.id, inspectedInventory, {
  eye: 'OU',
  catalog,
});
// {status, selections, warnings, plans}
```

`selections` contain only exact destination option identities, source canonical ID, eye, control and role. ESCRS manufacturer selections precede their dependent model selection. Barrett Rx uses the implanted destination only for an explicitly implanted source role; other sources use exchange. Two differing requested models cannot write into the same shared native control during OU transfer.

Open linked menus and native selects are authoritative about missing/disabled/duplicate options. Closed autocomplete menus can be planned using the published options; the runtime must open the menu and verify the actual available exact option before selecting it. A manufacturer's model list is scoped by its original maker label and eye.

`mergeLensCatalog()` preserves the bundled complete menu when a stored capture contains a filtered search result. It stores newly read constants only under their originating model/site/control/formula. User-defined exact mappings survive merges, while conflicting aliases fail strict validation.

## Reproduce and inspect

```powershell
node --test tests/lens-registry.test.js tests/lens-sites-apacrs.test.js tests/lens-sites-other.test.js
node scripts/build-lens-registry.mjs
```

The build script writes the complete `artifacts/lens-catalog-038/default-lens-catalog.json`, row-level `registry-coverage.json` and compact `registry-coverage.md`. The coverage audit executes the actual resolver on each of ESCRS's 645 displayed rows against the other 14 calculator definitions. Its counts distinguish exact models, families/groups, optical geometry, ambiguous choices, unmapped choices and DGS Toric inheritance. This is a deterministic published-data audit, separate from live extension execution.

Evidence: `docs/research-apacrs-lenses-038.md`, `artifacts/lens-catalog-038/escrs-master.json`, `apacrs-sources.json`, `evo-tecnis-data.json`, `tecnis-matrix.json`, `kane-options-live.json`, and the source links stored on each alias/target/parameter.
