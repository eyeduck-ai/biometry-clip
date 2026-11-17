// Observed on the live APACRS forms on 2026-11-14. No guessed IDs.
// The background transfer selects a verified eye BEFORE writing a single-eye
// profile; those radios post back and can discard writes made too early.
const field = (key, id, label, extra = {}) => ({
  key, selectors: [`#${id}`], labels: [label], ...extra,
});

const identity = () => [
  field('patient.name', 'MainContent_PatientName', 'Patient Name'),
  field('patient.patientId', 'MainContent_PatientNo', 'Patient ID'),
  field('patient.surgeonName', 'MainContent_DoctorName', 'Doctor Name'),
];
const constants = () => [
  field('lensFactor', 'MainContent_LensFactor', 'Lens Factor'),
  field('aConstant', 'MainContent_Aconstant', 'A Constant'),
];
const bilateral = () => ['OD', 'OS'].flatMap(eye => {
  const suffix = eye === 'OD' ? '' : '0';
  return [
    field('al', `MainContent_Axlength${suffix}`, 'Axial Length', { eye, unit: 'mm' }),
    field('k1', `MainContent_MeasuredK1${suffix}`, 'Measured K1', { eye, unit: 'D' }),
    field('k2', `MainContent_MeasuredK2${suffix}`, 'Measured K2', { eye, unit: 'D' }),
    field('acd', `MainContent_OpticalACD${suffix}`, 'Optical ACD', { eye, unit: 'mm' }),
    field('target', `MainContent_Refraction${suffix}`, 'Target Refraction', { eye, unit: 'D' }),
    field('lt', `MainContent_LensThickness${suffix}`, 'Lens Thickness', { eye, unit: 'mm' }),
    field('wtw', `MainContent_WTW${suffix}`, 'WTW', { eye, unit: 'mm' }),
  ];
});
const singleBiometry = () => [
  field('al', 'MainContent_AxLength', 'Axial Length', { unit: 'mm' }),
  field('acd', 'MainContent_OpticalACD', 'Optical ACD', { unit: 'mm' }),
  field('target', 'MainContent_Refraction', 'Target Refraction', { unit: 'D' }),
  field('lt', 'MainContent_LensThickness', 'Lens Thickness', { unit: 'mm' }),
  field('wtw', 'MainContent_WTW', 'WTW', { unit: 'mm' }),
  field('sia', 'MainContent_InducedCyl', 'Incision SIA', { unit: 'D' }),
  field('incisionAxis', 'MainContent_IncisionAxis', 'Incision Location', { unit: 'degrees' }),
];
const singleK = (prefix = '') => [
  field(prefix ? `${prefix}K1` : 'k1', 'MainContent_MeasuredK', prefix ? 'Flat K (Post Op)' : 'Flat K', { unit: 'D' }),
  field(prefix ? `${prefix}K1Axis` : 'k1Axis', 'MainContent_MeasuredAxis', prefix ? 'Flat Axis (Post Op)' : 'Flat Axis', { unit: 'degrees' }),
  field(prefix ? `${prefix}K2` : 'k2', 'MainContent_MeasuredK0', prefix ? 'Steep K (Post Op)' : 'Steep K', { unit: 'D' }),
  field(prefix ? `${prefix}K2Axis` : 'k2Axis', 'MainContent_MeasuredAxis0', prefix ? 'Steep Axis (Post Op)' : 'Steep Axis', { unit: 'degrees' }),
];

const lvcValueMap = {
  myopic: 'Myopic Lasik', hyperopic: 'Hyperopic Lasik', rk: 'Radial Keratotomy',
  keratoconus: 'Keratoconus',
  'myopic-lasik': 'Myopic Lasik', 'hyperopic-lasik': 'Hyperopic Lasik',
};
const lvc = (eye) => {
  const suffix = eye === 'OS' ? '0' : '';
  const extra = eye ? { eye } : {};
  return [
    field('lvcType', `MainContent_RefractProcedure${suffix}`, 'History', { ...extra, valueMap: lvcValueMap }),
    field('preLasikRefraction', `MainContent_PreLasik${suffix}`, 'Pre-Lasik Ref.', { ...extra, unit: 'D' }),
    field('postLasikRefraction', `MainContent_PostLasik${suffix}`, 'Post-Lasik Ref.', { ...extra, unit: 'D' }),
  ];
};
const eyeSelectors = { OD: ['#MainContent_Rad1'], OS: ['#MainContent_Rad2'] };
// Live public input controls inspected 2026-11-15. These affect output
// notation only; the extension never rewrites refraction cylinder/axis data.
const cylinderDisplayPreferences = {cylinderConvention:{
  control:'radio',choices:{plus:'#MainContent_RadioButtonList2_0',minus:'#MainContent_RadioButtonList2_1'},
  values:{plus:'1',minus:'-1'},labels:{plus:['+ve Cylinder','+ve Cyl'],minus:['-ve Cylinder','-ve Cyl']},navigationExpected:false,
}};
const base = {
  host: 'calc.apacrs.org', verified: true, verifiedOn: '2026-11-14',
  eyeSelectPostback: true,
  verification: 'Live initial Patient Data DOM and select options; calculation/results not submitted.',
};
const ordinaryRequired = ['al', 'acd', 'k1', 'k2', 'target'];
const toricRequired = [...ordinaryRequired, 'k1Axis', 'k2Axis', 'sia', 'incisionAxis'];

export const APACRS_SITES = [
  {
    ...base,
    id: 'barrett-universal', name: 'Barrett Universal II', category: 'regular',
    url: 'https://calc.apacrs.org/barrett_universal2105/', path: '/barrett_universal2105/',
    eyeMode: 'both', required: ordinaryRequired,
    fields: [...identity(), ...constants(), ...bilateral()],
    notes: '雙眼欄位已核對；LT、WTW 為 optional。另需病人姓名／代稱及適合晶體的 Lens Factor 或 A Constant；病人 ID、Doctor Name 非必填。ACD 為 optical ACD，K 以 D 輸入；不自動更改 K index。',
    requiredIdentity: ['patient.name'], requiredAny: [['lensFactor', 'aConstant']],
  },
  {
    ...base,
    id: 'barrett-true-k', name: 'Barrett True-K', category: 'lvc',
    url: 'https://calc.apacrs.org/Barrett_True_K_Universal_2105/', path: '/Barrett_True_K_Universal_2105/',
    eyeMode: 'both', required: [...ordinaryRequired, 'lvcType'],
    fields: [...identity(), ...constants(), ...lvc('OD'), ...lvc('OS'), ...bilateral()],
    notes: '雙眼可分別選近視 LASIK、遠視 LASIK、RK 或 keratoconus。Pre-/Post-Lasik refraction 為病史值，不是 target；缺失時保留空白，不推算。LT、WTW optional。',
    requiredIdentity: ['patient.name'], requiredAny: [['lensFactor', 'aConstant']],
  },
  {
    ...base,
    id: 'barrett-toric', name: 'Barrett Toric', category: 'toric',
    displayPreferences:cylinderDisplayPreferences,
    url: 'https://calc.apacrs.org/toric_calculator20/Toric%20Calculator.aspx', path: '/toric_calculator20/',
    eyeMode: 'single', eyeSelectors, required: toricRequired,
    fields: [...identity(), ...constants(), ...singleK(), ...singleBiometry()],
    notes: '貼上時切換已核對的 OD／OS 元件，等待網站更新後填入目前眼。需要 flat/steep K 與各自軸度、SIA 及 incision location（0–360°）。頁面另有 optional biometer K1/K2、IOL power；與主要角膜曲率不同，未自動混用。依顯示偏好優先選 -ve，不轉換測量值；K index 保留原站設定。',
    requiredIdentity: ['patient.name'], requiredAny: [['lensFactor', 'aConstant']],
  },
  {
    ...base,
    id: 'barrett-true-k-toric', name: 'Barrett True-K Toric', category: 'lvc-toric',
    displayPreferences:cylinderDisplayPreferences,
    url: 'https://calc.apacrs.org/TrueKToricTK_preview/TrueKToricTK.aspx', path: '/TrueKToricTK_preview/',
    eyeMode: 'single', eyeSelectors, required: [...toricRequired, 'lvcType'],
    fields: [...identity(), ...constants(), ...lvc(), ...singleK(), ...singleBiometry()],
    notes: '貼上時切換已核對眼別，並依偏好優先選 -ve。History 支援 myopic/hyperopic LASIK、RK、keratoconus；另有 Pre-/Post-Lasik refraction。雖 URL 含 TK，初始 Patient Data 沒有獨立 TK／PCA 欄位；不把 TK 轉填為 measured K。optional K1/K2 在此頁停用。',
    requiredIdentity: ['patient.name'], requiredAny: [['lensFactor', 'aConstant']],
  },
  {
    ...base,
    id: 'barrett-rx', name: 'Barrett Rx / Exchange', category: 'second',
    displayPreferences:cylinderDisplayPreferences,
    url: 'https://calc.apacrs.org/barrett_rx105/', path: '/barrett_rx105/',
    eyeMode: 'single', eyeSelectors,
    required: ['al', 'acd', 'target', 'postOpK1', 'postOpK1Axis', 'postOpK2', 'postOpK2Axis', 'implantedIolPower', 'refractionSphere', 'refractionCylinder', 'refractionAxis'],
    fields: [
      ...identity(), ...constants(), ...singleBiometry(), ...singleK('postOp'),
      field('preOpK1', 'MainContent_PreOpFlatK', 'Flat K (Pre Op)', { unit: 'D' }),
      field('preOpK1Axis', 'MainContent_PreOpFlatAxis', 'Flat Axis (Pre Op)', { unit: 'degrees' }),
      field('preOpK2', 'MainContent_PreOpSteepK', 'Steep K (Pre Op)', { unit: 'D' }),
      field('preOpK2Axis', 'MainContent_PreOpSteepAxis', 'Steep Axis (Pre Op)', { unit: 'degrees' }),
      field('implantedIolPower', 'MainContent_IOLPower', 'Power IOL (Implanted)', { unit: 'D' }),
      field('implantedIolCylinder', 'MainContent_ImplantedToricCylinder', 'Toric (Implanted)', { unit: 'D (IOL plane)' }),
      field('implantedIolAxis', 'MainContent_ImplantedToricAxis', 'Axis (Implanted)', { unit: 'degrees' }),
      field('refractionSphere', 'MainContent_PostOpSphere', 'Post Op Refraction: Sphere', { unit: 'D' }),
      field('refractionCylinder', 'MainContent_PostOpCyl', 'Post Op Refraction: Cyl', { unit: 'D' }),
      field('refractionAxis', 'MainContent_PostOpAxis', 'Post Op Refraction: Axis', { unit: 'degrees' }),
      field('exchangeLensFactor', 'MainContent_LensFactorEx', 'Lens Factor IOL (Exchange)'),
      field('exchangeAConstant', 'MainContent_AconstantEx', 'A Constant IOL (Exchange)'),
    ],
    notes: '術後分析／換片／piggyback，不是初次植入計算。主要 K 欄位代表 Post Op；Pre Op K 供 SIA analysis，不從一般 K 自動代入。Implanted toric 下拉文字 T2–T9 對應 IOL-plane D（1.0–6.0），不可用角膜平面 cylinder 代替。換片另有獨立晶體常數；ELP/IOL 模式在原網站核對；依顯示偏好優先選 -ve，不改寫柱鏡或軸向量測。',
    requiredIdentity: ['patient.name'], requiredAny: [['lensFactor', 'aConstant']],
  },
];
