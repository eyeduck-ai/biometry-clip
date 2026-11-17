# Optional recognition APIs

本機 **PP-OCRv6 Small** 是預設，不需 API 帳號。只有希望使用雲端辨識時，才需設定下列服務。設定頁的辨識模型區也可展開簡要申請說明。官方申請連結於 2026-11-17 核對；供應商畫面、模型、配額與費用可能改變。

## Gemini

1. 登入 [Google AI Studio API Keys](https://aistudio.google.com/api-keys)。首次使用請完成平台要求的帳戶與條款步驟。
2. 建立新專案的 API key；若已有 Google Cloud 專案，可先在 AI Studio 的 Projects 匯入，再為該專案建立金鑰。詳見[官方 API key 說明](https://aistudio.google.com/docs/api-key)。
3. 確認專案可使用所選模型，並查看配額與計費狀態，複製金鑰。
4. 在 Biometry-Clip 的 Settings → recognition 選 Gemini，貼上 API key、選模型並儲存。

擴充功能目前提供：

| 選項 | 模型識別 |
| --- | --- |
| Gemini 3.5 Flash-Lite（預設） | `gemini-3.5-flash-lite` |
| Gemini 3.1 Flash-Lite | `gemini-3.1-flash-lite` |
| Gemini 3.6 Flash | `gemini-3.6-flash` |

這是目前程式的模型清單；帳戶／地區／專案是否有權限使用，應以供應商回應為準。API 配額、免費資格與是否需啟用計費取決於帳戶及專案，並非保證免費。

## 官方 PaddleOCR API

1. 登入 [PaddleOCR AI Studio 服務](https://aistudio.baidu.com/paddleocr)。
2. 開啟 [AI Studio Access Token](https://aistudio.baidu.com/account/accessToken) 頁面，取得 Token。這裡使用 **AI Studio Access Token**，不是百度智慧雲的 API Key／Secret Key 配對。
3. 依帳戶提示啟用服務，確認可用配額與計費，再複製 Token。[官方服務說明](https://www.paddleocr.ai/latest/en/version3.x/inference_deployment/serving/paddleocr_official_api/overview.html)。
4. 在擴充功能選 PaddleOCR API，貼上 Token、選 **PP-OCRv6** 並儲存，不需填網址。

模型選項為 `PP-OCRv6`（預設）、`PP-OCRv5-latin` 與 `PP-OCRv5`。可用性、啟用要求、配額及費用依帳戶與服務當時規則而定。

官方模式透過託管工作上傳圖片、等待處理並讀取結果。既有自訂 `/ocr` 服務仍可在進階設定使用，此時才需服務網址與該服務要求的認證；一般官方 API 使用者不用設定這些網址。

## 資料傳送與儲存

- 金鑰／Token 存在目前 Chrome profile 的擴充功能本機儲存空間，**沒有加密**，不會放入個案或病人資料庫 JSON。
- 選擇雲端 provider 不代表立即上傳。原生 PDF 能直接讀出文字時仍在本機解析；真正需要雲端圖像辨識前會顯示上傳確認，並依需要請求網站存取權限。
- 雲端請求會將選定、需辨識的圖片／PDF 頁面影像送至該供應商；來源可能含有報告上的個人資訊，請在確認時核對要傳送的內容。
- 保留本機模式即可避免雲端辨識請求；模型需先隨發佈包提供，或由開發者完成 vendor 步驟。

## 常見問題

| 現象 | 檢查方式 |
| --- | --- |
| 金鑰／Token 無效 | 確認服務種類、複製完整內容、帳戶與專案；不要把密鑰貼入問題回報 |
| 模型不存在／無權限 | 改選帳戶可用的模型，核對供應商模型清單與地區限制 |
| 配額或計費錯誤 | 在供應商平台查看該帳戶／專案的配額、啟用狀態與計費 |
| 沒有發生雲端請求 | 可能已成功使用原生 PDF 文字；這是預期路由 |
| 官方 Paddle 設定要求網址 | 確認未切到進階自訂服務模式 |

請勿把金鑰、Token 或原始病人報告提交到 GitHub。回報可提供 provider、模型、去識別化錯誤訊息與合成範例。
