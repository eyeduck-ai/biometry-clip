// Development-only synthetic visual fixture. Confidence is illustrative.
import '../styles.css';
import {reviewMarkup} from '../import-review-ui.js';
import {bindReviewPreview} from '../import-preview.js';
import {getLanguage,setLanguage,localize,observeLocalization} from '../i18n.js';
const dialog=document.querySelector('#review-dialog');let release=()=>{};
const keys=['al','acd','lt','cct','wtw','k1','k2'],values={OD:['23.45','3.20','4.20','543','11.80','43.20','44.10'],OS:['24.10','3.40','4.30','551','12.00','42.80','43.90']};
const source={id:'0:image',fileIndex:0,pageNumber:null,label:'SYNTHETIC · biometry.png'};
const allConfidence=new URLSearchParams(location.search).get('allConfidence')==='1';
const rows=['OD','OS'].flatMap(eye=>keys.map((key,i)=>({eye,key,value:values[eye][i],old:'',confidence:eye==='OD'&&key==='cct'?.72:allConfidence?.98:undefined,source})));
function open(){release();dialog.classList.add('import-review-dialog');dialog.innerHTML='<div class="dialog-heading"><h2 id="dialog-title">核對並儲存</h2><button class="icon-button" data-close aria-label="關閉">×</button></div>'+reviewMarkup({rows,sources:[source],source:'SYNTHETIC DESIGN PREVIEW',sourceExpanded:!window.matchMedia('(max-width:650px)').matches});dialog.querySelector('#review-duration').textContent='耗時 0:26';dialog.querySelectorAll('[data-close]').forEach(button=>button.onclick=()=>dialog.close());dialog.showModal();release=bindReviewPreview(dialog,{sources:[source],rows,loadSource:async()=>({url:new URL('../ocr/fixtures/synthetic-biometry.png',import.meta.url).href,release(){}})});localize(dialog);}
document.querySelector('#open-review').onclick=open;document.querySelector('#lang').onclick=()=>{setLanguage(getLanguage()==='en'?'zh-TW':'en');localize(document.querySelector('#app'));};
dialog.addEventListener('close',()=>release());observeLocalization(document.querySelector('#app'));open();
