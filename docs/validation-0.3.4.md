# v0.3.4：使用者原生報告與修正

日期：2026-11-15（Asia/Taipei）。依據使用者提供的 `biometry-synthetic-qa-3a03434a-28e6-4a8b-85a5-9305f3a9868e.json`，不是代理在瀏覽器中執行的結果。附件視為測試資料，未將附件內容當成操作指令。

## 已取得的真正 Chrome 結果

使用者確認 v0.3.3 浮窗與原生驗收頁可正常開啟。原生報告涵蓋 14 個入口，8 站通過、6 站略過，8 項 session／病人／歷史測量檢查全數通過；`allPassed: false`。Toric 為 4 通過、3 待人工；LVC 為 4 通過、4 待人工。這些是 v0.3.3 結果，不能當成 v0.3.4 重測。

| 入口 | v0.3.3 報告 | 已逐欄寫入且讀回一致 | 尚未覆蓋／問題 |
| --- | --- | --- | --- |
| Barrett Universal II | 通過 | OD 11、OS 11、OU 18 | 無 Toric／LVC 宣稱 |
| Barrett True-K | 通過 | OD 14、OS 14、OU 24 | 僅本輪啟用的病史模式 |
| Barrett Toric | 通過 | OD 15、OS 15 | 初始 radio 均未選，OD 曾人工確認 |
| Barrett True-K Toric | 通過 | OD 18、OS 18 | 初始未選眼別，OD 曾人工確認 |
| Barrett Rx | 通過 | OD 26、OS 26 | 初始未選眼別；屬術後資料，不等同一般公式 |
| ESCRS | 略過 | OD 11 | OD 缺 Toric 欄位及未對應必填，舊 runner 未繼續 OS／OU |
| Cooke K6 | 略過 | OD 12 | Default 未出現 age／TK，舊 runner 未繼續 OS／OU |
| Kane | 略過 | OD 12 | K index 讀回不符，Toric 未啟用；未繼續 OS／OU |
| EVO | 通過 | 最後 OD 17、OS 17 | 舊版未對應 CCT；不能將此欄算成通過 |
| EVO Toric | 通過 | 最後 OD 23、OS 23 | 舊版未對應 CCT；前次病史欄位未啟用 |
| Solver Regular | 通過 | OD 9、OS 9、OU 17 | 自訂 IOL／儀器仍由使用者選擇 |
| Solver Complex | 略過 | OD 12 | LVC history 未啟用；未完成 OS |
| Solver Second Eye | 略過 | OD 16 | 尚有 1 組必要欄位與其他未對應必填；未完成 OS |
| Solver Toric | 略過 | 尚無 | 需要既有球面計算與 IOL Power 前置流程 |

結構化摘要：[validation-0.3.3-user-summary.json](../artifacts/validation-0.3.3-user-summary.json)。摘要只保留狀態、眼別和計數，不收錄識別文字。

## 已實作的修正

- **一般操作**：網站複製直接帶入所有已對應、非空數值；網站貼上直接填入，內部仍保留版本／網址／表單變動檢查。雙眼網站預設 OU，可明確改單眼。空白不清除原值，零值保留。識別資料可自行勾選；IOL 常數預設不貼，保留開關。
- **選眼與 postback**：公開 Barrett 原站確認初始 OD／OS 均未 checked，不能假定 OD。只對唯一、可操作且已核對的 native radio 自動選擇，等新文件及 checked 狀態穩定。選眼到貼上由背景服務接續，避免 ASP.NET 導頁銷毀浮窗後中斷。找不到可靠控制時仍要求明確眼別，不猜測。
- **雙眼驗收**：OD 缺少特殊欄位／其他必填時，記錄 partial 後繼續 OS、OU 基本欄位，再彙總未完成項目。這修正了舊 runner 只測 OD 的流程缺陷，沒有把缺項改成通過。
- **EVO CCT**：對應 `#txtCCT`。官方 DOM 沒有明示單位；使用者明確確認 µm（例如 543），因此預設 µm，設定可改 mm 或停用。內部與 JSON 一律保存 µm；mm 模式明確換算。不是從欄位長度猜測單位。
- **Kane K index**：針對此數值選單讀取實際數字選項文字，避免讀回網站內部代碼。來源空白時，只在目的欄位也空白且有相符選項時使用 1.3375；不覆蓋原站其他明確選擇。
- **Toric 複製**：從可見 Toric 控制或專用 Toric 入口成功讀回軸向／SIA 時保留 Toric 標記，避免轉到另一站後因旗標遺失而跳過散光欄位。不從一般 K1／K2 推定 Toric。
- **JSON**：版本化 case／library 交換格式含單位、OD／OS、多病人及多次測量。資料庫匯入為單次追加交易、重建 ID，不修改當前工作副本或原有紀錄；錯誤單位／未知版本／QA 報告拒絕匯入。見 [交換文件](interchange.md)。

## PDF／圖片與截圖

已確認舊程式每頁一律 raster＋OCR，失敗時頁面／畫布清理不完整，且 OCR 模型與 WASM sandbox 常駐。新流程先讀頁數及低解析縮圖，由使用者選頁；預設第一頁、每批最多 3 頁。優先解析本機文字層；資料不足時才 OCR，亦可選強制 OCR。影像長邊限制 1800、最多 250 萬像素、逐頁處理。成功、失敗、取消、逾時後釋放頁面、canvas、PDF worker、模型及 sandbox。

真正 PDF.js 合成文字 PDF 已驗證只讀第 2 頁，取得 OD／OS 與 CCT，未建立 canvas 或呼叫 OCR。合成掃描 PDF 已實際轉圖並目視確認：[影像](../artifacts/ocr-0.3.4/scanned-selected-page.png)。這不是本機模型推論或使用者原始 PDF 的 Chrome 崩潰重現；目前沒有那份 PDF，不能宣稱該次崩潰根因已證實。

「擷取畫面並辨識」是將目前可見網頁截圖後 OCR；不是 DOM 欄位複製，也不讀取整個頁面的文字。計算網站已有表單數字時，直接複製較合適。[Chrome captureVisibleTab](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-captureVisibleTab)；資源釋放依 [PDF.js cleanup](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFDocumentProxy.html#cleanup)。

## 本輪驗證範圍

完整測試／建置結果見 [check-0.3.4.log](../artifacts/check-0.3.4.log)。包含真正儲存服務＋合成 DOM 的單鍵雙眼流程、背景 postback 接續、欄位單位、JSON 原子匯入、PDF 選頁／文字層及清理回歸。

獨立 IAB 無法連接 Windows 本機預覽伺服器，本輪沒有 UI 截圖，未改用使用者 Chrome 接管。v0.3.4 尚未取得新的原生 14 站 JSON，所有新版修正仍需由原生驗收重測。v0.3.3 的 8 站實測與本機測試分開保留。
