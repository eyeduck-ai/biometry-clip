# v0.3.7：預設值、儀器與特殊模式

## 使用者原生報告

來源為使用者提交的 `biometry-synthetic-qa-e163c486-c494-44b9-b7be-20f1c7c50b10.json`，擴充功能版本 0.3.6。報告停在第 14 個入口 DGS Toric，TECNIS 尚未開始；共 15 個入口，13 個已處理，6 站通過、7 站略過、8 項隔離儲存檢查通過。這是舊版實際證據，不能視為 0.3.7 已通過。

| 入口 | 報告狀態 | OD／OS／OU 填入並讀回一致的欄位 |
| --- | --- | --- |
| Barrett Universal II | 通過 | 11／11／18 |
| Barrett True-K | 通過 | 14／14／24 |
| Barrett Toric | 通過 | 15／15／單眼入口 |
| Barrett True-K Toric | 通過 | 18／18／單眼入口 |
| Barrett Rx | 通過 | 26／26／單眼入口 |
| ESCRS | 略過 | 11／11／7；Toric 隱藏與 OU 重繪問題 |
| Cooke K6 | 略過 | 12／12／21；特殊模式欄位未完成 |
| Kane | 略過 | 13／13／21；Toric 欄位未完成 |
| EVO | 略過 | 16／18／單眼入口；第一次 LVC 歷史欄位未完成 |
| EVO Toric | 略過 | 22／24／單眼入口；第一次 LVC 歷史欄位未完成 |
| DGS Regular | 通過 | 9／9／17 |
| DGS Complex | 略過 | 12／12／單眼入口 |
| DGS Second | 略過 | OD 16；另有必填／眼別待確認 |
| DGS Toric | 等待 | 球面計算前置流程未完成 |
| TECNIS Toric | 未開始 | 無新版原生證據 |

只列成功核對的合成欄位數，並未將所有來源欄位、特殊模式或計算結果視為通過。精簡機器摘要見 [validation-0.3.6-user-summary.json](../artifacts/validation-0.3.6-user-summary.json)。

報告中的柱鏡偏好全數顯示 manual 另有工具錯誤：平台回傳的是 `{displayPreference: ...}`，runner 卻讀取外層 status。已修正解包並新增實際回傳形狀回歸；不據此回推舊版 −ve 已成功套用。

## 已完成的修改

- Toric 缺值補 SIA 0.05 D、OD 切口軸向 180°、OS 0°，設定可修改。明確的值（包括 0）優先，未測量的另一眼不會只因 target／常數而產生預設。預設只用於貼上的副本，歷史紀錄不變。
- 一般儀器預設 IOLMaster 700，可修改。明確 `argos=yes` 優先，K6 對應 Argos／Lenstar／Other；DGS 對應 Argos (SOS-AL)／Other／兩種 US，經原站實際 UI 選擇，不寫隱藏值。一般儀器與後角膜儀器 `posteriorBiometer` 分開。
- EVO CCT 固定 µm，移除單位設定，也忽略舊版 mm 設定。正常空白 LVC 以 No 準備，已有 myopic／hyperopic／RK 病史保留。原生合成 fixture 刻意使用 Myopic，工具頁已明示。
- EVO 先切 LVC 等已核對的模式並等待原站 postback，再重新取得表單填資料，避免歷史欄位在回傳後遺失。
- ESCRS Initials 可從 ID／代稱補入，其他已核對必填識別欄位也可備援；設定可關閉。新增真正 `patient.initials`，不將 Initials 誤存為 ID。預設讀寫識別資料，傳輸選項仍可取消。
- ESCRS 各眼 Toric、Keratoconus、Argos (SoS) AL、Post LASIK/PRK/RK 四個獨立開關已對應。Keratoconus 為獨立 boolean。Post-LVC 總開關只能確定有／無，無法由此推斷子類型；讀回為 unknown，子類型仍需在原站核對。
- ESCRS 逐欄寫入前重新尋找仍連接的控制項、等待畫面更新，保留原預覽值及 locator 核對；最後再檢查有無被原站重設。未把已脫離畫面的舊節點當成功。
- DGS Complex／Second 辨識並切換原生眼別 switch；複製時不切眼。Toric 的眼別來自球面計算結果，只能辨識固定眼別；有前置提示時顯示「先開基本輸入」入口，保留工作副本，不代按計算。
- 晶體選項唯讀收集：EVO 33 項、EVO Toric 29 項、TECNIS 16 個 family；來源選項、目前選擇與站別參數可結構化保存及匯出。JSON 使用 1.2，兼容凍結的 1.0／1.1；晶體目錄為獨立格式。多個浮窗收集用同來源 Web Lock 保護合併寫入。

## 保留的限制

晶體還沒有預置的已核對跨站 alias，這版不自動選取目的網站晶體，也沒有窮舉選擇各品項後執行計算或收集全部衍生參數。TECNIS family 不等於精確型號，不用相似名稱猜測等價；常數不跨站套用。詳見 [晶體目錄研究](research-lens-catalog.md)。

Kane、Cooke 的其他特殊模式，以及 ESCRS Post-LVC 子類型，仍依已核對的可見欄位與原站選項處理，無法可靠操作的項目會列為待人工確認。ESCRS 本次獨立公開頁遇到使用條款，未代為接受；四個開關的定位使用先前已保存的實際 DOM 證據與本次合成回歸，不能宣稱新版已在使用者 Chrome 重測。

## 檢查範圍

本機測試使用正式 bridge、背景傳輸、資料庫及合成 DOM，包含來源不變、零值、雙眼分流、postback、重新繪製、模式／儀器、晶體讀取與保存隔離。官方公開來源的欄位核對見 [DGS](research-dgs-controls.md)、[晶體](research-lens-catalog.md) 及 [模式與儀器](research-modes-037.md)。

完整檢查為 **426 項通過、0 失敗**，正式建置完成，ZIP CRC 檢查通過。檢查紀錄及封裝雜湊見 `artifacts/check-0.3.7.log` 與 `artifacts/package-0.3.7.json`。本輪未接管使用者 Chrome、接受網站條款或按 Calculate；新版 15 站原生驗收仍需新版工具頁產生報告。
