// Run via playwright-cli --filename on an independent, approved research page.
// All changes use normal visible controls. Never fills a patient or calculates.
async page => {
  const tasks=__TASKS__;
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
      await page.reload({waitUntil:"domcontentloaded"});
      await page.getByRole("button",{name:"Reset",exact:true}).waitFor({state:"visible",timeout:20000});
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
      if((await read()).manufacturer!==task.manufacturer)throw Error('Manufacturer did not commit');await sleep(650);
      const model=page.getByRole('combobox',{name:'Select IOL',exact:true}).first();
      await model.click();await model.fill(task.label);
      const choice=page.getByRole('option',{name:task.label,exact:true}).nth(task.duplicateIndex);await choice.waitFor({state:'visible'});
      await sleep(1250);await choice.click();await choice.waitFor({state:'hidden',timeout:8000});await sleep(2500);
      let observation,previous='';
      for(let n=0;n<30;n++){
        observation=await read();const signature=JSON.stringify(observation);
        if(observation.model===task.label&&observation.manufacturer===task.manufacturer&&observation.committed&&signature===previous)break;
        previous=signature;await sleep(200);
      }
      if(observation.model!==task.label||observation.manufacturer!==task.manufacturer||!observation.committed)throw Error('Lens choice did not commit');
      if(observation.parameters.length!==7)throw Error('Seven formula controls absent');
      if(task.proofName)await page.screenshot({path:'output/playwright/'+task.proofName,fullPage:true});
      result.push({manufacturer:task.manufacturer,mode:'non-toric',optionIndex:task.optionIndex,label:task.label,values:observation.parameters.map(p=>p.rawValue),capturedAt:new Date().toISOString(),verifiedAfterClear:true,captureMethod:'fresh-reload-native-reset-blank-verification'});
    }
    return {ok:true,rows:result};
  }catch(error){return {ok:false,error:error.message,rows:result,next:tasks[result.length]};}
}
