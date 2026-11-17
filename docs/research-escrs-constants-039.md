# ESCRS 晶體七公式預置參數資料

此資料與跨站晶體型號目錄分開保存，供後續查詢及其他專案交換使用。來源是 [ESCRS IOL Calculator](https://iolcalculator.escrs.org/) 的實際輸入表單；沒有以其他公式的數值推算、換算或補值。

依據 [ESCRS FAQs](https://iolcalculator.escrs.org/faqs)，原站優先採用公式作者指定的晶體常數；未指定時使用 IOLCon 的優化值或廠商／ULIB 建議值。因此七個欄位各自保存，不能把同款晶體的一個 A constant 當成所有公式共用的數值。此研究收集的是當下表單的預置值，沒有把數值相同推定為來源相同。

## 查詢及交換檔

- [公開資料集說明](../data/README.md)
- [七公式 JSON](../data/escrs-formula-constants.json)
- [CSV](../data/escrs-formula-constants.csv)
- [可搜尋查詢頁](../data/escrs-constants-lookup.html)
- [覆蓋統計](../data/coverage.json)
- [獨立頁面重查報告](../data/verification-report.json)
- [同名選項差異](../data/duplicate-labels.json)
- [JSON Schema 1.0](../schemas/escrs-formula-constants-1.0.schema.json)

來源目錄有 645 個選項列，一般 465、Toric 180。每一列保留廠商、模式、原始選單序號 `optionIndex`（由零起算）及原始名稱，再以七個固定參數 key 保存狀態：

2026-11-15 已完成 **645／645 個來源列、4,515 個參數位置**的實際核對：4,363 個位置有原站數值、152 個位置為原站空白，待收集及未顯示欄位均為零。617 列七欄皆有值，9 列有部分空白，19 列七欄皆空白；空白沒有用別款或別公式補值。獨立重新載入重查為 **28／28 完全一致**，包括全部 19 列七欄皆空的來源，沒有未完成的空白重查或數值衝突。

| Key | 原始欄位 |
| --- | --- |
| `barrettAConstant` | Barrett A-Constant |
| `cookeAConstant` | Cooke A-Constant |
| `evoAConstant` | EVO A-Constant |
| `hillRbfAConstant` | Hill-RBF A-Constant |
| `hofferPacd` | Hoffer® pACD |
| `kaneAConstant` | Kane A-Constant |
| `pearlDgsAConstant` | Pearl DGS A-Constant |

每個參數的 `rawValue` 保留原始數值字串或 `null`；狀態另外保存為 `observed`、`blank`、`not-exposed` 或 `not-collected`。`blank` 表示在清空前一款資料後，原站沒有填回此欄；`not-collected` 表示尚未完成該來源列，兩者不混用。原站未在欄位顯示單位時，`unit` 保留空字串。Hoffer pACD 與 A constant 是不同參數。

同名來源列沒有去重。名稱、大小寫、正負度數及包裝後綴都保留，例如 `AR40e`／`AR40E` 的 pACD 分別為 5.39／5.41。`optionIndex` 是此擷取版本中的原站選項位置，不能當成廠商的永久型號 ID。

共有七組同名選項、十四個來源列。五組一般晶體的七參數均有差異：Ophtec AC 205 的兩列分別是六個 A constant 115.7／pACD 3.62，以及六個 A constant 116.9／pACD 4.34；SIFI 三組 MINI 4 變體則各有一列七欄皆空。兩組 Teleon Toric 同名選項的七參數當下相同，也保留兩列，不因數值相同而合併型號。

## 實際收集及防殘值驗證

收集在獨立研究瀏覽器進行，沒有接管使用者 Chrome，也沒有輸入病人資訊或執行計算。ESCRS 條款依使用者先前對此網站研究頁的明確同意正常接受。

每次選型前，先透過原生 Clear 按鈕或原站 Reset 清空，並實際讀回檢查空白狀態。後續批次以原站 Reset 為主，要求廠商及型號為空、型號輸入框停用，七個公式欄位均為 `null`；未符合就不保存該筆。再以正常的廠商及晶體選單選取，等待原站接受選項及參數穩定後讀取。自動化僅使用可見 UI 操作及 DOM 讀值，沒有查詢 Blazor 私有狀態或使用 raw CDP。

研究中確認兩種不能採用的捷徑：

- 對數字輸入框單純 `fill('')` 可改變 DOM 的顯示值，卻沒有清除 Blazor 綁定的舊值，因此不作為已清空的證據。
- 直接從一款切換到另一款可能留下前款的 Hoffer pACD。例如 Alcon PMMA MTA3U0／MTA4U0 原站只填回 Hill-RBF 115.54，未先清空時卻可能顯示前款的 5.67 或 5.6274。正式查詢資料保留 pACD `null`，未使用這些殘留值。

每筆在完成 UI 驗證後保存 checkpoint，並以廠商、模式、原始序號及名稱核對來源。斷線、未接受選項或數值仍變動時停止該批次，已驗證資料保留。

另以獨立頁面重新載入的方式檢查 28 列：全部 19 列七欄皆空的來源，以及 SN60WF、PMMA、AR40e／AR40E、兩個 AC 205 及 Toric 的公式差異樣本。每筆等待原站接受選型後至少 2.5 秒，再逐欄比較原始字串／`null`，28 列均完全一致。重查沒有補造原站缺值。原研究截圖保留於本機研究輸出，例如 PMMA MTA3U0、AC 205 第一列與第二列；不隨公開資料集附送。

## Toric 列的七參數觀察方式

ESCRS 的 Toric 輸入畫面直接顯示 Barrett、EVO、Hoffer pACD、Kane、Pearl DGS 五個參數，Cooke 及 Hill-RBF 兩欄在此模式不顯示。

收集完整七欄時，先在一般模式驗證七欄全空，再開啟 Toric 並選取 Toric 晶體。記下已接受型號與五個可見參數後，使用原站開關切回一般模式，讀取重新顯示的七欄。只有前後五個可見參數完全一致、廠商一致且七欄穩定時，才保存額外兩欄，並附上 `selectionContext: "toric"`、`revealedInMode: "non-toric"`、`sourceSelectionVerified: true`。切回一般模式會清空型號文字，但沒有把五個已觀察到的值換成別款晶體。

例如 1stQ B1ZBY0 的 Cooke 為 118.6678，其他多個 A constant 是 118.8243，這兩者按原始數值分開保存。這些是 ESCRS 在選取該 Toric 晶體時填入的預置值，**不表示 ESCRS 提供 Cooke／Hill-RBF 的 Toric 計算功能**；資料中的 Toric 是晶體選單來源模式。

Toric 模式五欄與切回一般模式七欄的對照畫面保留於本機研究輸出；公開 JSON 以每列的選型與顯示模式 metadata 記錄此過程。

## 重建與查詢

一般查詢不需要研究輸入。下載 `data` 內的查詢頁、JSON、CSV 後，可直接開啟 `escrs-constants-lookup.html` 離線搜尋，或在專案根目錄執行：

```sh
node scripts/query-escrs-constants.mjs SN60WF
```

CLI 直接讀取公開的 `data/escrs-formula-constants.json`。查詢頁以來源、廠商、型號、模式及參數狀態篩選，不會自動把這些常數貼入計算網站。

以下是歷史重建流程，**需要本機研究輸入，不是全新 clone 後可直接執行的下載／蒐集指令**：

- `node scripts/build-escrs-constants.mjs` 需要原始 `escrs-master.json` 與已驗證 checkpoint，從忽略的 `artifacts` 研究目錄整合。它拒絕名稱／序號不符、七欄長度不符、無效數值或同來源衝突。舊的未清空紀錄不納入；`coverage.complete` 只有在全部來源列的七欄均已檢查時成立，原站真實空白仍可完成檢查。
- `node scripts/build-escrs-query.mjs` 讀取研究目錄內的 JSON，將獨立查詢頁及統計寫回該目錄。它不是公開 `data` 快照的自動更新指令。

公開的六份資料檔由完成研究輸出另行整理，僅包含晶體選項、公式預置參數與核對資訊，未包含病人資料。獨立查詢頁內嵌資料已與公開 JSON 對齊；原始研究 checkpoint 不在公開快照內。
