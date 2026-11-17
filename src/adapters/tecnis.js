// Checked against the vendor's public calculator HTML and JavaScript on
// 2026-11-15. Registration redirects were observed without accepting terms.
// This profile does not select an IOL, calculate, accept PCA or clear data.
const field=(key,id,label,extra={})=>({key,selectors:[`#calculate-form #${id}`],label,...extra});

export const TECNIS_SITES=[{
  id:'tecnis-toric',name:'TECNIS Toric',category:'toric',
  url:'https://tecnistoriccalc.com/calculator/',host:'tecnistoriccalc.com',path:'/calculator/',
  verified:true,verifiedOn:'2026-11-15',verificationLevel:'public-source',
  verification:'Vendor public HTML/JavaScript selectors and control behavior checked; registration gate not accepted and installed-extension runtime not tested.',
  eyeMode:'single',eyeSelectPostback:false,
  eyeSelectors:{OD:['#calculate-form #eyeSelection1'],OS:['#calculate-form #eyeSelection2']},
  numericFormat:{decimalEvidence:{selector:'#calculate-form #kIndex option[value="1.3375"]',text:'1.3375'}},
  inputUnits:{keratometry:{
    control:'radio',choices:{D:'#calculate-form #kNotationDiopters',mm:'#calculate-form #kNotationMillimeters'},
    values:{D:'D',mm:'mm'},labels:{D:['D'],mm:['mm']},canonical:'D',sourceKeys:['k1','k2'],min:20,max:80,
  }},
  displayPreferences:{cylinderConvention:{
    control:'radio',choices:{plus:'#calculate-form #rccPlus',minus:'#calculate-form #rccMinus'},
    values:{plus:'Plus',minus:'Minus'},labels:{plus:['Plus'],minus:['Minus']},navigationExpected:false,
    requireNoResultsSelector:'#results > tr',requireUniqueResultsContainer:'#results',
  }},
  required:['al','k1','k2','k1Axis','sia','incisionAxis','plannedIolPower','kIndex'],
  fields:[
    field('patient.surgeonName','surgeonName','Surgeon Name'),
    // One free-form field: map ID only, never two aliases to the same input.
    field('patient.patientId','patientInfo','Patient Information'),
    field('patient.age','age','Patient Age',{unit:'years'}),
    field('al','axialLength','Axial Length',{unit:'mm',requiresDotDecimal:true}),
    field('k1','flatK1','Flat K1',{unit:'D',requiresKeratometryUnit:'D',requiresDotDecimal:true}),
    field('k2','steepK2','Steep K2',{unit:'D',requiresKeratometryUnit:'D',requiresDotDecimal:true}),
    field('k1Axis','flatK1M','Flat K1 @ Meridian',{unit:'degrees'}),
    field('k2Axis','steepK2M','Steep K2 @ Meridian',{unit:'degrees',readOnlyValue:true}),
    field('sia','sia','Surgically Induced Astigmatism (SIA)',{unit:'D',requiresDotDecimal:true}),
    field('incisionAxis','incisionLocation','@ Meridian (Incision Location)',{unit:'degrees'}),
    field('plannedIolPower','seIOLPower','SE IOL Power',{unit:'D',emptyValues:['-Select-']}),
    field('kIndex','kIndex','K Index',{emptyValues:['-Select-']}),
  ],
  notes:'單眼表單，OD／OS 由已核對的 native radio 切換；眼別切換會保存／還原各眼表單。K 的資料模型為 D；讀取 mm 模式不切單位且不複製 K1／K2，其他明確欄位仍可讀。貼上有完整且合格的 K1／K2 時可先切 D 再覆寫兩 K，缺一值則保持原站單位。SE IOL Power 為計畫使用的球面等效 IOL 度數，不是 target 或已植入 IOL。IOL 型號、儀器 method、PCA 與常數在原站選擇；constantFactor 隨 method 改變語意，不自動當成 A constant 或測得 ACD。Steep K2 軸向為停用的網站推導欄位，不寫入。若原站已有結果，切柱鏡記法會重新計算，故自動偏好僅在無結果時套用。尚未接受註冊條款或完成真實擴充功能驗收。',
}];
