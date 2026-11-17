// Approved, isolated research browser only. Uses visible controls and read-only DOM.
// Reset is checked for all seven nulls before every selection to prevent carry-over.
async page => {
  const tasks=__TASKS__;
  const labels=['Barrett A-Constant','Cooke A-Constant','EVO A-Constant','Hill-RBF A-Constant','Hoffer® pACD','Kane A-Constant','Pearl DGS A-Constant'];
  const od=page.locator('.mud-grid.mud-grid-spacing-xs-6.noprint > .mud-grid-item').first();
  const read=()=>page.evaluate(()=>{
    const col=document.querySelector('.mud-grid.mud-grid-spacing-xs-6.noprint > .mud-grid-item');
    const maker=col.querySelector('[role=combobox][aria-label=Manufacturer]');
    const model=col.querySelector('input[aria-autocomplete=list]');
    return {manufacturer:maker.value||maker.textContent.trim(),model:model.value,disabled:model.disabled,
      committed:!!model.closest('.mud-input-control').querySelector('button[aria-label=Clear]'),
      parameters:[...col.querySelectorAll('.mud-input-control')].filter(x=>/A-Constant|pACD/.test(x.textContent)).map(x=>({label:x.querySelector('label')?.textContent.trim(),rawValue:x.querySelector('input')?.value||null}))};
  });
  const sleep=ms=>page.waitForTimeout(ms);
  const result=[];
  try{
    for(const task of tasks){
      await page.getByRole('button',{name:'Reset',exact:true}).click();await sleep(650);
      let cleared;
      for(let n=0;n<25;n++){
        cleared=await read();if(!cleared.manufacturer&&!cleared.model&&cleared.disabled&&cleared.parameters.length===7&&cleared.parameters.every(p=>p.rawValue===null))break;
        await sleep(120);
      }
      if(cleared.manufacturer||cleared.model||!cleared.disabled||cleared.parameters.length!==7||cleared.parameters.some(p=>p.rawValue!==null))throw Error('Native Reset did not clear all seven values');
      await page.getByRole('combobox',{name:'Manufacturer',exact:true}).first().click();
      const maker=page.getByRole('option',{name:task.manufacturer,exact:true});await maker.waitFor({state:'visible'});await maker.click();
      for(let n=0;n<25;n++){const s=await read();if(s.manufacturer===task.manufacturer&&!s.disabled)break;await sleep(120);}
      if((await read()).manufacturer!==task.manufacturer)throw Error('Manufacturer did not commit');
      await page.getByRole('switch',{name:'Toric',exact:true}).first().check();
      await od.getByRole('spinbutton',{name:'Cooke A-Constant',exact:true}).waitFor({state:'hidden',timeout:8000});
      await sleep(650);
      const model=page.getByRole('combobox',{name:'Select IOL',exact:true}).first();
      await model.click();await model.fill(task.label);
      const choice=page.getByRole('option',{name:task.label,exact:true}).nth(task.duplicateIndex);await choice.waitFor({state:'visible'});
      await sleep(1250);await choice.click();await choice.waitFor({state:'hidden',timeout:8000});await sleep(700);
      let selected,previous='';
      for(let n=0;n<30;n++){
        selected=await read();const signature=JSON.stringify(selected);
        if(selected.model===task.label&&selected.manufacturer===task.manufacturer&&selected.committed&&signature===previous)break;
        previous=signature;await sleep(200);
      }
      if(selected.model!==task.label||selected.manufacturer!==task.manufacturer||!selected.committed)throw Error('Toric lens choice did not commit');
      if(selected.parameters.length!==5)throw Error('Expected five Toric formula controls');
      // ESCRS hides Cooke/Hill in Toric mode, but fills them on selection.
      // Reveal them using the normal switch; prior Reset proved all seven null.
      await page.getByRole('switch',{name:'Toric',exact:true}).first().uncheck();
      await od.getByRole('spinbutton',{name:'Cooke A-Constant',exact:true}).waitFor({state:'visible',timeout:8000});
      await sleep(650);
      const observed=await read();await sleep(250);const stable=await read();
      if(observed.parameters.length!==7||observed.manufacturer!==task.manufacturer||JSON.stringify(observed)!==JSON.stringify(stable))throw Error('Unstable seven-formula reveal');
      if(selected.parameters.some(p=>observed.parameters.find(q=>q.label===p.label)?.rawValue!==p.rawValue))throw Error('Toric values changed during normal-mode reveal');
      result.push({manufacturer:task.manufacturer,mode:'toric',optionIndex:task.optionIndex,label:task.label,
        values:labels.map(label=>observed.parameters.find(p=>p.label===label)?.rawValue??null),
        capturedAt:new Date().toISOString(),verifiedAfterClear:true,exposed:[true,true,true,true,true,true,true],
        captureMethod:'native-reset-playwright-ui',selectionContext:'toric',revealedInMode:'non-toric',sourceSelectionVerified:true});
    }
    return {ok:true,rows:result};
  }catch(error){return {ok:false,error:error.message,rows:result,next:tasks[result.length]};}
}
