import {messages as coreMessages,rules as coreRules} from './locales/en-core.js';
import {messages as helpMessages,rules as helpRules} from './locales/en-help.js';
import {messages as parserMessages,rules as parserRules} from './locales/en-parser.js';
import {messages as secondaryMessages,rules as secondaryRules} from './locales/en-secondary.js';

// Interface language is an explicit preference. It does not depend on the
// browser locale and never changes the vocabulary of stored clinical data.
let currentLanguage='en';
const messages={...secondaryMessages,...coreMessages,...helpMessages,...parserMessages};
const rules=[...(coreRules||[]),...(secondaryRules||[]),...(helpRules||[]),...parserRules];
const textSources=new WeakMap();
const attributeSources=new WeakMap();
const activeObservers=new Set();
const attributes=['aria-label','title','placeholder','alt'];
const dataSelects=new Set(['patient-picker','measurement-picker','lens-picker','lens-source-picker','target-tab']);
const protectedTags=new Set(['SCRIPT','STYLE','PRE','CODE','NOSCRIPT','TEMPLATE']);

export function normalizeLanguage(value){
  return typeof value==='string'&&/^zh(?:[-_].*)?$/i.test(value.trim())?'zh-TW':'en';
}
export function getLanguage(){return currentLanguage;}
export function setLanguage(value){
  const next=normalizeLanguage(value);
  if(next===currentLanguage)return next;
  currentLanguage=next;
  for(const context of activeObservers)context.refresh();
  return next;
}

/** Translate a complete UI fragment only; unknown text stays verbatim. */
export function translate(value,language=currentLanguage){
  const source=String(value??'');
  if(normalizeLanguage(language)==='zh-TW'||!source.trim())return source;
  const leading=source.match(/^\s*/)[0],trailing=source.match(/\s*$/)[0];
  const body=source.slice(leading.length,source.length-trailing.length);
  let translated;
  if(Object.hasOwn(messages,body))translated=messages[body];
  if(typeof translated!=='string')for(const rule of rules){
    const pattern=Array.isArray(rule)?rule[0]:rule?.pattern;
    const replacement=Array.isArray(rule)?rule[1]:rule?.replacement;
    if(!(pattern instanceof RegExp)||!['function','string'].includes(typeof replacement))continue;
    // A global or partial substitution could silently alter a source label or
    // identity embedded in an otherwise unknown string. Require the full text.
    const expression=new RegExp(pattern.source,pattern.flags.replace(/[gy]/g,''));
    const match=expression.exec(body);
    if(!match||match.index!==0||match[0].length!==body.length)continue;
    try{translated=body.replace(expression,replacement);}catch{continue;}
    break;
  }
  return typeof translated==='string'?leading+translated+trailing:source;
}

function elementFor(node){return node?.nodeType===1?node:node?.parentElement;}
function protectedElement(element){
  if(!element)return false;
  if(element.closest('[data-i18n-skip],[translate="no"],[contenteditable]:not([contenteditable="false"])'))return true;
  for(let current=element;current;current=current.parentElement)if(protectedTags.has(current.tagName))return true;
  if(element.tagName==='OPTION'){
    const select=element.closest('select');
    if(dataSelects.has(select?.id)&&element.value!=='')return true;
  }
  return false;
}
function protectedText(element){
  return protectedElement(element)||!!element?.closest('input,textarea');
}
function originalValue(current,previous){
  // If the app replaced the text since the last translation, it is a new UI
  // message. A repeated pass over our own output retains its original source.
  return previous&&current===previous.output?previous.source:current;
}
function localizeText(node,language){
  if(protectedText(elementFor(node)))return;
  const current=node.nodeValue,source=originalValue(current,textSources.get(node));
  const output=translate(source,language);
  textSources.set(node,{source,output});
  if(current!==output)node.nodeValue=output;
}
function localizeAttributes(element,language){
  if(protectedElement(element))return;
  const skipped=new Set((element.getAttribute('data-i18n-skip-attrs')||'').split(/\s+/).filter(Boolean));
  let previous=attributeSources.get(element);
  if(!previous){previous=new Map();attributeSources.set(element,previous);}
  for(const name of attributes){
    if(skipped.has(name)||!element.hasAttribute(name)){previous.delete(name);continue;}
    const current=element.getAttribute(name),source=originalValue(current,previous.get(name));
    const output=translate(source,language);
    previous.set(name,{source,output});
    if(current!==output)element.setAttribute(name,output);
  }
}

/**
 * Localize UI nodes in place. Input values, IDs, source option labels and data
 * attributes are never edited. Callers set the extension document's lang; this
 * generic helper must not change a host calculator document for a shadow shell.
 */
export function localize(root,language=currentLanguage){
  if(!root)return root;
  const selected=normalizeLanguage(language);
  const walk=node=>{
    if(node.nodeType===3){localizeText(node,selected);return;}
    if(node.nodeType===1){
      if(protectedElement(node))return;
      localizeAttributes(node,selected);
      if(node.tagName==='INPUT'||node.tagName==='TEXTAREA')return;
    }
    for(const child of node.childNodes||[])walk(child);
  };
  walk(root);return root;
}

/** Catch asynchronous dialogs, status and progress without rebuilding controls. */
export function observeLocalization(root,{language=()=>currentLanguage}={}){
  const document=root?.nodeType===9?root:root?.ownerDocument;
  const Observer=document?.defaultView?.MutationObserver||globalThis.MutationObserver;
  const selected=()=>normalizeLanguage(typeof language==='function'?language():language);
  if(!root||typeof Observer!=='function'){
    localize(root,selected());return ()=>{};
  }
  let disposed=false;
  const config={subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:attributes};
  const context={refresh(){
    if(disposed)return;
    // Synchronous translation cannot race another JS task. Disconnecting while
    // changing text prevents recursive observer notifications from our writes.
    observer.disconnect();
    try{localize(root,selected());}finally{if(!disposed)observer.observe(root,config);}
  }};
  const observer=new Observer(()=>context.refresh());
  activeObservers.add(context);context.refresh();
  return ()=>{disposed=true;observer.disconnect();activeObservers.delete(context);};
}

export function languageButtonMarkup(language=currentLanguage,{floating=false}={}){
  const selected=normalizeLanguage(language),chinese=selected==='zh-TW';
  const action=chinese?'切換至英文':'Switch to Chinese';
  return `<button type="button" id="language-toggle" class="language-toggle${floating?' is-compact':''}" data-action="toggle-language" data-language="${selected}" data-i18n-skip aria-label="${action}" title="${action}"><span lang="en" class="${chinese?'':'selected'}">EN</span><span class="language-divider" aria-hidden="true">/</span><span lang="zh-Hant" class="${chinese?'selected':''}">中文</span></button>`;
}
