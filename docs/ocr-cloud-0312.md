# v0.3.12 雲端模型設定與實測

查核與測試日期：2026-11-15。

一般使用只需選辨識服務、貼上 key 並選模型。儲存設定不會上傳報告，沿用每次辨識前的雲端傳送確認。

- Gemini 下拉選單：`gemini-3.5-flash-lite`（預設）、`gemini-3.1-flash-lite`、`gemini-3.6-flash`。前兩者使用較少推理的 `minimal` 設定；3.6 亦支援此設定。舊版已保存的其他模型 ID 保留，不會被自動替換。移除新版不建議傳送的 sampling 設定，限制輸出至8192 tokens。
- PaddleOCR 下拉選單：`PP-OCRv6`（預設）、`PP-OCRv5-latin`、`PP-OCRv5`。Key 欄為 AI Studio Access Token；官方服務網址已內建。
- 自架 Paddle basic `/ocr` 服務保留在收合的進階區，既有自架網址會遷移為 custom 模式。一般使用不必填任何網址。

先前 Paddle 接頭只實作自架 `/ocr` JSON 協定，因此 AI Studio token 無法只靠貼上金鑰使用。新版補上官方 hosted jobs 協定：單次 multipart 上傳、限時查詢工作、下載 JSONL 結果。上傳不重試，避免建立重複工作。OCR 文字座標與分數保留，接入與本機相同的版面解析器。

連線權限只要求所選服務及官方結果儲存網域。結果只接受 HTTPS 的 `bcebos.com`、`baidubce.com`、`aistudio-app.com` 主網域及子網域，禁止帳密、非標準埠及跳轉。下載結果不附帶 Authorization；錯誤訊息不回顯服務內容、網址或 token。

## 代表頁實測

使用使用者提供 PDF 對應的既有去識別影像：結構 PDF 原第6頁、掃描 PDF 原第2頁。兩張影像均在本輪逐一視覺檢查，確認身份、日期、操作者及眼部照片已遮蔽；以 manifest 核對影像 SHA-256 與原 PDF SHA-256，未修改數值區。每模型每頁一個工作，總共4個推論工作，沒有自動重試。

| 模型 | 結構 PDF 第6頁 | 掃描 PDF 第2頁 |
| --- | --- | --- |
| Gemini 3.5 Flash-Lite | 18/18；19.38秒 | 18/18；19.04秒 |
| PaddleOCR API PP-OCRv6 | 18/18；19.00秒 | 18/18；25.24秒 |

18項為每眼 AL、ACD、LT、CCT、WTW、K1、K1 axis、K2、K2 axis，依原專案既有人工答案比對。各頁另有8個明示未量測的 TK 度數／軸向，四次結果均正確保留空白。Gemini 實際回傳模型為 `gemini-3.5-flash-lite`，總 tokens 分別2936與2187；Paddle 回傳186與123個文字區塊。

這是兩張代表量測頁及目前共同欄位的比較，不是全檔、全部欄位或所有報告版型的準確率；遮蔽的識別欄位不評分。未查帳單，沒有宣稱實際費用為零。測試呼叫正式 JavaScript cloud 接頭；不是只呼叫另一個 Python 專案。

可重現腳本：`scripts/cloud-sample-validation-0312.mjs`，`--preflight`只做本機檔案來源驗證。真正執行會使用原提供的金鑰檔、傳送上述去識別影像；每次執行最多4個工作。結果 `artifacts/ocr-0312/cloud-validation.json`僅包含樣本雜湊、欄位對錯布林、數量、時間、模型及 tokens，不保存原始回應、報告文字、臨床數值或金鑰。圖片、金鑰與私有人工答案不納入 extension 發佈檔。

新增7項雲端測試，涵蓋實際 hosted 協定、單次上傳、結果網址與無授權下載、取消、參數預設、錯誤不洩漏及簡化設定 UI。與原有 platform／OCR 測試合計59項通過。

## 官方來源

- [Gemini 3.5 Flash-Lite](https://aistudio.google.com/docs/models/gemini-3.5-flash-lite)、[3.1 Flash-Lite](https://aistudio.google.com/docs/models/gemini-3.1-flash-lite)、[3.6 Flash](https://aistudio.google.com/docs/models/gemini-3.6-flash)
- [Gemini thinking 設定](https://ai.google.dev/gemini-api/docs/generate-content/thinking)
- [PaddleOCR TypeScript 官方 API SDK與模型](https://github.com/PaddlePaddle/PaddleOCR/blob/main/api_sdk/typescript/README.md)、[官方 HTTP 實作](https://github.com/PaddlePaddle/PaddleOCR/blob/main/paddleocr/_api_client/_http.py)
