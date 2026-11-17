# 晶體選項與跨站對照

查核日期：2026-11-15。這輪加入獨立的晶體選項收集與交換結構；已核對 **3 個入口**，尚未完成全部 15 個入口的晶體品項與各參數對照。

## 目前可收集的來源

| 官方來源 | 選單與數量 | 語意及切換影響 |
| --- | --- | --- |
| [EVO regular](https://www.evoiolcalculator.com/Calculator.aspx) | 原生 `#DropDownIOLModel`，33 項 | 同一選單包含個別型號、family 及 generic Standard。`change` 會觸發 ASP.NET postback。 |
| [EVO Toric](https://www.evoiolcalculator.com/Toric.aspx) | 原生 `#DropDownToric`，29 項 | 包含個別 family，以及 Posterior / Anterior / Bitoric 等幾何設定；幾何設定不能當作晶體型號。`change` 會觸發 postback。 |
| [TECNIS Toric](https://tecnistoriccalc.com/calculator/) | 自訂 `.lens-select`，16 個 family | 地區會限制可選 family；目前選擇記錄在已核對的 `#lens`。官方公開 JS 的 matrix v4.11.2.0 有 14 地區、16 個 family、118 個不同 model code；**family 選單不等於計算結果中的某一個 toric model**。 |

EVO 的 `Tecnis`、`J&J Eyhance` 和 TECNIS 的 `Eyhance-II-Simplicity` 等字樣，單憑相近名稱不足以確認同一個完整型號。因此目前未預置跨站 alias，也不自動選擇晶體。TECNIS 選單與其地區矩陣是公開來源盤點，沒有接受網站條款、切換實際晶體、執行計算或完成該站安裝版原生驗收。

另外取得 Cooke 與 Kane 的公開首頁，但其晶體控制由客戶端產生，未據首頁 HTML 建立自動對應。APACRS 本次來源 GET 未能取得；不以猜測的 selector 或值補齊。ESCRS 與 PEARL-DGS 的自訂晶體控制尚未納入收集。

## 使用與保存

複製上述網站時，可一併保存已選晶體的來源網站、原始選項值及原始名稱；每眼的 `iolSourceSite`、`iolSourceValue`、`iolSourceLabel`、`iolCatalogId` 與一般 biometry 分開。來源選項變更時需清除舊 `iolCatalogId`，避免誤用先前對照。

設定提供「收集本頁晶體選項」與「匯出晶體對照 JSON」。所收集的公開選單及目前選擇另存本機 `biometryLensCatalog`，不含病人輸入、API key 或工作階段 token。匯入獨立晶體 JSON 不會當作病人資料匯入，也不會變更網站目前的晶體選擇。合成 QA 不寫入正式晶體資料庫。

選項收集是唯讀操作：不逐項切換晶體、不點 Calculate。只會記錄目前已選品項旁已存在的數值參數，例如 EVO 的 A constant，或 TECNIS 的 constant factor 和其 A-constant / SF / ACD 標籤。尚未選過的其他品項不會憑空附上常數。

目錄保存及收集的讀取／合併／寫入使用同名 Web Lock，讓相同擴充功能來源的多個面板依序更新，避免彼此覆蓋新增來源；不在收集鎖內再次取得保存鎖。未提供 Web Locks 的測試或預覽環境以模組內 Promise queue 排序，單次寫入失敗後仍可處理後續操作。API 行為依 [MDN Web Locks 文件](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API)核對。

## JSON 與程式介面

獨立交換格式是 `biometry-lens-catalog`，`schemaVersion: "1.0"`；契約位於 `schemas/biometry-lens-catalog.schema.json`。它包含：

- `sources`：每站收集時間、固定來源網址、選項清單、目前選擇，以及此站此品項當下的參數快照。
- `entries`：人工查核過的 stable ID、manufacturer、modelCode、型號層級，以及每站精確 `value` / `label` alias、來源連結與查核日期。

`kind` 區分 `model`、`family`、`geometry`。family 不能自動升級為某個 model；幾何設定不參與晶體對照。參數留在 `sources`，不能塞進 canonical entry 當作跨公式通用常數。

`src/lens-catalog.js` 提供：

- `LENS_SOURCE_DEFINITIONS[siteId]`：已核對來源定義。
- `lensSourcesBridge(definition)`：可由 `chrome.scripting.executeScript` 序列化執行的自含唯讀函式。
- `buildLensReadRows(profile, snapshot, eye)`：把已選品項轉為對應眼別的來源欄位；雙眼共用選單使用 `shared`。
- `exportLensCatalogDocument(snapshots, {entries, now})` / `parseLensCatalogDocument(input)`：匯出及嚴格解析獨立交換資料。
- `resolveLensSelection(caseEye, targetSiteId, catalog, liveSnapshot)`：只在來源精確 alias、型號層級及目的網站即時唯一可用選項均一致時回傳 `ready`；其餘回傳 `manual` 與原因。它不寫入網站，也不回傳任何常數。

同站回貼可使用完全一致的原始值及名稱；跨站需要明確核對過的 alias。解析器另檢查重複 canonical ID、同一網站選項的衝突 alias，以及來源選擇是否唯一存在於清單。來源網址必須是無 query、fragment、帳密的 HTTPS 網址。

## 驗證範圍

`tests/lens-catalog.test.js` 的 13 項測試已通過，使用實際公開 HTML 和合成 alias，驗證選項數量、selected 讀取、眼別保存、唯讀無事件、參數隔離、歧義及 stale label 阻擋、family/model 層級和交換格式。`tests/platform-lens.test.js` 另有 17 項通過，驗證只注入受支援入口的 top frame、讀取不寫目錄、選用晶體讀取失敗保留 biometry、明確收集才保存、失敗收集保留舊目錄、QA 不寫正式目錄、JSON 及網站來源變更清除舊 canonical ID；另以兩個模組實例共用的 fake Web Lock 驗證並行收集保留兩站來源、匯入與收集不互相覆蓋，以及 fallback queue 在儲存失敗後可繼續。這些測試未代替使用者 Chrome 的已安裝擴充功能驗收，也沒有驗證晶體選擇後的臨床計算結果。

公開來源盤點保存於 `artifacts/lens-catalog-source-summary.json`。下一步是逐站補齊客戶端選單、區分計算用途／晶體完整型號，並逐筆查核 alias 與各站參數；完整對照成立後才接自動切換流程及 postback 後重新檢查。
