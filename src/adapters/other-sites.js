// Public form DOM inspected 2026-11-14. Calculations were never submitted.
// Generated framework IDs are deliberately replaced by exact label matching.
const verified = {
  verified: true,
  verifiedOn: '2026-11-14',
  verification: 'Live public input DOM, labels, units and mode switches; no calculation/results validation.',
};
const idField = (key, id, label, extra = {}) => ({ key, selectors: [`#${id}`], label, ...extra });
const labelField = (key, label, extra = {}) => ({ key, selectors: [], labels: [label], label, ...extra });
const bothLabels = fields => ['OD', 'OS'].flatMap((eye, labelIndex) => fields.map(([key, label, unit]) =>
  labelField(key, label, { eye, labelIndex, expectedLabelCount: 2, unit }),
));
const escrsEyeScope = eye => `.mud-grid.mud-grid-spacing-xs-6.noprint > .mud-grid-item:nth-child(${eye === 'OD' ? 1 : 2})`;
const escrsModeControls = ['OD', 'OS'].flatMap(eye => [
  ['toric', 'Toric', 'boolean'], ['keratoconus', 'Keratoconus', 'boolean'],
  ['argos', 'Argos (SoS) AL', 'argos'], ['lvcType', 'Post LASIK/PRK/RK', 'lvc-enabled'],
].map(([key, label, sourceTransform]) => labelField(key, label, {
  eye, control:'checkbox', sourceTransform, scopeSelector:escrsEyeScope(eye),
  ...(sourceTransform === 'lvc-enabled' && {
    readSelection:'[role="combobox"][aria-label="Post LASIK/PRK/RK"][aria-expanded="false"]',
    readValues:{myopic:'myopic', hyperopic:'hyperopic', 'radial keratotomy':'rk'},
  }),
})));
const cookeModeControls = ['OD', 'OS'].map(eye => ({key:'biometer', eye, label:'Biometer', control:'radio', sourceTransform:'cooke-biometer',
  choices:Object.fromEntries([['Argos','0'],['Lenstar','1'],['Other','2']].map(([value, code]) => [value, `[role="radiogroup"][aria-labelledby="${eye.toLowerCase()}-biometer-label"] input[type="radio"][value="${code}"]`])),
}));
const evoModeControls = () => [
  idField('lvcType', 'DropDownLASIK', 'Post LASIK/PRK/RK', {control:'select', navigationExpected:true,
    valueMap:{none:'0',myopic:'1',hyperopic:'2',rk:'3','myopic-lasik':'1','hyperopic-lasik':'2'}}),
  idField('argos', 'DropDownArgos', 'Argos Biometer', {control:'select',sourceTransform:'argos',valueMap:{yes:'1',no:'0'}}),
  idField('posteriorBiometer', 'DropDownListPK', 'Posterior cornea biometer', {control:'select',navigationExpected:true}),
  idField('kIndex', 'DropDownKIndex', 'K Index', {control:'select',navigationExpected:true}),
];
const solverBiometer = () => [{key:'biometer',label:'Biometer',labels:['Biometer'],control:'vuetify-select',sourceTransform:'solver-biometer',rootSelector:'.iol-v-select.v-select',activatorSelector:'.v-input__slot[role="button"][aria-haspopup="listbox"][aria-owns]',selectionSelector:'.v-select__selection'}];
const escrsToricFields = ['OD', 'OS'].flatMap(eye => [
  ['k1Axis', 'K1 axis', 'degrees'], ['k2Axis', 'K2 axis', 'degrees'],
  ['sia', 'SIA', 'D'], ['incisionAxis', 'Incision', 'degrees'],
].map(([key, label, unit]) => labelField(key, label, {
  eye, unit, mode: 'toric',
  // Observed parent grid contains exactly two eye sections, OD then OS.
  scopeSelector: escrsEyeScope(eye),
})));
const evoIdentity = () => [
  idField('patient.name', 'TextBoxName', 'Patient Name'),
  idField('patient.patientId', 'TextBoxID', 'Patient Identifier'),
  idField('patient.surgeonName', 'TextBoxSurgeon', 'Surgeon'),
];
const evoFields = () => [
  idField('al', 'txtAL', 'Axial Length', { unit: 'mm' }),
  idField('k1', 'txtK1', 'K1 (Flat)', { unit: 'D' }),
  idField('k2', 'txtK2', 'K2 (Steep)', { unit: 'D' }),
  idField('acd', 'txtACD', 'Optical ACD', { unit: 'mm' }),
  idField('lt', 'txtLT', 'Lens Thickness', { unit: 'mm' }),
  // Unit confirmed by the user: EVO always receives micrometres. Legacy
  // evoCctUnit settings must not silently scale this field.
  idField('cct', 'txtCCT', 'CCT', {unit:'µm'}),
  idField('target', 'txtRefraction', 'Target Refraction', { unit: 'D' }),
  idField('aConstant', 'txtAConstant', 'A Constant'),
  idField('preLasikRefraction', 'txtPreLASIK', 'Pre LASIK SE', { unit: 'D' }),
  idField('postLasikRefraction', 'txtPostLASIK', 'Post LASIK SE', { unit: 'D' }),
  idField('pk1', 'txtPK1', 'PK1 (magnitude)', { unit: 'D', transform: 'absolute' }),
  idField('pk2', 'txtPK2', 'PK2 (magnitude)', { unit: 'D', transform: 'absolute' }),
];
const evoEyeSelectors = { OD: ['#RadioButtonRLEye_0'], OS: ['#RadioButtonRLEye_1'] };
const evoNotes = '貼上時依指定眼別切換 native radio，先設定已知 LVC/Argos 並等候原站更新，再填量測。未指定 LVC 時採 No；明確病史保留。CCT 固定 µm（使用者確認），不受舊單位設定影響。PK1/PK2 框外印負號，填入絕對值。IOL 型號仍由原站選擇。';

const solverIdentity = () => [labelField('patient.patientId', 'Patient ID / Name')];
const solverMeasurements = [
  ['al', 'AL (mm)', 'mm'], ['k1', 'K1 (D)', 'D'], ['k2', 'K2 (D)', 'D'],
  ['acd', 'ACD (mm)', 'mm'], ['lt', 'LT (mm)', 'mm'], ['cct', 'CCT (µm)', 'µm'],
  ['aConstant', 'A constant', ''], ['target', 'Target refraction (D)', 'D'],
];
const solverSingle = () => solverMeasurements.map(([key, label, unit]) => labelField(key, label, { unit }));

const kaneFields = ['OD', 'OS'].flatMap(eye => {
  const side = eye === 'OD' ? 'right' : 'left';
  const suffix = eye === 'OD' ? '1' : '2';
  return [
    ...['al', 'k1', 'k2', 'acd', 'lt', 'cct'].map(key => ({
      key, eye, selectors: [`input[name="${key}_${side}"]`, `input[name="${key}_${side}_t"]`],
      label: key.toUpperCase(), unit: key === 'cct' ? 'µm' : ['k1', 'k2'].includes(key) ? 'D' : 'mm',
    })),
    idField('aConstant', `A-Constant${suffix}`, 'A-Constant', { eye }),
    idField('target', `${side}-target`, 'Target refraction', { eye, unit: 'D' }),
    idField('k1Axis', `k1-${side}-t-axis`, 'K1 axis', { eye, unit: 'degrees', mode: 'toric' }),
    idField('k2Axis', `k2-${side}-t-axis`, 'K2 axis', { eye, unit: 'degrees', mode: 'toric' }),
    idField('sia', `sia-${side}`, 'SIA', { eye, unit: 'D', mode: 'toric' }),
    idField('incisionAxis', `inc-${side}`, 'Incision', { eye, unit: 'degrees', mode: 'toric' }),
  ];
});
const cookeFields = ['OD', 'OS'].flatMap(eye => {
  const side = eye.toLowerCase();
  return [
    ...[
      ['al', 'al', 'Axial Length', 'mm'], ['k1', 'k1', 'K1', 'D'], ['k2', 'k2', 'K2', 'D'],
      ['acd', 'acd', 'Anterior Chamber Depth', 'mm'], ['lt', 'lt', 'Lens Thickness', 'mm'],
      ['cct', 'cct', 'Central Corneal Thickness', 'µm'], ['wtw', 'wtw', 'White-To-White', 'mm'],
      ['target', 'tgt-rx', 'Target Refraction', 'D'], ['aConstant', 'a-constant', 'A-Constant', ''],
      ['tk1', 'tk1', 'IOLMaster TK1', 'D'], ['tk2', 'tk2', 'IOLMaster TK2', 'D'],
    ].map(([key, suffix, label, unit]) => idField(key, `${side}-${suffix}`, label, { eye, unit })),
  ];
});

export const OTHER_SITES = [
  {
    ...verified, id: 'escrs', name: 'ESCRS IOL Calculator', host: 'iolcalculator.escrs.org',
    url: 'https://iolcalculator.escrs.org/', path: '/', category: 'multi', eyeMode: 'both',
    required: ['al', 'acd', 'k1', 'k2', 'target'],
    requiredIdentity:['patient.initials','patient.surgeonName'],
    modeControls:escrsModeControls, asyncWrites:true,
    notes: '各眼 Toric、Keratoconus、Argos、Post-LVC 為獨立 switch；貼上先切已知模式並等候更新。Post-LVC 子類型、Gender、IOL/PCA 請在原站確認。Patient Initials 可依設定以 ID/姓名代填，不修改原始識別資料。各公式常數獨立；不把單一 A 常數套入所有公式。',
    fields: [
      labelField('patient.initials', 'Patient Initials'), labelField('patient.patientId', 'Id'), labelField('patient.surgeonName', 'Surgeon'),
      labelField('patient.age', 'Age'),
      ...bothLabels([
        ['al', 'AL', 'mm'], ['acd', 'ACD', 'mm'], ['lt', 'LT', 'mm'], ['cct', 'CCT', 'µm'],
        ['wtw', 'WTW', 'mm'], ['k1', 'K1', 'D'], ['k2', 'K2', 'D'], ['target', 'Target Refraction', 'D'],
      ]),
      ...escrsToricFields,
    ],
  },
  {
    ...verified, id: 'cooke', name: 'Cooke K6', host: 'cookeformula.com',
    url: 'https://cookeformula.com/', path: '/', category: 'regular', eyeMode: 'both',
    required: ['al', 'acd', 'k1', 'k2', 'target', 'aConstant'],
    requiredIdentity: ['patient.name'],
    modeControls:cookeModeControls,
    notes: '已驗證 Default、Post-Myopic LVC、Post-Hyperopic LVC、Post-RK 表單。先在原站選病況、Use Ks 與 IOL；Biometer 可依各眼來源切換（IOLMaster 700→Other、Argos→Argos）。AL/ACD/K 必要；LT/CCT 建議，Argos 必須 LT。LVC 額外要求 Age。Name 必填，可依設定以 ID 代填。',
    fields: [
      labelField('patient.name', 'Name *'), labelField('patient.patientId', 'ID'),
      labelField('patient.surgeonName', 'Surgeon'), idField('patient.age', 'age', 'Age'), ...cookeFields,
    ],
  },
  {
    ...verified, id: 'kane', name: 'Kane Formula', host: 'www.iolformula.com', allowedHosts: ['iolformula.com'],
    url: 'https://www.iolformula.com/', path: '/', category: 'regular', eyeMode: 'both',
    required: ['al', 'acd', 'k1', 'k2', 'target', 'aConstant', 'patient.gender'],
    notes: '已驗證雙眼 Non-toric、Toric 欄位與 Keratoconus 選項。請先在網站選各眼 Toric/Non-toric、Keratoconus 與 IOL Type。Sex 為必填，可從面板 Gender 帶入；LT/CCT 為 optional。表單沒有一般 LVC 欄位；不可把 Keratoconus 當作 LVC 模式。',
    fields: [
      idField('patient.patientId', 'ID', 'ID'), idField('patient.name', 'Patient', 'Patient'),
      idField('patient.surgeonName', 'Surgeon', 'Surgeon'),
      { key:'patient.gender',label:'Sex',control:'exclusive-checkboxes',choices:{male:'input[name="gender_1"]',female:'input[name="gender_2"]'} },
      labelField('kIndex', 'Index', {readOptionText:true}), ...kaneFields,
    ],
  },
  {
    ...verified, id: 'evo', name: 'EVO 2.0', host: 'www.evoiolcalculator.com', allowedHosts: ['evoiolcalculator.com'],
    url: 'https://www.evoiolcalculator.com/Calculator.aspx', path: '/Calculator.aspx', category: 'regular', eyeMode: 'single',
    eyeSelectors: evoEyeSelectors, modeControls:evoModeControls(), required: ['al', 'k1', 'k2', 'target', 'aConstant'],
    notes: evoNotes, fields: [...evoIdentity(), ...evoFields()],
  },
  {
    ...verified, id: 'evo-toric', name: 'EVO Toric 2.0', host: 'www.evoiolcalculator.com', allowedHosts: ['evoiolcalculator.com'],
    url: 'https://www.evoiolcalculator.com/Toric.aspx', path: '/Toric.aspx', category: 'toric', eyeMode: 'single',
    eyeSelectors: evoEyeSelectors, modeControls:evoModeControls(),
    required: ['al', 'k1', 'k2', 'k1Axis', 'k2Axis', 'sia', 'incisionAxis', 'target', 'aConstant'],
    notes: evoNotes,
    fields: [...evoIdentity(), ...evoFields(),
      idField('k1Axis', 'TxtK1Axis', 'K1 Axis', { unit: 'degrees' }),
      idField('k2Axis', 'TxtK2Axis', 'K2 Axis', { unit: 'degrees' }),
      idField('sia', 'TxtSIA', 'SIA', { unit: 'D' }),
      idField('incisionAxis', 'TxtSIAaxis', 'Incision Axis', { unit: 'degrees' }),
      idField('pk1Axis', 'TxtPK1axis', 'PK1 Axis', { unit: 'degrees' }),
      idField('pk2Axis', 'TxtPK2axis', 'PK2 Axis', { unit: 'degrees' }),
    ],
  },
  {
    ...verified, id: 'solver-regular', name: 'PEARL-DGS · Regular', host: 'iolsolver.com',
    url: 'https://iolsolver.com/regular', path: '/regular', category: 'regular', eyeMode: 'both',
    modeControls:solverBiometer(),
    required: ['al', 'acd', 'k1', 'k2', 'target', 'aConstant'],
    notes: '雙眼表單，LT/CCT optional。Biometer 透過原站可見選單選擇，IOLMaster 700→Other、Argos→Argos (SOS-AL)；不寫隱藏輸入。兩眼共用儀器不同時保留原站並提示。Keratometric Index 與 IOL Model 仍在原站確認。',
    fields: [...solverIdentity(), ...bothLabels(solverMeasurements)],
  },
  {
    ...verified, id: 'solver-complex', name: 'PEARL-DGS · Complex', host: 'iolsolver.com',
    url: 'https://iolsolver.com/complex', path: '/complex', category: 'lvc', eyeMode: 'single',
    eyeSwitch:{selectors:['.switch-eye input[type="checkbox"]'],checkedEye:'OD',uncheckedEye:'OS'},
    modeControls:solverBiometer(),
    required: ['al', 'acd', 'k1', 'k2', 'target', 'aConstant'],
    notes: '單眼表單，眼別透過已核對的 switch 切換，Biometer 透過可見選單選擇。LVC、RK、Non-physiological cornea、ICL 為不同選項，仍需在原站確認。LVC history 用術前半徑(mm)與 corrected ametropia；不以 D 單位 Pre-LVC K 取代。後角膜 radius、TK、TCRP 分開保存。',
    fields: [...solverIdentity(), ...solverSingle(),
      labelField('preLvcRadius', 'Pre-LVC anterior corneal radius (mm)', { unit: 'mm' }),
      labelField('correctedAmetropia', 'Corrected ametropia (D)', { unit: 'D' }),
      labelField('posteriorRadius', 'Measured Posterior Corneal Radius (mm)', { unit: 'mm' }),
      labelField('totalK', 'Total Keratometry - IOLMaster700 (D)', { unit: 'D' }),
      labelField('tcrp', 'TCRP (D)', { unit: 'D' }),
    ],
  },
  {
    ...verified, id: 'solver-second', name: 'PEARL-DGS · Second Eye', host: 'iolsolver.com',
    url: 'https://iolsolver.com/second', path: '/second', category: 'second', eyeMode: 'single',
    eyeSwitch:{selectors:['.switch-eye input[type="checkbox"]'],checkedEye:'OD',uncheckedEye:'OS'},
    modeControls:solverBiometer(),
    required: ['al', 'acd', 'k1', 'k2', 'target', 'aConstant', 'fellowIolPower', 'fellowRefraction', 'fellowK1', 'fellowK2', 'fellowAcd'],
    notes: '已驗證目前眼及已手術對側眼兩區。對側眼術前 biometry、已植入 IOL 度數及術後 SE 分開儲存。網站標示 Preop. ACD (D) 應由使用者確認；不因標籤單位疑義而自動填入。兩眼須同 IOL model；網站另有 AL/ARC 差異限制。',
    fields: [...solverIdentity(),
      ...solverSingle().map(f => ['lt', 'cct'].includes(f.key) ? { ...f, labelIndex: 0, expectedLabelCount: 2 } : f),
      labelField('fellowIolPower', 'Implanted IOL power', { unit: 'D' }),
      labelField('fellowRefraction', 'Postop. spherical equivalent (D)', { unit: 'D' }),
      labelField('fellowAl', 'Preop. AL (mm)', { unit: 'mm' }),
      labelField('fellowK1', 'Preop. K1 (D)', { unit: 'D' }),
      labelField('fellowK2', 'Preop. K2 (D)', { unit: 'D' }),
      labelField('fellowLt', 'LT (mm)', { unit: 'mm', labelIndex: 1, expectedLabelCount: 2 }),
      labelField('fellowCct', 'CCT (µm)', { unit: 'µm', labelIndex: 1, expectedLabelCount: 2 }),
    ],
  },
  {
    ...verified,
    id: 'solver-toric', name: 'PEARL-DGS · Toric', host: 'iolsolver.com',
    url: 'https://iolsolver.com/toric', path: '/toric', category: 'toric', eyeMode: 'single',
    eyeIndicators:{OD:{selector:'.iol-right-v-sheet > h2',text:'OD'},OS:{selector:'.iol-left-v-sheet > h2',text:'OS'}},
    prerequisite:{selectors:['form .ghost p.text-center.text-h6.text-sm-h5'],messages:['Please first complete a spherical IOL calculation','Then select an "IOL Power" value'],entrySiteId:'solver-regular'},
    verification: 'Live Toric DOM reached through a normal spherical calculation using an explicitly labeled synthetic software test; no real patient data, no Toric calculation submitted.',
    required: ['k1Axis', 'sia', 'incisionAxis'],
    fields: [
      labelField('k1Axis', 'K1 axis (°)', { unit: 'degrees' }),
      labelField('sia', 'SIA (D)', { unit: 'D' }),
      labelField('incisionAxis', 'Incision axis (°)', { unit: 'degrees' }),
      labelField('pk1', 'PK1 (D)', { unit: 'D' }),
      labelField('pk2', 'PK2 (D)', { unit: 'D' }),
      labelField('pk2Axis', 'PR2/PK2 axis (°)', { unit: 'degrees' }),
    ],
    notes: '已使用明確標記的合成測試驗證 Toric 表單。必須先完成 spherical calculation 並選 IOL Power，再開 Toric。先手動核對網站眼別、Toric IOL Style 與 cylinder notation；PR1/PR2、PK1/PK2、Post. Cylinder 為替代量測，請選一種。自動對應 PK1/PK2 及其陡峭軸向；半徑與柱鏡符號慣例留手動確認。',
  },
];
