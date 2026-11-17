import {ESCRS_CAPTURE} from './lens-escrs-data.js';
// ESCRS input controls observed in the approved independent research page, 2026-11-15.
const url='https://iolcalculator.escrs.org/';
const scope=eye=>`.mud-grid.mud-grid-spacing-xs-6.noprint > .mud-grid-item:nth-child(${eye==='OD'?1:2})`;
export const ESCRS_LENS_DEFINITIONS=Object.freeze({escrs:{siteId:'escrs',url,controls:['OD','OS'].flatMap(eye=>[
 {id:`${eye}.manufacturer`,eye,role:'manufacturer',control:'linked-select',label:'Manufacturer',rootSelector:scope(eye)+' .mud-input-control',rootLabels:['Manufacturer'],activatorSelector:'[role="combobox"][aria-label="Manufacturer"]',valueMode:'label',optionSelector:'[role="option"]',optionKind:'group'},
 {id:`${eye}.model`,eye,role:'primary',control:'linked-select',label:'Select IOL',rootSelector:scope(eye)+' .mud-input-control',rootLabels:['Select IOL'],activatorSelector:'input[role="combobox"][aria-autocomplete="list"]',valueMode:'label',optionSelector:'[role="option"]',dependsOn:`${eye}.manufacturer`,requireOptionCommit:true,searchInput:true,
 parameters:[['barrettAConstant','Barrett A-Constant'],['cookeAConstant','Cooke A-Constant'],['evoAConstant','EVO A-Constant'],['hillRbfAConstant','Hill-RBF A-Constant'],['hofferPacd','Hoffer® pACD'],['kaneAConstant','Kane A-Constant'],['pearlDgsAConstant','Pearl DGS A-Constant']].map(([key,label])=>({key,label,labels:[label],scopeSelector:scope(eye),unit:'1'}))}
])}});
export const ESCRS_LENS_SOURCES=Object.freeze(ESCRS_CAPTURE.flatMap(item=>['OD','OS'].map(eye=>({siteId:'escrs',controlId:`${eye}.model`,eye,role:'primary',manufacturer:item.manufacturer,formula:item.mode,url,capturedAt:'2026-11-15T00:00:00.000Z',control:'linked-select',options:item.options.map(label=>({value:label,label,kind:label.includes('/')?'group':'model',available:true})),selected:null,parameters:[]}))).filter(source=>source.options.length));
