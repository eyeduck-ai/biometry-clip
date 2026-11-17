# ESCRS seven-formula constant observations

這是 Biometry-Clip 另行公開、可供其他專案查詢的**晶體常數觀察資料集**，不屬於病人個案資料，也不會因開啟查詢頁而自動貼入計算網站。

## 來源與範圍

- 來源：[ESCRS IOL Calculator](https://iolcalculator.escrs.org/) 的原站晶體選單與選型後預置參數。
- 觀察日期：**2026-11-15**；JSON 各列保留原始 `capturedAt`。此公開快照未重新查詢或更新原站數值。
- 來源選項 **645 列**：一般 465、Toric 180；每列七個參數位置，共 **4,515** 個位置。
- 已觀察到數值 4,363 個；原站空白 152 個；沒有待收集或未顯示欄位。617 列七欄有值，9 列部分空白，19 列七欄皆空。
- 獨立重新載入核對 28 列，包含全部 19 列七欄皆空來源；28/28 一致。此重查樣本不等於對所有列作第二次獨立核對。

數值是當時原站表單的預置值，**不保證反映今日原站或適用於任何特定臨床情況**。使用時應回原站核對晶體、公式及常數；不能把一種公式的常數直接套用到另一公式。

## 檔案與查詢

| 檔案 | 用途 |
| --- | --- |
| [escrs-formula-constants.json](escrs-formula-constants.json) | 含來源、七公式定義、逐列數值／狀態及覆蓋摘要的標準資料 |
| [escrs-formula-constants.csv](escrs-formula-constants.csv) | 每列晶體選項，每個公式各有值與狀態欄；UTF-8 BOM |
| [escrs-constants-lookup.html](escrs-constants-lookup.html) | 內嵌完整資料的獨立搜尋頁，可離線開啟；JSON／CSV 下載連結指向同資料夾 |
| [coverage.json](coverage.json) | 來源列、模式與參數狀態統計 |
| [verification-report.json](verification-report.json) | 28 列獨立重查的結果與來源追溯資訊 |
| [duplicate-labels.json](duplicate-labels.json) | 七組同名選項及參數差異，保留原始來源列 |

下載查詢頁及同資料夾 JSON／CSV 後，以瀏覽器開啟 HTML 即可使用，不需啟動擴充功能或網站伺服器。從專案根目錄也可執行：

```sh
node scripts/query-escrs-constants.mjs SN60WF
node scripts/query-escrs-constants.mjs "AC 205"
```

CLI 只讀取此公開快照；輸出包括來源網址、擷取時間與命中列。它不呼叫原站或更新常數。

## 格式與缺值

格式為 `biometry-escrs-formula-constants`、`schemaVersion: "1.0"`，保持既有協定名稱。[JSON Schema](../schemas/escrs-formula-constants-1.0.schema.json)。

七個 key 為 `barrettAConstant`、`cookeAConstant`、`evoAConstant`、`hillRbfAConstant`、`hofferPacd`、`kaneAConstant`、`pearlDgsAConstant`。Hoffer pACD 與 A constant 是不同參數；原站未標示的單位保留空字串。

每個參數保存原始字串 `rawValue` 或 `null`，另以 `status` 區分 `observed`、`blank`、`not-exposed`、`not-collected`。本快照只有前兩種狀態；原站空白沒有補零、推算或以其他晶體／公式代替。

來源列識別包含模式、廠商、`optionIndex` 及原始名稱。同名選項不去重，`optionIndex` 只是這次選單的位置，並非永久晶體型號 ID。Toric 列的 Cooke／Hill-RBF 值是在選擇 Toric 晶體後切回一般模式觀察，相關 metadata 保留在列內，**不代表原站提供這兩公式的 Toric 計算功能**。

## 公開整理與重建

六份檔案經欄位結構及交叉核對後，由完成的研究輸出整理：內容僅有晶體廠商／型號、站內常數、模式、時間及核對追溯資訊，沒有病人識別、測量、API 金鑰、原始截圖或瀏覽器 session。獨立頁內嵌資料與 JSON 對齊；CSV 與逐列狀態一致。

重查報告中的 `checkpoint` 是歷史來源名稱，不是隨附檔案的連結。原始研究目錄、checkpoint 與畫面證據未收入公開資料。歷史重建 scripts 需要那些本機研究輸入；一般使用者直接查詢本資料夾即可。[收集方法與防殘值驗證](../docs/research-escrs-constants-039.md)。
