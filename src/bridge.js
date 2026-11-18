// Self-contained: Chrome serializes this function into an isolated content-script world.
export function siteBridge(action, profile, data, options = {}) {
  const requestedEye=options.eye || data.activeEye;
  const result={siteId:profile.id,url:location.href,rows:[],warnings:[],eye:requestedEye,eyeMode:profile.eyeMode || 'single',capabilities:{both:profile.eyeMode==='both'}};
  if(action==='apply' && options.expectedFrameUrl && options.expectedFrameUrl!==location.href)return {...result,error:'表單頁面已變更，請重新預覽。'};
  const allowedHost=new URL(profile.url).hostname;
  if(location.hostname!==allowedHost && !(profile.allowedHosts||[]).includes(location.hostname))return {...result,error:'頁面網址已變更，請重新預覽。'};
  const expectedPath=decodeURIComponent(profile.path || new URL(profile.url).pathname).toLowerCase();
  const actualPath=decodeURIComponent(location.pathname).toLowerCase();
  if(expectedPath!=='/' && !(actualPath===expectedPath || (expectedPath.endsWith('/') && actualPath.startsWith(expectedPath))))return {...result,error:'網站計算模式已變更，請重新選取頁面並預覽。'};
  if(!['OD','OS','OU'].includes(requestedEye))return {...result,error:'請選擇 OD、OS 或雙眼。'};
  if(action!=='inspect' && requestedEye==='OU' && profile.eyeMode!=='both')return {...result,error:'此網站一次只支援單眼，請選擇 OD 或 OS。'};
  const selectedEyes=requestedEye==='OU'?['OD','OS']:[requestedEye];
  const shown=el=>!!el && el.type!=='hidden' && !el.hidden && el.getClientRects().length>0 && !['hidden','collapse'].includes(getComputedStyle(el).visibility);
  const visible=el=>shown(el) && !el.disabled && !el.readOnly && el.getAttribute('aria-disabled')!=='true' && el.getAttribute('aria-readonly')!=='true';
  // Only an explicit profile readOnlyValue opt-in reaches this predicate.
  // A site-derived disabled value is readable, but never becomes writable.
  const readable=el=>shown(el);
  const normalize=value=>String(value || '').replace(/\s+/g,' ').trim().toLowerCase();
  const normalizeLabel=value=>normalize(value).replace(/\s*[*＊]+\s*$/u,'').trim();
  const hasValue=value=>value!=null && value!=='';
  const emptyTargetValue=(field,value)=>value==null||value===''||(field.emptyValues||[]).some(empty=>String(empty)===String(value));
  const isConstant=key=>['aConstant','lensFactor','exchangeAConstant','exchangeLensFactor'].includes(key);
  const unitFor=field=>field.requiresUnitOption?options[field.requiresUnitOption]:undefined;
  const unitKnown=field=>!field.requiresUnitOption||['um','mm'].includes(unitFor(field));
  const equalValues=(left,right)=>String(left)===String(right) || (String(left).trim()!=='' && String(right).trim()!=='' && Number.isFinite(Number(left)) && Number.isFinite(Number(right)) && Number(left)===Number(right));
  function labelText(node){
    if(!node || node.matches?.('input,select,textarea,[contenteditable="true"],[role="textbox"]'))return '';
    const copy=node.cloneNode(true);
    for(const control of copy.querySelectorAll('input,select,textarea,[contenteditable="true"],[role="textbox"]'))control.remove();
    return copy.textContent || '';
  }
  function queryChoices(selector,inspection=false){try{return [...document.querySelectorAll(selector)].filter(inspection?shown:visible);}catch{return [];}}
  function find(field,inspection=false,allowReadOnly=false){
    let scopes;
    try{scopes=field.scopeSelector?[...document.querySelectorAll(field.scopeSelector)]:[document];}catch{return {error:'missing'};}
    if(scopes.length!==1)return {error:scopes.length?'ambiguous':'missing'};
    const scope=scopes[0],predicate=inspection?shown:allowReadOnly?readable:visible;
    for(const selector of field.selectors || []){
      let nodes;try{nodes=[...scope.querySelectorAll(selector)].filter(predicate);}catch{nodes=[];}
      if(nodes.length===1)return {node:nodes[0],locator:selector};
      if(nodes.length>1)return {error:'ambiguous'};
    }
    const labels=new Set((field.labels || (field.label?[field.label]:[])).map(normalizeLabel));
    if(!labels.size)return {};
    const matches=new Set();
    for(const label of scope.querySelectorAll('label'))if(labels.has(normalizeLabel(labelText(label)))){
      const el=label.control || label.querySelector('input,select,textarea');
      if(predicate(el) && scope.contains(el))matches.add(el);
    }
    for(const el of scope.querySelectorAll('input,select,textarea'))if(predicate(el) && labels.has(normalizeLabel(el.getAttribute('aria-label'))))matches.add(el);
    const nodes=[...matches];
    if(field.labelIndex!=null){
      if(nodes.length!==(field.expectedLabelCount||2))return {error:nodes.length?'ambiguous':'missing'};
      return {node:nodes[field.labelIndex],locator:`label:${[...labels][0]}:${field.labelIndex}`};
    }
    if(nodes.length===1)return {node:nodes[0],locator:`label:${[...labels][0]}`};
    return nodes.length>1?{error:'ambiguous'}:{};
  }
  if(profile.prerequisite){
    const definition=profile.prerequisite,nodes=[...new Set((definition.selectors||[]).flatMap(selector=>queryChoices(selector,true)))];
    const required=nodes.length===1&&(definition.messages||[]).every(message=>normalize(nodes[0].textContent).includes(normalize(message)));
    result.prerequisite={status:required?'required':'ready',entrySiteId:definition.entrySiteId,message:required?'請先完成球面 IOL 計算、選擇 IOL Power，再進入 Toric。':''};
    if(required&&action!=='inspect')return {...result,error:result.prerequisite.message};
  }
  if(profile.eyeMode==='single'){
    const choices=Object.fromEntries(['OD','OS'].map(eye=>[eye,[...new Set((profile.eyeSelectors?.[eye]||[]).flatMap(selector=>queryChoices(selector,true)))]]));
    const unique=choices.OD.length===1&&choices.OS.length===1&&choices.OD[0]!==choices.OS[0];
    const unambiguous=Object.values(choices).every(nodes=>nodes.length<=1)&&!(choices.OD[0]&&choices.OD[0]===choices.OS[0]);
    const checked=unambiguous?['OD','OS'].filter(eye=>choices[eye][0]?.checked||choices[eye][0]?.getAttribute('aria-checked')==='true'):[];
    let selectedEye=checked.length===1?checked[0]:'';
    const radios=unique&&['OD','OS'].every(eye=>choices[eye][0].type==='radio')&&choices.OD[0].name&&choices.OD[0].name===choices.OS[0].name&&choices.OD[0].form===choices.OS[0].form;
    result.detectedEye=selectedEye;
    result.canSelectEye=!!radios&&['OD','OS'].every(eye=>visible(choices[eye][0]))&&checked.length<=1;
    if(profile.eyeSwitch){
      const candidates=[...new Set((profile.eyeSwitch.selectors||[]).flatMap(selector=>queryChoices(selector,true)))];
      const toggle=candidates.length===1?candidates[0]:null;
      const known=toggle?.type==='checkbox'&&!toggle.indeterminate&&['OD','OS'].includes(profile.eyeSwitch.checkedEye)&&['OD','OS'].includes(profile.eyeSwitch.uncheckedEye)&&profile.eyeSwitch.checkedEye!==profile.eyeSwitch.uncheckedEye;
      selectedEye=known?(toggle.checked?profile.eyeSwitch.checkedEye:profile.eyeSwitch.uncheckedEye):'';
      result.canSelectEye=!!known&&visible(toggle);result.detectedEye=selectedEye;
      if(action==='select-eye'&&selectedEye!==requestedEye){
        if(!result.canSelectEye)return {...result,error:'無法唯一辨識可切換的 OD／OS 元件，請先在原網站選擇眼別。'};
        toggle.click();return {...result,autoEyeSelected:true,navigationExpected:!!profile.eyeSelectPostback};
      }
    }else if(profile.eyeIndicators){
      const candidates=['OD','OS'].map(eye=>{const indicator=profile.eyeIndicators[eye];return {eye,indicator,nodes:indicator?queryChoices(indicator.selector,true):[]};});
      const matches=candidates.filter(({indicator,nodes})=>nodes.length===1&&normalize(nodes[0].textContent)===normalize(indicator.text));
      selectedEye=candidates.every(({nodes})=>nodes.length<=1)&&matches.length===1?matches[0].eye:'';result.detectedEye=selectedEye;result.canSelectEye=false;
    }
    result.eyeSelectionState=checked.length>1?'ambiguous':selectedEye?'selected':result.canSelectEye?'unselected':'unavailable';
    if(action==='select-eye'){
      if(selectedEye===requestedEye)return {...result,autoEyeSelected:false};
      if(!result.canSelectEye)return {...result,error:'無法唯一辨識可切換的 OD／OS 元件，請先在原網站選擇眼別。'};
      choices[requestedEye][0].click();
      return {...result,autoEyeSelected:true,navigationExpected:!!profile.eyeSelectPostback};
    }
    if(!['inspect','apply-display'].includes(action)){
      if(selectedEye && selectedEye!==requestedEye)return {...result,error:`網站目前為 ${selectedEye}，面板選取 ${requestedEye}。請在網站切換眼別後重試。`};
      if(!selectedEye && !options.eyeConfirmed)return {...result,error:'無法確認網站眼別。請先在網站核對眼別，再勾選「已核對網站眼別」。'};
    }
  }
  // Output conventions are UI preferences, never measurement fields. A
  // convention change must not transpose stored refraction or axis values.
  function nativeRadioChoices(definition,keys){
    const state={status:'manual',available:false,value:'',control:'radio'};
    const choices=Object.fromEntries(keys.map(key=>[key,queryChoices(definition.choices?.[key],true)]));
    if(!keys.every(key=>choices[key].length===1)||new Set(keys.map(key=>choices[key][0])).size!==keys.length)return {state};
    const nodes=Object.fromEntries(keys.map(key=>[key,choices[key][0]])),pair=Object.values(nodes);
    if(!pair.every(node=>node.type==='radio')||!pair[0].name||pair.some(node=>node.name!==pair[0].name||node.form!==pair[0].form))return {state};
    if(keys.some(key=>definition.values?.[key]!=null&&String(nodes[key].value)!==String(definition.values[key])))return {state};
    if(keys.some(key=>definition.labels?.[key]&&!definition.labels[key].map(normalize).includes(normalize([...(nodes[key].labels||[])].map(labelText).join(' ')))))return {state};
    const group=[...document.querySelectorAll('input[type="radio"]')].filter(node=>shown(node)&&node.name===pair[0].name&&node.form===pair[0].form);
    if(group.length!==keys.length||group.some(node=>!pair.includes(node)))return {state};
    const checked=keys.filter(key=>nodes[key].checked);
    if(checked.length>1)return {state};
    state.value=checked[0]||'';state.available=pair.every(visible);state.status=state.available?'ready':'manual';
    return {state,nodes,definition};
  }
  function displaySideEffects(display,definition){
    if(!definition.requireNoResultsSelector)return display;
    try{
      const containers=definition.requireUniqueResultsContainer?[...document.querySelectorAll(definition.requireUniqueResultsContainer)]:[];
      if(containers.length!==1){display.state.available=false;display.state.status='manual';display.state.reason='無法確認原站結果狀態，請在原站確認柱鏡顯示。';}
      else if(document.querySelectorAll(definition.requireNoResultsSelector).length){display.state.available=false;display.state.status='manual';display.state.reason='原站切換柱鏡記法會重新計算，請在原站確認。';}
    }catch{display.state.available=false;display.state.status='manual';display.state.reason='無法確認原站結果狀態，請在原站確認柱鏡顯示。';}
    return display;
  }
  function cylinderDisplay(){
    const definition=profile.displayPreferences?.cylinderConvention;
    if(!definition)return {state:{status:'unsupported',available:false,value:''}};
    const state={status:'manual',available:false,value:'',control:definition.control};
    if(definition.control==='radio'){
      return displaySideEffects(nativeRadioChoices(definition,['plus','minus']),definition);
    }
    if(definition.control==='select'){
      const found=find({selectors:definition.selectors||[]},true),node=found.node;
      if(!node||node.tagName!=='SELECT')return {state};
      const values=definition.valueMap;
      if(!values||values.plus==null||values.minus==null||String(values.plus)===String(values.minus))return {state};
      const matched=key=>[...node.options].filter(option=>String(option.value)===String(values[key]));
      if(!['plus','minus'].every(key=>matched(key).length===1))return {state};
      const selected=['plus','minus'].filter(key=>String(node.value)===String(values[key]));
      state.value=selected[0]||'';state.available=visible(node);state.status=state.available?'ready':'manual';
      return displaySideEffects({state,node,definition},definition);
    }
    return {state};
  }
  const kDefinition=profile.inputUnits?.keratometry;
  const kUnits=kDefinition?.control==='radio'?nativeRadioChoices(kDefinition,['D','mm']):{state:{status:kDefinition?'manual':'unsupported',available:false,value:''}};
  result.inputUnits={keratometry:kUnits.state};
  const evidence=profile.numericFormat?.decimalEvidence;
  let decimal='unknown';
  if(evidence){
    try{
      const nodes=[...document.querySelectorAll(evidence.selector)];
      if(nodes.length===1){const text=(nodes[0].textContent||'').trim();if(text===evidence.text)decimal='dot';else if(text===String(evidence.text).replace(/\./g,','))decimal='comma';}
    }catch{/* An unknown numeric format remains manual. */}
  }
  result.numericFormat={decimal,available:decimal==='dot'};
  const numericFormatKnown=field=>!field.requiresDotDecimal||decimal==='dot';
  const keratometryUnitKnown=field=>!field.requiresKeratometryUnit||kUnits.state.value===field.requiresKeratometryUnit;
  if(action==='prepare-input-units'){
    const outcome={requested:'D',value:kUnits.state.value,status:'unsupported',changed:false};result.inputUnitPreparation=outcome;
    if(!kDefinition)return result;
    if(kUnits.state.value==='D'){outcome.status='already-selected';return result;}
    const manual=reason=>{outcome.status='manual';outcome.reason=reason;return result;};
    if((profile.fields||[]).some(field=>(kDefinition.sourceKeys||['k1','k2']).includes(field.key)&&!numericFormatKnown(field)))return manual('原站數字格式不是已核對的小數點格式，原有單位與數值保留。');
    if(!kUnits.state.available||!kUnits.nodes?.D)return manual('無法唯一操作原站角膜曲率單位，請於原站確認。');
    const keys=kDefinition.sourceKeys||['k1','k2'],values=keys.map(key=>data.eyes[requestedEye]?.[key]);
    const numerical=value=>value!=null&&String(value).trim()!==''&&/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(String(value))&&Number.isFinite(Number(value));
    const minimum=kDefinition.min??20,maximum=kDefinition.max??80;
    if(keys.length!==2||!values.every(value=>numerical(value)&&Number(value)>=minimum&&Number(value)<=maximum)||Number(values[0])>Number(values[1]))return manual('須有可填入的成對 K1／K2，才會切換原站至 D；原有單位與數值保留。');
    for(const [index,key]of keys.entries()){
      const fields=(profile.fields||[]).filter(field=>field.key===key&&(!field.eye||field.eye===requestedEye));
      if(fields.length!==1)return manual('無法唯一確認成對 K 欄位，原有單位與數值保留。');
      const found=find(fields[0]),node=found.node,value=String(values[index]);
      if(!node||!['INPUT','TEXTAREA'].includes(node.tagName)||['radio','checkbox','button','submit'].includes(node.type))return manual('成對 K 欄位目前不可填入，原有單位與數值保留。');
      if(node.maxLength>=0&&value.length>node.maxLength)return manual('來源 K 值超過目的欄位長度，原有單位與數值保留。');
      if(node.pattern){try{if(!new RegExp(`^(?:${node.pattern})$`,'v').test(value))return manual('來源 K 值不符合目的欄位格式，原有單位與數值保留。');}catch{return manual('無法確認目的 K 欄位格式，原有單位與數值保留。');}}
    }
    // TECNIS clears both K inputs when changing notation. The guarded caller
    // supplies both replacement values before this one native change event.
    kUnits.nodes.D.click();
    const after=nativeRadioChoices(kDefinition,['D','mm']).state;
    outcome.changed=true;outcome.value=after.value;outcome.status=after.value==='D'?'prepared':'manual';
    result.inputUnits.keratometry=after;
    return result;
  }
  const display=cylinderDisplay();
  result.displayPreferences={cylinderConvention:display.state};
  if(action==='apply-display'){
    const requested=options.cylinderConvention??'minus';
    const outcome={requested,value:display.state.value,status:'unsupported',changed:false};
    result.displayPreference=outcome;
    if(!['minus','plus','preserve'].includes(requested))return {...result,error:'柱鏡顯示偏好必須為 minus、plus 或 preserve。'};
    if(requested==='preserve'){outcome.status='preserved';return result;}
    if(display.state.status==='unsupported')return result;
    if(display.state.value===requested){outcome.status='already-selected';return result;}
    if(!display.state.available){outcome.status='manual';outcome.reason=display.state.reason||'柱鏡顯示控制目前不可唯一操作，請於原站確認。';return result;}
    if(display.nodes)display.nodes[requested].click();
    else{
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(display.node,String(display.definition.valueMap[requested]));
      display.node.dispatchEvent(new Event('input',{bubbles:true}));display.node.dispatchEvent(new Event('change',{bubbles:true}));
    }
    const after=cylinderDisplay().state;
    outcome.changed=true;outcome.value=after.value;outcome.status=after.value===requested?'applied':'manual';
    result.navigationExpected=!!display.definition.navigationExpected;
    if(outcome.status==='manual')outcome.reason='原站未確認柱鏡顯示偏好，請於原站確認。';
    return result;
  }
  function outputEye(field){return field.eye || (requestedEye==='OU'?(field.key.startsWith('patient.')?'patient':'shared'):requestedEye);}
  function sourceValue(field){
    if(field.key.startsWith('patient.')){
      const key=field.key.slice(8),value=data.patient?.[key];
      if(hasValue(value)||options.identityFallbacks===false||!(profile.requiredIdentity||[]).includes(field.key))return value;
      const aliases={initials:['patientId','name'],patientId:['name','initials'],name:['patientId','initials'],surgeonName:['surgeonId'],surgeonId:['surgeonName']};
      return (aliases[key]||[]).map(alias=>data.patient?.[alias]).find(hasValue);
    }
    if(field.eye)return data.eyes[field.eye]?.[field.key];
    if(requestedEye!=='OU')return data.eyes[requestedEye]?.[field.key];
    return ['OD','OS'].map(eye=>data.eyes[eye]?.[field.key]).find(hasValue);
  }
  function modeSource(field){
    const values=data.eyes?.[field.eye||requestedEye]||{};
    let value=sourceValue(field);
    if(field.sourceTransform==='argos'){
      if(['yes','no'].includes(normalize(value)))return normalize(value);
      if(hasValue(values.biometer))return ['argos','argos (sos-al)'].includes(normalize(values.biometer))?'yes':'no';
      return undefined;
    }
    if(field.sourceTransform==='lvc-enabled')return !hasValue(value)||normalize(value)==='keratoconus'?undefined:normalize(value)==='none'?'no':'yes';
    if(field.sourceTransform==='boolean')return typeof value==='boolean'?value? 'yes':'no':field.key==='keratoconus'&&normalize(values.lvcType)==='keratoconus'?'yes':undefined;
    if(field.sourceTransform==='cooke-biometer')return !hasValue(value)?undefined:['argos','argos (sos-al)'].includes(normalize(value))?'Argos':normalize(value)==='lenstar'?'Lenstar':'Other';
    if(field.sourceTransform==='solver-biometer')return !hasValue(value)?undefined:['argos','argos (sos-al)'].includes(normalize(value))?'Argos (SOS-AL)':normalize(value)==='us (immersion)'?'US (immersion)':normalize(value)==='us (applanation)'?'US (applanation)':'Other';
    return field.valueMap&&Object.hasOwn(field.valueMap,String(value))?Object.keys(field.valueMap).find(key=>String(field.valueMap[key])===String(field.valueMap[String(value)])):value;
  }
  function modeState(field,index){
    const eye=field.eye||(requestedEye==='OU'?'shared':requestedEye),requested=modeSource(field);
    const state={index,key:field.key,eye,label:field.label||field.key,requested:requested??'',value:'',available:false,status:'missing'};
    if(['argos','cooke-biometer','solver-biometer'].includes(field.sourceTransform)){
      const eyes=field.eye?[field.eye]:selectedEyes;
      const contradictory=eyes.some(eye=>{const values=data.eyes?.[eye]||{},argos=normalize(values.argos);return ['yes','no'].includes(argos)&&hasValue(values.biometer)&&(argos==='yes')!==['argos','argos (sos-al)'].includes(normalize(values.biometer));});
      if(contradictory)return {state:{...state,status:'manual',reason:'ARGOS 選項與測量儀器資料矛盾，請先核對；已保留原站儀器。'}};
    }
    if(field.sourceTransform==='lvc-enabled'&&requested==='yes')state.manualReason='Post-LVC 開關不區分近視、遠視或 RK；請在原網站確認子類型。';
    if(!field.eye&&requestedEye==='OU'){
      const values=['OD','OS'].map(eye=>modeSource({...field,eye}));
      if(values.every(hasValue)&&String(values[0])!==String(values[1]))return {state:{...state,status:'manual',reason:'OD／OS 的共用模式或儀器不同，請改用單眼貼上。'}};
    }
    if(field.control==='vuetify-select'){
      const roots=queryChoices(field.rootSelector,true).filter(root=>[...root.querySelectorAll('label')].some(label=>normalizeLabel(labelText(label))===normalizeLabel(field.label)));
      if(roots.length!==1)return {state:{...state,status:roots.length?'ambiguous':'missing'}};
      const root=roots[0],activators=[...root.querySelectorAll(field.activatorSelector)].filter(shown),selections=[...root.querySelectorAll(field.selectionSelector)].filter(shown);
      if(activators.length!==1||selections.length>1)return {state:{...state,status:'ambiguous'}};
      const target=activators[0],owned=target.getAttribute('aria-owns'),lists=[...document.querySelectorAll('[role="listbox"]')].filter(list=>list.id===owned&&shown(list));
      state.value=(selections[0]?.textContent||'').trim();state.available=visible(target)&&root.getAttribute('aria-disabled')!=='true'&&root.getAttribute('aria-readonly')!=='true'&&!root.classList.contains('v-input--is-disabled')&&!root.classList.contains('v-input--is-readonly')&&!root.querySelector('input:disabled,input[aria-readonly="true"],input[aria-disabled="true"]');state.status=state.available?'ready':'manual';state.menuOpen=lists.length===1;
      if(lists.length>1)return {state:{...state,status:'ambiguous',available:false}};
      const choices=lists.length===1?[...lists[0].querySelectorAll('[role="option"]')].filter(option=>shown(option)&&normalize(option.textContent)===normalize(requested)):[];
      if(state.menuOpen&&hasValue(requested)&&choices.length!==1){state.status=choices.length?'ambiguous':'option-missing';state.available=false;}
      const choice=choices[0];
      if(choice&&(choice.getAttribute('aria-disabled')==='true'||choice.classList.contains('v-list-item--disabled'))){state.status='manual';state.available=false;}
      return {state,nodes:[target],target,choice};
    }
    if(field.control==='radio'){
      const choices=Object.entries(field.choices||{}).map(([value,selector])=>({value,selector,nodes:queryChoices(selector,true)}));
      if(!choices.length||choices.some(choice=>choice.nodes.length!==1)||new Set(choices.map(choice=>choice.nodes[0])).size!==choices.length)return {state};
      const nodes=choices.map(choice=>choice.nodes[0]);
      if(nodes.some(node=>node.type!=='radio'||!node.name||node.name!==nodes[0].name||node.form!==nodes[0].form))return {state};
      const group=[...document.querySelectorAll('input[type="radio"]')].filter(node=>shown(node)&&node.name===nodes[0].name&&node.form===nodes[0].form);
      if(group.length!==nodes.length||group.some(node=>!nodes.includes(node)))return {state};
      const checked=choices.filter(choice=>choice.nodes[0].checked);
      if(checked.length>1)return {state:{...state,status:'ambiguous'}};
      state.value=checked[0]?.value||'';state.available=nodes.every(visible);state.status=state.available?'ready':'manual';
      if(hasValue(requested)&&!Object.hasOwn(field.choices,String(requested)))state.status='option-missing';
      return {state,nodes,target:choices.find(choice=>choice.value===String(requested))?.nodes[0]};
    }
    const found=find(field,true),node=found.node;
    if(!node)return {state:{...state,status:found.error||'missing'}};
    if(field.control==='checkbox'){
      if(node.type!=='checkbox'||node.indeterminate)return {state:{...state,status:'manual'}};
      state.value=node.checked?'yes':'no';state.available=visible(node);state.status=state.available?'ready':'manual';
    }else if(field.control==='select'){
      if(node.tagName!=='SELECT')return {state:{...state,status:'manual'}};
      state.value=Object.entries(field.valueMap||{}).find(([,value])=>String(value)===node.value)?.[0]??node.value;
      state.available=visible(node);state.status=state.available?'ready':'manual';
      const mapped=String(field.valueMap?.[String(requested)]??requested);
      if(hasValue(requested)&&![...node.options].some(option=>String(option.value)===mapped))state.status='option-missing';
    }
    return {state,node,nodes:[node],target:node};
  }
  const modes=(profile.modeControls||[]).map((field,index)=>({field,...modeState(field,index)})).filter(mode=>!mode.field.eye||selectedEyes.includes(mode.field.eye));
  result.modeControls=modes.map(mode=>mode.state);
  if(action==='prepare-modes'){
    const mode=modes.find(item=>item.state.index===options.modeIndex),outcome=mode?{...mode.state,changed:false}:{status:'unsupported',changed:false};result.modePreparation=outcome;
    if(!mode||!hasValue(mode.state.requested))return result;
    if(mode.state.status!=='ready'||!mode.state.available){outcome.reason=mode.state.reason||'原站模式元件未能唯一確認；已保留原站設定。';return result;}
    if(String(mode.state.value)===String(mode.state.requested)){outcome.status='already-selected';return result;}
    const {field,target}=mode;
    if(field.control==='vuetify-select'){
      if(mode.state.menuOpen){mode.choice.click();outcome.phase='selected';}
      else {target.click();outcome.phase='opened';}
      outcome.changed=true;outcome.status='applied';return result;
    }
    if(field.control==='select'){
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(target,String(field.valueMap?.[String(mode.state.requested)]??mode.state.requested));
      target.dispatchEvent(new Event('input',{bubbles:true}));target.dispatchEvent(new Event('change',{bubbles:true}));
    }else target.click();
    outcome.changed=true;outcome.status='applied';outcome.navigationExpected=!!field.navigationExpected;
    result.navigationExpected=!!field.navigationExpected;
    return result;
  }
  if(action==='read')for(const {field,state} of modes)if(state.available&&state.status==='ready'){
    let value=state.value;
    if(field.sourceTransform==='boolean')value=state.value==='yes';
    if(field.sourceTransform==='lvc-enabled'){
      value=state.value==='yes'?'unknown':'none';
      if(value==='unknown' && field.readSelection){
        const choices=queryChoices(`${field.scopeSelector} ${field.readSelection}`,true);
        const subtype=choices.length===1 ? normalize(choices[0].textContent) : '';
        if(Object.hasOwn(field.readValues,subtype))value=field.readValues[subtype];
      }
    }
    result.rows.push({key:field.key,eye:state.eye,value,previous:state.value,status:'read',label:field.label||field.key,modeControl:true});
  }
  if(['preview','apply'].includes(action))for(const {field,state} of modes)if(hasValue(state.requested)){
    result.rows.push({key:field.key,eye:state.eye,value:String(sourceValue(field)??state.requested),previous:state.value,mappedValue:String(state.requested),locator:`mode:${state.index}`,modeIndex:state.index,modeControl:true,label:field.label||field.key,status:state.status==='ready'?(String(state.value)===String(state.requested)?'ready':'mode-required'):state.status});
  }
  if(action==='inspect'){
    const declared=new Set([...(profile.required||[]),...(profile.requiredIdentity||[])]);
    const used=new Map(),knownNodes=new Set();
    result.fields=modes.map(({field,state,nodes=[]})=>{for(const node of nodes)knownNodes.add(node);return {key:field.key,eye:field.eye||'current',label:field.label||field.key,unit:'',mode:'',visible:state.status!=='missing',available:state.available,required:false,declaredRequired:false,domRequired:false,status:state.status,modeControl:true};});
    for(const field of profile.fields || []){
      const patient=field.key.startsWith('patient.');
      const meta={key:field.key,eye:patient?'patient':field.eye || (profile.eyeMode==='both'?'shared':'current'),label:field.label || field.labels?.[0] || field.key,unit:field.unit || '',mode:field.mode || '',visible:false,available:false,required:false,declaredRequired:declared.has(field.key),domRequired:false,status:'missing'};
      if(field.requiresUnitOption)meta.unit=unitKnown(field)?unitFor(field)==='mm'?'mm':'µm':'需設定目標單位';
      if(field.control==='exclusive-checkboxes'){
        const groups=Object.values(field.choices||{}).map(selector=>queryChoices(selector,true));
        meta.visible=groups.length>0 && groups.every(nodes=>nodes.length===1);
        meta.available=meta.visible && groups.every(nodes=>visible(nodes[0]) && nodes[0].type==='checkbox');
        meta.domRequired=meta.visible && groups.some(nodes=>nodes[0].required || nodes[0].getAttribute('aria-required')==='true');
        meta.status=meta.available?'ready':meta.visible?'manual':'missing';
        for(const nodes of groups)for(const node of nodes)knownNodes.add(node);
      }else{
        const found=find(field,true),el=found.node;
        meta.visible=!!el;
        meta.domRequired=!!el && (el.required || el.getAttribute('aria-required')==='true');
        meta.available=!!el && visible(el) && !['radio','checkbox','button','submit'].includes(el.type);
        meta.status=found.error || (meta.available?'ready':el?'manual':'missing');
        if(field.readOnlyValue===true){meta.readable=!!el;meta.available=false;meta.readOnlyValue=true;meta.status=found.error||(el?'read-only':'missing');}
        if(el){
          knownNodes.add(el);
          if(used.has(el)){used.get(el).status='ambiguous';used.get(el).available=false;meta.status='ambiguous';meta.available=false;}
          used.set(el,meta);
        }
      }
      if(!unitKnown(field)&&meta.visible){meta.available=false;meta.status='manual';meta.reason='請先設定此網站 CCT 的輸入單位。';}
      if(!keratometryUnitKnown(field)&&meta.visible){meta.available=false;meta.status='unit-required';meta.reason='原站 K 目前不是 D，未將半徑當成角膜屈光度。';meta.canonicalUnit=field.unit;meta.unit=kUnits.state.value||'需確認 K 單位';}
      if(!numericFormatKnown(field)&&meta.visible){meta.available=false;meta.readable=false;meta.status='format-required';meta.reason='原站不是已核對的小數點格式，請在原站確認數字格式。';}
      meta.required=meta.visible && (meta.declaredRequired || meta.domRequired);
      result.fields.push(meta);
    }
    result.unmappedRequired=[];
    const seen=new Set();
    for(const el of document.querySelectorAll('input,select,textarea,[role="combobox"][aria-required="true"]')){
      const readOnlyCombobox=shown(el) && el.getAttribute('role')==='combobox' && (el.readOnly || el.getAttribute('aria-readonly')==='true');
      // Custom selects often use a required read-only display input.
      // Surface a manual hint, but never attempt to write their display input.
      if(knownNodes.has(el) || (!visible(el) && !readOnlyCombobox) || el.disabled || el.getAttribute('aria-disabled')==='true' || !(el.required || el.getAttribute('aria-required')==='true'))continue;
      const referenced=(el.getAttribute('aria-labelledby')||'').split(/\s+/).filter(Boolean).map(id=>labelText(document.getElementById(id))).join(' ');
      const associated=el.labels?.length?[...el.labels].map(labelText).join(' '):'';
      const label=(el.getAttribute('aria-label') || associated || referenced || '網站其他必填項目').replace(/\s+/g,' ').trim().slice(0,120);
      const type=el.getAttribute('role') || el.type || el.tagName.toLowerCase();
      const identity=`${label}:${type}`;
      if(seen.has(identity))continue;
      seen.add(identity);result.unmappedRequired.push({label,type,reason:'此項需在原網站手動完成'});
      if(result.unmappedRequired.length>=30)break;
    }
    return result;
  }
  // A bilateral page may expose only one IOL-constant/K-index input. Never
  // choose an eye silently when the two stored measurements disagree.
  if(requestedEye==='OU' && action!=='read')for(const field of profile.fields || []){
    if(field.readOnlyValue===true)continue;
    if(field.eye || field.key.startsWith('patient.'))continue;
    if(isConstant(field.key)&&!options.includeConstants)continue;
    const left=data.eyes.OD?.[field.key],right=data.eyes.OS?.[field.key];
    if(hasValue(left) && hasValue(right) && !equalValues(left,right))return {...result,rows:[],error:`此網站共用 ${field.label || field.key} 欄位，但 OD／OS 數值不同。請改為單眼貼上，或先核對共用值。`};
  }
  const used=new Map(),targets=new Map(),rowFields=new Map();
  for(const field of profile.fields || []){
    if(field.eye && !selectedEyes.includes(field.eye))continue;
    if(action!=='read'&&field.readOnlyValue===true)continue;
    if(['patient.initials','patient.name','patient.patientId','patient.surgeonName','patient.surgeonId'].includes(field.key) && !options.includeIdentifiers && !(action!=='read'&&options.identityFallbacks!==false&&(profile.requiredIdentity||[]).includes(field.key)))continue;
    if(action!=='read'&&isConstant(field.key)&&!options.includeConstants)continue;
    if(action!=='read' && field.mode==='toric' && !(field.eye?data.eyes[field.eye]?.toric:selectedEyes.some(eye=>data.eyes[eye]?.toric)))continue;
    let value=sourceValue(field);const eye=outputEye(field);
    if(!numericFormatKnown(field)){
      result.rows.push({key:field.key,eye,value:action==='read'?'':String(value??''),previous:'',status:'format-required',label:field.label||field.key});
      const warning='原站數字格式不是已核對的小數點格式，未讀寫受影響的數值；請在原站確認格式。';if(!result.warnings.includes(warning))result.warnings.push(warning);continue;
    }
    if(!keratometryUnitKnown(field)){
      result.rows.push({key:field.key,eye,value:action==='read'?'':String(value??''),previous:'',status:'unit-required',label:field.label||field.key});
      const warning='原站 K 單位未確認為 D，未讀寫這些 K 值；其他已對應欄位仍可使用。';if(!result.warnings.includes(warning))result.warnings.push(warning);continue;
    }
    if(!unitKnown(field)){result.rows.push({key:field.key,eye,value:action==='read'?'':String(value??''),previous:'',status:'unit-required',label:field.label||field.key});continue;}
    const defaultIndex=action!=='read'&&field.key==='kIndex'&&!hasValue(value);
    if(defaultIndex)value='1.3375';
    if(action!=='read' && (!hasValue(value) || typeof value==='boolean'))continue;
    if(field.control==='exclusive-checkboxes'){
      const groups=Object.entries(field.choices).map(([choice,selector])=>({choice,selector,nodes:queryChoices(selector)}));
      const selected=groups.filter(g=>g.nodes[0]?.checked);
      const row={key:field.key,eye,value:action==='read'?(selected[0]?.choice||''):String(value),previous:selected[0]?.choice||'',mappedValue:String(value??''),control:field.control,locator:JSON.stringify(field.choices),status:'ready'};
      if(groups.some(g=>g.nodes.length!==1 || g.nodes[0].type!=='checkbox'))row.status='missing';
      else if(selected.length>1 || new Set(groups.map(g=>g.nodes[0])).size!==groups.length)row.status='ambiguous';
      else if(action==='read')row.status='read';
      else if(!Object.hasOwn(field.choices,String(value)))row.status='option-missing';
      targets.set(row,groups);rowFields.set(row,field);result.rows.push(row);continue;
    }
    const found=find(field,false,action==='read'&&field.readOnlyValue===true);
    const row={key:field.key,eye,value:value==null?'':String(value),previous:'',status:found.error || 'missing',label:field.label || field.key};
    if(eye==='shared')row.sourceEyes=['OD','OS'].filter(sourceEye=>hasValue(data.eyes[sourceEye]?.[field.key]));
    const el=found.node;
    if(defaultIndex&&el&&!emptyTargetValue(field,el.value))continue;
    if(el){
      row.previous=el.type==='checkbox' || el.type==='radio'?String(el.checked):String(el.value);
      row.locator=found.locator;row.status=used.has(el)?'ambiguous':'ready';
      if(used.has(el))used.get(el).status='ambiguous';
      used.set(el,row);targets.set(row,el);rowFields.set(row,field);
      let mapped=field.valueMap?.[String(value)] ?? String(value);
      if(field.transform==='absolute')mapped=String(Math.abs(Number(mapped)));
      if(field.requiresUnitOption&&unitFor(field)==='mm'&&mapped!=='')mapped=String(Number(mapped)/1000);
      if(el.tagName==='SELECT'){
        const match=[...el.options].filter(o=>normalize(o.value)===normalize(mapped) || normalize(o.textContent)===normalize(mapped) || (o.value!=='' && Number.isFinite(Number(mapped)) && Number(o.value)===Number(mapped)));
        if(match.length!==1)row.status='option-missing';else mapped=match[0].value;
      }
      if(['radio','checkbox','button','submit'].includes(el.type))row.status='manual';
      if(el.type==='number' && (!Number.isFinite(Number(mapped)) || (el.min!=='' && Number(mapped)<Number(el.min)) || (el.max!=='' && Number(mapped)>Number(el.max))))row.status='out-of-range';
      row.mappedValue=mapped;
      if(action==='read'){
        row.value=el.tagName==='SELECT' && field.valueMap?Object.keys(field.valueMap).find(k=>String(field.valueMap[k])===el.value || normalize(field.valueMap[k])===normalize(el.selectedOptions[0]?.textContent)) ?? el.value:el.value;
        if(emptyTargetValue(field,el.value))row.value='';
        if(el.tagName==='SELECT'&&field.readOptionText&&/^\s*1\.\d+\s*$/.test(el.selectedOptions[0]?.textContent||''))row.value=el.selectedOptions[0].textContent.trim();
        if(field.transform==='absolute' && row.value!=='')row.value=String(Math.abs(Number(row.value)));
        if(field.requiresUnitOption&&unitFor(field)==='mm'&&row.value!=='')row.value=String(Number(row.value)*1000);
        if(row.status!=='ambiguous')row.status='read';
      }
    }
    result.rows.push(row);
  }
  function applyRow(row,refresh=false){
    const expected=options.expected?.find(e=>e.key===row.key && e.eye===row.eye && e.locator===row.locator);
    if(row.modeControl){
      const definition=profile.modeControls?.[row.modeIndex],current=definition&&modeState(definition,row.modeIndex).state;
      row.status=expected&&expected.previous===row.previous&&expected.mappedValue===row.mappedValue&&current?.available&&String(current.value)===row.mappedValue?'filled':'changed';return;
    }
    if(row.control==='exclusive-checkboxes'){
      const groups=targets.get(row),currentSelected=groups.filter(g=>g.nodes[0]?.checked);
      if(!expected || expected.previous!==row.previous || expected.mappedValue!==row.mappedValue || currentSelected.length>1 || (currentSelected[0]?.choice||'')!==row.previous || groups.some(g=>!g.nodes[0].isConnected || queryChoices(g.selector).length!==1 || queryChoices(g.selector)[0]!==g.nodes[0]))row.status='changed';
      else{
        const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'checked').set;
        for(const group of groups)setter.call(group.nodes[0],group.choice===row.mappedValue);
        for(const group of groups){group.nodes[0].dispatchEvent(new Event('input',{bubbles:true}));group.nodes[0].dispatchEvent(new Event('change',{bubbles:true}));}
        row.status=groups.every(g=>g.nodes[0].checked===(g.choice===row.mappedValue))?'filled':'rejected';
      }
      return;
    }
    const field=rowFields.get(row),fresh=refresh?find(field):null,el=refresh?fresh.node:targets.get(row),mapped=row.mappedValue;
    if(!expected || expected.previous!==row.previous || expected.mappedValue!==mapped || !el?.isConnected || !visible(el) || String(el.value)!==row.previous || (refresh?fresh.locator!==row.locator:find(field).node!==el))row.status='changed';
    else{
      const prototype=el.tagName==='SELECT'?HTMLSelectElement.prototype:el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype,'value').set.call(el,mapped);
      el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
      row.status=el.value===mapped?'filled':'rejected';
    }
  }
  if(action==='apply'&&profile.asyncWrites)return (async()=>{
    // Server-rendered forms may replace later inputs after each change. Keep
    // the original value/locator guard, but resolve the connected node again
    // after each acknowledged edit instead of writing cached detached nodes.
    const pause=()=>new Promise(resolve=>setTimeout(resolve,profile.writeSettleMs??350));
    for(const row of result.rows)if(row.status==='ready'){
      if(options.expectedFrameUrl&&options.expectedFrameUrl!==location.href){row.status='changed';continue;}
      applyRow(row,true);
      if(row.status==='filled'&&!row.modeControl)await pause();
    }
    for(const row of result.rows)if(row.status==='filled'&&!row.modeControl&&row.control!=='exclusive-checkboxes'){
      const current=find(rowFields.get(row)).node;
      if(!current?.isConnected||String(current.value)!==row.mappedValue)row.status='rejected';
    }
    return result;
  })();
  if(action==='apply')for(const row of result.rows)if(row.status==='ready')applyRow(row);
  return result;
}
