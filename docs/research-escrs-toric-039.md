# ESCRS Toric 晶體的七公式預置參數

來源：[ESCRS IOL Calculator](https://iolcalculator.escrs.org/)，2026-11-15 獨立研究頁。使用者已批准該研究頁的使用條款；沒有填入病人資料或執行 Calculate。

Toric 模式實際顯示 Barrett、EVO、Hoffer pACD、Kane、Pearl DGS 五個參數控制。Cooke 與 Hill-RBF 的控制在此模式不顯示，但是選取晶體仍會填入它們的站內預置數值。透過正常切換回一般模式，可以讀到七個欄位。這不代表該網站提供 Cooke／Hill-RBF 的 Toric 計算功能。

為了排除前一款晶體的殘值，每一筆收集均依序：

1. 按原生 Reset，驗證廠商與晶體清空、晶體控制停用、七個公式欄位全部為空。
2. 選取原始廠商與 Toric 模式，再選取原始晶體選項。重複名稱保留來源清單的序號。
3. 確認晶體已正式選取，且五個可見參數穩定。
4. 以原生 Toric 開關切回一般模式，顯示全部七個參數；驗證前述五值完全一致，七值再次讀取穩定。
5. 保存原始數字字串或 `null`，不從其他公式推算，也不把同名／同系列的數值代入。

切回一般模式後，網站會清除已選 Toric 晶體名稱，但保留剛由該選項填入的七個參數。因此資料保留 `selectionContext: "toric"`、`revealedInMode: "non-toric"`、`sourceSelectionVerified: true`，以區分來源選型與讀值時的顯示模式。查詢時應使用來源列的廠商、模式與 `optionIndex`，不能由空白的最終晶體欄位反推來源。

例如 1stQ B1ZBY0 的 Cooke 預置值為 `118.6678`，其他多數 A constant 欄為 `118.8243`，pACD 為 `5.4111`；這些是逐欄觀察結果，不能只保存一個 A constant 後複製成七欄。1stQ A4FW00 與 A4HW0M 在全新表單首次選取時亦沒有提供預置值；空白是當下來源的真實狀態。

獨立 CLI 的實作在 [escrs-cli-toric-template.cjs](../scripts/escrs-cli-toric-template.cjs) 與 [run-escrs-toric-cli.py](../scripts/run-escrs-toric-cli.py)，使用正常 Playwright 控制與唯讀 DOM，不使用 CDP 或框架私有狀態。前期 CUA 收集的記錄使用原生 Clear 按鈕並驗證全空；只有顯示五欄的早期記錄會被完整七欄記錄取代，不將未顯示視為公式缺值。

原始續跑檔為 `artifacts/escrs-constants-039/toric-checkpoint.json` 與 `root-toric-checkpoint.json`；最終完成範圍以合併資料檔的 coverage 為準。

## 獨立重載驗證

前半段 89 個 Toric 來源列已完成：623 個參數位置中 601 個有值、22 個為來源空白，來源身分與主清單逐列一致。另以每筆先重新載入頁面、選取後延長等待至 2.5 秒的流程，重讀四款全空白晶體與兩個正向控制，六筆七欄皆與首次觀察完全一致。四款為 1stQ A4FW00、A4HW0M，Appasamy RIL，以及 Rayner Sulcoflex Toric；正向控制為 1stQ B1ZBY0 與 Alcon AcrySof SN6AT (2-9)。

- [前半段來源完整性檢查](../artifacts/escrs-constants-039/toric-early-integrity.json)
- [六筆重新載入原始觀察](../artifacts/escrs-constants-039/blank-verification-toric.json)
- [六筆逐欄比較結果](../artifacts/escrs-constants-039/toric-fresh-verification-report.json)

以下為同一次 B1ZBY0 驗證的原站畫面，病人與 biometry 均未輸入。

![Toric 模式下已選 B1ZBY0 與五個可見參數](../output/playwright/escrs-toric-selected-039.png)

![切回一般模式顯示七欄；Cooke 118.6678 與其他 A constant 118.8243 不同](../output/playwright/escrs-toric-seven-revealed-039.png)
