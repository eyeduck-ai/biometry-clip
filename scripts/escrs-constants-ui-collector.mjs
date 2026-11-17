// Research helper: call only with an approved, independent ESCRS CUA tab.
// All mutations use visible controls. No calculation, private state, or network API.
export function createEscrsConstantsCollector(tab) {
  const rows = [];
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const state = () => tab.getAXState({emit:false, disableDiffing:true});
  const read = () => tab.playwright.evaluate(() => {
    const col = document.querySelector('.mud-grid.mud-grid-spacing-xs-6.noprint > .mud-grid-item');
    const maker = col?.querySelector('[role=combobox][aria-label=Manufacturer]');
    const toric = Array.from(col?.querySelectorAll('input[type=checkbox]') || []).find(x => x.closest('label')?.textContent.trim() === 'Toric');
    return {manufacturer:maker?.value || maker?.textContent?.trim(), model:col?.querySelector('input[aria-autocomplete=list]')?.value,
      toric:toric?.checked,
      parameters:Array.from(col?.querySelectorAll('.mud-input-control') || []).filter(x => /A-Constant|pACD/.test(x.textContent)).map(x => ({
        label:x.querySelector('label')?.textContent.trim(), rawValue:x.querySelector('input')?.value || null,
        controlId:x.id, hasClear:!!x.querySelector('button[aria-label=Clear]')
      }))};
  });
  async function clear() {
    // Clear buttons update Blazor's bound state; fill('') alone leaves old defaults.
    const before = await read();
    for (const param of before.parameters.filter(x => x.hasClear)) {
      await tab.playwright.locator('#' + param.controlId).getByRole('button', {name:'Clear',exact:true}).click();
      await state();
    }
    await sleep(500);
    const after = await read();
    if (after.parameters.length !== 7 || after.parameters.some(x => x.rawValue !== null || x.hasClear)) throw Error('Seven parameter controls did not clear');
    // Clearing the IOL allows re-selecting the same option to refill defaults.
    if (after.model) {
      await tab.playwright.getByRole('combobox', {name:'Select IOL',exact:true}).first().locator('..').getByRole('button',{name:'Clear',exact:true}).click();
      await state();
      await sleep(500);
    }
  }
  async function chooseMaker(manufacturer) {
    if ((await read()).manufacturer === manufacturer) return;
    await tab.playwright.getByRole('combobox',{name:'Manufacturer',exact:true}).first().click();
    await tab.playwright.getByRole('option',{name:manufacturer,exact:true}).waitFor({state:'visible',timeout:10000});
    await state(); await sleep(700);
    await tab.playwright.getByRole('option',{name:manufacturer,exact:true}).click();
    const start=Date.now();
    while ((await read()).manufacturer !== manufacturer) {
      if (Date.now()-start > 12000) throw Error('Manufacturer did not commit: '+manufacturer);
      await state(); await sleep(250);
    }
  }
  async function chooseMode(mode) {
    // The native switch name was observed on both normal and toric forms.
    const s = await state();
    const line=s.split('\n').find(x => /switch .*Description: Toric, Value:/.test(x));
    if (!line) throw Error('Toric switch absent');
    const isToric=/Value: 1/.test(line);
    if (isToric !== (mode==='toric')) {
      await tab.click(Number(line.trim().match(/^\d+/)[0]));
      await state(); await sleep(700); await state();
    }
  }
  async function capture(branch, optionIndex) {
    const label=branch.options[optionIndex];
    const duplicateIndex=branch.options.slice(0,optionIndex).filter(x=>x===label).length;
    await chooseMode(branch.mode);
    await chooseMaker(branch.manufacturer);
    await clear();
    // Reveal input first: scrolling to a menu item can close MudBlazor popovers.
    await tab.playwright.getByRole('combobox',{name:'Select IOL',exact:true}).first().click();
    await state();
    await tab.playwright.getByRole('combobox',{name:'Select IOL',exact:true}).first().fill(label);
    await tab.playwright.getByRole('option',{name:label,exact:true}).nth(duplicateIndex).waitFor({state:'visible',timeout:10000});
    await state(); await sleep(1200);
    let committed=false;
    for (let attempt=0;attempt<3;attempt++) {
      try { await tab.playwright.getByRole('option',{name:label,exact:true}).nth(duplicateIndex).click(); }
      catch(error) { await state(); if(attempt===2)throw error; await sleep(500); continue; }
      await state(); await sleep(800);
      const current=await state();
      if (current.includes('combo box (collapsed, settable) Select IOL, Value: '+label)) { committed=true; break; }
    }
    if(!committed)throw Error('Lens did not commit: '+label);
    const first=await read(); await sleep(350); const second=await read();
    if(first.model!==label || first.manufacturer!==branch.manufacturer || JSON.stringify(first)!==JSON.stringify(second)) throw Error('Unstable or wrong lens result');
    const record={manufacturer:branch.manufacturer,mode:branch.mode,optionIndex,label,values:second.parameters.map(x=>x.rawValue),capturedAt:new Date().toISOString(),verifiedAfterClear:true};
    rows.push(record); return record;
  }
  return {rows,read,clear,chooseMaker,chooseMode,capture};
}
