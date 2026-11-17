# v0.3.9 驗證紀錄

日期：2026-11-15（Asia/Taipei）。

## 介面與操作

使用者從三個圖片提案選擇 A 石墨灰黑；正式圖示由同一份可維護向量幾何生成 16/48/128 px PNG 與懸浮窗標誌，保留 SVG 及產生器。採石墨、灰與米白，資訊與警告各保留足夠辨識度。

非指定網站點工具列圖示會開啟較寬工作台，預設資料頁，附隨分頁切換的簡短說明。指定網站延用 360 px 懸浮窗。未增加 extension 權限、host permissions 或 CSP 放寬。

匯入頁四個主要入口：複製網站、貼上截圖、PDF/圖片、JSON。移除文字報告輸入與解析按鈕，圖片剪貼簿、PDF 選頁與版本化 JSON 交換保留。

設定以 fieldset 分隔偏好參數及辨識模型。新增 defaultSurgeonName 預設 OPH；資料欄位提示預設值。貼上時只補缺少且沒有 surgeon ID 的醫師姓名，不覆蓋明確輸入，也不把預設值寫回歷史測量。

## 晶體錯誤根因

1. 搜尋每次 input 重建面板會打斷 IME composition。改為保留輸入節點，只更新選項與計數，保留焦點和游標。
2. 選取後重建面板時遺失 details 展開狀態。保存狀態並由 canonical ID 補足摘要名稱。
3. 原生瀏覽器驗證另發現，replaceChildren 搬移 select options 時，來源選單自動改選下一項，使最後一項看似已選。現在在更新選項前後明確保留預期選取值；搜尋本身不能選晶體，也不能默選來源 Rx 角色。

## 病人與歷史測量

支援病人識別編輯、刪除整位病人、單筆與勾選批次刪測量、複製測量後編輯。刪除僅一次確認。複製為獨立 ID 與深複製雙眼資料；編輯/複製模式下保存預設更新所選紀錄。

session queue 與資料庫 revision 核對保護並行操作；刪除目前選取的紀錄保留工作副本、解除歷史連結並換 case token。識別修正同步歷史識別，保留歷史年齡、醫師與眼數值。

## 真實瀏覽器檢查的範圍

Browser skill 的原生連線未建立；使用獨立 IAB CUA fallback。初始沙箱伺服器本機連線被限制，改為只監聽 127.0.0.1 的本機預覽伺服器後成功。

已實際檢視一般視窗寬版資料頁、匯入四按鈕、分隔的偏好/OCR 設定，以及 360 × 503 px 的 compact 資料、匯入和病人頁。以 SYNTHETIC-039、AL 24.32、SN60WF 建立 Synthetic baseline，再複製成獨立測量；病人頁顯示兩筆紀錄，摘要/所選晶體及展開狀態正確。所有資料僅為獨立本機預覽的合成資料。viewport override 已復原。

另外使用獨立 Playwright CLI session 保存實際 PNG 截圖至 output/playwright/；1280 px 寬版 document/panel scrollWidth 分別等於 1280/802 px，360 px compact document/panel scrollWidth 均為 360 px，沒有水平溢位。再驗證搜尋 SN60WF 後 picker value 為空、label 為「選擇晶體」；明確選取後才變為 model:alcon:SN60WF，summary 正確且 details 保持 open。

這不是安裝在使用者 Chrome 的完整 15 站回歸驗收。沒有接管使用者 Chrome，也沒有輸入真實病人資料。

## 自動檢查

最終 npm run check：544 tests pass，0 fail，Vite/MV3 build 成功。搜尋 placeholder 與研究查詢檔缺值驗證均包含在檢查內。

## ESCRS 七公式參數

完整研究流程與參數查詢格式見 [ESCRS 研究紀錄](research-escrs-constants-039.md)。站上空白與未蒐集分開保存，不由其他公式常數推算補值。645 列來源及最終參數統計記於 artifacts/escrs-constants-039/coverage.json；獨立頁面重查記於 verification-report.json。

另保留 CLI 查詢器 scripts/query-escrs-constants.mjs、JSON Schema 及可單獨開啟的查詢 HTML。Toric 來源的 Cooke/Hill 值是在正常模式切換後顯示的預置參數，不表示這兩種 Toric 計算功能受到原站支援。

最終參數蒐集：645/645 來源列（465 一般、180 Toric），每列七欄已檢查。4,363 observed、152 blank、0 not-exposed、0 not-collected；7 組同名選項共 14 列各自保存。28/28 fresh-reload 複查相符，全部 19 列七欄空白已另行重查，無差異。
