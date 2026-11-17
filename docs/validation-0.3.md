# v0.3 正式計算網站驗證

> 最新進展：使用者已確認 v0.3.3 正常並提交原生 14 站報告（8 通過／6 略過）。以下保留先前階段紀錄；新版結果與修正請見 [v0.3.4 驗收紀錄](validation-0.3.4.md)。

日期：2026-11-15，Asia/Taipei（測試開始於 2026-11-14 16:45 UTC）。

## 本次證據能確認的範圍

已在新的 Chrome 分頁開啟使用者指定的全部 14 個 HTTPS 網址。其中 12 個可操作表單使用瀏覽器提供的定位與輸入功能填入合成資料，再讀回公開 DOM 中的欄位值，並儲存截圖。這些檢查涵蓋正式網站當下的表單、單位、左右眼區分、條件式控制項，以及網站對應設定使用的選擇器。

**本次並未完成「已安裝擴充功能」的端到端驗證。** 未在這些正式網站實際操作 Biometry 工具列按鈕、擴充功能 service worker、`chrome.scripting`、真正的 `chrome.storage`、已安裝版本的懸浮 iframe、擴充功能讀取、已儲存病人選取，以及擴充功能跨分頁填入。原生 Chrome 工具列的存取核准請求逾時，因此未取得該操作管道；這不代表已確認 Biometry 是否安裝。未變更瀏覽器設定、安全控制或擴充功能安裝狀態。

v0.3 介面與儲存流程另以本機開發測試環境驗證，詳見 [validation-ui-0.3.md](validation-ui-0.3.md)。該環境模擬 Chrome API，不能取代已安裝擴充功能的實測。

機器可讀的觀察紀錄：[live-evidence.json](../artifacts/live-0.3/live-evidence.json)。必填控制項 HTML：[escrs-required-controls.json](../artifacts/live-0.3/escrs-required-controls.json)。截圖位於 `artifacts/live-0.3/`。

## 合成測量資料

以下為軟體測試資料，不是病人紀錄或臨床建議。測試使用新分頁，未讀取或修改原有已填入病人資料的表單。本次未送出任何 Calculate 計算操作。

| 欄位 | OD | OS |
| --- | ---: | ---: |
| AL，mm | 23.45 | 24.10 |
| ACD，mm | 3.20 | 3.40 |
| LT，mm | 4.20 | 4.30 |
| CCT，µm | 543 | 551 |
| WTW，mm | 11.80 | 12.00 |
| K1，D | 43.20 | 42.80 |
| K2，D | 44.10 | 43.90 |
| K1 軸向，° | 90 | 85 |
| K2 軸向，° | 180 | 175 |
| 目標屈光度，D | 0.00 | -0.50 |
| SIA，D | 0.10 | 0.20 |
| 切口軸向，° | 90 | 80 |

明確填入 A-constant 的欄位使用 118.7。填入姓名或 ID 時，使用 `SYNTHETIC SOFTWARE TEST`、`SYNTHETIC SOFTWARE TEST - NOT A PATIENT` 或 `DEMO-ONLY-03`。不同的 LVC 病史值用來辨識左右眼交換，以及目標屈光度與病史屈光度混用。這些資料由瀏覽器直接輸入，並非由擴充功能傳送。

## 14 個網站的驗證矩陣

「DOM 輸入／讀回」指透過瀏覽器定位欄位、填入資料，再檢查公開 DOM。**所有列的已安裝擴充功能讀取／儲存／跨分頁流程，均仍未驗證。**

| 網站 | 新分頁正式網站結果 | 已檢查的眼別／特殊欄位 | 證據 |
| --- | --- | --- | --- |
| [ESCRS](https://iolcalculator.escrs.org/) | DOM 輸入／讀回 | 雙眼 AL／ACD／LT／CCT／WTW／K／目標屈光度使用不同數值；OD 開啟 Toric，填入軸向／SIA／切口；OS 開啟 Post-LASIK/PRK/RK，顯示 Myopic 模式。各公式常數與自訂性別控制保留手動設定。 | [截圖](../artifacts/live-0.3/escrs.png) |
| [Barrett Universal II](https://calc.apacrs.org/barrett_universal2105/) | DOM 輸入／讀回 | OD 使用無後綴欄位，OS 使用 `0` 後綴欄位；A-constant 為共用。讀回未發現左右眼交換。 | [截圖](../artifacts/live-0.3/barrett-universal.png) |
| [Barrett True-K](https://calc.apacrs.org/Barrett_True_K_Universal_2105/) | DOM 輸入／讀回 | 雙眼測量；OD Myopic Lasik 術前 -4.00／術後 +0.25，OS Hyperopic Lasik 術前 +2.00／術後 -0.25；目標屈光度仍為 0.00／-0.50。 | [截圖](../artifacts/live-0.3/barrett-true-k.png) |
| [Barrett Toric](https://calc.apacrs.org/toric_calculator20/Toric%20Calculator.aspx) | DOM 輸入／讀回 | 填入前明確選取 OS；平坦／陡峭 K 及各自軸向、SIA、切口、AL／ACD／LT／WTW／目標屈光度。 | [截圖](../artifacts/live-0.3/barrett-toric.png) |
| [Barrett True-K Toric](https://calc.apacrs.org/TrueKToricTK_preview/TrueKToricTK.aspx) | DOM 輸入／讀回 | 明確選取 OD；Hyperopic Lasik 病史，術前 +2.00／術後 -0.25；Toric 軸向／SIA／切口。停用中的選填 biometer K 控制項未變更。 | [截圖](../artifacts/live-0.3/barrett-true-k-toric.png) |
| [Barrett Rx](https://calc.apacrs.org/barrett_rx105/) | DOM 輸入／讀回 | 選取 OS；術後 K 42.80／43.90 與術前 K 42.20／43.20 分開；已植入度數 20.5、T3、植入軸向 95；術後屈光度與換片常數分開。 | [截圖](../artifacts/live-0.3/barrett-rx.png) |
| [Cooke K6](https://cookeformula.com/) | **停在 EULA** | 新分頁顯示 End User Licensing Agreement 與 Accept 按鈕。代理未接受條款，本次未填入表單；先前的表單研究屬於另一份證據。 | [阻擋畫面](../artifacts/live-0.3/cooke-eula.png) |
| [Solver Regular](https://iolsolver.com/regular) | DOM 輸入／讀回 | 雙眼 AL／ACD／LT／CCT／K／目標屈光度／A-constant 使用不同測量值；自訂型號／index／biometer 控制項未變更。 | [截圖](../artifacts/live-0.3/solver-regular.png) |
| [Kane](https://www.iolformula.com/) | DOM 輸入／讀回 | 同時使用 OD Toric 與 OS non-toric；雙眼 AL／ACD／LT／CCT／K／目標屈光度／A-constant 分開；性別 M；OD K1 軸向 90，網站推導且停用的 K2 軸向為 180；另填入 SIA／切口。 | [截圖](../artifacts/live-0.3/kane.png) |
| [EVO](https://www.evoiolcalculator.com/Calculator.aspx) | DOM 輸入／讀回 | 選取 OS；Myopic 值 `1` 啟用術前／術後病史；病史 -4.00／+0.25，PK 絕對值 5.80／6.10；CCT 因單位未明示而保留手動輸入。 | [截圖](../artifacts/live-0.3/evo.png) |
| [EVO Toric](https://www.evoiolcalculator.com/Toric.aspx) | DOM 輸入／讀回 | OD；軸向／SIA／切口與後角膜軸向；Hyperopic 值 `2` 時病史欄位仍停用，切換 Myopic 值 `1` 後啟用並填入 -4.00／+0.25。 | [截圖](../artifacts/live-0.3/evo-toric.png) |
| [Solver Complex](https://iolsolver.com/complex) | DOM 輸入／讀回 | 觀察目前眼標題為 OD；LVC 病史開關啟用半徑 7.80 mm 與 corrected ametropia -4.00 D；Total Keratometry 43.00 D 維持獨立。 | [截圖](../artifacts/live-0.3/solver-complex.png) |
| [Solver Second](https://iolsolver.com/second) | DOM 輸入／讀回 | 目前 OD 測量與已手術對側眼的術前 AL 24.10／K 42.80、43.90／LT 4.30／CCT 551 分開；已植入度數 20.50／術後 SE -0.25。單位有疑義的 `Preop. ACD (D)` 保留手動輸入。 | [截圖](../artifacts/live-0.3/solver-second.png) |
| [Solver Toric](https://iolsolver.com/toric) | **停在頁面前置條件** | 新分頁要求先完成球面人工水晶體計算並選取 IOL Power。本次未填入 Toric 表單；2026-11-14 的先前研究曾透過明確標記的合成球面計算進入該表單。 | [阻擋畫面](../artifacts/live-0.3/solver-toric-gate.png) |

## 已回報實作端的發現

1. **網站必填項目需要手動提示。** ESCRS Surgeon 與 Patient Initials 為具有 `required`／`aria-required=true` 的原生輸入框。Gender 是必填、唯讀的自訂下拉控制項。Patient Initials 不應由完整姓名推測。本次證據用於改善 v0.3 對尚無安全自動對應之必填控制項的偵測。
2. **必填星號需要區分顯示與實際標籤。** ESCRS 無障礙名稱顯示 `Surgeon*`、`SIA*`、`Incision*`，但關聯標籤的 `textContent` 為 `Surgeon`、`SIA`、`Incision`。因此，**本次未重現尾端星號造成選擇器失敗的問題**。僅針對標籤加入星號正規化，是穩健性補強，並非宣稱修復已確認的正式網站缺陷。
3. **停用的病史欄位與推導軸向有其用途。** EVO Toric 的 Hyperopic／RK 模式不啟用 Myopic LASIK 專用屈光病史輸入；Kane 的 K2 Toric 軸向由網站推導並停用。填入橋接程式仍須跳過停用控制項；動態必填條件應依可用欄位調整，不能強制寫入。
4. **模式控制項可能需要時間才更新完成。** ESCRS OS LVC 在點擊後立即讀取時仍顯示未勾選，稍後才更新為勾選。最終截圖與重新讀取的 DOM 已確認 OS Myopic LVC 模式。預覽／套用前須重新檢查更新完成的表單，模式變更後應拒絕舊的填入計畫。
5. **單眼網站仍須明確確認眼別。** APACRS 切換眼別的單選按鈕可能觸發回傳與重載，應先選眼再預覽／填入。Solver Complex／Second 目前眼開關沒有可靠且穩定的標籤，仍適合要求手動確認眼別。

12 個可操作的正式表單未確認新的 ID／標籤對應不符。這不代表 `siteBridge` 或已安裝 Chrome 擴充功能的事件處理已通過，因為瀏覽器定位輸入與擴充功能注入的 setter 是不同程式路徑。部分 Kane DOM 值由瀏覽器檢查介面遮蔽；截圖則記錄可見的合成目標屈光度及軸向。未嘗試繞過遮蔽。

## 尚待完成的已安裝擴充功能驗收

使用者安裝或重新載入 v0.3 後，仍需依下列流程重跑本合成資料，逐站保留預覽／實際填入數量與可見欄位讀回結果：

1. 透過懸浮擴充功能，依序從來源網站讀取 OD、OS、OU。儲存病人 A 的第 1 次測量，將 OD AL 改為 23.68 並儲存第 2 次測量，確認第 1 次測量仍為 23.45。
2. 建立病人 B，再切回病人 A，逐一選取各次測量，確認病人身分與測量資料保持分開。
3. 切換至另一網站的新分頁，測試只填 OD、只填 OS，以及支援時同時填 OU。確認未選眼別維持原值、共用常數會檢查衝突，且明確的眼別不符會阻止單眼填入。
4. 重跑矩陣中的 Toric 與 LVC 案例，確認停用／唯讀控制項維持原值，目標屈光度、病史、術後與對側眼資料分開處理。
5. 確認原生必填／手動操作提示、網址或模式變更後的舊計畫失效、懸浮視窗重新開啟狀態，以及瀏覽器重新啟動後的保存。須獨立確認真正的 `chrome.storage`，不能以模擬 Chrome API 的開發測試環境代替。

Cooke 的 EULA 須由使用者自行決定；Solver Toric 須完成正常的球面計算與 IOL Power 前置流程。這兩個阻擋畫面都不算已安裝擴充功能驗證通過，本報告也未驗證臨床計算結果的正確性。
