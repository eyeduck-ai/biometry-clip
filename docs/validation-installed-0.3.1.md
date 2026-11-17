# 已安裝 Chrome 擴充功能實測（v0.3.1 起）

> 最新進展：使用者已確認 v0.3.3 正常並提交原生 14 站報告（8 通過／6 略過）。以下保留先前階段紀錄；新版結果與修正請見 [v0.3.4 驗收紀錄](validation-0.3.4.md)。

日期：2026-11-15，Asia/Taipei。

使用者最初回覆安裝 v0.3.1，並在 Barrett Universal II 開啟懸浮面板，後續確認 v0.3.2 手動正常。接管時曾看見浮窗外框／標題下方內文全白；使用者確認兩分頁一白一正常，並回報「我發現你接管chrome就會變白」。後續從正式 HTTPS 父頁確認這次白畫面的直接機制：iframe 帶有空 `srcdoc`，實際子框為 `about:srcdoc`，覆蓋有效的擴充功能 `src`。寫入者與目的仍未確認。v0.3.3 已實作明確重試／重開時的恢復，HTTP 開發頁兩路徑已驗證，但已安裝版本的接管情境與 14 站端到端結果仍未驗證。新增的原生合成驗收入口尚未由主代理啟動，沒有讀取／儲存／跨分頁通過判定。

先前的 [正式網站 DOM 檢查](validation-0.3.md) 與 [模擬 Chrome API 的開發介面測試](validation-ui-0.3.md) 保留為背景資料，不能代替本報告的實測結果。版本紀錄分開處理：初次使用者回報為 v0.3.1，最新回報為 v0.3.2 手動正常；本機建置版本不能代替使用者實際執行版本。直接載入證據見 [frame-metadata.json](../artifacts/root-cause-0.3.2/frame-metadata.json)。

## 判定與證據規則

- **待驗**：尚未取得足以判定的已安裝擴充功能觀察。
- **通過**：有實際操作、擴充功能結果與網站欄位讀回證據，且僅適用於列出的欄位、眼別與模式。
- **失敗**：已重現值錯誤、對應不符、資料遺失或流程失效，另列問題與修復後重測結果。
- **受阻**：流程已嘗試，但被具體前置條件阻擋；需記錄畫面與原因，不視為通過。
- **不適用**：該頁面或目前安全對應集合不提供此功能，並不代表該公式沒有其他用途。

「讀取」須由懸浮擴充功能執行，核對讀入的欄位與眼別；「儲存」須將該站讀入的資料保存為測量紀錄後重新選回；「跨分頁」須從另一分頁／已存測量選取資料，經本擴充功能預覽與套用，再核對目的網站實際欄位。只在面板中看見數字，不算跨分頁填入通過。

OD／OS 欄記錄單眼輸出：雙眼網站須確認未選眼保持原值，單眼網站須確認網站眼別與面板一致。OU 欄記錄雙眼網站一次輸出兩眼，並檢查共用常數。Toric／LVC 欄須逐項列出已驗欄位；未測模式不能由其他模式推定。

每筆證據應記錄：時間、來源與目的網站、執行版本、病人／測量代號、選定眼別、網站模式、讀取／預覽／填入數量、實際讀回值、截圖檔案。所有資料限使用明確標記的合成測試資料。

## 14 站已安裝擴充功能矩陣

| 網站 | 擴充功能讀取 | 測量儲存／選回 | 跨分頁貼入 | OD | OS | OU | Toric | LVC | 本輪證據／限制 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [ESCRS](https://iolcalculator.escrs.org/) | 待驗 | 待驗 | 待驗 | 待驗 | 待驗 | 待驗 | 待驗 | 待驗 | 尚無本輪觀察 |
| [Barrett Universal II](https://calc.apacrs.org/barrett_universal2105/) | 受阻：空 srcdoc 覆蓋內頁 | 受阻：未能開始 | 受阻：未能開始 | 受阻：未能開始 | 受阻：未能開始 | 受阻：未能開始 | 不適用：此普通頁面 | 不適用：另有 True-K 頁面 | I01–I07／B01：v0.3.2 手動正常；接管下已確認空 `srcdoc`／`about:srcdoc`，正常重試未恢復。未讀取、儲存或貼入 |
| [Barrett True-K](https://calc.apacrs.org/Barrett_True_K_Universal_2105/) | 待驗 | 待驗 | 待驗 | 待驗 | 待驗 | 待驗 | 不適用：另有 True-K Toric 頁面 | 待驗 | 尚無本輪觀察 |
| [Barrett Toric](https://calc.apacrs.org/toric_calculator20/Toric%20Calculator.aspx) | 待驗 | 待驗 | 待驗 | 待驗 | 待驗 | 不適用：單眼頁面 | 待驗 | 不適用：另有 True-K Toric 頁面 | 尚無本輪觀察 |
| [Barrett True-K Toric](https://calc.apacrs.org/TrueKToricTK_preview/TrueKToricTK.aspx) | 待驗 | 待驗 | 待驗 | 待驗 | 待驗 | 不適用：單眼頁面 | 待驗 | 待驗 | 尚無本輪觀察 |
| [Barrett Rx](https://calc.apacrs.org/barrett_rx105/) | 待驗 | 待驗 | 待驗 | 待驗 | 待驗 | 不適用：單眼頁面 | 待驗：已植入 Toric／術後分析欄位 | 不適用：無一般 LVC 病史對應欄位 | 尚無本輪觀察 |
| [Cooke K6](https://cookeformula.com/) | 待驗 | 待驗 | 待驗 | 待驗 | 待驗 | 待驗 | 不適用：目前頁面集合 | 待驗 | EULA 與模式狀態須在本輪確認 |
| [Solver Regular](https://iolsolver.com/regular) | 待驗 | 待驗 | 待驗 | 待驗 | 待驗 | 待驗 | 不適用：另有 Toric 頁面 | 不適用：另有 Complex 頁面 | 尚無本輪觀察 |
| [Kane](https://www.iolformula.com/) | 待驗 | 待驗 | 待驗 | 待驗 | 待驗 | 待驗 | 待驗 | 不適用：Keratoconus 不等於 LVC | 尚無本輪觀察 |
| [EVO](https://www.evoiolcalculator.com/Calculator.aspx) | 待驗 | 待驗 | 待驗 | 待驗 | 待驗 | 不適用：單眼頁面 | 不適用：另有 Toric 頁面 | 待驗 | 尚無本輪觀察 |
| [EVO Toric](https://www.evoiolcalculator.com/Toric.aspx) | 待驗 | 待驗 | 待驗 | 待驗 | 待驗 | 不適用：單眼頁面 | 待驗 | 待驗 | 尚無本輪觀察 |
| [Solver Complex](https://iolsolver.com/complex) | 待驗 | 待驗 | 待驗 | 待驗 | 待驗 | 不適用：單眼頁面 | 不適用：另有 Toric 頁面 | 待驗 | 網站眼別與自訂模式須手動確認 |
| [Solver Second](https://iolsolver.com/second) | 待驗 | 待驗 | 待驗 | 待驗 | 待驗 | 不適用：目前眼／已手術對側眼分區 | 不適用：目前頁面集合 | 待驗：模式與手動欄位提示 | 對側眼不應當成 OU 同時輸出的另一眼 |
| [Solver Toric](https://iolsolver.com/toric) | 待驗 | 待驗 | 待驗 | 待驗 | 待驗 | 不適用：單眼頁面 | 待驗 | 不適用：承接球面計算來源，無獨立病史對應 | 球面計算／IOL Power 前置條件須在本輪確認 |

## 建議合成資料與逐站檢查點

以下是待執行的資料與預期核對點，**不是已測結果**。若主代理實際採用不同數值，以後續觀察紀錄為準，並保存實際資料。

病人 A：`DEMO-ONLY-031-A`，姓名／代稱 `SYNTHETIC SOFTWARE TEST - NOT A PATIENT`。第 1 次測量 `SYNTHETIC-01`；第 2 次測量 `SYNTHETIC-02` 僅將 OD AL 改為 23.68。病人 B 使用 `DEMO-ONLY-031-B`，用來核對病人切換不污染資料。A-constant 使用 118.7，雙眼共用常數測試保持相同；衝突阻擋測試另明確將一眼改為 119.0。

| 欄位 | OD | OS |
| --- | ---: | ---: |
| AL，mm | 23.45 | 24.10 |
| ACD，mm | 3.20 | 3.40 |
| LT，mm | 4.20 | 4.30 |
| CCT，µm | 543 | 551 |
| WTW，mm | 11.80 | 12.00 |
| K1／K2，D | 43.20／44.10 | 42.80／43.90 |
| K1／K2 軸向，° | 90／180 | 85／175 |
| 目標屈光度，D | 0.00 | -0.50 |
| SIA，D | 0.10 | 0.20 |
| 切口軸向，° | 90 | 80 |
| LVC 病史 | Myopic LASIK | Hyperopic LASIK |
| LVC 術前／術後屈光度，D | -4.00／+0.25 | +2.00／-0.25 |

| 網站 | 前置條件與精簡檢查組合 |
| --- | --- |
| ESCRS | 先選各眼 Toric／LVC 模式與 IOL。先 OD Toric、OS LVC，再視需要反向測試。核對基本雙眼值及依眼分區的軸向／SIA／切口。Surgeon、Patient Initials、Gender 的必填／手動提示須可見；不從姓名推測 initials，不將同一 A-constant 灌入所有公式。等待模式切換完成後再預覽。 |
| Barrett Universal II | 來源首選。先填雙眼不同值再由擴充功能讀 OD、OS、OU；確認 OD 無後綴、OS `0` 後綴。常數共用，OU 應只寫一次；兩眼常數不一致應阻擋。來源名稱／ID／Doctor 與病人資料分開核對。 |
| Barrett True-K | 使用雙眼不同 LVC 類型與術前／術後值；目標屈光度維持 0.00／-0.50。測試 OU 與單眼輸出均不交換病史。共用常數同 Universal II。 |
| Barrett Toric | 先在網站選 OD 或 OS，待 ASP.NET 回傳完成再預覽。分別測試兩眼的 flat／steep K、各自軸向、SIA／切口；保留選填 biometer K，不與主要 K 混用。 |
| Barrett True-K Toric | 先選眼別及 History，待頁面更新。以 Toric 值搭配獨立 LVC 病史；確認停用的選填 K 未被寫入。URL 含 TK 不表示可把 TK 值代入 measured K。 |
| Barrett Rx | 使用明確的 `postOpK1/2` 42.80／43.90、`preOpK1/2` 42.20／43.20 及各自軸向，避免一般 K 混入。已植入 power 20.5、T3、axis 95；術後 sphere -0.75、cyl +0.50、axis 85；exchange A-constant 119.0。核對 T3 對應的 IOL-plane D，而非把文字或角膜平面 cylinder 混用。 |
| Cooke K6 | 若顯示 EULA，記錄本輪狀態，由使用者自行決定，不以先前 DOM 檢查視為本次通過。Default 先測雙眼；再選 Post-Myopic／Post-Hyperopic／Post-RK，確認 Age 與 TK 的條件欄位。先選 Use Ks、Biometer、IOL；Argos 模式另核對 LT 必填。 |
| Solver Regular | 先選 Biometer／Keratometric Index／IOL Model；核對重複標籤的第 1 組 OD、第 2 組 OS。不要寫入自訂選單的隱藏 input。雙眼基本值與兩份 A-constant 分開保存。 |
| Kane | 先用可見模式標籤選 OD Toric、OS Non-toric，再交換模式。填入 gender 時核對男女互斥。K2 Toric 軸向由網站推導且停用，應跳過。Keratoconus 不能當成 LVC。 |
| EVO | 先選眼別。Myopic 值 `1` 用來測 -4.00／+0.25 歷史；Hyperopic 值 `2` 與 RK 值 `3` 核對可用欄位及停用欄位。PK1／PK2 使用 5.80／6.10 絕對值，保留框外負號；CCT 單位不明，應保留手動。 |
| EVO Toric | 同 EVO，另加 K1／K2 軸向、SIA／切口與 PK 軸向。先以 Myopic 啟用病史，再切 Hyperopic 核對病史停止寫入。不要將後角膜 K 與總角膜 K 混用。 |
| Solver Complex | 手動確認目前眼。啟用 LVC history，使用術前半徑 7.80 mm、corrected ametropia -4.00 D；Total K 43.00 D 獨立。radius、posterior radius、TK、TCRP 不互相替代；LVC／RK／ICL 為不同條件。 |
| Solver Second | 手動確認目前眼，對側已手術眼另用 AL 24.10、K 42.80／43.90、LT 4.30、CCT 551、implanted power 20.50、post-op SE -0.25。`Preop. ACD (D)` 單位疑義應保持手動並顯示提示。兩眼須同 IOL model；此分區不能誤判為 OU。LVC 自訂模式／未安全對應欄位另記手動範圍。 |
| Solver Toric | 必須透過正常合成球面計算，選 IOL Power 後進入 Toric；不要把入口前置畫面算成功。核對 `K1 axis (°)`、`SIA (D)`、`Incision axis (°)`；可另填 PK1／PK2 5.80／6.10 與 `PR2/PK2 axis (°)`。網站眼別、Toric IOL Style、cylinder notation 手動確認；球面來源資料／唯讀表頭不能當成已成功貼入的可編輯欄位。 |

## 共用儲存與跨分頁流程

這些項目是跨網站功能的共用驗收，不會自動將 14 站各列的「儲存」或「跨分頁」全部標為通過。

| 項目 | 狀態 | 實際觀察／證據 |
| --- | --- | --- |
| 已安裝版本與正式浮窗載入 | 部分已確認，接管流程仍受阻 | 使用者確認 v0.3.2 手動正常；接管下空 `srcdoc` 覆蓋機制有直接證據，未讀取擴充功能內頁 HTML（I05–I07／B01） |
| 病人 A：保存第 1 次測量並重新選回 | 待驗 | — |
| 病人 A：保存第 2 次測量，確認第 1 次未被覆寫 | 待驗 | — |
| 病人 B：建立／切換後，病人 A 的紀錄仍獨立 | 待驗 | — |
| 不同分頁重開浮窗後，選取病人／測量保持一致 | 待驗 | — |
| 來源站 → 目的站：OD、OS、OU 分別預覽／套用／讀回 | 待驗 | — |
| 眼別不符拒絕；修改模式／網址後舊預覽失效 | 待驗 | — |
| OU 共用常數衝突拒絕 | 待驗 | — |
| 關閉／重新開啟浮窗後的 `chrome.storage.local` 紀錄 | 待驗 | — |
| Chrome 重新啟動後的持久保存 | 待驗 | — |
| 使用者自行啟動的原生 14 站合成驗收 | 未啟動／未實測 | 已新增真正 Chrome API 與隔離 `biometryQa:` 儲存流程；尚無正式執行結果，不以功能實作當成驗收通過 |

## 本輪觀察紀錄

已收到下列實際觀察。尚未完成任何已安裝擴充功能的讀取／儲存／跨分頁貼入；後續不能以預定資料或前一版測試推定通過。

| 證據編號 | 時間 | 網站／來源 → 目的 | 操作、眼別與模式 | 實際結果 | 證據檔案 |
| --- | --- | --- | --- | --- | --- |
| I01 | 本輪，精確時間待補 | Barrett Universal II；Chrome 分頁 `722863255` | 觀察正式網站與已開啟浮窗 | 網站表單空白；浮窗外框與標題可見，內文全白，未看見 5 個功能頁籤。主頁 DOM 未記錄 console 錯誤，但這不能排除擴充功能內頁錯誤。未執行讀取／儲存／貼入。 | 主代理 CUA 觀察；截圖路徑待補 |
| I02 | 本輪，精確時間待補 | 庫存中既有的擴充功能入口分頁 `722863241` | 嘗試直接檢查已存在的擴充功能頁面 | 瀏覽器工具的網址政策明確拒絕 `chrome-extension:`，只允許 HTTP／HTTPS。停止該路徑，未改用 CDP 或其他方式繞過。 | 主代理工具回應；不屬於欄位功能通過證據 |
| I03 | 本輪，精確時間待補 | 使用者的兩個分頁 | 使用者手動觀察浮窗顯示 | 使用者確認一個分頁內文全白，另一個分頁正常；不能據此判為所有浮窗或所有網站都無法載入。 | 使用者訊息 |
| I04 | 本輪，精確時間待補 | Chrome 接管前後 | 使用者回報：「我發現你接管chrome就會變白」 | 當時確認接管與變白的相關性，主代理停止互動控制。後續僅檢查 HTTPS 父頁 iframe 屬性／frame metadata 並按正常重試（I06–I07），未執行 14 站端到端流程。 | 使用者訊息及主代理紀錄 |
| I05 | 本輪，精確時間待補 | 使用者目前安裝版本 | 使用者回覆版本／手動狀態 | 確認為 v0.3.2，未接管時手動顯示正常；此回覆不代表讀取／保存／貼入已通過。 | 使用者訊息；metadata 版本欄 |
| I06 | 2026-11-15，精確時間待補 | Barrett Universal II HTTPS 分頁 `722863266` | 只讀父頁唯一 Biometry iframe 屬性及主頁 frame tree metadata | `src` 指向有效擴充功能 `index.html`；`srcdoc` 存在且長度 0；子框 committed URL 為 `about:srcdoc`。直接確認空文件覆蓋的白畫面機制。未讀取受保護擴充功能文件內容；寫入者與目的未確認。 | [metadata](../artifacts/root-cause-0.3.2/frame-metadata.json)；[截圖](../artifacts/root-cause-0.3.2/blank-frame.jpg) |
| I07 | 2026-11-15，精確時間待補 | 同 I06 分頁 | 按一次正常「重新載入面板」 | `srcdoc` 仍存在，iframe 仍白。原有重試沒有恢復正常內頁，尚無已安裝版本的修正後重測；後續 HTTP 回歸另列 H01／H02。 | [metadata 的 afterRetry](../artifacts/root-cause-0.3.2/frame-metadata.json) |
| H01（HTTP 回歸） | 2026-11-15，精確時間待補 | Chrome `/src/dev/floating-preview.html`；模擬 Chrome API | 最新正式外框：輸入 AL 23.45 → 模擬空 srcdoc → 明確重新開啟 | 恢復 5 個頁籤，AL 仍為 23.45。僅為 HTTP 開發頁機制回歸，不是已安裝擴充功能的讀寫／保存通過。 | [重新開啟後恢復](../artifacts/root-cause-0.3.2/http-reopen-recovered.jpg) |
| H02（HTTP 回歸） | 2026-11-15，精確時間待補 | 同 H01；模擬 Chrome API | 再次模擬白畫面，等待未就緒提示，按正式外框重試 | 恢復 5 個頁籤，AL 仍為 23.45。已安裝版本接管重測仍未完成。 | [重試後恢復](../artifacts/root-cause-0.3.2/http-retry-recovered.jpg) |
| S01（本機檢查） | v0.3.3 修正建置 | 原始碼測試與建置 | 3 項 srcdoc 回歸、開發環境 session／library 完整保留整合檢查及完整測試 | 該次紀錄為 197 項通過、0 失敗，建置完成；不代表 14 個正式網站已實測，也不預先包含後續新增原生 QA 的結果。 | [檢查紀錄](../artifacts/check-0.3.3.log) |
| S02（最終本機檢查） | 新增原生 QA 後 | 完整原始碼測試與建置 | 231 項通過、0 失敗；正式建置完成。包含 QA 隔離儲存、逐站 runner、逐次人工眼別確認、報告遮蔽與 UI 不自啟動。 | 本機檢查通過；不能據此將 14 個正式網站改為已實測。原有 S01 紀錄保留。 | [最終檢查紀錄](../artifacts/check-0.3.3-native-qa.log) |

## 問題、修復與重測

目前已確認本次白畫面的直接機制為空 `srcdoc` 覆蓋有效 `src`，寫入者與目的仍未知，不能歸因特定工具或政策。v0.3.2 原有重試未移除此覆蓋；v0.3.3 已實作只在明確重試／重開時移除 `srcdoc`，不加持續監看迴圈、不放寬權限。HTTP Chrome 回歸的兩條恢復路徑與 AL 草稿保留已通過；**已安裝 v0.3.3 的接管重測仍未完成，不能宣稱接管問題完全修復或 14 站已通過。** 若外部流程再次寫入覆蓋，仍可能再次變白。詳細證據見 [浮窗載入診斷](panel-loading-diagnostics.md)。先前 ESCRS 星號導致 selector 失敗的問題仍未重現，不因本次調查變成已確認缺陷。

| 問題編號 | 實際重現步驟／影響 | 修正範圍 | 重測結果與證據 |
| --- | --- | --- | --- |
| B01（直接機制已確認，寫入來源未明） | I06 空 `srcdoc` 存在、子框 `about:srcdoc`，覆蓋有效 `src`；I07 原有正常重試仍白。使用者確認 v0.3.2 手動正常且接管相關。直接擴充功能網址的工具限制仍存在。 | v0.3.3 已實作明確重試／重開時移除覆蓋。不加入 observer／自動重試迴圈，不放寬權限或額外 `extension_ids`，不讀取受保護內頁 HTML。 | H01／H02 HTTP 模擬 API 開發頁回歸通過；已安裝版本接管重測與 14 站讀取／儲存／跨分頁仍未驗證 |

## 使用者自行啟動的原生驗收流程（尚未執行）

在未由助理接管 Chrome 時，使用者可從已安裝擴充功能 **設定 → 開啟原生合成驗收** 進入。開啟頁面本身不啟動網站操作；先確認只使用合成資料，再按「開始合成驗收」（Start）。後續按「驗證下一步」，遇到網站眼別、Toric／LVC、IOL 或條款等前置條件時，由使用者自行核對，回原生驗收頁按「重試目前網站」，或按「略過目前網站」保留未完成標記。完成或受阻都可「匯出 JSON」交回核對。

單眼網站若沒有可靠的自動眼別偵測，必須先在原站確認訊息要求的眼別，再勾選「已在原網站核對目前為 OD／OS」（依訊息顯示當眼）後按重試，報告記為 `manual-confirmed`；不能只因程式選了 OS、寫入值也一致，就宣稱網站 OS 已正確，也不能把人工確認寫成 DOM 自動偵測。可偵測眼別但與要求不同時，仍須先切換原站眼別。

這個入口使用真正的 Chrome 分頁／注入／訊息／儲存 API，與隔離的 `biometryQa:` session／library 資料，**不是模擬 Chrome API 的開發測試頁**。只處理啟動後新建的合成分頁，不將原有病人分頁當作測試對象，不更動一般病人資料庫、一般工作副本或 API 設定。不自動接受法律條款、選臨床人工水晶體或按 Calculate；Solver Toric 的球面計算與 IOL Power 前置流程也由使用者自行處理。

主代理尚未啟動這個原生流程，尚無可據以更新上方 14 站矩陣的 JSON。未來應逐筆區分 OD／OS／OU、儲存與選回、Toric／LVC 及人工項目；「入口全部處理完」不等於全部通過。瀏覽器工具對直接 `chrome-extension:` 網址的限制仍存在，此功能不代表代理取得額外的工具存取權限。

本報告驗證欄位搬移與保存流程，不以網站能顯示計算結果推定臨床計算正確。僅在 Solver Toric 正常前置流程需要時，才另明確記錄合成球面計算；其他網站不需要為了欄位測試送出 Calculate。
