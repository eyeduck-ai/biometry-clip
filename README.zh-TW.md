# Biometry-Clip

只輸入一次眼部生物測量資料，再帶入不同人工水晶體計算網站。Chrome 擴充功能提供精簡懸浮窗、多病人／多次測量管理，以及本機 PDF／圖像辨識。

[English](README.md) · [使用說明](docs/user-guide.md) · [15 個支援網站](docs/supported-sites.md) · [API 申請設定](docs/api-setup.md) · [開發說明](docs/development.md)

## 安裝

需要 **Chrome 140 以上版本**。

1. 將發佈 ZIP 解壓至固定資料夾，確認內有 `manifest.json`。
2. 開啟 `chrome://extensions`，啟用「開發人員模式」，選「載入未封裝項目」。
3. 選擇解壓資料夾，並將 **Biometry-Clip** 固定在工具列。
4. 開啟[支援網站](docs/supported-sites.md)，點擊擴充功能圖示。

從原始碼建置時，選擇產生的 `dist` 資料夾。更新時維持相同安裝路徑，重新載入擴充功能，再重新整理計算網站分頁。移動未封裝資料夾可能改變擴充功能的 Chrome 識別與本機資料歸屬。

## 操作概覽

- **資料：**在計算網站使用可拖曳、縮放的懸浮窗；其他頁面點擊圖示則開啟較寬工作台。手動輸入或直接複製網站已填資料，必填欄位隨目前網站調整。
- **OD／OS：**上方分頁決定正在編輯哪一眼；Toric、KC、LVC 是該眼的條件。貼入範圍另外選 OD、OS 或 OD+OS；只有偵測到雙眼獨立表單的網站才提供同時貼入。
- **病人：**保存多位病人與多次測量；可載入、編輯、複製及刪除。工作草稿與已保存測量分開，修改草稿不會直接覆寫歷史。
- **匯入**可複製網站資料、貼上截圖、上傳 PDF／圖片，或貼上／上傳 Biometry-Clip 和 biometry-parser 的 JSON。核對後再選擇要帶入的欄位。
- **入口：**依用途分類開啟公式網站；手動開啟的網站分頁也能使用。
- **設定：**偏好參數與辨識模型分區。介面預設英文，標題右上角按鈕可切換繁體中文。

貼入只填寫對應欄位，仍由使用者在原網站執行計算。晶體有明確、受支援的對照時可以跨站帶入；各站 IOL 常數預設不貼入。

## PDF／圖片辨識

PDF 先顯示每頁縮圖，**每批最多選三頁**。程式先讀原生文字與座標；影像型或文字不足的頁面自動交給 OCR。預設是隨擴充功能打包、可離線執行的 **PP-OCRv6 Small**，也可選 Tiny。

辨識過程顯示處理階段與經過時間。核對頁提供來源影像及 OD／OS 欄位；實際 OCR 信心分數低於 **85%** 的欄位以暗紅色提示。原生 PDF 或沒有提供分數的模型不會產生假信心分數。

主要測試報告為 **ZEISS IOLMaster 700**：一份原生文字 PDF、一份掃描 PDF。已在實際載入擴充功能的環境，比對代表頁面的 18 項共同數值，結果為 18/18；這不是所有報告、儀器或影像品質的普遍準確率。Argos 已支援部分網站的測量儀器偏好，尚未作為 OCR 報告種類獨立驗證。[測試範圍](docs/user-guide.md#report-types-and-validation)與[驗證紀錄](docs/validation-evidence.md#iolmaster-700-report-checks)。

## 儲存與雲端選項

工作草稿保存在 Chrome session storage；病人資料庫、設定與 API 金鑰保存在擴充功能本機儲存空間，**沒有加密**。本機 OCR 不需雲端帳號。Gemini 與官方 PaddleOCR API 為選配，正常設定只需金鑰／Token 與模型選項，設定頁可展開申請說明。真正送出雲端圖像請求前才會確認上傳；選了雲端服務也不會把可直接解析的原生 PDF 自動上傳。

個案與病人資料庫使用 `biometry-clipboard` **1.3**，含報告摘要時使用 **1.4**，可匯入 1.0–1.4。單筆量測可另匯出為 Python kit 可讀的 JSON。[備份格式](docs/interchange.md) · [biometry-parser 交換方式](docs/parser-exchange.md)

## 從原始碼建置

需要 Node.js **22.13 以上**，開發環境已使用 Node.js 24 與 npm 驗證；首次下載套件及模型需要網路。

```sh
npm ci
npm run vendor:ocr
npm run check
```

完成後在 Chrome 載入 `dist`。`npm run dev` 僅啟動開發介面，不會安裝擴充功能。完整流程及架構請見[開發說明](docs/development.md)與 [v0.4.0 架構檢視](docs/architecture-review-0.4.0.md)。其餘文件見[文件索引](docs/README.md)。

另提供 [ESCRS 七公式晶體常數資料集](data/README.md)：645 個原站晶體選項的 JSON、CSV 與離線查詢頁。它保留各公式觀察值，不把單一常數視為通用值。

GitHub：[eyeduck-ai/biometry-clip](https://github.com/eyeduck-ai/biometry-clip)。
