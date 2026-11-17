# v0.3.13 匯入核對與眼別分頁

日期：2026-11-15（Asia/Taipei）。

## 介面變更

OD／OS是決定下方測量內容的獨立頂部分頁，使用tablist、aria-selected、tabpanel與roving tabindex，支援ArrowLeft／ArrowRight／Home／End；切換保留左右眼各自數值。Toric、KC與LVC位於下一層條件區，Toric／KC維持獨立toggle語意，四種LVC選擇互斥。

可見文字移除Right／Left，Keratoconus縮寫KC但保留完整tooltip／無障礙名稱。Toric與KC依內容寬度，LVC標籤12px、選項至少11px、輸入12px。360px時條件同列、300px時換行；兩種語言及未知LVC註記都不水平溢位。360×503下第八個常用欄位底部386.39px，footer起點396px。

匯入處理有實際階段、分秒與原生不定進度條，不推算模型百分比。辨識計時在選頁後重新開始，雲端確認期間暫停；取消、失敗、完成或pagehide均停止interval。讀屏訊息更新階段，不每秒反覆朗讀計時。減少動態效果偏好會停用進度條動畫。

核對畫面沿用資料頁的欄位、單位與輸入樣式：來源影像在左、OD／OS在右並排。窄版先顯示雙眼值，來源影像以details收合，需要時可展開；點欄位來源按鈕可開啟原頁。來源選單、縮放、編輯及語言切換都不重建候選輸入節點或勾選。已有值的欄位保留原有不預選覆蓋規則。

PDF來源預覽每次只解碼一頁，最大1400px／1.5MP；圖片亦建立有界預覽。換頁、重新核對、關閉、個案切換與pagehide會取消過期載入並釋放URL／worker／bitmap／canvas。來源檔、影像與confidence僅供本次review，cleanCase及明確欄位patch不把這些資料寫入病例或JSON匯出。

## 信心分數

欄位分數取自實際參與該欄位的OCR標籤、數值與眼別標記，採最低有效分數；獨立的SD或另一眼區塊不混入。軸向保留自己的分數與來源。多頁一致值合併保留來源，矛盾值移除時對應evidence／confidence也移除。原生PDF與未提供分數的VLM保持未知。

低於0.85的欄位使用暗紅邊框、淡紅底、警示與百分比，不將OCR低信心誤當作輸入格式錯誤。高於門檻的分數在窄版隱藏以減少干擾，低分仍可見。全域「文字區塊低信心」訊息不會使所有量測欄位標紅。

## 驗證

npm run check：639 pass／0 fail，Vite與Chrome MV3建置完成。測試涵蓋confidence／來源跨頁保留與衝突、原生PDF無假分數、紅框門檻、雙眼DOM對應、0／false、不覆蓋既值、輸入escape、縮放／切頁保留編輯、取消晚到影像、URL釋放、進度timer停止／暫停以及眼別鍵盤切換。

以合成報告、低信心OD CCT=72%及其他高信心98%測視覺，1280、360、300px及中英文均無水平溢位。低信心為明示的設計測試資料，不是實際模型評分。來源可縮放至125%、回復100%，數值不變；聚焦欄位不自動展開使用者收合的影像，來源按鈕才會展開。最新合成截圖：output/playwright/review-wide-0313.png、review-compact-low-0313.png、compact-state-360-en-0313.png。

正式dist以獨立Chromium profile載入（非HTTP模擬），讀取使用者既有realpdf.pdf原第6頁與photo.pdf原第2頁。先檢查provider為Local PP-OCRv6 Small，再以offline browser context阻止外部連線。原生PDF顯示OD／OS各9欄且來源p.6影像解碼；掃描PDF顯示各10欄（18共同測量＋2個明示Target），來源p.2影像解碼。兩次共同測量與既有人工答案皆18/18。參考答案只用於評分，不提供給模型／解析器。

掃描推論期間實際觀察0:04、Recognizing image locally、不定進度條；完成時Elapsed0:27、活動條隱藏、OCR sandbox數量0，console零錯誤／警告。實際已接受欄位均不低於85%，因此沒有暗紅欄位；暗紅視覺驗證另用合成資料。沒有呼叫雲端、送出公式計算或接管使用者Chrome。

本輪不重跑15個公式網站或雲端模型，未更換OCR權重／臨床公式／晶體資料。公開報告只有欄位ID、分數與正確性／數量，沒有病人ID、量測值、金鑰或原始影像；私人原始輸出只在忽略的private目錄，不進發佈ZIP。

結構化證據：artifacts/ui-preview-0.3.13.json、artifacts/ocr-0313/installed-extension-review.json、artifacts/review-ui-0313.json、artifacts/compact-state-ui-0313.json、artifacts/ocr-review-evidence-0313.json。

進度條語意依W3C：https://www.w3.org/TR/wai-aria-1.2/#progressbar ，未知進度不設定aria-valuenow。

## 更新

在chrome://extensions重新載入E:\code\biometry-clipboard\dist，再重新整理計算網站分頁。v0.3.13 ZIP含既有本機模型；模型、病人格式與設定無需重新建立。
