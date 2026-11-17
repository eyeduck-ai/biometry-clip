# v0.3.11 中英文與 LVC 選項

日期：2026-11-15（Asia/Taipei）。

介面預設 English，工作台與計算網站懸浮窗的標題右上角可切換繁體中文。選擇以獨立 biometryUiLanguage key 保存，使用 chrome.storage.local 事件同步開啟中的面板；不混入病人、測量、辨識設定或 JSON 匯出資料。

工作台就地更新文字與屬性，不重新建立表單或面板。懸浮窗只更新外框按鈕與內層介面，不改 iframe、src 或來源網站欄位。完整翻譯涵蓋五個分頁、說明、測量提示、偏好與辨識設定、PDF 選頁、晶體目錄操作及合成驗收頁。病人 ID／姓名、測量名稱、來源與晶體型號保留原文；輸入框數值、PDF 檔名與驗收證據 JSON 不翻譯。

LVC 選項收斂為 No LVC / Myopic / Hyperopic / RK，移除可選的「待確認」。空白工作副本顯示 No LVC；若歷史資料明確為 unknown 或未認得的類型，保留原值、四個按鈕均不選取，顯示來源類型未明的短說明。顯示與語言切換不把未知手術病史寫成 none。

## 驗證

npm run check：581 pass / 0 fail，正式 Vite 與 MV3 建置完成。新測試包括六項 DOM 語言引擎、五項實際 app 整合、四項真實翻譯字典回歸，以及 floating／storage／bootstrap／QA 的語言隔離與同步。新事件接入後，QA storage mock 補上真實的 oldValue/newValue 變更事件，原有 namespace／資料隔離檢查保留。

合成識別資料刻意使用「資料」「匯入」「設定」等與介面相同文字，確認不會被翻譯。切換前後驗證 input 節點、焦點、游標、尚未保存的欄位、設定草稿、開啟中的 details／dialog 及 session token／revision／臨床資料不變。語言同步不觸發計算或資料儲存。

獨立 Playwright 瀏覽器檢查英文五個分頁、中文偏好重開保留、工作台與實際浮窗外框。以本機 HTTP 合成 Chrome transport 模擬頁點擊原生浮窗右上角「中文」，觀察外框變 EN、內層各分頁與欄位同時切為中文。測試頁僅有 favicon 404，面板沒有執行錯誤。此操作未接管使用者 Chrome。

1280×850 工作台、360×503 與300×503內容區均檢查排版。360px 的 document scrollWidth = clientWidth =360，八個共用輸入框的最後底部381.39px，footer起點396px。300px document scrollWidth = clientWidth =300，左右眼按鈕及四個LVC選項文字完整顯示。

截圖與結構化結果見 artifacts/ui-preview-0.3.11.json。正式建置仍有既有 OCR/OpenCV browser externalization 和大檔提示，並未阻擋建置。本輪沒有重跑安裝版15個網站驗收，也沒有更新公式計算或ESCRS參數資料。

## 使用新版

在 chrome://extensions 重新載入 E:\code\biometry-clipboard\dist，再重新整理計算網站分頁。新版本首次預設英文；從標題右上角切換後，後續面板會沿用所選語言。安裝 ZIP 包含本機 OCR 模型，內容與 dist 一致並檢查 CRC。
