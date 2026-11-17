import { cleanCase } from '../model.js';

// Explicit software-test values only. They do not recommend a formula, lens,
// biometer, clinical target, or treatment. Alternative measurements are kept
// separate so the runner can report the exact fields that were exercised.
export const QA_CASE = cleanCase({
  version: 1,
  activeEye: 'OD',
  patient: {
    patientId: 'QA-SYNTHETIC-A',
    name: 'SYNTHETIC SOFTWARE TEST - NOT A PATIENT',
    surgeonId: 'DEMO',
    surgeonName: 'DEMO',
    age: '70',
    gender: 'female',
  },
  eyes: {
    OD: {
      al: '23.45', acd: '3.20', lt: '4.20', cct: '543', wtw: '11.80',
      k1: '43.20', k2: '44.10', k1Axis: '90', k2Axis: '180', target: '0.00',
      aConstant: '118.7', lensFactor: '', plannedIolPower: '21.5',
      toric: true, keratoconus: false, iolSourceSite:'', iolSourceValue:'', iolSourceLabel:'', iolCatalogId:'', iolSourceControl:'', iolSourceManufacturer:'', iolSourceRole:'', sia: '0.10', incisionAxis: '90',
      tk1: '43.40', tk2: '44.30', tk1Axis: '90', tk2Axis: '180',
      pk1: '5.80', pk2: '6.10', pk1Axis: '90', pk2Axis: '180',
      pca: '0.30', pcaAxis: '175',
      lvcType: 'myopic', preLasikK: '45.20',
      preLasikRefraction: '-4.00', postLasikRefraction: '0.25',
      preLvcRadius: '7.80', correctedAmetropia: '-4.00',
      posteriorRadius: '6.60', totalK: '43.00', tcrp: '43.10',
      kIndex: '1.3375', biometer: 'IOLMaster 700', posteriorBiometer:'', argos: 'no',
      refractionSphere: '-0.75', refractionCylinder: '0.50', refractionAxis: '85',
      implantedIolPower: '20.5', implantedIolCylinder: '1.5', implantedIolAxis: '95',
      desiredIolAxis: '90',
      preOpK1: '43.00', preOpK2: '44.00', preOpK1Axis: '90', preOpK2Axis: '180',
      postOpK1: '42.60', postOpK2: '43.60', postOpK1Axis: '80', postOpK2Axis: '170',
      exchangeLensFactor: '', exchangeAConstant: '118.9',
      fellowAl: '23.70', fellowAcd: '3.30', fellowLt: '4.35', fellowCct: '548',
      fellowK1: '42.60', fellowK2: '43.60', fellowIolPower: '20.0', fellowRefraction: '-0.25',
    },
    OS: {
      al: '24.10', acd: '3.40', lt: '4.30', cct: '551', wtw: '12.00',
      k1: '42.80', k2: '43.90', k1Axis: '85', k2Axis: '175', target: '-0.50',
      aConstant: '118.7', lensFactor: '', plannedIolPower: '22.5',
      toric: true, keratoconus: false, iolSourceSite:'', iolSourceValue:'', iolSourceLabel:'', iolCatalogId:'', iolSourceControl:'', iolSourceManufacturer:'', iolSourceRole:'', sia: '0.20', incisionAxis: '80',
      tk1: '42.95', tk2: '44.05', tk1Axis: '85', tk2Axis: '175',
      pk1: '5.70', pk2: '6.00', pk1Axis: '85', pk2Axis: '175',
      pca: '0.25', pcaAxis: '165',
      lvcType: 'myopic', preLasikK: '44.80',
      preLasikRefraction: '-3.00', postLasikRefraction: '-0.25',
      preLvcRadius: '7.90', correctedAmetropia: '-3.00',
      posteriorRadius: '6.70', totalK: '42.70', tcrp: '42.85',
      kIndex: '1.3375', biometer: 'IOLMaster 700', posteriorBiometer:'', argos: 'no',
      refractionSphere: '-1.00', refractionCylinder: '0.75', refractionAxis: '75',
      implantedIolPower: '21', implantedIolCylinder: '3', implantedIolAxis: '100',
      desiredIolAxis: '85',
      preOpK1: '42.50', preOpK2: '43.50', preOpK1Axis: '85', preOpK2Axis: '175',
      postOpK1: '42.10', postOpK2: '43.30', postOpK1Axis: '75', postOpK2Axis: '165',
      exchangeLensFactor: '', exchangeAConstant: '118.9',
      fellowAl: '23.60', fellowAcd: '3.25', fellowLt: '4.15', fellowCct: '540',
      fellowK1: '43.10', fellowK2: '44.00', fellowIolPower: '20.5', fellowRefraction: '0.25',
    },
  },
});

// These keys describe observable field coverage, never a precomputed pass.
// A nonempty special-mode key set requires exact write AND readback for every
// key/eye tested. An empty set with a Toric/LVC manual-mode notice means that
// mode still needs manual verification, not that it passed or was unsupported.
// Manual notices are instructions for the user; they are not automated actions.
export const QA_SITE_CHECKS = [
  {
    siteId: 'barrett-universal',
    notes: '雙眼基本量測；OD 無後綴、OS 為 0 後綴。共用 A constant 兩眼均 118.7，Lens Factor 留空；不選臨床 IOL 型號。',
    toricKeys: [], lvcKeys: [], requiredManualModes: [],
  },
  {
    siteId: 'barrett-true-k',
    notes: '雙眼 LVC 病史值不同，目標屈光度獨立；只驗證資料對應，不計算或推薦公式。',
    toricKeys: [], lvcKeys: ['lvcType', 'preLasikRefraction', 'postLasikRefraction'],
    requiredManualModes: ['LVC：先確認兩眼 History 為 Myopic Lasik，病史欄位已可編輯；不將 target 當成病史值。'],
  },
  {
    siteId: 'barrett-toric',
    notes: '單眼 measured K 與 flat／steep 軸向分開；選填 biometer K 不代替主要 K。',
    toricKeys: ['k1Axis', 'k2Axis', 'sia', 'incisionAxis'], lvcKeys: [],
    requiredManualModes: ['Toric：使用者先選網站 OD／OS，等 ASP.NET 回傳完成；手動核對 cylinder sign 與 K index。'],
  },
  {
    siteId: 'barrett-true-k-toric',
    notes: '單眼 Toric 與 LVC 皆須核對；URL 含 TK 不表示可把 TK 填入 measured K，停用選填 K 保持原值。',
    toricKeys: ['k1Axis', 'k2Axis', 'sia', 'incisionAxis'],
    lvcKeys: ['lvcType', 'preLasikRefraction', 'postLasikRefraction'],
    requiredManualModes: ['Toric：先選網站眼別並等回傳完成，手動核對 cylinder sign。', 'LVC：先確認 History 為 Myopic Lasik，術前／術後病史欄位可用。'],
  },
  {
    siteId: 'barrett-rx',
    notes: '術後分析／換片測試：一般 K、preOp K、postOp K、術後屈光度與 exchange 常數各自獨立；implanted cylinder 為 IOL-plane D。',
    toricKeys: ['postOpK1Axis', 'postOpK2Axis', 'preOpK1Axis', 'preOpK2Axis', 'implantedIolCylinder', 'implantedIolAxis', 'sia', 'incisionAxis'],
    lvcKeys: [],
    requiredManualModes: ['Toric：先選網站眼別；確認已植入 Toric、ELP／IOL 模式與 cylinder sign。這是術後欄位驗證，不是一般 Toric 計算。'],
  },
  {
    siteId: 'escrs',
    notes: '依 OD／OS 分區核對；各公式常數獨立，不灌入同一 A constant。Patient Initials 不從姓名推測，Gender 為自訂控制。',
    toricKeys: ['k1Axis', 'k2Axis', 'sia', 'incisionAxis'], lvcKeys: [],
    requiredManualModes: ['Toric：使用者先開啟欲測眼別的 Toric，等待欄位出現；確認 PCA 與 IOL。', 'LVC：Post LASIK/PRK/RK 模式未安全自動對應，需使用者手動核對，不能以空 lvcKeys 宣稱通過。', '手動確認 Surgeon、Patient Initials、Gender 及各公式常數；不代填未安全對應的必填項目。'],
  },
  {
    siteId: 'cooke',
    notes: '先驗基本雙眼，LVC 的 TK1／TK2 與一般 K 分開。年齡為合成 70；本測試不指定臨床鏡片或公式。',
    toricKeys: [], lvcKeys: ['tk1', 'tk2'],
    requiredManualModes: ['EULA：若顯示條款，僅由使用者自行決定；測試程式不得點 Accept。', 'LVC：使用者選 Post-Myopic LVC、Use Ks／TK、Biometer／IOL；確認 Age。Argos 模式另要求 LT，Default 成功不代表 LVC 成功。'],
  },
  {
    siteId: 'kane',
    notes: '雙眼模式可不同；男女須互斥。K2 Toric 軸向為停用的網站推導值，不要求自動寫入。Keratoconus 不能當成一般 LVC。',
    toricKeys: ['k1Axis', 'sia', 'incisionAxis'], lvcKeys: [],
    requiredManualModes: ['Toric：使用者先用可見標籤選各眼 Toric／Non-toric，等待相應欄位出現，手動核對 IOL Type。'],
  },
  {
    siteId: 'evo',
    notes: '單眼；PK1／PK2 為框外有負號的絕對值。CCT 單位未明，不強制填入；不由一般 K 推導歷史或後角膜值。',
    toricKeys: [], lvcKeys: ['lvcType', 'preLasikRefraction', 'postLasikRefraction'],
    requiredManualModes: ['使用者先選網站眼別與 IOL／Argos，不能依面板選眼擅自假定網站眼別。', 'LVC：先選 Myopic（值 1）並確認病史啟用；Hyperopic／RK 的停用病史應跳過，不能算已驗證該模式。'],
  },
  {
    siteId: 'evo-toric',
    notes: '單眼 Toric；前角膜與後角膜軸向分開。PK 為絕對值，不等同 TK 或 PCA。',
    toricKeys: ['k1Axis', 'k2Axis', 'sia', 'incisionAxis', 'pk1', 'pk2', 'pk1Axis', 'pk2Axis'],
    lvcKeys: ['lvcType', 'preLasikRefraction', 'postLasikRefraction'],
    requiredManualModes: ['Toric：使用者先選眼別、Toric Model、Argos 與後角膜量測方式。', 'LVC：先選 Myopic（值 1）並確認病史啟用；切 Hyperopic 後病史停用屬網站條件，不能強制寫入。'],
  },
  {
    siteId: 'solver-regular',
    notes: '雙眼重複標籤依眼別核對；custom selects 的隱藏 input 不直接寫入。',
    toricKeys: [], lvcKeys: [],
    requiredManualModes: ['使用者手動核對 Biometer、Keratometric Index、IOL Model；測試程式不選臨床型號或點 Calculate。'],
  },
  {
    siteId: 'solver-complex',
    notes: '單眼，術前 radius 以 mm、corrected ametropia 以 D。posterior radius／Total K／TCRP 是替代量測，需分別核對，完整 fixture 不表示應同時計算。',
    toricKeys: [], lvcKeys: ['preLvcRadius', 'correctedAmetropia'],
    requiredManualModes: ['使用者手動確認網站目前眼別。', 'LVC：先啟用 history 並核對 Myopic；RK、Non-physiological cornea、ICL 是不同條件。後角膜半徑／TK／TCRP 請選定一種後分別驗證。'],
  },
  {
    siteId: 'solver-second',
    notes: '目前眼與已手術對側眼分區，不等於 OU；fellow 測量是獨立的術前測試值。Preop. ACD (D) 有單位疑義，需手動確認，不以自動欄位通過掩蓋。',
    toricKeys: [], lvcKeys: [],
    requiredManualModes: ['使用者手動確認目前眼、同一 IOL Model 與對側已手術資料，核對 AL／ARC 差異限制。', '手動核對 Preop. ACD (D)；此必填欄位未安全自動對應。', 'LVC：目前眼／對側眼的自訂模式與病史未完整自動對應，需手動驗證，不能以空 lvcKeys 宣稱通過。'],
  },
  {
    siteId: 'solver-toric',
    notes: '僅核對可編輯 Toric 欄位；球面來源的唯讀表頭不算貼入成功。PR1／PR2、PK1／PK2、Post. Cylinder 為替代量測。',
    toricKeys: ['k1Axis', 'sia', 'incisionAxis', 'pk1', 'pk2', 'pk2Axis'], lvcKeys: [],
    requiredManualModes: ['Toric：使用者先完成正常 spherical calculation 並選 IOL Power，才能進入本表單；程式不得自動點 Calculate 或選 IOL Power。', 'Toric：使用者手動核對網站眼別、Toric IOL Style、cylinder notation 與選定的後角膜量測。入口前置畫面不算驗證通過。'],
  },
  {
    siteId: 'tecnis-toric',
    notes: 'TECNIS 前角膜 K、K1 軸向、SIA、切口、AL 與獨立 Planned SE IOL Power；沒有量測 ACD／LT／CCT／WTW／target 欄位。常數及計算日期不與量測資料混用。',
    toricKeys: ['k1Axis', 'sia', 'incisionAxis'], lvcKeys: [],
    requiredManualModes: ['TECNIS：先自行完成地區／語言／使用條款與 IOL 型號選擇；工具不代為接受條款或選鏡片。', 'Toric：Planned SE IOL Power 使用先前已規劃的球面等效 IOL power，不用 implanted 或 fellow IOL power 代替。', 'K 單位：讀取時只接受已核對的 D 模式，不切換以免清除原 K；貼上時完整且合法的兩 K 才可準備 D 模式。', '柱鏡顯示：優先 Minus；已有結果而切換會重算時，保留原站並標為需人工確認。'],
  },

];
