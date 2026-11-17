/**
 * Self-contained calculator lens UI bridge. Select requests contain only an
 * identity already resolved by the packaged catalog; constants are read only.
 */
export function lensTransferBridge(action,definition,request={}) {
  const result={siteId:definition?.siteId||'',status:'unavailable',controls:[],url:'',capturedAt:new Date().toISOString()};
  const clean=value=>String(value??'').replace(/[\u200b\ufeff]/g,'').replace(/\s+/g,' ').trim();
  const norm=value=>clean(value).toLowerCase();
  const all=(selector,root=document)=>{try{return selector?[...root.querySelectorAll(selector)]:[];}catch{return [];}};
  const shown=node=>!!node&&!node.hidden&&!node.closest('[aria-hidden="true"]')&&node.type!=='hidden'&&node.getClientRects().length>0&&!['hidden','collapse'].includes(getComputedStyle(node).visibility);
  const disabled=node=>!node||node.nodeType===1&&(node.disabled||node.getAttribute('aria-disabled')==='true'||node.getAttribute('aria-readonly')==='true'||!!node.closest('[inert]')||['disabled','Mui-disabled','mud-disabled','v-list-item--disabled'].some(name=>node.classList?.contains(name)));
  const text=node=>clean(node?.getAttribute('aria-label')||node?.textContent);
  const one=(selector,root=document)=>{const nodes=all(selector,root);return nodes.length===1?nodes[0]:null;};
  const publicParameter=node=>clean(node&&('value' in node?node.value:node.textContent));
  const blocked=reason=>({...result,status:'manual',reason});
  if(!definition||!['inspect','read','open','close','select'].includes(action))return result;
  try{
    const expected=new URL(definition.url),actual=new URL(location.href);
    if(actual.protocol!=='https:'||![expected.hostname,...(definition.allowedHosts||[])].includes(actual.hostname)||decodeURIComponent(actual.pathname).toLowerCase()!==decodeURIComponent(expected.pathname).toLowerCase())return {...result,status:'target-changed',reason:'目的網站已離開原定計算入口。'};
    result.url=actual.origin+actual.pathname;
  }catch{return result;}
  const definitions=Array.isArray(definition.controls)?definition.controls:[{...definition,id:definition.id||'primary'}];
  function describe(control,index){
    const controlId=control.id||`lens-${index+1}`;
    const state={controlId,...(control.eye?{eye:control.eye}:{}),...(control.formula?{formula:control.formula}:{}),role:control.role||'primary',control:control.control,status:'unavailable',options:[],selected:null,parameters:[],menuOpen:false,navigationExpected:!!control.navigationExpected};
    let scope=document;
    if(control.scopeSelector){const scopes=all(control.scopeSelector).filter(shown);if(scopes.length!==1)return {state:{...state,status:scopes.length?'ambiguous':'unavailable'}};scope=scopes[0];}
    const rootLabels=control.rootLabels||[control.rootLabel||control.label].filter(Boolean);
    function roots(){
      const nodes=control.rootSelector?all(control.rootSelector,scope):[scope];
      return nodes.filter(root=>!rootLabels.length||[...all('label',root),...all('[aria-label]',root)].some(label=>rootLabels.some(rootLabel=>norm(label.getAttribute('aria-label')||label.textContent)===norm(rootLabel))));
    }
    function kind(value,label){
      if(control.role==='geometry')return 'geometry';
      const known=(control.options||[]).filter(option=>option.value===value&&(!label||option.label===label));
      if(known.length===1&&['model','family','group','geometry'].includes(known[0].kind))return known[0].kind;
      return (control.geometryValues||[]).includes(value)?'geometry':(control.familyValues||[]).includes(value)?'family':control.kind|| (control.role==='manufacturer'?'group':control.control==='custom-family'?'family':'model');
    }
    function parameters(root){
      if(!state.selected)return;
      for(const parameter of control.parameters||[]){
        let parameterRoot=parameter.global?document:root;
        if(parameter.scopeSelector){const scopes=[...all(parameter.scopeSelector,parameterRoot),...(parameterRoot.matches?.(parameter.scopeSelector)?[parameterRoot]:[])].filter(shown);if(scopes.length!==1)continue;parameterRoot=scopes[0];}
        let node=parameter.selector?one(parameter.selector,parameterRoot):null;
        if(!node&&parameter.label){
          const labels=all('label',parameterRoot).filter(label=>norm(label.textContent)===norm(parameter.label));
          const nodes=[...new Set(labels.flatMap(label=>{const id=label.getAttribute('for');if(id){const candidate=document.getElementById(id);return candidate&&parameterRoot.contains(candidate)?[candidate]:[];}return all('input,select,textarea',label);} ))];
          if(nodes.length===1)node=nodes[0];
        }
        const value=publicParameter(node);
        if(!shown(node)||!value||!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)||!Number.isFinite(Number(value)))continue;
        const entry={key:parameter.key,value,unit:parameter.unit||'site-defined',sourceControl:parameter.selector||`label:${parameter.label}`};
        if(parameter.methodSelector){const method=one(parameter.methodSelector,parameter.global?document:root);if(!shown(method))continue;entry.method=text(method);}
        state.parameters.push(entry);
      }
    }
    if(control.control==='native-select'){
      const candidates=[...new Set([control.selector,...(control.selectors||[])].filter(Boolean).flatMap(selector=>all(selector,scope)))];
      if(candidates.length!==1)return {state:{...state,status:candidates.length?'ambiguous':'unavailable'}};
      const target=candidates[0];
      if(target.tagName!=='SELECT'||target.multiple||target.type==='hidden')return {state:{...state,status:'manual'}};
      let operable=shown(target);
      if(!operable&&(control.allowStyledSelect||control.styledNative)){
        const owner=target.closest(control.styledOwnerSelector||'.bootstrap-select');
        const buttons=owner?all(control.styledActivatorSelector||'button.dropdown-toggle',owner).filter(node=>shown(node)&&!disabled(node)):[];
        operable=!target.hidden&&buttons.length===1;
      }
      if(!operable)return {state};
      const choices=[...target.options].map(node=>({node,value:clean(control.valueMode==='label'?node.label||node.textContent:node.value),label:clean(node.label||node.textContent)})).filter(option=>option.value&&option.label&&!(control.emptyValues||[]).map(String).includes(String(option.node.value)));
      state.options=choices.map(option=>({value:option.value,label:option.label,kind:kind(option.value,option.label),available:!disabled(target)&&!option.node.disabled&&!option.node.parentElement?.disabled}));
      const selected=choices.filter(option=>option.node.selected);
      if(selected.length===1&&choices.filter(choice=>choice.value===selected[0].value&&choice.label===selected[0].label).length===1)state.selected={value:selected[0].value,label:selected[0].label,kind:kind(selected[0].value,selected[0].label)};
      state.status=disabled(target)?'manual':'read';parameters(scope);
      return {state,target,choices,operable:!disabled(target)};
    }
    if(control.control==='custom-family'){
      const targetRoots=roots();if(targetRoots.length!==1)return {state:{...state,status:targetRoots.length?'ambiguous':'unavailable'}};
      const root=targetRoots[0],choices=all(control.selector,root).map(node=>({node,value:clean(control.valueMode==='label'?text(node):node.getAttribute(control.valueAttribute||'data-value')),label:clean(control.labelSelector?(node.querySelector(control.labelSelector)?.getAttribute('alt')||node.querySelector(control.labelSelector)?.textContent):text(node))})).filter(option=>option.value&&option.label);
      const activators=control.activatorSelector?all(control.activatorSelector,root).filter(shown):[];
      const target=activators.length===1?activators[0]:null;
      const selectedNode=one(control.selectedSelector,root)||one(control.selectedSelector,scope);
      const selectedValue=publicParameter(selectedNode),selected=choices.filter(choice=>choice.value===selectedValue);
      state.options=choices.map(choice=>({value:choice.value,label:choice.label,kind:kind(choice.value,choice.label),available:!disabled(choice.node)&&!choice.node.closest('.d-none,[hidden]')&&(shown(choice.node)||!!target&&!disabled(target))}));
      if(selected.length===1)state.selected={value:selected[0].value,label:selected[0].label,kind:kind(selected[0].value,selected[0].label)};
      state.menuOpen=choices.some(choice=>shown(choice.node));state.status=choices.length?'read':'unavailable';parameters(scope);
      return {state,root,target,choices,operable:!!choices.length};
    }
    if(control.control==='linked-select'){
      const targetRoots=roots();if(targetRoots.length!==1)return {state:{...state,status:targetRoots.length?'ambiguous':'unavailable'}};
      const root=targetRoots[0],selector=control.activatorSelector||control.selector;
      const targets=selector?all(selector,root).filter(shown):[];
      // When selector is itself the known combobox, root may be that element.
      if(selector&&root!==document&&root.matches?.(selector)&&shown(root))targets.push(root);
      const activators=[...new Set(targets)];if(activators.length!==1)return {state:{...state,status:activators.length?'ambiguous':'unavailable'}};
      const target=activators[0];
      const rootDisabled=disabled(root)||root.classList?.contains('v-input--is-disabled')||root.classList?.contains('v-input--is-readonly')||root!==document&&!!root.querySelector?.('input:disabled,input[aria-readonly="true"]');
      const operable=!rootDisabled&&!disabled(target)&&!(target.tagName==='BUTTON'&&target.type==='submit');
      const selectedNode=control.selectedSelector?one(control.selectedSelector,root):target;
      const label=clean(selectedNode&&('value' in selectedNode?selectedNode.value:selectedNode.textContent));
      const valueNode=control.selectedValueSelector?one(control.selectedValueSelector,root):null;
      const value=control.valueMode==='label'||!valueNode?label:publicParameter(valueNode);
      if(label&&value)state.selected={value,label,kind:kind(value,label)};
      const ids=[...new Set([target.getAttribute('aria-controls'),target.getAttribute('aria-owns')].filter(Boolean).flatMap(value=>value.split(/\s+/)).filter(Boolean))];
      let menus=[];
      for(const id of ids){const owner=document.getElementById(id);if(!owner)continue;if(owner.matches(control.menuSelector||'[role="listbox"],[role="menu"]')&&shown(owner))menus.push(owner);else menus.push(...all(control.menuSelector||'[role="listbox"],[role="menu"]',owner).filter(shown));}
      if(!menus.length&&target.id)menus=all(control.menuSelector||'[role="listbox"],[role="menu"]').filter(menu=>shown(menu)&&(menu.getAttribute('aria-labelledby')||'').split(/\s+/).includes(target.id));
      if(!menus.length&&control.allowUnlinkedMenu&&control.menuSelector&&target.getAttribute('aria-expanded')==='true'){
        const openOwners=all('[role="combobox"][aria-expanded="true"],[aria-haspopup="listbox"][aria-expanded="true"]').filter(shown);
        if(openOwners.length===1&&openOwners[0]===target)menus=all(control.menuSelector).filter(shown);
      }
      menus=[...new Set(menus)];if(menus.length>1)return {state:{...state,status:'ambiguous'},target,operable:false};
      const menu=menus[0],choices=menu?all(control.optionSelector||'[role="option"]',menu).filter(shown).map(node=>({node,label:text(node),value:clean(control.valueMode==='label'?text(node):node.getAttribute(control.valueAttribute||'data-value')??text(node))})).filter(option=>option.value&&option.label):[];
      state.options=choices.map(option=>({value:option.value,label:option.label,kind:kind(option.value,option.label),available:operable&&!disabled(option.node)&&!option.node.classList.contains('v-list-item--disabled')}));
      if(state.selected&&choices.filter(choice=>choice.value===state.selected.value&&choice.label===state.selected.label).length>1)state.selected=null;
      state.menuOpen=!!menu;state.status=operable?'read':'manual';parameters(scope);
      return {state,target,root,menu,choices,operable};
    }
    return {state:{...state,status:'unsupported'}};
  }
  const controls=definitions.map((control,index)=>({definition:control,...describe(control,index)}));
  for(const item of controls){
    if(item.state.role==='manufacturer')continue;
    const makers=controls.filter(candidate=>candidate.state.role==='manufacturer'&&(!item.state.eye||!candidate.state.eye||candidate.state.eye===item.state.eye));
    if(makers.length===1&&makers[0].state.selected)item.state.manufacturer=makers[0].state.selected.label||makers[0].state.selected.value;
  }
  result.controls=controls.map(item=>item.state);result.status=controls.some(item=>item.state.status==='read')?'read':'unavailable';
  if(['inspect','read'].includes(action))return result;
  const matches=controls.filter(item=>item.state.controlId===request.controlId&&(!request.eye||!item.state.eye||item.state.eye===request.eye));
  if(matches.length!==1)return blocked('晶體欄位無法唯一定位，保留原站選擇。');
  const current=matches[0],control=current.definition,state=current.state;
  result.controlId=state.controlId;
  if(!['read'].includes(state.status)||!current.operable)return blocked('晶體欄位目前不可操作，保留原站選擇。');
  if(control.requireNoResultsSelector&&all(control.requireNoResultsSelector).some(shown))return blocked('原站已有計算結果，變更晶體可能觸發重算，請在原站選擇。');
  if(action==='close'){
    if(state.menuOpen&&current.target){current.target.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true}));return {...result,status:'closed',changed:false};}
    return {...result,status:'closed',changed:false};
  }
  if(request.expectedPrevious){
    const previous=request.expectedPrevious;
    if((state.selected?.value||'')!==String(previous.value||'')||(state.selected?.label||'')!==String(previous.label||''))return blocked('原站晶體已變更，請重新貼上。');
  }
  if(action==='open'){
    if((state.menuOpen&&!(control.searchInput&&request.label))||control.control==='native-select')return {...result,status:'opened',phase:'opened',changed:false};
    if(!current.target||!shown(current.target)||disabled(current.target)||current.target.tagName==='BUTTON'&&current.target.type==='submit')return blocked('晶體選單無法安全展開，請在原站選擇。');
    let expectedAfterOpen,searchPrepared=false;
    if(control.searchInput&&request.label){
      const input=control.searchInputSelector?one(control.searchInputSelector,current.root||document):current.target;
      if(input?.tagName!=='INPUT'||input.type==='hidden'||input.readOnly||!shown(input)||disabled(input))return blocked('晶體搜尋輸入框不可安全操作，請在原站選擇。');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,request.label);
      input.dispatchEvent(new Event('input',{bubbles:true}));
      searchPrepared=true;
      const after=describe(control,definitions.indexOf(control)).state.selected;
      if(after)expectedAfterOpen={value:after.value,label:after.label};
    }
    if(!state.menuOpen)current.target.click();return {...result,status:'opened',phase:'opened',changed:true,...(searchPrepared?{searchPrepared:true}:{}),...(expectedAfterOpen?{expectedAfterOpen}:{})};
  }
  const evidencedGeometry=request.kind==='geometry'&&request.relation==='geometry'&&typeof request.catalogId==='string'&&request.catalogId.trim()!=='';
  if(!request.value||!request.label||!(['model','family','group'].includes(request.kind)||evidencedGeometry))return blocked('晶體對照不完整或只是光學幾何設定，未變更原站選擇。');
  if(!control.requireOptionCommit&&!control.searchInput&&state.selected?.value===request.value&&state.selected?.label===request.label&&state.selected?.kind===request.kind)return {...result,status:'already-selected',changed:false};
  const choices=(current.choices||[]).filter(option=>option.value===request.value&&option.label===request.label);
  const published=state.options.filter(option=>option.value===request.value&&option.label===request.label&&option.kind===request.kind&&option.available);
  if(choices.length!==1||published.length!==1)return blocked('目的網站沒有唯一可選的精確晶體型號，保留原站選擇。');
  const choice=choices[0];
  if(control.control==='native-select'){
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(current.target,choice.node.value);
    current.target.dispatchEvent(new Event('input',{bubbles:true}));current.target.dispatchEvent(new Event('change',{bubbles:true}));
  }else{
    if(!shown(choice.node)||disabled(choice.node)||choice.node.tagName==='BUTTON'&&choice.node.type==='submit')return blocked('目的晶體選項尚未顯示或不可操作，保留原站選擇。');
    choice.node.click();
  }
  return {...result,status:'selected',phase:'selected',changed:true,navigationExpected:!!control.navigationExpected};
}

const failure=(code,message)=>Object.assign(new Error(message),{code});
const selectedEqual=(left,right)=>left?.value===right?.value&&left?.label===right?.label&&left?.kind===right?.kind;

/** Background-side bounded sequencing. run must target frame 0 and return documentId. */
export function createLensTransfer({run,checkedTab,guard=async()=>{},onUpdated,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=()=>Date.now()}={}) {
  if(typeof run!=='function'||typeof checkedTab!=='function')throw new Error('Lens transfer requires checked tab and bridge transports.');
  const locks=new Set();
  async function inspect(tabId,definition,request={}){
    await checkedTab(tabId,definition.siteId);return run(tabId,'inspect',definition,request);
  }
  async function collect(tabId,definition,options={}){
    const id=Number(tabId);if(locks.has(id))throw failure('LENS_TRANSFER_BUSY','此分頁正在讀取或選擇晶體，請稍候。');
    locks.add(id);const controls=[],warnings=[];
    const check=async()=>{await guard();await options.guard?.();return checkedTab(id,definition.siteId);};
    const key=control=>`${control.controlId}:${control.eye||''}`;
    try{
      await check();const before=await run(id,'inspect',definition,{});
      for(const initial of before.controls||[]){
        if(options.eye&&options.eye!=='OU'&&initial.eye&&initial.eye!==options.eye)continue;
        await check();let snapshot=await run(id,'inspect',definition,{}),current=snapshot.controls?.find(control=>key(control)===key(initial));
        if(!current){warnings.push('原站晶體欄位已變更，略過此欄。');continue;}
        let opened=false;
        if(current.status==='read'&&current.control!=='native-select'&&!current.menuOpen){
          const request={controlId:current.controlId,...(current.eye?{eye:current.eye}:{}),expectedPrevious:current.selected||{value:'',label:''}};
          const action=await run(id,'open',definition,request);
          if(action.status==='manual'){controls.push({...current,reason:action.reason});warnings.push(action.reason);continue;}
          opened=true;const started=now();
          while(now()-started<(options.timeoutMs??5000)){
            await check();snapshot=await run(id,'inspect',definition,{});current=snapshot.controls?.find(control=>key(control)===key(initial));
            if(current?.menuOpen)break;await sleep(100);
          }
          if(!current?.menuOpen){warnings.push('晶體選單未能展開，僅保存目前可讀的選項。');}
        }
        if(current)controls.push(current);
        if(opened){await check();await run(id,'close',definition,{controlId:initial.controlId,...(initial.eye?{eye:initial.eye}:{})});}
      }
      await check();const after=await run(id,'inspect',definition,{});
      for(const initial of before.controls||[]){
        const current=after.controls?.find(control=>key(control)===key(initial));
        if(current&&((initial.selected||current.selected)&&!selectedEqual(initial.selected,current.selected)))throw failure('LENS_READ_CHANGED','展開晶體選單時原站改變了選擇，請核對原站晶體；未保存這次收集。');
      }
      return {...after,status:controls.some(control=>control.status==='read')?'read':'unavailable',controls,warnings:[...new Set(warnings)],changed:false};
    }finally{locks.delete(id);}
  }
  async function prepare(tabId,definition,selections,options={}){
    const id=Number(tabId);if(locks.has(id))throw failure('LENS_TRANSFER_BUSY','此分頁正在選擇晶體，請稍候。');
    if(!Array.isArray(selections))throw failure('INVALID_LENS_SELECTION','晶體對照必須是明確選項清單。');
    const definitions=Array.isArray(definition.controls)?definition.controls.map((control,index)=>({...control,id:control.id||`lens-${index+1}`})):[{...definition,id:definition.id||'primary'}];
    const descriptorFor=selection=>{const matches=definitions.filter(control=>control.id===selection.controlId&&(!selection.eye||!control.eye||control.eye===selection.eye));return matches.length===1?matches[0]:undefined;};
    const keys=selections.map(item=>`${item.controlId}:${descriptorFor(item)?.eye||'shared'}`);
    if(new Set(keys).size!==keys.length)throw failure('INVALID_LENS_SELECTION','同一晶體欄位有多個來源，請核對後重試。');
    locks.add(id);const outcomes=[],warnings=[];let navigated=false,latest;
    const check=async()=>{await guard();await options.guard?.();return checkedTab(id,definition.siteId);};
    const describe=(snapshot,selection)=>{const matches=snapshot.controls?.filter(item=>item.controlId===selection.controlId&&(!selection.eye||!item.eye||item.eye===selection.eye))||[];return matches.length===1?matches[0]:undefined;};
    try{
      await check();latest=await run(id,'inspect',definition,options.eye?{eye:options.eye}:{});
      if(!selections.length)return {...latest,status:'unsupported',controls:[],navigated:false,warnings:[]};
      const order=selection=>definitions.findIndex(control=>(control.id||'primary')===selection.controlId&&(!selection.eye||!control.eye||control.eye===selection.eye));
      const ordered=[...selections].sort((left,right)=>order(left)-order(right));
      for(const selection of ordered){
        await check();latest=await run(id,'inspect',definition,{});
        const before=latest,control=describe(before,selection);
        if(!control||control.status!=='read'){outcomes.push({...selection,status:'manual',reason:'目的晶體欄位目前無法唯一讀取。'});continue;}
        const evidencedGeometry=selection.kind==='geometry'&&selection.relation==='geometry'&&typeof selection.catalogId==='string'&&selection.catalogId.trim()!=='';
        if(!selection.value||!selection.label||!(['model','family','group'].includes(selection.kind)||evidencedGeometry)){outcomes.push({...selection,status:'manual',reason:'沒有已核對的精確晶體對照。'});continue;}
        const descriptor=descriptorFor(selection);
        if(selectedEqual(control.selected,selection)&&!descriptor?.requireOptionCommit&&!descriptor?.searchInput){outcomes.push({...selection,status:'already-selected',changed:false});continue;}
        const expectedPrevious=control.selected||{value:'',label:''},request={...selection,expectedPrevious};
        let loading=false,completed=false,documentChanged=false,phase=descriptor?.searchInput?'open':control.control==='native-select'||control.menuOpen?'select':'open',selected=false,stableSince,stableSignature,searchStarted;
        const listener=(changedId,change)=>{if(Number(changedId)!==id)return;if(change.status==='loading'){loading=true;navigated=true;}if(change.status==='complete'&&loading)completed=true;};
        onUpdated?.addListener(listener);const started=now();
        try{
          await check();let action;
          try{action=await run(id,phase,definition,request);}catch(error){if(error.code||!control.navigationExpected)throw error;}
          if(action?.status==='manual'||action?.status==='target-changed'){
            outcomes.push({...selection,status:'manual',reason:action.reason||'晶體選項未能安全準備。'});continue;
          }
          if(action?.searchPrepared){searchStarted=now();if(action.expectedAfterOpen)request.expectedPrevious=action.expectedAfterOpen;}
          selected=phase==='select';
          let finished=false;
          while(now()-started<(options.timeoutMs??15000)){
            const checked=await check(),tab=checked.tab||checked;
            if(tab.status==='loading'){loading=true;navigated=true;stableSince=undefined;await sleep(100);continue;}
            try{latest=await run(id,'inspect',definition,{});}catch(error){if(error.code)throw error;await sleep(100);continue;}
            documentChanged||=!!before.documentId&&!!latest.documentId&&before.documentId!==latest.documentId;navigated||=documentChanged;
            if(latest.status==='target-changed')throw failure('TARGET_CHANGED','晶體選取期間分頁已離開原定入口。');
            const current=describe(latest,selection);
            if(!current){stableSince=undefined;await sleep(100);continue;}
            if(!selected&&current.menuOpen){
              const desired=(current.options||[]).filter(option=>option.value===selection.value&&option.label===selection.label&&option.kind===selection.kind&&option.available);
              if(searchStarted!=null&&desired.length!==1&&now()-searchStarted<(options.searchTimeoutMs??3000)){await sleep(100);continue;}
              await check();
              try{action=await run(id,'select',definition,request);}catch(error){if(error.code||!control.navigationExpected)throw error;}
              if(action?.status==='manual'){outcomes.push({...selection,status:'manual',reason:action.reason});await run(id,'close',definition,{controlId:selection.controlId,eye:selection.eye});finished=true;break;}
              selected=true;stableSince=undefined;await sleep(100);continue;
            }
            const navigationDone=!control.navigationExpected||completed||documentChanged;
            if(selected&&current.status==='read'&&selectedEqual(current.selected,selection)&&navigationDone){
              const signature=JSON.stringify({selected:current.selected,parameters:current.parameters||[]});
              if(signature!==stableSignature){stableSignature=signature;stableSince=now();}
              if(now()-stableSince>=(options.settleMs??350)){outcomes.push({...selection,status:'applied',changed:true,selected:current.selected,parameters:current.parameters});finished=true;break;}
            }else{stableSince=undefined;stableSignature=undefined;}
            await sleep(100);
          }
          if(!finished)throw failure('LENS_SWITCH_TIMEOUT','原站晶體選取尚未穩定，已停止貼上；請核對原站晶體後重試。');
        }finally{onUpdated?.removeListener(listener);}
      }
      await check();latest=await run(id,'inspect',definition,{});
      for(const accepted of outcomes.filter(item=>['applied','already-selected'].includes(item.status))){
        const current=describe(latest,accepted);
        if(!current||!selectedEqual(current.selected,accepted))throw failure('LENS_STATE_CHANGED','後續選項重設了已選晶體，已停止貼上；請核對原站。');
      }
      for(const item of outcomes)if(item.reason)warnings.push(item.reason);
      return {...latest,status:outcomes.some(item=>item.status==='manual')?'partial':outcomes.some(item=>item.status==='applied')?'applied':'already-selected',controls:outcomes,navigated,warnings:[...new Set(warnings)]};
    }catch(error){if(navigated){error.navigated=true;error.restoreSiteId=definition.siteId;}throw error;}
    finally{locks.delete(id);}
  }
  return {inspect,collect,prepare};
}
