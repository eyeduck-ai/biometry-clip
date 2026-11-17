# TECNIS Toric：公開欄位與對應

研究日期：2026-11-15（Asia/Taipei）。目標為 [TECNIS Toric Calculator](https://tecnistoriccalc.com/calculator/)。本輪只研究原站公開 HTML／JavaScript，未接受註冊條款、選擇 IOL、送出計算或接管使用者 Chrome。

獨立 IAB 開啟 `/calculator/` 會導向註冊頁。沒有修改 cookie／localStorage 或接受條款來越過此閘門。之後以不帶登入憑證與 cookie 的公開 HTTPS GET 取得 HTTP 200 的原始 calculator HTML（78,220 bytes）及其公開 JavaScript；因此 profile 標為 `verificationLevel: public-source`，不是實際已安裝擴充功能通過。

來源證據保存在 `artifacts/tecnis-source/calculator-public.html`、`calculator-public.js`、`calculator-metadata.json` 與 `fields-public.json`。不包含病人資料。

## 欄位集合

讀寫只使用 `#calculate-form` 中的唯一控制，避免誤選 Preferences 模態內相似的元件。

| 共用欄位 key | 原站控制 ID | 語意／處理 |
| --- | --- | --- |
| `patient.surgeonName` | `surgeonName` | 非必填；原站長度上限 25，識別資料選項開啟時才讀寫 |
| `patient.patientId` | `patientInfo` | 原站只有一個自由文字資訊欄（長度上限 25）；只映射 ID，不把 ID 與姓名同填或串接 |
| `patient.age` | `age` | 年齡；原站選填，範圍 0–199 |
| `al` | `axialLength` | mm；原站 12–40 |
| `k1`／`k2` | `flatK1`／`steepK2` | 前角膜 K；模型為 D，兩值 20–80 且 K1≤K2；不以 TK 取代 |
| `k1Axis` | `flatK1M` | 平坦 K 軸向，整數 0–180° |
| `k2Axis` | `steepK2M` | 明確標記僅讀原站停用的推導值；不寫入 |
| `sia` | `sia` | D，0–2 |
| `incisionAxis` | `incisionLocation` | 切口位置，整數 0–360° |
| `plannedIolPower` | `seIOLPower` | 計畫使用的球面等效 IOL 度數；只匹配網站已提供的選項；未選的 `-Select-` 是缺值，不當作數字 |
| `kIndex` | `kIndex` | 網站實值 1.3375／1.336／1.332／1.3315；預設補值只適用空來源與空目的 |

`plannedIolPower` 與 `target`、`implantedIolPower`、`fellowIolPower` 是不同資料，不互相代入。球面等效 IOL 選項依地區與使用者選擇的 lens 動態產生；沒有相符選項時保留未填，不選擇其他 power，也不代選 lens。

原站沒有實測 ACD、LT、CCT、WTW 或 target 的對應輸入框；這些資料仍保存在共用模型，不硬塞進其他欄位。`constantFactor` 的語意會隨 method 變成固定／個人化 A constant、Surgeon Factor 或個人化 ACD constant，不能當成測得 ACD。本輪不自動讀寫這個多義欄位，也不修改 method。`steepK2M` 是停用的網站推導軸向，僅以專用 read-only metadata 複製原站現值，不寫入或在擴充功能自行推算。

## 眼別、單位與顯示偏好

- OD／OS 為主表單的 `eyeSelection1`／`eyeSelection2`，同一 native radio group，值分別為 `right`／`left`。原站 change handler 保存舊眼資料並還原新眼資料，不能以 HTML 的初始 checked 屬性代替執行時狀態。只用一次 native click 觸發，不重複送 change。
- K 單位為 `kNotationDiopters`（D）／`kNotationMillimeters`（mm）。地區預設可能不同，Taiwan 的預設為 mm。切換會清除兩個 K 及舊結果，不是單純換標籤。**讀取時不切單位**，mm 模式的 K 不以 D 複製；其他明確欄位可用。貼上只有在來源 K1／K2 俱全、有效且可唯一寫入時，才先切 D 再寫兩 K；缺少任何一個時不切換。
- 原站小數點預設為 `.`，但使用者可保存逗號格式。輸入格式須有明確證據，不能把帶逗號的數字直接當 canonical D/mm 字串。K index 的 option 值始終為點號，而可見選項文字跟隨小數顯示偏好，可作為點號格式的對應證據。只有主表單 `kIndex option[value="1.3375"]` 唯一且文字為 `1.3375`，才讀寫需要點號的 AL／K1／K2／SIA。逗號或無法確認時保留原值並回傳提示，亦不切 K 單位。整數軸向與 native select 的數字 value 不受此小數顯示 gate 影響。
- 主表單的柱鏡記法為 `rccPlus`／`rccMinus`（`Plus`／`Minus`），不操作 Preferences 中另一組 radio。`#results` 已有資料列時，原站改記法會重新執行計算；因此自動 −ve 僅在結果容器唯一且無資料列時操作。已有結果則保留手動狀態，基本資料貼上不因顯示偏好而被阻擋。

PCA、IOL 型號、method、地區、條款及任何會確認清除雙眼的對話框仍由使用者操作。讀取不修改原站。以上為欄位與控制流程相容性，並非公式或臨床結果驗證。

## 已驗證與限制

`tests/tecnis.test.js` 使用取得的真實公開 HTML，在不執行外站 scripts／不連線的合成 DOM 中測試唯一 selector、計畫 IOL 欄位隔離、OD／OS 切換、K 單位保護、缺選項保留及 −ve 的重新計算保護。動態 select options 依公開 JavaScript 的格式建立測試替身；沒有模擬已選某個臨床 IOL。

實際註冊後 DOM、地區／語言切換後的 runtime、網站輸入遮罩及已安裝擴充功能的原生讀取／跨分頁貼上仍需後續驗收。由於前角膜 K 與許多共用量測單位／用途不同，不以新增入口等同全部欄位皆支援。
