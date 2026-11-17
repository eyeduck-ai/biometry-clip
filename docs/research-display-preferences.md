# 柱鏡顯示偏好

核對日期：2026-11-15（Asia/Taipei）。這是網站顯示控制的對應紀錄，不驗證公式結果或改寫屈光度資料。

## 已核對的控制

| 網站 | Plus | Minus | 值／控制 |
| --- | --- | --- | --- |
| [Barrett Toric](https://calc.apacrs.org/toric_calculator20/Toric%20Calculator.aspx) | `#MainContent_RadioButtonList2_0` | `#MainContent_RadioButtonList2_1` | 同名 native radio，值 `1`／`-1`；標籤 +ve Cylinder／-ve Cylinder |
| [Barrett True-K Toric](https://calc.apacrs.org/TrueKToricTK_preview/TrueKToricTK.aspx) | 同上 | 同上 | 同名 native radio，值 `1`／`-1`；標籤同上 |
| [Barrett Rx](https://calc.apacrs.org/barrett_rx105/) | 同上 | 同上 | 同名 native radio，值 `1`／`-1`；標籤 +ve Cyl／-ve Cyl |
| [TECNIS Toric](https://tecnistoriccalc.com/calculator/) | `#calculate-form #rccPlus` | `#calculate-form #rccMinus` | 主表單 radio，值 `Plus`／`Minus`；不操作另組 Preferences radio |

Barrett 三站由獨立 IAB 公開輸入頁讀取 AX 與目標控制 HTML，未接管使用者 Chrome、填入病人資料或按 Calculate。三站初始皆為 Plus；本輪僅核對欄位與控制，實際偏好變更由合成 DOM／背景程序回歸驗證。TECNIS 主表單及公開 JavaScript 另記於 [TECNIS 研究](research-tecnis.md)。

Barrett Rx 中 `refractionCylinder`／`refractionAxis` 屬輸入資料。擴充功能切換原站的顯示 radio 時，不自行轉正負、不加減 90 度，也不將此偏好寫入測量數據。合成測試確認原網站輸入值與共用資料保持不變；不宣稱原站計算結果已臨床驗證。

## TECNIS 的已知副作用

公開 `calculator.js` 的 `input[name='rcc']` change handler，在 `#results` 已有 `tr` 時會呼叫原站 `calculateResults()`。因此 profile 使用精確的 `requireNoResultsSelector: '#results > tr'` 與 `requireUniqueResultsContainer: '#results'`：已有結果列時不自動點切換，回傳 manual 與原因，仍允許明確的基本欄位搬移；空結果表可設定 Minus。若原站已是所需記法，回傳 already-selected 而不觸發 change。

## 尚未安全自動對應的入口

- EVO Toric 初始可操作輸入頁沒有可見的正／負柱鏡顯示控制，本輪沒有推測結果頁設定。
- ESCRS 新的公開分頁出現 Terms of Use，Kane 公開頁轉到使用條款；未代為同意，未取得其顯示偏好操作證據。
- Solver Toric 入口要求先完成球面計算與選 IOL Power。本輪沒有執行這些前置操作；先前表單研究記錄其 Residual cylinder notation 為自訂選單，不能當作已核對的 native select。

## 擴充契約與邊界

`settings.cylinderConvention` 與傳輸選項接受 `minus`（預設）、`plus`、`preserve`。Profile 使用 `displayPreferences.cylinderConvention` 描述已核對的 native radio／select，與量測欄位 `fields` 分開。inspect／read／preview 只回報狀態，不變更顯示或資料。

背景 quick fill 的順序為選眼及等待穩定、設定顯示、必要時重選眼、重新檢核工作副本版本、預覽與填入。顯示設定引起導頁時，不把舊文件的人工眼別確認沿用到新文件。未支援設定不阻擋一般填入；已宣告但隱藏、停用、不唯一或有已知副作用時記為 manual。網址或個案版本變更仍中止填入。

結果為 `displayPreference: {requested,value,status,changed,reason?}`，status 包含 `applied`、`already-selected`、`preserved`、`unsupported`、`manual`。這些狀態只表示控制對應結果，不代表運算結果通過。

## 相鄰的輸入單位與衍生值處理

TECNIS 另有 D／mm 的 K 輸入單位，不能與正／負柱鏡記法混為一談。Profile 以 `inputUnits.keratometry` 描述 native unit radio，以 `field.requiresKeratometryUnit: 'D'` 宣告 canonical D 欄位的前置狀態。inspect 回 `inputUnits.keratometry.value`（`D`／`mm`）；read 不切單位，也不把 mm 半徑當成 D 帶回。

背景貼上在選眼後執行 `prepare-input-units`。只有當眼 K1／K2 均為完整有限十進位、符合原站 20–80 D、K1≤K2，而且兩個目的欄位可填、長度／pattern 允許時，才以一次 native click 切 D，再重新偵測表單與顯示偏好。這個切換會由原站清空舊 K，隨後由本次已核對的成對來源填回；缺值、錯值或不可寫時保持原有 mm 與數值，其他欄位仍可貼入。

`field.readOnlyValue: true` 只用於已核對的原站衍生讀值，例如 TECNIS 的 steep-axis。這個旗標讓可見的 readonly 或 disabled 衍生值可被複製；所有非讀取動作都略過該欄位，即使原站日後啟用它也不寫入。其他 readonly 或 disabled 欄位維持原行為。擴充功能不自行由 flat-axis 推算 steep-axis。

TECNIS 的 `numericFormat.decimalEvidence` 以主表 K index 選項的唯一顯示文字 `1.3375` 核對小數點格式，直接讀取 option 文字，不依賴閉合選單內 option 的可見性。若為 `1,3375` 或無法核對，標記 `requiresDotDecimal` 的 AL、K1、K2、SIA 不讀寫，且不切換會清空 K 值的單位；其餘已核對欄位仍可處理。`emptyValues: ['-Select-']` 僅正規化明確宣告的原站空選項，並允許空白 K index 採用 1.3375 預設值。
