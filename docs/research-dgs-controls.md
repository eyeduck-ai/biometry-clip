# DGS eye selection and Toric entry

Public source inspected on 2026-11-15. Only ordinary HTTP GET requests were made. No terms were accepted, no patient data were submitted, and no calculation was run for this inspection. Saved source URLs, byte counts and hashes are in `artifacts/dgs-source/metadata.json`.

## Eye selection

| Entry | Observed structure | Meaning | Transfer behavior |
| --- | --- | --- | --- |
| Regular | Separate OD and OS input sections | Both eyes are present at once | Preserve the existing bilateral adapter |
| Complex | Vuetify switch with root class `switch-eye`, bound to `inputs.side` | `true` is OD; `false` is OS | Click the unique native checkbox only if the requested eye differs; reinspect after the site's watcher restores that eye's data |
| Second Eye | Same switch and binding | `true` is the current OD; `false` is the current OS | Select the current eye; keep fellow-eye measurements in their separate fields |
| Toric | Header `h2` inside `iol-right-v-sheet` or `iol-left-v-sheet` | The fixed eye from the preceding spherical calculation | Read the exact OD/OS header; changing the eye requires returning to a spherical entry and calculation |

The Complex/Second watchers explicitly replace the form from the stored right or left eye when `inputs.side` changes. Writing the checkbox's `checked` property without a native click would bypass this transition. Copying data must never toggle the switch: it reads the eye currently displayed.

Automatic switching is unavailable for duplicate, disabled, ARIA-disabled or indeterminate switches. Conflicting visible eye headers cannot determine an eye. These conditions must not silently relabel measurements.

## Toric prerequisite

The Toric component renders a prerequisite notice instead of its fields while `gtoric_calc_allowed` is false. Its visible paragraph contains both messages:

- `Please first complete a spherical IOL calculation`
- `Then select an "IOL Power" value`

The notice is inside `form .ghost p.text-center.text-h6.text-sm-h5`. Detect this narrowly scoped, visible notice and provide the Regular entry (`https://iolsolver.com/regular`) as the next action. Opening that entry retains the extension's saved measurements. The extension must not invent a spherical result, choose an IOL power, or claim Toric acceptance before these website prerequisites are completed.

Once the form is present, the extension can fill the audited Toric inputs. A fixed-eye header inconsistent with the requested eye stops transfer and directs the user back to the spherical entry.

## Biometer

The public Regular, Complex and Second components use a Vuetify custom select labeled `Biometer`, with these shared options from the application source:

| Source instrument | Website item |
| --- | --- |
| Argos | `Argos (SOS-AL)` (`type: Argos`) |
| Immersion ultrasound | `US (immersion)` (`type: USimmersion`) |
| Applanation ultrasound | `US (applanation)` (`type: USaplanation`) |
| IOLMaster 700 and other optical instruments | `Other` (`type: Other`) |

This is a custom readonly display/combobox, not an ordinary native `select`. It is operated through its actual option UI, never by changing its hidden/display input. The audited Vuetify bundle generates an activator with `role="button"`, `aria-haspopup="listbox"` and `aria-owns` referring to its own listbox. Transfer opens that activator, reinspects the exact owned listbox, and clicks only its unique matching enabled `role="option"`. It verifies the selected display text afterward. Another visible menu with the same option text cannot serve as the destination. The Toric page displays the preceding calculation's biometer as readonly information.

The displayed `Argos (SOS-AL)` value must survive read→paste round trips. A bilateral form with different instrument mappings cannot silently choose one eye's value. Two explicit optical instruments that both map to `Other` are compatible for this shared website field.

Kane's public GET currently shows its terms page. It cannot establish whether the accepted calculation form has an instrument selector. The Barrett GET was challenged by Cloudflare and was not bypassed. Barrett's optional **Biometer K1/K2** fields are measurements, not a generic instrument selector, and must not receive an instrument name. EVO's **posterior-cornea biometer** selector is likewise a separate measurement role.

Source-backed regression fixtures exercise eye switching and the prerequisite notice; they are distinct from native Chrome acceptance and formula-result validation.
