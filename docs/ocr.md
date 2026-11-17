# OCR 架構與設定

研究日期：2026-11-14；v0.3.12 修正驗證：2026-11-15。

## 本機預設：PP-OCRv6 small / tiny

使用官方 `@paddleocr/paddleocr-js@0.4.2`。`v6` 是模型世代；官方 npm 套件名稱不是 `paddleocrv6.js`。tiny 和 small 的模型名稱分別是 `PP-OCRv6_tiny_det/rec`、`PP-OCRv6_small_det/rec`。

先安裝依賴，再執行：

```sh
npm run vendor:ocr
npm run build
```

`scripts/vendor-ocr.mjs` 從官方 Paddle 模型來源下載四個未壓縮 `.tar`，把 ONNX Runtime WASM 複製到 `public/vendor-ocr`，產生含來源、大小與 SHA-256 的 `models.json`。下載只發生於建置準備階段；執行時 SDK、OpenCV、WASM 與模型皆來自擴充功能套件。small 是預設；tiny 可在設定切換，適合偏重速度的情境。與另一個 Python 專案的 ONNX 匯出檔 SHA-256 不同，不能宣稱位元相同；本套件官方 tar 的 inference.yml 確認為 PP-OCRv6_small_det／rec，實測與模型來源雜湊另存 artifacts/ocr-0312/model-verification.json。

ONNX Runtime 同時封裝 plain 與 JSEP 的 `.mjs` / `.wasm` 配對。SDK 使用預設 `onnxruntime-web` 匯入，安裝的 runtime 即使選 `backend: "wasm"` 也可能載入 JSEP loader；兩個檔案必須來自相同版本，不能只提供 plain WASM。

OpenCV 的 Emscripten binding 內含 `new Function`，因此本機推論在 `src/ocr/sandbox.html` 隔離 iframe 執行。此頁必須列在 manifest `sandbox.pages`。只有 sandbox CSP 允許 `unsafe-eval`；主面板不可加入此權限。sandbox 沒有 Chrome extension API，訊息會核對父視窗、來源及每次建立的隨機 channel。API key 不會傳入 sandbox。v0.3.12 另在隔離 sandbox 的 connect-src 加入 data:，供 SDK 載入內嵌 OpenCV WASM；不增加主頁 script／worker 權限，也不允許 sandbox 的外部網路連線。

v0.3.1：主面板的 `worker-src` 為 `'self'`，不包含 `blob:`。PDF 讀取會直接建立封裝內的 module worker，透過 `PDFWorker` 的 port 傳給文件載入程序，並在完成或失敗時釋放文件與 worker。不能只設定 PDF.js `workerSrc`：目前版本會將 `chrome-extension:` 的 opaque URL origin 誤判為跨來源，進而建立不符合 MV3 CSP 的 blob wrapper。PaddleOCR 使用 `worker:false`，ORT 使用 `numThreads:1`、`proxy:false`，不需要放寬 worker CSP。

模型與 WASM 的允許路徑由 sandbox HTML 的封裝位置推導，必須精確等於同套件的 `vendor-ocr/`。不使用 `URL.origin` 判斷 extension 套件：自訂 `chrome-extension:` scheme 在部分 URL 實作會回傳 `null`。靜態資源經 manifest 的 `web_accessible_resources` 提供給 opaque sandbox；此清單只包含程式與模型，不包含病例或 API key。

執行使用 WASM、單執行緒，避免 side panel 依賴 SharedArrayBuffer 或 cross-origin isolation。本機辨識不傳送圖片到網路。

## Gemini 與 PaddleOCR 官方 API

v0.3.12 預設 Gemini 3.5 Flash-Lite，可選3.1 Flash-Lite／3.6 Flash；Paddle 預設 PP-OCRv6。一般設定只需 API key／AI Studio Access Token 與模型，不需網址。官方 hosted jobs 協定、權限與兩張去識別代表頁實測見 [雲端設定及實測](ocr-cloud-0312.md)。自架 basic OCR /ocr 接頭保留於進階區，舊網址設定會遷移成 custom mode。

雲端確認只會在真正需要傳送影像時出現；可直接解析的文字 PDF 不傳送到雲端。設定或頁面預覽不會執行辨識或上傳。

## 圖片、PDF、解析與人工確認

- 支援 PNG / JPEG / WebP、目前頁面截圖及 PDF。圖片先本機解碼並重新編碼，移除原始檔 metadata。
- PDF 使用本機 `pdfjs-dist` 與打包的 PDF worker，逐頁轉為影像，再由選定 OCR 辨識。每個檔案最多 25 MB；單次最多 10 個檔案；每份 PDF 最多 10 頁；單張影像最多 2,500 萬像素。
- 對有明確 `OD` / `OS` 標記的單眼段落，以及 `OD OS` 或 `OS OD` 欄頭的雙眼表格做保守解析。OCR bounding boxes 先按行與水平位置重建文字。不能判定眼別、數字有歧義、兩頁數值衝突時留空並顯示提示。
- 核心欄位：AL、ACD、LT、CCT、WTW、K1/K2、各 K axis、TK1/TK2、target、SIA、incision axis。CCT 僅在明示 `mm` 時轉換成 µm；不推算缺失的軸位、不把 TK 代換成 K。
- 候選值只提供給面板的人工確認流程；`recognizeFiles` / `recognizeImage` 不直接寫網站或病例。從 Gemini 取得的欄位也經 allowlist，所有值仍須面板的單位與範圍驗證。
- 不同儀器報告的任意版型尚未全面驗證；可檢視原始文字、修正眼別標記後重解析，或手動輸入。

PDF worker 直接以打包的 `pdf.worker.min.mjs?url` 建立 module `Worker`，再把該 port 傳給每份文件自己的 `PDFWorker`，不經 PDF.js 會產生 `blob:` wrapper 的 `workerSrc` 便利路徑，也不修改全域 `workerPort`。另外明確設定 `disableWorkerRendering: true`，不啟動額外 canvas renderer worker。主擴充功能只需 `worker-src 'self'`；處理結束或失敗會釋放文件 task、PDFWorker 並終止 native Worker。PaddleOCR 設為 `worker: false`，ONNX Runtime 設為 `numThreads: 1`、`proxy: false`，不需 blob worker。

## v0.3.12 實際報告修正

辨識模型仍為封裝內官方 PP-OCRv6 Small，不更換權重、不依賴 Python 服務。原本把文字座標攤平成行，無法正確處理 IOLMaster 雙眼區域、重複標籤與 SD／多個數字；目前保留 PDF.js／OCR 座標，用明確眼別與欄位標籤取得摘要值，排除各次量測明細與 IOL 計算表。支援列內標準差、K 軸向、半徑與 D 分欄。未知、缺眼別、衝突與未量測 TK 不補值。

realpdf.pdf 第6頁直接 PDF.js 與強制 Small OCR、photo.pdf 第2頁 Small OCR，三組支援的18個量測值皆與既有人工核對答案一致；參考答案僅用於評分。文字檔8頁逐頁均不需 OCR。掃描檔7頁沒有文字層，選頁後自動走本機模型。這是兩份指定樣本與代表頁驗證，沒有宣稱所有頁面或所有報告版型達同樣準確率。

選頁改為每頁可見縮圖、每組12頁，逐頁低解析載入、點選與放大。每批仍最多辨識3頁；縮圖與OCR的canvas及worker分開釋放。維持原1800px／2.5MP辨識上限，沒有為修解析而全面提高記憶體負擔。

數量與正確性紀錄：artifacts/ocr-0312/layout-comparison.json、artifacts/ocr-native-pdf-pages-0312.json。原始樣本／模型文字與金鑰不在發佈包中。

## 先前合成瀏覽器檢查

2026-11-14 在 Chrome 的本機 Vite 測試頁執行了合成雙眼報告影像，經過實際 sandbox、OpenCV 與 ONNX Runtime WASM 推論：

- **PNG / small**：正確抽取預期 14 個測量值（每眼 AL、ACD、LT、CCT、WTW、K1、K2）。
- **PNG / tiny**：本機推論成功，但把 `OS` 讀成 `0S`。解析器因此無法確定雙眼欄頭，保留數值空白。使用者須對照原圖，將辨識文字中的 `0S` 明確修正為 `OS` 後重新解析，才產生候選值；程式不自行把數字零推定成英文字母 O。

基於這次合成樣本檢查，把預設調整為 small。這不代表已驗證所有 biometer 報告版型、實際病例或 Chrome extension 安裝狀態；目前影像合成樣本與 `/src/ocr/smoke.html` 留在原始碼供重現，測試頁不是發布版入口。PDF 的 small／tiny 按鈕同樣呼叫正式逐頁渲染與 OCR pipeline，執行結果另外核對。

## 程式介面

`recognizeFiles(files, settings, onProgress)` 與 `recognizeImage(dataUrl, settings, onProgress)` 回傳 `{ text, candidates, warnings }`。`candidates` 為 `{ patient, eyes: { OD, OS }, warnings }`，不存在的欄位不加入物件。`parseBiometry(text)` 可獨立重新解析已修正的文字。

## 主要來源

- [官方 PaddleOCR.js README 與模型設定](https://github.com/PaddlePaddle/PaddleOCR/blob/main/paddleocr-js/packages/core/README.md)
- [官方 SDK model assets](https://github.com/PaddlePaddle/PaddleOCR/tree/main/paddleocr-js/packages/core/src/resources)
- [官方 basic OCR HTTP serving 協定](https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/pipeline_usage/OCR.en.md)
- [官方 PP-OCR demo token 授權範例](https://huggingface.co/spaces/PaddlePaddle/PP-OCRv5_Online_Demo/blob/66403e65d0942ffe67f1c5ef00611f6d81836ab4/app.py)
- [Chrome sandbox 與 eval](https://developer.chrome.com/docs/extensions/how-to/security/sandboxing-eval)
- [Gemini generateContent API](https://ai.google.dev/api/generate-content)
- [Gemini 模型清單](https://ai.google.dev/gemini-api/docs/models)
- [Gemini 模型停用及遷移公告](https://ai.google.dev/gemini-api/docs/deprecations)
