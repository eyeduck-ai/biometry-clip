# v0.3.6：柱鏡偏好與 TECNIS

日期：2026-11-15（Asia/Taipei）。這版新增 TECNIS Toric，總計 15 個指定入口；先前使用者提供的 v0.3.3 原生 14 站報告仍保留為歷史證據，不當成新版或新增網站通過。

## 柱鏡顯示與選眼

「設定 → 柱鏡顯示偏好」預設 −ve，可改 +ve 或保留原站。只處理已核對的原站顯示控制；個案中的柱鏡、軸向及其他量測數值保留原值。讀取網站不切換顯示或眼別。

Barrett Toric、True-K Toric、Rx 的主表單 radio 已核對；TECNIS 使用主表單 `rcc` 群組，與 Preferences 模態的另一組控制分開。TECNIS 已有結果時，改記法會觸發原站重新計算，故自動偏好在這種情況回報需人工確認，基本欄位仍可填入。未對應的網站控制不猜測，也不因偏好缺少而阻擋基本貼上。

貼上 OD／OS 時，背景會切換已核對且唯一可操作的 native radio，等網站更新穩定後填入。Barrett 的 postback 不會因浮窗銷毀而中斷背景任務；TECNIS 選眼會由原站保存舊眼／還原新眼，因此只觸發一次正常點擊，不重派 `change`。無法可靠辨識的自訂元件仍需在原站核對。

原生 QA 新增各眼柱鏡顯示證據。要求與實際記法不符時標為需人工，不會因基本數值填入而宣稱偏好通過。細節見 [顯示控制研究](research-display-preferences.md)。

## TECNIS 對應

對應欄位包含 AL、前角膜 K1／K2、平坦軸向、原站推導的陡峭軸向唯讀值、SIA、切口、K index、Planned SE IOL Power、年齡及可選識別資訊。沒有量測 ACD／LT／CCT／WTW／target 欄位，這些數據仍保留在擴充功能供其他網站使用。`constantFactor` 會隨 method 改變語意，沒有混入 A constant 或量測 ACD。

Planned SE IOL Power 與已植入、對側眼 IOL power 及 target 分開保存，只匹配原站已提供的選項；不代選 IOL 型號或其他度數。數值選單的 `-Select-` 佔位符視為空白。

原站 K 可為 D／mm，切單位會清空兩個 K。讀取不切單位，不把半徑當 D；貼上時只有完整、合法且能寫入的成對 K 才準備 D 模式，再填入兩值。缺值或控制不可操作時保留原站資料並提示。來源 K 使用 D，不用 TK 取代。

原站也可保存逗號小數顯示。這版只對已確認的點號數字格式直接讀寫小數輸入，其他格式提示手動確認；不把 `43.20` 錯讀或錯寫成 `4320`。

來源為官方公開 HTML／JavaScript，沒有接受地區／使用條款、選 IOL、計算或接管使用者 Chrome。新增 profile 是公開來源核對，不是已安裝版本的真實頁面驗收。欄位 ID、模式、來源及限制見 [TECNIS 研究](research-tecnis.md)。

## 相容性與驗證

共同資料模型新增 optional `plannedIolPower`，交換格式匯出 1.1 並保留 1.0 匯入相容。新增網站採獨立 adapter；入口、用途與原生驗收計數依 registry 動態產生。詳見 [網站擴充方式](site-adapters.md) 與 [JSON 交換格式](interchange.md)。

完整本機測試為 343 項通過、0 失敗，正式建置完成，紀錄：[check-0.3.6.log](../artifacts/check-0.3.6.log)。本機回歸使用正式 bridge／儲存服務及合成 DOM，並包含公開 HTML selector 核對；尚未取得新版原生 15 站執行報告。
